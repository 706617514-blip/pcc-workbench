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
    { key: 'explain',    page: ['records', 'overview'],     roles: ['L1_HQ_MARKETING', 'L1_HQ_ADMIN', 'L3_STORE'] },
  ];

  function availableCapabilities(page, account) {
    return CAPABILITIES.map((c) => ({
      key: c.key,
      enabled: c.page.includes(page) && c.roles.includes(account.role),
    }));
  }

  /* ================================================================
   * 1. 意图解析（组件 A 的确定性实现）
   * ==============================================================*/
  const COUPON_KEYWORDS = [
    { key: 'winback',    words: ['回流', '未消费', '沉睡', '挽留', '流失', '30 天', '30天', '召回'] },
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
    { key: 'dormant30', words: ['30 天未消费', '30天未消费', '连续 30 天', '連續 30 天', '未消费', '未消費'] },
    { key: 'newbie',    words: ['新注册', '新註冊', '注册 30 天内', '新人'] },
    { key: 'highvalue', words: ['高价值', '高消費', '消费超 500', '500 以上', '白金', 'platinum'] },
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

    const lines = [];
    if (referencedJobId) {
      lines.push(`你点名的是 ${referencedJobId}，该任务的失败记录已重试恢复、当前无遗留失败或因拦截记录；以下改引用最近一条仍有记录的 ${job.job_id}。`);
    }
    lines.push(`任务 ${job.job_id}（${job.coupon_name} · ${job.discount_label}）共请求 ${job.requested} 人，成功建券 ${job.success} 张，失败 ${job.failed} 条，被拦截 ${job.blocked} 条。`);
    if (top.length) {
      lines.push('按原因代码归并，命中最多的是：');
      top.slice(0, 4).forEach((code) => {
        const sample = blocked.concat(failed).find((a) => a.code === code);
        lines.push(`· ${code}（${codeCount[code]} 条）—— ${sample.reason}`);
      });
    }
    if (!top.length) lines.push('该任务没有失败或因拦截记录。');

    return {
      kind: 'explain',
      title: `拦截解释 · ${job.job_id}`,
      lines,
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

  global.PCC_AI = {
    CAPABILITIES, availableCapabilities,
    parseIntent, buildDraft, guard, route, explainBlock, localize, permissionCheck, generateDraft,
    segmentLabel,
  };
})(window);
