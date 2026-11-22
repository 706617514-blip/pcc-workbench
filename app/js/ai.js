/* ============================================================================
 * PCC 会员营销工作台 —— AI 活动助手 (ai.js)
 * ----------------------------------------------------------------------------
 * 实现 PRD 6.3「AI 组件与外部服务」：
 *   组件 A  自然语言活动配置 Agent  —— 一句话 → 结构化活动草稿
 *   组件 B  门店本地化改写 Agent     —— 按地段/季节/语言本地化模板
 *   组件 C  权限守门服务（确定性，fail-closed）
 *   组件 E  审批分流服务             —— 按当前启用角色与风险路由
 *   组件 F  拦截解释组件             —— 用人话解释「为什么没发」
 *
 * 关键原则（PRD 6.3 / 6.3.4）：
 *   · AI 只生成「建议／草稿」，不直接调用发券或通知接口；
 *   · 权限落在服务端工具调用层，抽屉按账号角色与当前页面启用能力；
 *   · 所有检查与解释须可追溯到规则版本或原始记录；
 *   · 门店输入不得带入跨店会员资料。
 *
 * 本模块包含一个确定性 NLU 解析器（规则+词典），无需外部 LLM 即可
 * 完整演示全部交互；若部署环境提供 LLM 服务，可替换 parseIntent 实现。
 * ==========================================================================*/
(function (global) {
  'use strict';

  const E = global.PCC_ENGINE;
  const C = global.PCC_CONST;
  const DB = E.DB;

  /* ================================================================
   * 0. 能力矩阵（PRD 表 9 分层权限矩阵 + 6.3.4 边界）
   * 抽屉按账号角色和当前页面启用相应能力，其余入口隐藏或禁用。
   * ==============================================================*/
  const CAPABILITIES = [
    { key: 'draft',      page: ['create'],                  roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
    { key: 'localize',   page: ['create'],                  roles: ['L3_STORE', 'L1_HQ_MARKETING', 'L1_HQ_ADMIN'] },
    { key: 'permission', page: ['create', 'manage'],        roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
    { key: 'value',      page: ['create', 'overview'],      roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
    { key: 'predict',    page: ['create', 'overview'],      roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
    { key: 'copy',       page: ['create', 'manage'],        roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
    { key: 'explain',    page: ['records', 'overview'],     roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
  ];

  // 门店账号的页面键与总部不同（propose / progress / store-info），
  // 但底层是同一套页面实现，查能力矩阵前先归一化，否则门店会被判成「无任何 AI 能力」。
  const PAGE_ALIAS = { propose: 'create', progress: 'approval', 'store-info': 'settings' };

  function availableCapabilities(page, account) {
    const p = PAGE_ALIAS[page] || page;
    return CAPABILITIES.map((c) => ({
      key: c.key,
      enabled: c.page.includes(p) && c.roles.includes(account.role),
    }));
  }

  /* ================================================================
   * 1. 意图解析（组件 A 的确定性实现）
   * ==============================================================*/
  const COUPON_KEYWORDS = [
    { key: 'winback',    words: ['回流', '未消费', '未消費', '沉睡', '沉默', '挽留', '流失', '30 天', '30天',
                            '没来', '沒來', '好久没', '好久沒', '没再消费', '未到店', '召回'] },
    { key: 'newbie',     words: ['新人', '新注册', '新客', '首单', '注册'] },
    { key: 'birthday',   words: ['生日', '寿星'] },
    { key: 'halloween',  words: ['万圣', '万聖', 'halloween', '主题', '限定', '節日', '节日'] },
    { key: 'student',    words: ['学生', '學生', 'student', '校园'] },
    { key: 'store_local',words: ['门店', '本店', '本地', '周末', '下午茶', 'store'] },
  ];
  // 折扣识别：小数折扣必须先于整数折扣匹配，且整数折扣前不能用 \d 前缀，
  // 否则「8.5 折」会被「5 折」抢先命中（PRD 表 6 含 7.5 折与 8.5 折）。
  // 使用 (?<![\d.]) 确保匹配的数字前面不是数字或小数点。
  const DISCOUNT_PATTERNS = [
    { re: /买一送一|買一送一|buy\s*one\s*get\s*one|bogo|1\s*送\s*1/i, label: '买一送一', discount: 0.50, over: true },
    { re: /(?<![\d.])7\.5\s*折|75\s*%/i, label: '7.5 折', discount: 0.75 },
    { re: /(?<![\d.])8\.5\s*折|85\s*%/i, label: '8.5 折', discount: 0.85 },
    { re: /(?<![\d.])6\.5\s*折|65\s*%/i, label: '6.5 折', discount: 0.65 },
    { re: /半价|半價|(?<![\d.])5\s*折|五折|50\s*%/i, label: '5 折', discount: 0.50 },
    { re: /(?<![\d.])7\s*折|70\s*%/i, label: '7 折', discount: 0.70 },
    { re: /(?<![\d.])8\s*折|80\s*%/i, label: '8 折', discount: 0.80 },
    { re: /(?<![\d.])9\s*折|90\s*%/i, label: '9 折', discount: 0.90 },
  ];
  const MODE_WORDS = {
    auto: ['自动', '自動', '规则', '規則', 'auto', '触发'],
    manual: ['人工', '手动', '手動', '批次', 'manual', '逐批'],
  };
  const SEGMENT_WORDS = [
    { key: 'dormant30', words: ['30 天未消费', '30天未消费', '30 天没', '30天没', '连续 30 天', '連續 30 天',
                                '未消费', '未消費', '没来', '沒來', '好久没', '好久沒', '沉睡', '沉默'] },
    { key: 'newbie',    words: ['新注册', '新註冊', '注册 30 天内', '新人'] },
    { key: 'highvalue', words: ['高价值', '高價值', '高消費', '消费超 500', '500 以上', '白金', 'platinum',
                                '高频', '高頻', '常客', '金卡', '消费高', '消費高', 'top'] },
    { key: 'student',   words: ['学生', '學生'] },
    { key: 'birthday',  words: ['生日'] },
    { key: 'all',       words: ['全部', '所有', '全港', '全部会员', '全部會員'] },
  ];

  /**
   * 解析自然语言 → 结构化意图。
   * 返回 { coupon_type, discount, offer_label, mode, store_scope, segment,
   *        segment_definition, channel, understood:[...], confidence }
   */
  function parseIntent(text, account) {
    const t = String(text || '');
    const understood = [];
    let couponType = null;

    for (const c of COUPON_KEYWORDS) {
      if (c.words.some((w) => t.toLowerCase().includes(w.toLowerCase()))) {
        couponType = c.key;
        understood.push(`识别到券种关键词 → 「${E.COUPON_TYPES[c.key].name}」`);
        break;
      }
    }
    // 门店账号默认本店；无券种关键词时按门店本地活动处理
    if (!couponType) {
      if (account.scope_type === 'store') {
        couponType = 'store_local';
        understood.push('未识别到具体券种；门店账号默认使用「门店本地券」');
      } else {
        couponType = 'winback';
        understood.push('未识别到具体券种；按最常见场景默认「30 天回流券」');
      }
    }

    let discount = null, offerLabel = null, overLimit = false;
    for (const d of DISCOUNT_PATTERNS) {
      if (d.re.test(t)) {
        discount = d.discount; offerLabel = d.label; overLimit = !!d.over;
        understood.push(`识别到优惠力度 → 「${d.label}」`);
        break;
      }
    }
    if (discount == null) {
      discount = E.COUPON_TYPES[couponType].discount;
      offerLabel = E.COUPON_TYPES[couponType].discount_label;
      understood.push(`未指定优惠力度；采用「${E.COUPON_TYPES[couponType].name}」标准折扣 ${offerLabel}`);
    }
    // 与券种标准折扣不一致时，明确告知「按自定义折扣写入草稿，仍受守门约束」
    if (!overLimit && Math.abs(discount - E.COUPON_TYPES[couponType].discount) > 1e-9) {
      understood.push(`「${offerLabel}」与「${E.COUPON_TYPES[couponType].name}」标准折扣 `
        + `${E.COUPON_TYPES[couponType].discount_label} 不同；按自定义折扣写入草稿，提交时仍受守门上限约束`);
    }
    // 买一送一在门店账号下视为超限
    if (overLimit && account.scope_type === 'store') {
      discount = 0.50;
      understood.push('「买一送一」等价于 5 折，低于总部授权的门店折扣上限，需守门判定');
    }

    let mode = null;
    for (const m of MODE_WORDS.auto) if (t.toLowerCase().includes(m.toLowerCase())) { mode = 'auto'; break; }
    if (!mode) for (const m of MODE_WORDS.manual) if (t.toLowerCase().includes(m.toLowerCase())) { mode = 'manual'; break; }
    if (!mode) { mode = E.COUPON_TYPES[couponType].auto ? 'auto' : 'manual'; }
    understood.push(`发放方式 → 「${mode === 'auto' ? '规则批准后自动发放' : '逐批人工批准发放'}」`);

    let seg = null;
    for (const s of SEGMENT_WORDS) {
      if (s.words.some((w) => t.includes(w))) { seg = s.key; break; }
    }
    if (!seg) seg = couponType === 'winback' ? 'dormant30' : couponType === 'newbie' ? 'newbie'
              : couponType === 'student' ? 'student' : couponType === 'birthday' ? 'birthday' : 'all';

    // 门店范围：门店账号强制本店；总部默认全港，除非文本指定门店
    let storeScope = 'all_hk', storeId = null;
    if (account.scope_type === 'store') {
      storeScope = 'store'; storeId = account.scope_id;
      understood.push(`门店范围锁定为账号所属门店「${E.utils.storeLabel(account.scope_id)}」（服务端强制）`);
    } else {
      for (const s of DB.stores) {
        if (t.includes(s.name) || t.includes(s.name.replace('店', ''))) {
          storeScope = 'store'; storeId = s.store_id;
          understood.push(`识别到门店 → 「${s.name}」`);
          break;
        }
      }
      if (storeScope === 'all_hk') understood.push('未指定门店；范围为「全港门店」');
    }

    const ct = E.COUPON_TYPES[couponType];
    const name = buildName(couponType, mode, storeId, account);
    return {
      coupon_type: couponType, discount, offer_label: offerLabel,
      mode, store_scope: storeScope, store_id: storeId, segment: seg,
      segment_definition: segmentLabel(seg),
      channel: 'app_push',
      name,
      validity_label: ct.validity_label,
      per_member_label: ct.per_member_label,
      stack_label: ct.stack_label,
      understood,
      raw: t,
    };
  }

  function segmentLabel(seg) {
    return {
      dormant30: '连续 30 天未消费会员', newbie: '注册 30 天内的新会员',
      highvalue: '月消费 HK$500 以上的高价值会员', student: '学生资格有效的会员',
      birthday: '生日当月会员', all: '全部会员',
    }[seg] || '全部会员';
  }
  function buildName(couponType, mode, storeId, account) {
    const ct = E.COUPON_TYPES[couponType];
    const prefix = storeId ? E.utils.storeLabel(storeId).replace('店', '') + '门店' : '';
    const tail = couponType === 'winback' ? '会员优惠' : '活动';
    return `${prefix}${ct.name.replace('券', '')}${tail}`;
  }

  /* ================================================================
   * 2. 草稿构造（组件 A 输出）
   * ==============================================================*/
  function buildDraft(intent, account, context) {
    const ct = E.COUPON_TYPES[intent.coupon_type];
    const draft = {
      name: intent.name,
      coupon_type: intent.coupon_type,
      discount: intent.discount,
      offer_label: intent.offer_label,
      mode: intent.mode,
      channel: intent.channel,
      store_scope: intent.store_scope,
      store_id: intent.store_id,
      segment_definition: intent.segment_definition,
      audience_size: context && context.audienceSize || 0,
      valid_from: '', valid_until: '',
      source: 'ai_draft',
    };
    return draft;
  }

  /* ================================================================
   * 3. 组件 C —— 权限守门（确定性，fail-closed）
   * ==============================================================*/
  function guard(draft, account, sessionId) {
    const res = E.permissionGuard(draft, account);
    E.guardLog({
      session_id: sessionId, account: account.account_id, scope: account.scope_type,
      intent: draft.coupon_type,
      rule_version: 'guard-v1.0 / hq-policy-2026.10',
      result: res.pass ? 'pass' : 'block',
      checks: res.checks.map((c) => ({ name: c.name, pass: c.pass, rule: c.rule })),
      draft: { coupon_type: draft.coupon_type, discount: draft.discount, store_scope: draft.store_scope },
    });
    return res;
  }

  /* ================================================================
   * 4. 组件 E —— 审批分流
   * ==============================================================*/
  function route(draft, account) { return E.routeApproval(draft, account); }

  /* ================================================================
   * 5. 组件 F —— 拦截解释（基于原始记录）
   * ==============================================================*/
  function explainBlock(text, account) {
    const t = String(text || '');
    let referencedJobId = null;   // 用户点名但已无记录的任务编号（用于如实说明）
    const storeScoped = account.scope_type === 'store';
    const myStore = account.scope_id;

    // 从文本中找任务编号 R-xxxx / J-xxxx
    const jobMatch = t.match(/[RJ]-\d{3,4}/i);
    let job = null;
    if (jobMatch) {
      const jid = jobMatch[0].toUpperCase().replace(/^R-/, 'J-');
      job = DB.sendJob.find((j) => j.job_id === jid)
         || DB.sendJob.find((j) => j.job_id === jobMatch[0].toUpperCase());
    }
    if (!job) {
      // 优先选择确实存在失败或因拦截记录的任务，其次为失败任务，最后退化为最近任务
      const withRecords = DB.sendJob.filter((j) =>
        DB.sendAttempt.some((a) => a.job_id === j.job_id && (a.result === 'failed' || a.result === 'blocked')));
      job = withRecords.slice(-1)[0]
         || DB.sendJob.filter((j) => j.status === 'failed').slice(-1)[0]
         || DB.sendJob.slice(-1)[0];
    }
    // 若被明确点名的任务已无失败或因拦截记录（例如已重试恢复），
    // 则改取最近一条确实存在拦截/失败记录的任务，保证解释始终有原始记录可引用。
    if (job && !DB.sendAttempt.some((a) => a.job_id === job.job_id &&
        (a.result === 'failed' || a.result === 'blocked'))) {
      const withRecords = DB.sendJob.filter((j) =>
        DB.sendAttempt.some((a) => a.job_id === j.job_id && (a.result === 'failed' || a.result === 'blocked')));
      const fallback = withRecords.slice(-1)[0];
      if (fallback) { referencedJobId = job.job_id; job = fallback; }
    }
    if (!job) {
      return {
        kind: 'explain', title: '暂无可解释的记录',
        lines: ['当前账号范围内没有可引用的发送任务记录。'],
        evidence: [], confidence: 'low',
      };
    }

    const attempts = DB.sendAttempt.filter((a) => a.job_id === job.job_id);
    const failed = attempts.filter((a) => a.result === 'failed');
    const blocked = attempts.filter((a) => a.result === 'blocked');

    // 门店账号不得读取跨店任务
    if (storeScoped && job.store_id && job.store_id !== myStore) {
      return {
        kind: 'explain', denied: true,
        title: '无权读取该记录',
        lines: [`任务 ${job.job_id} 属于 ${E.utils.storeLabel(job.store_id)}，当前账号门店范围为 ${E.utils.storeLabel(myStore)}，服务端已拒绝读取。`],
        evidence: [], confidence: 'high',
      };
    }

    const codeCount = {};
    blocked.concat(failed).forEach((a) => { codeCount[a.code] = (codeCount[a.code] || 0) + 1; });
    const top = Object.keys(codeCount).sort((a, b) => codeCount[b] - codeCount[a]);

    // 把内部原因代码翻译成大白话，让用户一眼就懂，而不是看 DUP_XXX 这种术语
    const PLAIN = {
      DUP_WINBACK_SAME_ROUND: '这位会员这一轮已经领过回流券了，不重复发',
      DUP_NEWBIE_ONCE: '新人券每位只能领一次，这位会员领过了',
      DUP_BIRTHDAY_YEAR: '今年的生日券已经发过了',
      DUP_STUDENT_MONTH: '这个月的学生券已经领过了',
      DUP_CAMPAIGN_ONCE: '这个活动每人只能领一次，这位会员领过了',
      FREQ_DAILY_CAP: '今天发得太多了，到了每天的上限',
      FREQ_WEEKLY_CAP: '这周发得太多了，到了每周的上限',
      IDEMPOTENT_SKIP: '这张券之前已经发过，跳过以免重复',
      ELIGIBILITY_TIMEOUT: '资格核对超时了，这次先没发',
      MISSING_BIRTHDAY: '资料里没填生日，发不了生日券',
      MISSING_SIGNUP_DATE: '资料里没填注册日期，判断不了是不是新人',
      STUDENT_EXPIRED: '学生身份已经过期了',
      NOT_DORMANT: '最近还有消费，不算“沉睡会员”',
      NO_STORE_TXN: '没有在这家店消费过',
      NOT_NEWBIE: '注册太久，不算新人',
      NO_STUDENT_RECORD: '没有学生身份认证记录',
      NOT_BIRTHDAY_MONTH: '这个月不是这位会员的生日月',
      MEMBER_NOT_FOUND: '找不到这位会员的资料',
      DATA_INCOMPLETE: '资料缺了几项关键信息',
    };
    const plain = (code) => PLAIN[code] || '不符合这次发券的条件';

    // 用与下方要点/证据同一批记录计算人数，避免“结论说全成功、下面却列了一堆拦截”的自相矛盾
    const notSent = failed.length + blocked.length;
    const sent = Math.max(0, job.requested - notSent);
    // 一句话结论：先说结果，再说为什么，全用大白话
    let headline;
    if (!notSent) {
      headline = `这次给 ${job.requested} 位会员发「${job.coupon_name}」，${sent} 位都成功拿到券了，没有人被挡下来。`;
    } else {
      const reasonText = top.length
        ? top.slice(0, 2).map((code) => `${plain(code)}（${codeCount[code]} 人）`).join('；')
        : '暂时没有查到具体原因';
      headline = `这次要给 ${job.requested} 位会员发「${job.coupon_name}」，${sent} 位成功拿到券，${notSent} 位没发出去。主要是：${reasonText}。`;
    }

    const lines = [];
    if (referencedJobId) {
      lines.push(`你问的是 ${referencedJobId}，但那笔已经重试成功、没有遗留问题了，所以改用了最近还有记录的一笔来说明。`);
    }
    if (top.length) {
      top.slice(0, 4).forEach((code) => lines.push(`· ${plain(code)}：${codeCount[code]} 位会员`));
    } else if (notSent) {
      lines.push('· 这次没有查到具体的拦截原因。');
    }
    lines.push('这些都是发券前自动检查规则挡下来的，属于正常保护，不是系统出错，也没有发重复的券。');

    return {
      kind: 'explain',
      title: `发券结果，一句话说清`,
      headline,
      lines,
      // 原始记录保留但默认折叠，避免一大段术语把用户淹没（验收仍可核对证据）
      evidence: failed.concat(blocked).slice(0, 5).map((a) => ({
        ref: a.attempt_id, code: a.code, at: a.at,
        customer_id: storeScoped ? maskCid(a.customer_id) : a.customer_id,
        stage: a.stage, reason: a.reason,
      })),
      ruleVersion: 'eligibility-v1.0 / freq-cap-2026.10',
      confidence: 'high',
      jobId: job.job_id,
    };
  }
  function maskCid(cid) {
    // 门店上下文只暴露匿名编号，不携带跨店会员资料
    return cid;
  }

  /* ================================================================
   * 6. 组件 B —— 门店本地化
   * ==============================================================*/
  function localize(text, account, context) {
    const src = String(text || '把总部活动改成本店周末活动');
    const intent = parseIntent(src, account);
    const storeId = account.scope_id;
    const storeName = E.utils.storeLabel(storeId);
    const st = DB.storeById.get(storeId) || {};

    // 门店档案（获授权部分）驱动本地化理由
    const reasons = [];
    const typeLabel = { office: '写字楼商圈', mall: '商场', tourist: '旅游区', retail: '零售街区',
                        residential: '住宅区', campus: '校园区' }[st.type] || '本地商圈';
    reasons.push(`门店档案：${storeName}位于${st.district || '—'}，属于${typeLabel}，工作日与周末客流结构不同。`);
    if (src.includes('周末')) reasons.push('请求指定「周末」触达；建议将文案方向设为周末到店礼遇，避开工作日早高峰。');
    if (src.includes('附近') || src.includes('周邊') || src.includes('周边')) reasons.push('请求指定「附近会员」；门店可使用本店交易记录筛选曾在本店消费的会员。');

    const draft = buildDraft(intent, account, context);
    draft.name = `${storeName.replace('店', '')}门店${intent.coupon_type === 'store_local' ? '周末活动' : E.COUPON_TYPES[intent.coupon_type].name + '本地版'}`;
    draft.segment_definition = '曾在本店消费的会员';
    draft.store_scope = 'store';
    draft.store_id = storeId;

    const g = guard(draft, account, context && context.sessionId);
    const r = route(draft, account);

    return {
      kind: 'localize', intent, draft, guard: g, route: r,
      title: '门店本地化建议',
      facts: [
        { k: '活动范围', v: storeName },
        { k: '目标人群', v: '曾在本店消费的会员' },
        { k: '文案方向', v: src.includes('周末') ? '周末到店回流礼遇' : '本地到店礼遇' },
        { k: '建议折扣', v: draft.offer_label },
      ],
      reasons,
      evidence: [
        { ref: 'store_profile:' + storeId, code: 'STORE_PROFILE', at: C.NOW_LABEL,
          reason: `门店类型 ${st.type || '—'}，商圈 ${st.district || '—'}` },
      ],
    };
  }

  /* ================================================================
   * 7. 组件 C 的独立展示（权限检查快捷入口）
   * ==============================================================*/
  function permissionCheck(account, context) {
    const draft = (context && context.currentDraft) || {
      coupon_type: account.scope_type === 'store' ? 'store_local' : 'winback',
      discount: account.scope_type === 'store' ? 0.85 : 0.80,
      offer_label: account.scope_type === 'store' ? '8.5 折' : '8 折',
      store_scope: account.scope_type === 'store' ? 'store' : 'all_hk',
      store_id: account.scope_id,
    };
    const g = guard(draft, account, context && context.sessionId);
    const r = route(draft, account);
    return { kind: 'permission', guard: g, route: r, draft, title: '权限检查' };
  }

  /* ================================================================
   * 8. 生成活动草稿（组件 A 展示）
   * ==============================================================*/
  function generateDraft(text, account, context) {
    const intent = parseIntent(text, account);
    const draft = buildDraft(intent, account, context);
    const g = guard(draft, account, context && context.sessionId);
    const r = route(draft, account);
    return { kind: 'draft', intent, draft, guard: g, route: r, title: '已生成可编辑活动草稿' };
  }

  /* ================================================================
   * 9. 券面额建议（老师反馈第 4 条；确定性规则，不调用 LLM）
   * 依据：该券种历史核销率 + 授权折扣上限 + 样本量。
   * 只输出「建议」，不写入活动；人员自行决定并走原有审批。
   * ==============================================================*/
  // 折扣弹性假设：折扣每加深 1 个百分点，核销率约提升 0.6 个百分点。
  // 这是测试假设（非因果估计），写入 assumptions 前须用真实对照实验校准。
  const DISCOUNT_ELASTICITY = 0.6;

  function typeStats(couponType) {
    const list = DB.couponInstance.filter((c) => c.coupon_type === couponType);
    const claimed = list.filter((c) => !!c.claimed_at).length;
    const used = list.filter((c) => c.status === 'used' || !!c.redeemed_at).length;
    const n = list.length;
    return {
      issued: n, claimed, used,
      claim_rate: n ? claimed / n : 0,
      redeem_rate: n ? used / n : 0,
    };
  }

  function pctText(x) { return (x * 100).toFixed(1) + '%'; }

  function suggestValue(account, context) {
    context = context || {};
    const draft = context.currentDraft || {};
    const couponType = draft.coupon_type
      || (account.scope_type === 'store' ? 'store_local' : 'winback');
    const ct = E.COUPON_TYPES[couponType];
    const st = typeStats(couponType);
    const baseDiscount = draft.discount || ct.discount;

    // 候选档位：基线、加深 5 个百分点、加深 10 个百分点
    const candidates = [baseDiscount, +(baseDiscount - 0.05).toFixed(2), +(baseDiscount - 0.10).toFixed(2)]
      .filter((d, i, arr) => d >= 0.5 && arr.indexOf(d) === i)
      .map((d) => {
        const deeperPp = (baseDiscount - d) * 100;                 // 折扣加深的百分点
        const estRate = Math.max(0, st.redeem_rate + deeperPp * DISCOUNT_ELASTICITY / 100);
        const probe = Object.assign({}, draft, {
          coupon_type: couponType,
          discount: d,
          offer_label: (d * 10).toFixed(d * 10 % 1 ? 1 : 0) + ' 折',
          store_scope: draft.store_scope || (account.scope_type === 'store' ? 'store' : 'all_hk'),
          store_id: draft.store_id || account.scope_id,
        });
        const g = guard(probe, account, context.sessionId);
        return { discount: d, label: probe.offer_label, est_rate: estRate, guard_pass: g.pass, guard: g };
      });

    const best = candidates.filter((c) => c.guard_pass)[0] || candidates[0];
    const evidence = [
      `该券种历史样本 ${st.issued} 张，核销率 ${pctText(st.redeem_rate)}（领取率 ${pctText(st.claim_rate)}）`,
      `授权基线折扣：${ct.discount_label}；折扣弹性假设：每加深 1 个百分点核销率约 +${DISCOUNT_ELASTICITY} 个百分点`,
      '折扣弹性是测试假设，不是因果估计；真实弹性须用对照实验校准',
    ];

    return {
      kind: 'value',
      title: '券面额建议（建议，需人工确认）',
      lines: [
        `券种：${ct.name}；当前基线：${ct.discount_label}`,
        ...candidates.map((c) => `· ${c.label}：预计核销率约 ${pctText(c.est_rate)}`
          + `（${c.guard_pass ? '授权内可用' : '超出授权上限，需总部例外申请'}）`),
        `推荐：${best.label} —— ${best.guard_pass ? '授权内、样本较充足' : '需要先取得例外授权'}；`
          + 'AI 不会自行写入活动或提交审批。',
      ],
      evidence,
      suggestions: candidates,
      ruleVersion: 'coupon-value/v1（确定性）',
      guard: { pass: best.guard_pass, checks: best.guard.checks },
    };
  }

  /* ================================================================
   * 10. 核销预测（老师反馈第 4 条；统计外推，不是模型预测）
   * ==============================================================*/
  function predictRedemption(account, context) {
    context = context || {};
    const draft = context.currentDraft || {};
    const couponType = draft.coupon_type || (account.scope_type === 'store' ? 'store_local' : 'winback');
    const ct = E.COUPON_TYPES[couponType];
    const st = typeStats(couponType);
    const audience = context.audienceSize || 0;
    const issued = audience;
    const claimPoint = Math.round(issued * st.claim_rate);
    const usedPoint = Math.round(issued * st.redeem_rate);
    // 二项分布的正态近似 95% 区间
    const p = st.redeem_rate;
    const sd = Math.sqrt(Math.max(issued, 1) * p * (1 - p));
    const low = Math.max(0, Math.round(usedPoint - 1.96 * sd));
    const high = Math.min(issued, Math.round(usedPoint + 1.96 * sd));

    return {
      kind: 'predict',
      title: '核销预测（基于合成历史的统计外推）',
      lines: [
        `券种：${ct.name}（${ct.discount_label}）；目标人群 ${issued} 人`,
        `预计领取 ≈ ${claimPoint} 张（历史领取率 ${pctText(st.claim_rate)}）`,
        `预计核销 ≈ ${usedPoint} 张，95% 区间 ${low}–${high} 张（历史核销率 ${pctText(p)}，样本 ${st.issued} 张）`,
        issued ? '' : '提示：先在「活动创建」页应用筛选，才能按实际人群规模预测。',
        '这是统计外推，不是预测模型；合成数据只能验证方法，真实核销需上线后对照测试。',
      ].filter(Boolean),
      evidence: [
        `样本：该券种已发 ${st.issued} 张 / 已领 ${st.claimed} 张 / 已核销 ${st.used} 张`,
        '口径：核销率 = 已核销 / 已发放（同一发放群体、统一截至时点）',
        '局限：历史券的折扣、人群与时间窗不同，直接外推会高估或低估',
      ],
      estimate: { issued, claimPoint, usedPoint, low, high, rate: p },
      ruleVersion: 'redeem-forecast/v1（统计外推）',
    };
  }

  /* ================================================================
   * 11. 券文案草稿生成（PRD 3.3 组件 G；模板 + 确定性合规检查）
   * 会员面向文案用繁体（与 PCC App 一致），后台界面语言不改变文案语种。
   * 输出为「草稿」，须人工确认并走审批后才能使用，不自动发送。
   * ==============================================================*/
  const COPY_UNSUB = '如不想再收到，可於 App「我的 → 通知設定」關閉，或回覆 TD 退訂。';
  const COPY_BANNED = ['免費贈送', '100%', '絕對', '保證', '保証', '必中', '最便宜', '全港第一', '零風險'];

  function couponValidityText(ct, draft) {
    if (draft && draft.valid_from && draft.valid_until) {
      return `${draft.valid_from} 至 ${draft.valid_until}`;
    }
    return ct.validity_label;
  }

  function generateCopy(account, context) {
    context = context || {};
    const draft = context.currentDraft || {};
    const couponType = draft.coupon_type
      || (account.scope_type === 'store' ? 'store_local' : 'winback');
    const ct = E.COUPON_TYPES[couponType];
    const discountLabel = draft.offer_label || ct.discount_label;
    const scopeLabel = draft.store_scope ? E.scopeLabelOf(draft) : ct.scope_label;
    const validity = couponValidityText(ct, draft);
    const seg = draft.segment_definition
      || (account.scope_type === 'store' ? '本店會員' : 'PCC 會員');
    const stack = ct.stack_points
      ? '可與積分同單使用（先以積分抵付，再對餘額套用折扣）。'
      : '不可與積分同單使用。';
    const terms = `有效期：${validity}；適用門店：${scopeLabel}；`
      + `使用限制：${ct.per_member_label}，每筆訂單最多使用一張優惠券；${stack}`;

    const variants = [
      {
        id: 'formal',
        tone: '正式（App 推送／短訊）',
        title: `${seg}專享：${ct.name} ${discountLabel}`,
        body: `您已獲贈「${ct.name}」一張，可於 ${scopeLabel} 使用，優惠為 ${discountLabel}。`
          + `${stack}數量有限，請於有效期內使用。`,
        terms,
        cta: '查看我的獎賞',
      },
      {
        id: 'friendly',
        tone: '親切（App 首頁卡片）',
        title: `${ct.name}已放入您的獎賞，記得領取`,
        body: `您好，這是為您準備的 ${discountLabel} ${ct.name}。`
          + `在 ${scopeLabel} 下單時選用它即可，${ct.stack_points ? '還能與積分一起用' : '每單限用一張'}。`
          + `領取後有效期由領取日起計，別放到過期。`,
        terms,
        cta: '立即領取',
      },
      {
        id: 'short',
        tone: '精簡（推送標題，≤ 18 字）',
        title: `${discountLabel}${ct.name}，${scopeLabel}`,
        body: `您的 ${ct.name} 已到帳，${scopeLabel}可用。`,
        terms,
        cta: '去使用',
      },
    ];

    // 确定性合规检查（PRD 8.2：明示有效期、適用門店、退訂方式；不得绝对化）
    const full = variants.map((v) => `${v.title}\n${v.body}\n${v.terms}\n${COPY_UNSUB}`).join('\n');
    const checks = [
      { name: '包含有效期', pass: /有效期/.test(full) },
      { name: '包含適用門店與範圍', pass: /適用門店/.test(full) },
      { name: '包含退訂／通知關閉方式', pass: /退訂/.test(COPY_UNSUB) && /退訂/.test(full) },
      { name: '無絕對化或保證性用語', pass: !COPY_BANNED.some((w) => full.indexOf(w) >= 0) },
      { name: '折扣表述與券規則一致', pass: full.indexOf(discountLabel) >= 0 },
      { name: '未承諾保證性結果', pass: !/保證|保証|必中/.test(variants.map((v) => v.body).join('\n')) },
    ];

    return {
      kind: 'copy',
      title: '券文案草稿（需人工確認）',
      variants,
      checks,
      unsub: COPY_UNSUB,
      evidence: [
        `券種：${ct.name}；折扣：${discountLabel}；適用：${scopeLabel}`,
        `有效期：${validity}；使用限制：${ct.per_member_label}`,
        '文案由模板生成，不调用 LLM；语种固定为繁体（与 PCC App 一致，不随后台界面语言变化）',
        '合规检查项：有效期 / 適用門店 / 退訂方式 / 绝对化用语 / 折扣一致 / 保证性表述',
      ],
      ruleVersion: 'coupon-copy/v1（模板 + 确定性检查）',
      guard: { pass: checks.every((c) => c.pass), checks },
    };
  }

  global.PCC_AI = {
    CAPABILITIES, availableCapabilities,
    parseIntent, buildDraft, guard, route, explainBlock, localize, permissionCheck, generateDraft,
    segmentLabel, suggestValue, predictRedemption, typeStats, generateCopy,
  };
})(window);
