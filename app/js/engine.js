/* ============================================================================
 * PCC 会员营销工作台 —— 核心业务引擎 (engine.js)
 * ----------------------------------------------------------------------------
 * 实现 PRD 第 6 章「后端规格与业务规则」的确定性部分：
 *   · 会员条件筛选（总部全港口径 / 门店本店口径）   —— 表 6、2.1、9.1
 *   · 券规则与发放限制（新人/生日/回流/万圣/学生）   —— 表 6 (6.2.1)
 *   · 资格检查：范围 / 同意 / 频控 / 同轮去重        —— 表 5 步骤 6
 *   · 幂等发券键与重试                               —— 6.2.1 / 9.1
 *   · 店级数据隔离（服务端强制）                     —— 6.1 / 2.1
 *   · 看板指标口径（同群体、同截至时点）             —— 表 12
 *   · 权限守门（fail-closed）与审批路由              —— 表 9 / 6.3.2
 *   · 审计日志                                       —— 表 7
 * ==========================================================================*/
(function (global) {
  'use strict';

  const D = global.PCC_DATA || {};
  const C = global.PCC_CONST;

  /* ---------------------------------------------------------------- 工具 */
  const DAY = 86400000;
  const d2 = (s) => new Date(s + 'T00:00:00');
  const dts = (s) => new Date(s);
  const iso = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const isoMin = (d) => iso(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const dayDiff = (a, b) => Math.floor((d2(a) - d2(b)) / DAY);
  const addDays = (s, n) => iso(new Date(d2(s).getTime() + n * DAY));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ================================================================
   * 0. 数据仓库加载与索引
   * ==============================================================*/
  const DB = {
    ready: false,
    customers: [], byId: new Map(),
    transactions: [], txByCustomer: new Map(), txByStore: new Map(),
    events: [], evByCustomer: new Map(),
    consent: [], consentIdx: new Map(),   // key: cid|channel
    stores: [], storeById: new Map(),
    dailyAgg: [],
    memberStore: null,
    assumptions: null,
    // 工作台运行时写入的表（PRD 表 4）
    campaigns: [], couponInstance: [], messages: [],
    sendJob: [], sendAttempt: [], redemption: [],
    approvalLog: [], auditLog: [], guardLog: [],
    aiSession: [], aiTurn: [],
    staffAccount: [], roleScope: [], localePreference: [],
    seq: { campaign: 1, coupon: 1, message: 1, job: 1, attempt: 1, redeem: 1, audit: 1, guard: 1, turn: 1, approval: 1 },
  };

  const loadJSON = (name) => fetch(`data/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`无法加载 data/${name}.json`);
    return r.json();
  });

  async function init() {
    const [customers, transactions, events, consent, stores, dailyAgg, memberStore, assumptions] = await Promise.all([
      loadJSON('customers'), loadJSON('transactions'), loadJSON('events'),
      loadJSON('consent'), loadJSON('stores'), loadJSON('daily_agg'),
      loadJSON('member_store_stats'), loadJSON('assumptions'),
    ]);
    DB.customers = customers;
    DB.transactions = transactions;
    DB.events = events;
    DB.consent = consent;
    DB.stores = stores;
    DB.dailyAgg = dailyAgg;
    DB.memberStore = memberStore;
    DB.assumptions = assumptions;

    customers.forEach((c) => DB.byId.set(c.customer_id, c));
    stores.forEach((s) => DB.storeById.set(s.store_id, s));
    consent.forEach((r) => DB.consentIdx.set(r.customer_id + '|' + r.channel, r));
    transactions.forEach((t) => {
      let a = DB.txByCustomer.get(t.customer_id); if (!a) DB.txByCustomer.set(t.customer_id, a = []);
      a.push(t);
      let b = DB.txByStore.get(t.store_id); if (!b) DB.txByStore.set(t.store_id, b = []);
      b.push(t);
    });
    events.forEach((e) => {
      let a = DB.evByCustomer.get(e.customer_id); if (!a) DB.evByCustomer.set(e.customer_id, a = []);
      a.push(e);
    });

    // member_store_stats 列式 → 行式，并建立索引
    const ms = memberStore;
    const msi = new Map();   // cid -> {store_id: row}
    for (let i = 0; i < ms.cols.c.length; i++) {
      const cid = 'M-' + ms.cols.c[i];
      const sid = ms.stores[ms.cols.s[i]];
      let m = msi.get(cid); if (!m) msi.set(cid, m = {});
      m[sid] = { visits: ms.cols.v[i], amount: ms.cols.a[i], cups: ms.cols.p[i], last_ts: ms.cols.l[i], first_ts: ms.cols.f[i] };
    }
    DB.memberStoreIdx = msi;

    seedRuntime();
    DB.ready = true;
    return DB;
  }

  /* ================================================================
   * 1. 账号、权限范围（PRD 2.1 / 表 2 / 6.3.2 分层权限矩阵）
   * ==============================================================*/
  const ACCOUNTS = [
    {
      account_id: 'hq.marketing', name: '总部营销人员', role: 'L1_HQ_MARKETING',
      scope_type: 'all_hk', scope_id: null, can_approve: true, can_manage_accounts: false,
      badge: '营', desc: '运营权限',
    },
    {
      account_id: 'hq.admin', name: '总部账号管理员', role: 'L1_HQ_ADMIN',
      scope_type: 'all_hk', scope_id: null, can_approve: true, can_manage_accounts: true,
      badge: '管', desc: '账号与权限',
    },
    {
      account_id: 'store.taikoo01', name: '门店员工', role: 'L3_STORE', display_name: '太古城店员',
      scope_type: 'store', scope_id: 'PCC-TKO03', can_approve: false, can_manage_accounts: false,
      badge: '店', desc: '太古城门店',
    },
    {
      account_id: 'store.central02', name: '门店员工', role: 'L3_STORE', display_name: '中环店员',
      scope_type: 'store', scope_id: 'PCC-CEN01', can_approve: false, can_manage_accounts: false,
      badge: '店', desc: '中环门店',
    },
  ];

  /* 总部对各门店的授权上限（表 9：设定券面额/折扣上限由 L1 掌握）
     discount_max: 允许的最大折扣力度（8 折 = 0.8）；buy_one_get_one 视为超出 */
  const HQ_POLICY = {
    store_discount_floor: 0.80,          // 门店活动折扣不得低于 8 折（0.8）
    get store_allowed_coupon_types() { return Object.keys(COUPON_TYPES); },
    store_require_approval: true,
    hq_auto_approve_threshold: null,     // 总部提交仍需审批（按活动审批配置）
    frequency_cap: { per_customer_per_week: 3, per_customer_per_day: 1 },
    region_role_enabled: false,          // 香港当前不启用区域负责人
  };

  /* ================================================================
   * 2. 券种定义（PRD 表 6 · 6.2.1 示例券规则与发放限制）
   * ==============================================================*/
  const COUPON_TYPES = {
    newbie: {
      key: 'newbie', name: '新人券', discount: 0.70, discount_label: '7 折',
      trigger: 'signup_day', trigger_label: '注册当日触发',
      validity_mode: 'fixed_from_issue', validity_days: 7, validity_label: '注册当日起 7 天',
      per_member: 1, per_member_label: '每位会员一次',
      stack_points: false, stack_label: '不可与积分同用',
      scope: 'all_hk', scope_label: '全港门店',
      auto: true, category: 'auto_rule',
      rules: ['注册日期缺失则不触发', '每位会员仅一次', '不可与积分同单使用'],
    },
    birthday: {
      key: 'birthday', name: '生日券', discount: 0.50, discount_label: '5 折',
      trigger: 'birthday', trigger_label: '生日当天触发',
      validity_mode: 'fixed_from_issue', validity_days: 7, validity_label: '生日当天起 7 天',
      per_member: 1, per_member_label: '每位会员每年一次',
      stack_points: false, stack_label: '不可与积分同用',
      scope: 'all_hk', scope_label: '全港门店',
      auto: true, category: 'auto_rule',
      rules: ['生日月日缺失则不触发', '每年一次', '不可与积分同单使用'],
    },
    winback: {
      key: 'winback', name: '30 天回流券', discount: 0.80, discount_label: '8 折',
      trigger: 'dormant_30', trigger_label: '连续 30 天未消费触发',
      validity_mode: 'from_claim', validity_days: 3, validity_label: '未领取长期保留；领取日起 3 天',
      per_member: 1, per_member_label: '同一轮不重复发放',
      stack_points: true, stack_label: '可与积分同用',
      scope: 'all_hk', scope_label: '全港门店',
      auto: true, category: 'auto_rule', requires_claim: true,
      rules: ['未领取长期保留，不计有效期', '领取日起 3 天有效', '同一轮不重复发放',
              '使用后再次连续 30 天未消费可进入下一轮'],
    },
    halloween: {
      key: 'halloween', name: '万圣限定券', discount: 0.80, discount_label: '8 折',
      trigger: 'theme_window', trigger_label: '万圣节主题活动',
      validity_mode: 'fixed_window', window: ['2026-10-24', '2026-11-07'],
      validity_label: '万圣节前后一周，约半个月',
      per_member: 1, per_member_label: '每人一次',
      stack_points: true, stack_label: '可与积分同用',
      scope: 'all_hk', scope_label: '全港门店',
      auto: false, category: 'theme', both_modes: true,
      rules: ['可逐批人工批准或批准规则后自动发放', '每人一次', '可与积分同单使用'],
    },
    student: {
      key: 'student', name: '学生优惠券', discount: 0.75, discount_label: '7.5 折',
      trigger: 'student_eligible', trigger_label: '学生资格有效的会员可领取',
      validity_mode: 'from_claim', validity_days: 7, validity_label: '领取日起 7 天',
      per_member: 1, per_member_label: '每月一次',
      stack_points: true, stack_label: '可与积分同用',
      scope: 'all_hk', scope_label: '全港门店',
      auto: false, category: 'theme', requires_claim: true,
      rules: ['学生资格缺失或过期则不发', '每月一次，同月不可重复领取', '可与积分同单使用'],
    },
    store_local: {
      key: 'store_local', name: '门店本地券', discount: 0.85, discount_label: '8.5 折',
      trigger: 'manual', trigger_label: '门店本地活动',
      validity_mode: 'from_claim', validity_days: 14, validity_label: '领取日起 14 天',
      per_member: 1, per_member_label: '每人一次',
      stack_points: true, stack_label: '可与积分同用',
      scope: 'store', scope_label: '仅创建门店',
      auto: false, category: 'store',
      rules: ['仅适用于创建门店', '须经总部或指定上级审批', '门店折扣不得低于总部授权上限'],
    },
  };

  const STATUS = {
    campaign: { draft: '草稿', pending: '待审批', approved: '已批准', rejected: '已驳回', running: '运行中', stopped: '停用' },
    job: { queued: '待执行', success: '成功', failed: '失败', retry: '待重试', handled: '已处理' },
    notify: { pending: '待发送', sent: '已发送', failed: '失败' },
    coupon: { unclaimed: '待领取', claimed: '已领取', used: '已使用', expired: '已过期', void: '已作废' },
  };

  /* ================================================================
   * 3. 会员筛选引擎（PRD 表 6 / 2.1 门店可见性 / 9.1 数据隔离）
   * ==============================================================*/
  /**
   * 计算某会员在给定门店范围下的消费统计。
   *   scopeType='all_hk'  → 全港累计
   *   scopeType='store'   → 仅该单店交易（门店账号）
   *   scopeType='stores'  → scopeId 为门店 ID 数组，合计所选门店（总部多选）
   * 这是门店隔离的核心：门店只能看到本店交易形成的统计值。
   */
  function memberStats(customerId, scopeType, scopeId) {
    const c = DB.byId.get(customerId);
    const m = DB.memberStoreIdx.get(customerId) || {};
    if (scopeType === 'store') {
      const r = m[scopeId];
      if (!r) return null;        // 从未在本店消费 → 门店不可见
      return {
        store_id: scopeId, visits: r.visits, amount: r.amount, cups: r.cups,
        last_ts: r.last_ts, last_date: r.last_ts.slice(0, 10),
        days_since: dayDiff(iso(PCC_TODAY()), r.last_ts.slice(0, 10)),
        scope: 'store',
      };
    }
    if (scopeType === 'stores') {
      // 总部多选门店：合计所选门店的交易；未在所选门店消费的会员不可见
      const ids = Array.isArray(scopeId) ? scopeId : [scopeId];
      let visits = 0, amount = 0, cups = 0, last = '', first = '9999', hit = 0;
      const perStore = {};
      ids.forEach((sid) => {
        const r = m[sid];
        if (!r) return;
        hit++;
        perStore[sid] = r;
        visits += r.visits; amount += r.amount; cups += r.cups;
        if (r.last_ts > last) last = r.last_ts;
        if (r.first_ts < first) first = r.first_ts;
      });
      if (!hit) return null;      // 所选门店均无消费记录 → 不可见
      return {
        store_id: null, store_ids: ids, per_store: perStore, visits,
        amount: Math.round(amount * 10) / 10, cups,
        last_ts: last, last_date: last.slice(0, 10),
        days_since: dayDiff(iso(PCC_TODAY()), last.slice(0, 10)),
        scope: 'stores', customer: c,
      };
    }
    // 全港：合计所有门店
    let visits = 0, amount = 0, cups = 0, last = '', first = '9999';
    for (const sid in m) {
      visits += m[sid].visits; amount += m[sid].amount; cups += m[sid].cups;
      if (m[sid].last_ts > last) last = m[sid].last_ts;
      if (m[sid].first_ts < first) first = m[sid].first_ts;
    }
    if (visits === 0) return null;
    return {
      store_id: null, visits, amount: Math.round(amount * 10) / 10, cups,
      last_ts: last, last_date: last.slice(0, 10),
      days_since: dayDiff(iso(PCC_TODAY()), last.slice(0, 10)), scope: 'all_hk',
      customer: c,
    };
  }

  function PCC_TODAY() { return d2(C.DATA_TODAY); }

  /**
   * 自由区间匹配。range 支持：
   *   · null / undefined / ''            → 不筛选
   *   · 数字                              → 恰好等于该值
   *   · { min, max }                      → 闭区间；min/max 为 null/'' 表示该方向不限
   *   · 'any'                             → 不筛选（兼容旧值）
   * 若 min > max，按调用方已校验的前提视为无效输入，此处自动交换以免整表判空。
   */
  function inRangeFilter(range, value) {
    if (range == null || range === '' || range === 'any') return true;
    if (typeof range === 'number') return value === range;
    let lo = range.min, hi = range.max;
    const hasLo = lo !== null && lo !== undefined && lo !== '';
    const hasHi = hi !== null && hi !== undefined && hi !== '';
    if (!hasLo && !hasHi) return true;
    let loN = hasLo ? Number(lo) : null;
    let hiN = hasHi ? Number(hi) : null;
    if (loN !== null && isNaN(loN)) loN = null;
    if (hiN !== null && isNaN(hiN)) hiN = null;
    if (loN !== null && hiN !== null && loN > hiN) { const t = loN; loN = hiN; hiN = t; }
    if (loN !== null && value < loN) return false;
    if (hiN !== null && value > hiN) return false;
    return true;
  }

  /**
   * 筛选会员。filters 见 UI「会员筛选条件」。
   * 返回 { list, total }，list 为通过筛选的会员（含统计值与资格状态）。
   *
   * 门店范围规则（PRD 2.1 / 9.1）：
   *   · 门店账号：范围由账号权限锁定为本店，忽略任何外部传入的 storeScope。
   *   · 总部账号：可按需传入 storeScope = { ids:[...] } 只统计所选门店；
   *     未传或 ids 为空表示全港门店。
   */
  function filterMembers(filters, account) {
    const f = filters || {};
    const todayStr = C.DATA_TODAY;

    // ---- 解析生效的门店范围 ----
    let scopeType = account.scope_type;
    let scopeId = account.scope_id;
    if (scopeType !== 'store') {
      // 总部：门店多选（空 → 全港）。storeScope 接受数组或 { ids:[...] } 两种写法。
      const raw = f.storeScope;
      const ids = (Array.isArray(raw) ? raw : (raw && Array.isArray(raw.ids) ? raw.ids : []))
        .filter(Boolean);
      if (ids.length) { scopeType = 'stores'; scopeId = ids; }
      else { scopeType = 'all_hk'; scopeId = null; }
    }
    const scopeLabel = scopeType === 'store' ? storeLabel(scopeId) : null;

    const out = [];
    for (const c of DB.customers) {
      const st = memberStats(c.customer_id, scopeType, scopeId);
      if (!st) continue;                                    // 门店隔离：范围内无消费即不可见

      // 最近消费
      if (f.recency && f.recency !== 'any') {
        const d = st.days_since;
        if (f.recency === 'lte7' && !(d <= 7)) continue;
        if (f.recency === 'lte30' && !(d <= 30)) continue;
        if (f.recency === 'dormant30' && !(d >= 30)) continue;
        if (f.recency === 'dormant60' && !(d >= 60)) continue;
        if (f.recency === 'dormant90' && !(d >= 90)) continue;
      }
      // 累计消费 / 购买杯数：自由区间（PRD 表 12 仅要求「按杯数与消费金额筛选」，
      // 不限定固定档位）。支持 {min, max}，任一端留空表示不设该方向的界限。
      if (!inRangeFilter(f.amount, st.amount)) continue;
      if (!inRangeFilter(f.cups, st.cups)) continue;
      // 会员等级
      if (f.tier && f.tier !== 'any' && c.member_tier !== f.tier) continue;
      // 注册渠道
      if (f.channel && f.channel !== 'any' && c.signup_channel !== f.channel) continue;
      // 学生资格
      if (f.student === 'yes' && !(c.student_eligibility && c.student_eligibility.eligible)) continue;
      // 新人（近 N 天注册）
      if (f.newbie === 'yes') {
        if (!c.signup_date) continue;
        if (dayDiff(todayStr, c.signup_date) > 30) continue;
      }
      // 生日当月
      if (f.birthdayMonth === 'yes') {
        if (!c.birthday_mmdd) continue;
        if (c.birthday_mmdd.slice(0, 2) !== todayStr.slice(5, 7)) continue;
      }

      out.push({
        customer_id: c.customer_id,
        phone_masked: maskPhone(c.phone),
        member_tier: c.member_tier,
        archetype: c.archetype,
        signup_date: c.signup_date,
        birthday_mmdd: c.birthday_mmdd,
        student_eligible: !!(c.student_eligibility && c.student_eligibility.eligible),
        visit_count: st.visits, amount: st.amount, cups: st.cups,
        last_date: st.last_date, days_since: st.days_since,
        store_id: scopeType === 'store' ? scopeId : null,
        store_ids: scopeType === 'stores' ? scopeId : null,
        // 多选门店时，标记该会员在所选门店中的哪几家消费过
        matched_stores: scopeType === 'stores' ? Object.keys(st.per_store || {}) : null,
      });
    }
    return { list: out, total: out.length, scope_type: scopeType,
             scope_ids: scopeType === 'stores' ? scopeId : null };
  }

  /** 电话掩码：香港 8 位号码前 4 位以星号隐藏，仅保留末 4 位（PRD 2.1）*/
  function maskPhone(phone) {
    if (!phone) return '****';
    return '**** ' + phone.slice(-4);
  }

  /* ================================================================
   * 4. 资格检查（PRD 表 5 步骤 6：范围 / 同意 / 频次 / 同轮去重）
   * ==============================================================*/
  /* ================================================================
   * 规则优先级（老师反馈第 5 条；PRD 6.2.1 列为待 PCC 确认项）
   *
   * 同一会员同时命中多条「运行中」规则时，只发优先级最高的一张，
   * 其余规则对该会员记为 PRIORITY_YIELD（优先级让步），不发券但留记录。
   *
   * 级别：生日 100 > 新人 90 > 回流 80 > 主题 70 = 门店本地 70 > 学生 60
   *   · 主题券与门店本地券**平级**（按需求方确认）
   *   · 同级并列时：适用范围更窄者优先（单店 > 多店 > 全港），再按活动编号先后
   *
   * 注意：这组数值是「工作台可配置项」，不是 PCC 现行运营政策；
   * 上线前须由 PCC 审定（PRD 6.2.1 / 8.4）。
   * ==============================================================*/
  const RULE_PRIORITY = {
    birthday: 100, newbie: 90, winback: 80,
    halloween: 70, store_local: 70,   // ← 主题与门店本地平级
    student: 60,
  };

  function priorityLevel(couponType) {
    return Object.prototype.hasOwnProperty.call(RULE_PRIORITY, couponType)
      ? RULE_PRIORITY[couponType] : 50;
  }

  /** 适用范围精度：单店 3 > 多店 2 > 全港 1 */
  function scopeRank(campaign) {
    if (campaign.store_scope === 'store') return 3;
    if (campaign.store_scope === 'stores') return 2;
    return 1;
  }

  /** a 是否优先于 b（级别 → 范围精度 → 编号先后） */
  function outranks(a, b) {
    const la = priorityLevel(a.coupon_type);
    const lb = priorityLevel(b.coupon_type);
    if (la !== lb) return la > lb;
    const sa = scopeRank(a);
    const sb = scopeRank(b);
    if (sa !== sb) return sa > sb;
    return String(a.campaign_id) < String(b.campaign_id);
  }

  /** 当前日期是否落在该券种的触发窗口内（轻量判断，不含同意/频控） */
  function triggerMatches(customerId, couponType, todayStr, storeId) {
    const c = DB.byId.get(customerId);
    if (!c) return false;
    if (couponType === 'newbie') return !!c.signup_date && dayDiff(todayStr, c.signup_date) <= 30;
    if (couponType === 'birthday') {
      return !!c.birthday_mmdd && c.birthday_mmdd.slice(0, 2) === todayStr.slice(5, 7);
    }
    if (couponType === 'student') {
      const se = c.student_eligibility;
      return !!(se && se.eligible && se.valid_until >= todayStr);
    }
    if (couponType === 'winback') {
      const st = memberStats(customerId, storeId ? 'store' : 'all_hk', storeId);
      return !!(st && st.days_since >= 30);
    }
    if (couponType === 'halloween') {
      const w = COUPON_TYPES.halloween.window;
      return todayStr >= w[0] && todayStr <= w[1];
    }
    if (couponType === 'store_local') {
      return !!(storeId ? memberStats(customerId, 'store', storeId) : null);
    }
    return false;
  }

  /** 该规则的门店范围是否覆盖此会员（在给定门店上下文中） */
  function ruleAppliesTo(campaign, customerId, storeId) {
    if (campaign.store_scope === 'store') {
      if (storeId && campaign.store_id !== storeId) return false;
      return !!memberStats(customerId, 'store', campaign.store_id);
    }
    if (campaign.store_scope === 'stores') {
      const ids = campaign.store_ids || [];
      return ids.some((sid) => memberStats(customerId, 'store', sid));
    }
    return true;
  }

  /**
   * 找出会把该会员「接走」的更高优先级规则。
   * 只比较：运行中 + 范围覆盖 + 触发命中 + 该规则自身不会因去重被拦的规则。
   */
  function findHigherPriorityRule(customerId, currentCampaign, todayStr, storeId) {
    if (!currentCampaign) return null;
    const running = DB.campaigns.filter((c) =>
      c.status === 'running' && c.campaign_id !== currentCampaign.campaign_id);
    let winner = null;
    for (let i = 0; i < running.length; i++) {
      const c = running[i];
      // 同券种之间不构成竞争：同轮去重已保证只发一张，谁发都是同一张券
      if (c.coupon_type === currentCampaign.coupon_type) continue;
      if (!outranks(c, currentCampaign)) continue;
      if (!ruleAppliesTo(c, customerId, storeId)) continue;
      const ctxStore = c.store_scope === 'store' ? c.store_id : storeId;
      if (!triggerMatches(customerId, c.coupon_type, todayStr, ctxStore)) continue;
      const dup = checkDuplicate(customerId, c.coupon_type, { campaign: c, today: todayStr });
      if (dup.blocked) continue;                  // 该规则自己也发不出去，不算竞争
      if (!winner || outranks(c, winner)) winner = c;
    }
    return winner;
  }

  /** 供界面展示：当前所有运行中规则的优先级阶梯 */
  function priorityLadder() {
    return DB.campaigns
      .filter((c) => c.status === 'running')
      .slice()
      .sort((a, b) => (outranks(a, b) ? -1 : outranks(b, a) ? 1 : 0))
      .map((c) => ({
        campaign_id: c.campaign_id, name: c.name, coupon_type: c.coupon_type,
        coupon_name: COUPON_TYPES[c.coupon_type].name,
        level: priorityLevel(c.coupon_type),
        scope: scopeLabelOf(c),
        scope_rank: scopeRank(c),
        mode: c.mode,
      }));
  }

  /**
   * 对单个会员 + 券种 + 门店范围执行确定性资格检查。
   * 返回 { eligible:boolean, code, reason }。fail-closed。
   */
  function checkEligibility(customerId, couponKey, opts) {
    opts = opts || {};
    const ct = COUPON_TYPES[couponKey];
    const c = DB.byId.get(customerId);
    if (!c || !ct) return { eligible: false, code: 'MEMBER_NOT_FOUND', reason: '会员不存在或数据缺失。' };

    const todayStr = opts.today || C.DATA_TODAY;
    const scopeId = opts.store_id || null;

    // --- 4.1 券种特定前置条件 ---
    if (couponKey === 'newbie') {
      if (!c.signup_date) return { eligible: false, code: 'MISSING_SIGNUP_DATE', reason: '注册日期缺失，不触发新人券。' };
      const age = dayDiff(todayStr, c.signup_date);
      if (age > 30) return { eligible: false, code: 'NOT_NEWBIE', reason: `注册已 ${age} 天，超出新人券 30 天窗口。` };
    }
    if (couponKey === 'birthday') {
      if (!c.birthday_mmdd) return { eligible: false, code: 'MISSING_BIRTHDAY', reason: '生日月日缺失，不触发生日券。' };
      if (c.birthday_mmdd.slice(0, 2) !== todayStr.slice(5, 7))
        return { eligible: false, code: 'NOT_BIRTHDAY_MONTH', reason: '非生日当月。' };
    }
    if (couponKey === 'student') {
      const se = c.student_eligibility;
      if (!se) return { eligible: false, code: 'NO_STUDENT_RECORD', reason: '无学生资格记录。' };
      if (!se.eligible || se.valid_until < todayStr)
        return { eligible: false, code: 'STUDENT_EXPIRED', reason: `学生资格已于 ${se.valid_until} 到期或无效。` };
    }
    if (couponKey === 'winback') {
      const st = memberStats(customerId, scopeId ? 'store' : 'all_hk', scopeId);
      if (!st) return { eligible: false, code: 'NO_STORE_TXN', reason: '该会员无本店消费记录。' };
      if (st.days_since < 30)
        return { eligible: false, code: 'NOT_DORMANT', reason: `最近消费距今 ${st.days_since} 天，未达连续 30 天未消费。` };
    }

    // --- 4.2 同意检查（PRD 表 3 / 8.2 / 6.2.3）---
    const channel = opts.channel || 'app_push';
    const consent = DB.consentIdx.get(customerId + '|' + channel);
    // 券本身进入 App 券包，但通知需要同意；无同意则跳过通知但不阻断建券
    const notifyAllowed = !!(consent && consent.status === 'granted');

    // --- 4.3 同轮去重 / 每人次数限制（PRD 表 6 / 6.2.1）---
    const dup = checkDuplicate(customerId, couponKey, opts);
    if (dup.blocked) return { eligible: false, code: dup.code, reason: dup.reason };

    // --- 4.4 频控（PRD 6.2.1 待 PCC 确认项，此处使用工作台配置）---
    const freq = checkFrequency(customerId, todayStr);
    if (freq.blocked) return { eligible: false, code: freq.code, reason: freq.reason };

    // --- 4.5 规则优先级：同一会员同时命中多条运行中规则时只发优先级最高的一张 ---
    if (!opts.ignorePriority && opts.campaign) {
      const yieldTo = findHigherPriorityRule(customerId, opts.campaign, todayStr, scopeId);
      if (yieldTo) {
        const mine = priorityLevel(opts.campaign.coupon_type);
        const theirs = priorityLevel(yieldTo.coupon_type);
        return {
          eligible: false, code: 'PRIORITY_YIELD',
          reason: `同时命中更高优先级规则「${yieldTo.name}」（${COUPON_TYPES[yieldTo.coupon_type].name}，优先级 ${theirs}），`
            + `本活动优先级 ${mine}；按规则同一轮只发一张，本活动让步。`,
          yielded_to: yieldTo.campaign_id,
        };
      }
    }

    // --- 4.6 数据完整性 ---
    if (DB.assumptions && !DB.byId.has(customerId))
      return { eligible: false, code: 'DATA_INCOMPLETE', reason: '关键字段缺失。' };

    return {
      eligible: true, code: 'OK', notifyAllowed,
      reason: notifyAllowed ? '通过范围、同意、频次与同轮去重检查。'
                            : '通过资格检查；该渠道未获同意，仅入券包不发送通知。',
    };
  }

  /** 同轮去重 + 每人次数：基于 coupon_instance 与活动轮次键 */
  function checkDuplicate(customerId, couponKey, opts) {
    const ct = COUPON_TYPES[couponKey];
    const todayStr = opts.today || C.DATA_TODAY;
    const mine = DB.couponInstance.filter((x) => x.customer_id === customerId && x.coupon_type === couponKey);

    if (couponKey === 'newbie') {
      if (mine.length) return { blocked: true, code: 'DUP_NEWBIE_ONCE', reason: '新人券每位会员仅一次，已发放。' };
    }
    if (couponKey === 'birthday') {
      const thisYear = todayStr.slice(0, 4);
      if (mine.some((x) => x.issued_at.slice(0, 4) === thisYear))
        return { blocked: true, code: 'DUP_BIRTHDAY_YEAR', reason: `${thisYear} 年生日券已发放，每年一次。` };
    }
    if (couponKey === 'winback') {
      // 同一轮：从首次达到连续 30 天未消费开始，未领取或已领取未使用的同轮券不重发
      const openRound = mine.find((x) => (x.status === 'unclaimed' || x.status === 'claimed'));
      if (openRound)
        return { blocked: true, code: 'DUP_WINBACK_SAME_ROUND',
                 reason: `同一轮回流券（${openRound.coupon_id}，状态${STATUS.coupon[openRound.status]}）仍有效，同轮不重复发放。` };
    }
    if (couponKey === 'student') {
      const ym = todayStr.slice(0, 7);
      if (mine.some((x) => x.issued_at.slice(0, 7) === ym))
        return { blocked: true, code: 'DUP_STUDENT_MONTH', reason: `${ym} 学生券已领取，同月不可重复领取。` };
    }
    if (couponKey === 'halloween' || couponKey === 'store_local') {
      const cid = opts.campaign_id;
      if (cid && mine.some((x) => x.campaign_id === cid))
        return { blocked: true, code: 'DUP_CAMPAIGN_ONCE', reason: '本活动每人一次，该会员已发放。' };
    }
    return { blocked: false };
  }

  /** 频控：同一会员在窗口内的发券次数上限 */
  function checkFrequency(customerId, todayStr) {
    const cap = HQ_POLICY.frequency_cap;
    const wkStart = addDays(todayStr, -6);
    const recent = DB.couponInstance.filter((x) =>
      x.customer_id === customerId && x.issued_at.slice(0, 10) >= wkStart && x.issued_at.slice(0, 10) <= todayStr);
    const sameDay = recent.filter((x) => x.issued_at.slice(0, 10) === todayStr);
    if (sameDay.length >= cap.per_customer_per_day)
      return { blocked: true, code: 'FREQ_DAILY_CAP',
               reason: `当日已发 ${sameDay.length} 张券，达到每日上限 ${cap.per_customer_per_day}。` };
    if (recent.length >= cap.per_customer_per_week)
      return { blocked: true, code: 'FREQ_WEEKLY_CAP',
               reason: `近 7 天已发 ${recent.length} 张券，达到周上限 ${cap.per_customer_per_week}。` };
    return { blocked: false };
  }

  /* ================================================================
   * 5. 发券执行（幂等 + 重试）—— PRD 表 5 步骤 7/8、表 7
   * ==============================================================*/
  /**
   * 幂等键：活动 + 会员 + 触发轮次（PRD 6.2.1）
   * 同一键重复执行不会重复建券。
   */
  function idempotencyKey(campaignId, customerId, round) {
    return `${campaignId}|${customerId}|${round || 'r0'}`;
  }

  /**
   * 执行一个发放任务（自动规则触发或人工批次）。
   * 返回 sendJob，并写入 sendAttempt / couponInstance / messages。
   */
  function executeSendJob(opts) {
    const { campaign, audience, mode, actor, reason } = opts;
    const now = opts.now || C.DATA_TODAY + 'T09:00';
    const jobId = 'J-' + String(DB.seq.job++).padStart(4, '0');
    const job = {
      job_id: jobId, campaign_id: campaign.campaign_id, coupon_type: campaign.coupon_type,
      mode, source: mode === 'auto' ? (campaign.trigger_label || '自动规则') : ('批次 B-' + String(DB.seq.job).padStart(3, '0')),
      requested: audience.length, success: 0, failed: 0, blocked: 0,
      status: 'queued', created_at: now, executed_at: null, actor,
      store_id: campaign.store_scope === 'store' ? campaign.store_id : null,
      coupon_name: COUPON_TYPES[campaign.coupon_type].name,
      discount_label: COUPON_TYPES[campaign.coupon_type].discount_label,
    };
    const attempts = [];
    let blockedList = [];

    audience.forEach((m, i) => {
      const cid = m.customer_id || m;
      const chk = checkEligibility(cid, campaign.coupon_type, {
        store_id: campaign.store_scope === 'store' ? campaign.store_id : null,
        campaign_id: campaign.campaign_id,
        campaign,                       // 供规则优先级比较
        channel: campaign.channel || 'app_push',
      });
      const key = idempotencyKey(campaign.campaign_id, cid, campaign.round || 'r1');

      if (!chk.eligible) {
        job.blocked++;
        blockedList.push({ customer_id: cid, code: chk.code, reason: chk.reason });
        attempts.push({
          attempt_id: 'A-' + String(DB.seq.attempt++).padStart(5, '0'),
          job_id: jobId, customer_id: cid, idempotency_key: key,
          stage: '资格检查', result: 'blocked', code: chk.code, reason: chk.reason,
          at: now,
        });
        return;
      }

      // 幂等：同一键已建券则跳过
      if (DB.couponInstance.some((x) => x.idempotency_key === key)) {
        job.blocked++;
        blockedList.push({ customer_id: cid, code: 'IDEMPOTENT_SKIP', reason: '同一幂等键已建券，跳过。' });
        attempts.push({
          attempt_id: 'A-' + String(DB.seq.attempt++).padStart(5, '0'),
          job_id: jobId, customer_id: cid, idempotency_key: key,
          stage: '发放', result: 'blocked', code: 'IDEMPOTENT_SKIP', reason: '同一幂等键已建券，跳过。',
          at: now,
        });
        return;
      }

      // 模拟渠道失败注入：约 0.2% 触发，用于演示重试流程（PRD 表 13「发送记录」）
      const failRoll = (i * 7919 + campaign.campaign_id.length) % 1000;
      if (opts.injectFailure && failRoll < 3) {
        job.failed++;
        DB.sendAttempt.push({
          attempt_id: 'A-' + String(DB.seq.attempt++).padStart(5, '0'),
          job_id: jobId, customer_id: cid, idempotency_key: key,
          stage: '资格检查', result: 'failed', code: 'ELIGIBILITY_TIMEOUT',
          reason: '资格服务超时，未建立券实例。', at: now,
        });
        attempts.push(DB.sendAttempt[DB.sendAttempt.length - 1]);
        return;
      }

      // 建立券实例（发券成功的唯一标准）
      const ct = COUPON_TYPES[campaign.coupon_type];
      const couponId = 'CP-' + String(DB.seq.coupon++).padStart(6, '0');
      let validFrom = '', validUntil = '';
      if (ct.validity_mode === 'fixed_from_issue') {
        validFrom = now.slice(0, 10); validUntil = addDays(validFrom, ct.validity_days);
      } else if (ct.validity_mode === 'fixed_window') {
        validFrom = ct.window[0]; validUntil = ct.window[1];
      } else if (ct.validity_mode === 'from_claim') {
        validFrom = ct.window ? ct.window[0] : now.slice(0, 10);   // 待领取不计有效期
        validUntil = '';
      }
      DB.couponInstance.push({
        coupon_id: couponId, campaign_id: campaign.campaign_id, customer_id: cid,
        coupon_type: campaign.coupon_type, discount: ct.discount,
        status: 'unclaimed', issued_at: now, claimed_at: null,
        valid_from: validFrom, valid_until: validUntil,
        idempotency_key: key, round: campaign.round || 'r1',
        store_scope: campaign.store_scope, store_id: campaign.store_id || null,
        notify_status: chk.notifyAllowed ? 'sent' : 'pending',
        notify_channel: campaign.channel || 'app_push',
        requires_claim: !!ct.requires_claim,
      });
      job.success++;
      const a = {
        attempt_id: 'A-' + String(DB.seq.attempt++).padStart(5, '0'),
        job_id: jobId, customer_id: cid, idempotency_key: key,
        stage: '发放', result: 'success', code: 'COUPON_CREATED',
        reason: '已建立券实例。', at: now,
      };
      DB.sendAttempt.push(a); attempts.push(a);

      // 通知记录（模拟渠道回执，不代表领取或核销）
      DB.messages.push({
        message_id: 'MSG-' + String(DB.seq.message++).padStart(6, '0'),
        campaign_id: campaign.campaign_id, customer_id: cid,
        channel: campaign.channel || 'app_push',
        status: chk.notifyAllowed ? 'sent' : 'pending',
        approved_by: campaign.approved_by || actor,
        sent_at: chk.notifyAllowed ? now : null,
        coupon_id: couponId,
        consent_basis: (DB.consentIdx.get(cid + '|' + (campaign.channel || 'app_push')) || {}).basis || 'NONE',
      });
    });

    job.attempts = attempts;
    job.blocked_list = blockedList;
    job.status = job.failed > 0 ? 'failed' : 'success';
    job.executed_at = now;
    job.notify_sent = attempts.filter((a) => a.result === 'success').length;
    DB.sendJob.push(job);

    audit(actor, 'execute_send_job', 'send_job', jobId,
      `执行发放：${campaign.name}，应发 ${job.requested}，成功 ${job.success}，失败 ${job.failed}，拦截 ${job.blocked}`, reason);
    return job;
  }

  /** 重试失败任务：沿用同一幂等键，避免重复建券（PRD 5.2 / 9.1）*/
  function retrySendJob(jobId, actor, reason) {
    const job = DB.sendJob.find((j) => j.job_id === jobId);
    if (!job) return { ok: false, error: '任务不存在' };
    const failed = DB.sendAttempt.filter((a) => a.job_id === jobId && a.result === 'failed');
    if (!failed.length) return { ok: false, error: '该任务没有可重试的失败记录' };
    const campaign = DB.campaigns.find((c) => c.campaign_id === job.campaign_id) || {
      campaign_id: job.campaign_id, coupon_type: job.coupon_type, name: job.campaign_id,
      store_scope: 'all_hk', channel: 'app_push',
    };
    let recovered = 0;
    failed.forEach((f) => {
      // 沿用同一幂等键
      if (DB.couponInstance.some((x) => x.idempotency_key === f.idempotency_key)) return;
      const ct = COUPON_TYPES[job.coupon_type];
      const couponId = 'CP-' + String(DB.seq.coupon++).padStart(6, '0');
      let validFrom = C.DATA_TODAY, validUntil = '';
      if (ct.validity_mode === 'fixed_from_issue') validUntil = addDays(validFrom, ct.validity_days);
      else if (ct.validity_mode === 'fixed_window') { validFrom = ct.window[0]; validUntil = ct.window[1]; }
      DB.couponInstance.push({
        coupon_id: couponId, campaign_id: job.campaign_id, customer_id: f.customer_id,
        coupon_type: job.coupon_type, discount: ct.discount, status: 'unclaimed',
        issued_at: C.DATA_TODAY + 'T10:30', claimed_at: null,
        valid_from: validFrom, valid_until: validUntil,
        idempotency_key: f.idempotency_key, round: 'r1',
        store_scope: campaign.store_scope || 'all_hk', store_id: campaign.store_id || null,
        notify_status: 'sent', notify_channel: campaign.channel || 'app_push',
        requires_claim: !!ct.requires_claim,
      });
      f.result = 'success'; f.code = 'RETRY_OK'; f.reason = '重试成功，已建立券实例（沿用原幂等键）。';
      f.retried_at = C.DATA_TODAY + 'T10:30';
      recovered++;
    });
    job.failed = Math.max(0, job.failed - recovered);
    job.success += recovered;
    job.status = job.failed > 0 ? 'failed' : 'success';
    job.retry_history = job.retry_history || [];
    job.retry_history.push({ at: C.DATA_TODAY + 'T10:30', by: actor, recovered, reason });
    audit(actor, 'retry_send_job', 'send_job', jobId, `重试失败任务，恢复 ${recovered} 张券（沿用原幂等键）`, reason);
    return { ok: true, recovered };
  }

  function markJobHandled(jobId, actor, reason) {
    const job = DB.sendJob.find((j) => j.job_id === jobId);
    if (!job) return { ok: false, error: '任务不存在' };
    job.status = 'handled';
    job.handled_by = actor; job.handled_at = C.DATA_TODAY + 'T11:00';
    audit(actor, 'mark_job_handled', 'send_job', jobId, '标记失败任务已处理', reason);
    return { ok: true };
  }

  /* ================================================================
   * 6. 领取 / 核销（PRD 表 7、表 12、9.1 回流券领取）
   * ==============================================================*/
  function claimCoupon(couponId, actor) {
    const cp = DB.couponInstance.find((x) => x.coupon_id === couponId);
    if (!cp) return { ok: false, error: '券不存在' };
    if (cp.status !== 'unclaimed') return { ok: false, error: `券状态为「${STATUS.coupon[cp.status]}」，不可领取` };
    const ct = COUPON_TYPES[cp.coupon_type];
    cp.status = 'claimed';
    cp.claimed_at = C.DATA_TODAY + 'T14:20';
    if (ct.validity_mode === 'from_claim') {
      // 领取日起开始计算有效期（PRD 9.1：未领取不计 3 天）
      cp.valid_from = C.DATA_TODAY;
      cp.valid_until = addDays(C.DATA_TODAY, ct.validity_days);
    }
    audit(actor || cp.customer_id, 'claim_coupon', 'coupon_instance', couponId,
      `会员领取优惠券（${ct.name}），有效期 ${cp.valid_from} ~ ${cp.valid_until}`, '会员主动领取');
    return { ok: true, coupon: cp };
  }

  /** 核销：一笔订单最多核销一张券；可叠加券允许先积分抵付再折扣（PRD 6.2.1）*/
  function redeemCoupon(couponId, orderAmount, usePoints, actor) {
    const cp = DB.couponInstance.find((x) => x.coupon_id === couponId);
    if (!cp) return { ok: false, error: '券不存在' };
    if (cp.status !== 'claimed') return { ok: false, error: `券状态为「${STATUS.coupon[cp.status]}」，不可核销` };
    if (cp.valid_until && C.DATA_TODAY > cp.valid_until) return { ok: false, error: '券已超过有效期' };
    const ct = COUPON_TYPES[cp.coupon_type];

    if (usePoints && !ct.stack_points)
      return { ok: false, error: `${ct.name} ${ct.stack_label}，不能与积分同单使用。` };

    // 结算顺序：先积分抵付，再对剩余金额应用一张折扣券
    let remaining = orderAmount;
    let pointValue = 0;
    if (usePoints) {
      // PCC：每 20 分抵 HK$1（PRD 6.2.1）
      const pointsUsed = Math.min(usePoints, Math.floor(orderAmount * 20));
      pointValue = pointsUsed / 20;
      remaining = Math.max(0, orderAmount - pointValue);
    }
    const paid = Math.round(remaining * ct.discount * 100) / 100;

    cp.status = 'used';
    cp.redeemed_at = C.DATA_TODAY + 'T12:45';
    const r = {
      redemption_id: 'RD-' + String(DB.seq.redeem++).padStart(6, '0'),
      coupon_id: couponId, transaction_id: 'T-SIM' + String(DB.seq.redeem).padStart(4, '0'),
      customer_id: cp.customer_id, store_id: cp.store_id || 'PCC-TKO03',
      redeemed_at: cp.redeemed_at, order_amount: orderAmount,
      points_used: usePoints ? Math.floor(orderAmount * 20) : 0,
      point_value: pointValue, paid_amount: paid,
      discount_applied: ct.discount_label, coupon_type: cp.coupon_type,
    };
    DB.redemption.push(r);
    audit(actor || cp.customer_id, 'redeem_coupon', 'redemption', r.redemption_id,
      `核销 ${ct.name}：原价 HK$${orderAmount}，积分抵付 HK$${pointValue}，实付 HK$${paid}`, '模拟核销');
    return { ok: true, redemption: r, coupon: cp };
  }

  /* ================================================================
   * 7. 指标聚合（PRD 表 12 指标口径）
   * ==============================================================*/
  /**
   * 按券种/活动 + 日期范围聚合。三事件按各自发生时间计数；
   * 领取率与核销率使用同一发放群体及统一截至时点。
   */
  function computeMetrics(filter, account) {
    const { couponTypes, campaignIds, dateFrom, dateTo, storeFilter } = filter;
    const inRange = (ts, f, t) => {
      const d = ts.slice(0, 10);
      return d >= f && d <= t;
    };
    const typeSet = (couponTypes && couponTypes.length) ? new Set(couponTypes) : null;
    const campSet = (campaignIds && campaignIds.length) ? new Set(campaignIds) : null;

    // 门店账号：仅统计适用范围覆盖本店的活动。
    // 总部账号可用 storeFilter 主动查看某门店（按活动覆盖范围，口径与门店账号一致）。
    const storeScoped = account.scope_type === 'store';
    const myStore = account.scope_id;
    const scopeStore = storeScoped ? myStore : (storeFilter || null);
    const applyStoreFilter = !!scopeStore && scopeStore !== '__all';

    const coupons = DB.couponInstance.filter((cp) => {
      if (typeSet && !typeSet.has(cp.coupon_type)) return false;
      if (campSet && !campSet.has(cp.campaign_id)) return false;
      if (applyStoreFilter) {
        const camp = DB.campaigns.find((c) => c.campaign_id === cp.campaign_id);
        if (!campaignCoversStore(camp, scopeStore)) return false;
      }
      return true;
    });
    const cidSet = new Set(coupons.map((c) => c.coupon_id));

    const issued = coupons.filter((c) => inRange(c.issued_at, dateFrom, dateTo));
    const claimed = coupons.filter((c) => c.claimed_at && inRange(c.claimed_at, dateFrom, dateTo));
    const used = coupons.filter((c) => c.redeemed_at && inRange(c.redeemed_at, dateFrom, dateTo));

    // 同一发放群体的率值：分母 = 区间内发放的券，分子 = 该群体中截至统计时点已领取/已核销
    const issuedIds = new Set(issued.map((c) => c.coupon_id));
    const claimedOfIssued = coupons.filter((c) => issuedIds.has(c.coupon_id) && c.claimed_at).length;
    const usedOfIssued = coupons.filter((c) => issuedIds.has(c.coupon_id) && c.redeemed_at).length;

    // 昨日回流券领取人数（去重会员）
    const yest = addDays(C.DATA_TODAY, -1);
    const winbackYesterday = new Set(
      DB.couponInstance.filter((c) => c.coupon_type === 'winback' && c.claimed_at && c.claimed_at.slice(0, 10) === yest)
        .map((c) => c.customer_id)).size;

    // 按券种明细
    const byType = {};
    couponTypeKeys().forEach((k) => {
      const set = coupons.filter((c) => c.coupon_type === k);
      const iss = set.filter((c) => inRange(c.issued_at, dateFrom, dateTo));
      const ids = new Set(iss.map((c) => c.coupon_id));
      const cl = set.filter((c) => ids.has(c.coupon_id) && c.claimed_at).length;
      const us = set.filter((c) => ids.has(c.coupon_id) && c.redeemed_at).length;
      byType[k] = {
        key: k, name: COUPON_TYPES[k].name, discount_label: COUPON_TYPES[k].discount_label,
        issued: iss.length, claimed: cl, used: us,
        claim_rate: iss.length ? cl / iss.length : 0,
        redeem_rate: iss.length ? us / iss.length : 0,
      };
    });

    // 按活动明细：先把券按活动分组、核销按券 ID 建索引，避免 O(n²) 的 some 查找
    const byCampId = new Map();
    for (const c of coupons) {
      let g = byCampId.get(c.campaign_id);
      if (!g) { g = []; byCampId.set(c.campaign_id, g); }
      g.push(c);
    }
    const redeemByCid = new Map();
    for (const r of DB.redemption) {
      let arr = redeemByCid.get(r.coupon_id);
      if (!arr) { arr = []; redeemByCid.set(r.coupon_id, arr); }
      arr.push(r);
    }
    const byCampaign = DB.campaigns.map((camp) => {
      const set = byCampId.get(camp.campaign_id) || [];
      const iss = set.filter((c) => inRange(c.issued_at, dateFrom, dateTo));
      const ids = new Set(iss.map((c) => c.coupon_id));
      let paid = 0;
      for (const c of set) {
        const arr = redeemByCid.get(c.coupon_id);
        if (!arr) continue;
        for (const r of arr) {
          if (inRange(r.redeemed_at, dateFrom, dateTo) &&
              (!applyStoreFilter || r.store_id === scopeStore)) paid += r.paid_amount;
        }
      }
      return {
        campaign_id: camp.campaign_id, name: camp.name,
        coupon_type: camp.coupon_type, coupon_name: COUPON_TYPES[camp.coupon_type].name,
        discount_label: COUPON_TYPES[camp.coupon_type].discount_label,
        mode: camp.mode, status: camp.status,
        scope_label: camp.store_scope === 'all_hk' ? '全港门店' : storeLabel(camp.store_id),
        issued: iss.length,
        claimed: set.filter((c) => ids.has(c.coupon_id) && c.claimed_at).length,
        used: set.filter((c) => ids.has(c.coupon_id) && c.redeemed_at).length,
        paid_amount: round1(paid),
      };
    });

    // 每日趋势：一次遍历按日期分桶，替代「每天 × 全部券」的重复 filter
    const days = [];
    let cur = dateFrom;
    while (cur <= dateTo && days.length < 400) { days.push(cur); cur = addDays(cur, 1); }
    const issuedByDay = new Map(), claimedByDay = new Map(), usedByDay = new Map();
    for (const c of coupons) {
      const di = c.issued_at.slice(0, 10);
      issuedByDay.set(di, (issuedByDay.get(di) || 0) + 1);
      if (c.claimed_at) {
        const dc = c.claimed_at.slice(0, 10);
        claimedByDay.set(dc, (claimedByDay.get(dc) || 0) + 1);
      }
      if (c.redeemed_at) {
        const dr = c.redeemed_at.slice(0, 10);
        usedByDay.set(dr, (usedByDay.get(dr) || 0) + 1);
      }
    }
    const trend = days.map((d) => ({
      date: d,
      issued: issuedByDay.get(d) || 0,
      claimed: claimedByDay.get(d) || 0,
      used: usedByDay.get(d) || 0,
    }));

    // 相关订单实付
    const paid = round1(DB.redemption
      .filter((r) => cidSet.has(r.coupon_id) && inRange(r.redeemed_at, dateFrom, dateTo) &&
                     (!applyStoreFilter || r.store_id === scopeStore))
      .reduce((s, r) => s + r.paid_amount, 0));

    // 最近异常（PRD 表 12）
    const anomalies = [];
    DB.sendAttempt.filter((a) => a.code && a.code !== 'COUPON_CREATED' && a.code !== 'RETRY_OK')
      .slice(-60).reverse().forEach((a) => {
        anomalies.push({
          type: a.result === 'failed' ? 'send_failed' : 'blocked',
          code: a.code, reason: a.reason, job_id: a.job_id,
          customer_id: a.customer_id, at: a.at,
          label: ANOMALY_LABEL[a.code] || a.code,
        });
      });

    return {
      issued: issued.length, claimed: claimed.length, used: used.length,
      paid_amount: paid,
      claim_rate: issued.length ? claimedOfIssued / issued.length : 0,
      redeem_rate: issued.length ? usedOfIssued / issued.length : 0,
      claimed_of_issued: claimedOfIssued,
      used_of_issued: usedOfIssued,
      winback_yesterday: winbackYesterday,
      byType, byCampaign, trend, anomalies,
      updated_at: C.NOW_LABEL,
      // 门店总览专用
      store_scoped: storeScoped, store_id: storeScoped ? myStore : null,
      applicable_campaigns: storeScoped ? DB.campaigns.filter((c) => c.status === 'running' &&
        campaignCoversStore(c, myStore)).length : null,
    };
  }

  const ANOMALY_LABEL = {
    FREQ_DAILY_CAP: '频控拦截（当日上限）', FREQ_WEEKLY_CAP: '频控拦截（周上限）',
    DUP_WINBACK_SAME_ROUND: '回流券同轮重复拦截', DUP_NEWBIE_ONCE: '新人券重复拦截',
    DUP_BIRTHDAY_YEAR: '生日券同年重复拦截', DUP_STUDENT_MONTH: '学生券同月重复拦截',
    DUP_CAMPAIGN_ONCE: '活动重复发放拦截', IDEMPOTENT_SKIP: '幂等键拦截',
    ELIGIBILITY_TIMEOUT: '资格服务超时', MISSING_BIRTHDAY: '生日数据缺失',
    MISSING_SIGNUP_DATE: '注册日期缺失', STUDENT_EXPIRED: '学生资格过期', NOT_DORMANT: '未达回流条件',
  };

  const round1 = (n) => Math.round(n * 10) / 10;
  function couponTypeKeys() { return Object.keys(COUPON_TYPES); }
  function storeLabel(sid) { const s = DB.storeById.get(sid); return s ? s.name : sid; }

  /**
   * 活动适用范围的统一文案（PRD 2.1）。
   *   all_hk → 全港门店
   *   store  → 单个门店名
   *   stores → 多个门店名（总部多选；全选等同全港）
   */
  function scopeLabelOf(camp) {
    if (!camp) return '—';
    if (camp.store_scope === 'all_hk') return '全港门店';
    if (camp.store_scope === 'stores') {
      const ids = camp.store_ids || [];
      if (!ids.length || ids.length >= DB.stores.length) return '全港门店';
      if (ids.length === 1) return storeLabel(ids[0]);
      return ids.map(storeLabel).join('、');
    }
    return storeLabel(camp.store_id);
  }

  /** 判断活动是否覆盖某门店（门店可见性 / 门店总览 / 核销统计共用） */
  function campaignCoversStore(camp, storeId) {
    if (!camp) return false;
    if (camp.store_scope === 'all_hk') return true;
    if (camp.store_scope === 'stores') {
      const ids = camp.store_ids || [];
      return !ids.length || ids.includes(storeId);   // 空集合视为全港
    }
    return camp.store_id === storeId;
  }

  /* ================================================================
   * 8. 权限守门（PRD 表 9 确定性规则，fail-closed）
   * ==============================================================*/
  /**
   * 检查活动草稿是否在授权范围内。
   * 返回 { pass, checks:[{name, pass, rule, detail}] }
   */
  function permissionGuard(draft, account) {
    const checks = [];
    const isStore = account.scope_type === 'store';
    const ct = COUPON_TYPES[draft.coupon_type];

    // 1) 门店范围
    if (isStore) {
      const wantStore = draft.store_id || draft.store_scope;
      const ok = draft.store_scope === 'store' && (!wantStore || wantStore === account.scope_id || wantStore === 'store');
      checks.push({
        name: '门店范围', pass: ok,
        rule: `L3 门店账号仅可创建适用于本店（${storeLabel(account.scope_id)}）的活动`,
        detail: ok ? `草稿范围锁定为 ${storeLabel(account.scope_id)}，符合账号权限。`
                   : `草稿请求范围「${draft.store_scope === 'all_hk' ? '全港门店' : wantStore}」超出账号所属门店，已拦截（fail-closed）。`,
      });
    } else {
      // 总部：全港、指定单店、或筛选所选的多个门店，均在授权内
      const multi = draft.store_scope === 'stores' ? (draft.store_ids || []) : [];
      const detail = draft.store_scope === 'all_hk' ? '全港门店'
        : draft.store_scope === 'stores'
          ? (multi.length ? `${multi.length} 家门店（${multi.map(storeLabel).join('、')}）` : '全港门店（未指定具体门店）')
          : storeLabel(draft.store_id);
      checks.push({ name: '门店范围', pass: true, rule: 'L1 总部可创建全港、指定门店或指定多个门店范围的活动',
        detail: `草稿范围：${detail}，在总部授权内。` });
    }

    // 2) 折扣上限
    if (isStore) {
      const floor = HQ_POLICY.store_discount_floor;
      const ok = draft.discount >= floor - 1e-9;
      checks.push({
        name: '折扣上限', pass: ok,
        rule: `总部授权的门店折扣上限为 ${(floor * 10).toFixed(1).replace('.0', '')} 折（不可低于此折扣）`,
        detail: ok ? `草稿折扣 ${(draft.discount * 10).toFixed(1).replace('.0', '')} 折，未超出授权上限。`
                   : `草稿折扣 ${(draft.discount * 10).toFixed(1).replace('.0', '')} 折（${draft.offer_label || '买一送一'}）超出总部授权的 ${(floor * 10).toFixed(1).replace('.0', '')} 折上限。可改为授权内折扣，或提出例外申请交总部指定审批人审核。`,
      });
    } else {
      checks.push({ name: '折扣上限', pass: true, rule: 'L1 总部设定券面额／折扣上限，总部活动不受门店上限约束',
        detail: `草稿折扣 ${(draft.discount * 10).toFixed(1).replace('.0', '')} 折，总部可自行设定。` });
    }

    // 3) 券种授权
    if (isStore) {
      const ok = HQ_POLICY.store_allowed_coupon_types.includes(draft.coupon_type);
      checks.push({
        name: '券种授权', pass: ok,
        rule: `门店可用券种：${HQ_POLICY.store_allowed_coupon_types.map((k) => COUPON_TYPES[k].name).join('、')}`,
        detail: ok ? `券种「${ct ? ct.name : draft.coupon_type}」在门店授权内。`
                   : `券种「${ct ? ct.name : draft.coupon_type}」为总部专属，门店不可创建。`,
      });
    } else {
      checks.push({ name: '券种授权', pass: true, rule: '总部可创建全部券种',
        detail: `券种「${ct ? ct.name : draft.coupon_type}」在总部授权内。` });
    }

    // 4) 审批要求
    checks.push({
      name: '审批要求', pass: true,
      rule: HQ_POLICY.store_require_approval ? '门店活动必须经总部或指定上级审批' : '—',
      detail: isStore
        ? `路由至：总部（区域负责人层级当前香港不启用）`
        : (account.can_approve ? '总部营销人员可提交，按活动审批配置决定是否需另一人审批' : '—'),
    });

    // 5) 日期范围合法性
    const dateOk = !draft.valid_from || !draft.valid_until || draft.valid_until >= draft.valid_from;
    checks.push({ name: '有效期', pass: dateOk, rule: '结束日期不得早于开始日期',
      detail: dateOk ? `有效期 ${draft.valid_from || '按券种规则'} ~ ${draft.valid_until || '按券种规则'}` : '结束日期早于开始日期，请修正。' });

    return { pass: checks.every((c) => c.pass), checks };
  }

  /** 审批路由（PRD 表 9 / 6.3.2）*/
  function routeApproval(draft, account) {
    if (account.scope_type === 'store') {
      return { target: '总部', approver: '总部审批人（陈经理）',
               reason: '门店活动须由总部或指定上级审批；区域负责人层级当前香港不启用。',
               risk: draft.discount < HQ_POLICY.store_discount_floor ? 'high' : 'normal' };
    }
    return { target: '总部审批人', approver: '陈经理',
             reason: '总部活动按活动审批配置提交总部审批人；可与创建者为同一人。',
             risk: 'normal' };
  }

  /* ================================================================
   * 9. 审计与审批日志（PRD 表 7）
   * ==============================================================*/
  function audit(actor, action, objectType, objectId, detail, reason) {
    const e = {
      audit_id: 'AU-' + String(DB.seq.audit++).padStart(6, '0'),
      actor: actor || 'system', action, object_type: objectType, object_id: objectId,
      reason: reason || '', detail: detail || '', at: C.NOW_LABEL,
    };
    DB.auditLog.push(e);
    return e;
  }
  function approvalLog(entry) {
    const e = Object.assign({
      approval_id: 'AP-' + String(DB.seq.approval++).padStart(5, '0'), at: C.NOW_LABEL,
    }, entry);
    DB.approvalLog.push(e);
    return e;
  }
  function guardLog(entry) {
    const e = Object.assign({ guard_id: 'GD-' + String(DB.seq.guard++).padStart(5, '0'), at: C.NOW_LABEL }, entry);
    DB.guardLog.push(e);
    return e;
  }

  /* ================================================================
   * 10. 活动 CRUD 与审批
   * ==============================================================*/
  function createCampaign(draft, account, actor) {
    const id = 'CMP-' + String(DB.seq.campaign++).padStart(4, '0');
    const ct = COUPON_TYPES[draft.coupon_type];
    const camp = {
      campaign_id: id,
      name: draft.name,
      coupon_type: draft.coupon_type,
      coupon_name: ct.name,
      discount: draft.discount != null ? draft.discount : ct.discount,
      mode: draft.mode || (ct.auto ? 'auto' : 'manual'),   // auto | manual
      channel: draft.channel || 'app_push',
      store_scope: draft.store_scope,                       // all_hk | store | stores
      store_id: draft.store_id || null,
      store_ids: draft.store_scope === 'stores' ? (draft.store_ids || []).slice() : null,
      owner: actor,
      created_by: actor,
      created_at: C.NOW_LABEL,
      status: 'pending',
      segment_definition: draft.segment_definition || '',
      audience_size: draft.audience_size || 0,
      valid_from: draft.valid_from || '', valid_until: draft.valid_until || '',
      per_member: ct.per_member, stack_points: ct.stack_points,
      trigger_label: ct.trigger_label,
      source: draft.source || 'manual',                      // manual | ai_draft
      ai_guard: draft.ai_guard || null,
      round: draft.round || 'r1',
      is_theme: ct.category === 'theme',
      is_store: draft.store_scope === 'store',
      category: ct.category,
    };
    DB.campaigns.push(camp);
    approvalLog({ campaign_id: id, action: 'submit', by: actor, decision: 'pending',
                  comment: draft.submit_note || '提交审批', approver: '—', approval_date: '—' });
    audit(actor, 'create_campaign', 'campaigns', id, `创建活动「${draft.name}」并提交审批`, draft.submit_note || '');
    return camp;
  }

  function approveCampaign(campaignId, actor, comment) {
    const camp = DB.campaigns.find((c) => c.campaign_id === campaignId);
    if (!camp) return { ok: false, error: '活动不存在' };
    if (camp.status !== 'pending') return { ok: false, error: `活动状态为「${STATUS.campaign[camp.status]}」，不可再审批` };
    camp.status = camp.mode === 'auto' ? 'running' : 'approved';
    camp.approved_by = actor; camp.approved_at = C.NOW_LABEL;
    camp.approval_comment = comment || '';
    const log = DB.approvalLog.filter((l) => l.campaign_id === campaignId).pop();
    if (log) { log.decision = 'approved'; log.approver = actor; log.approval_date = C.NOW_LABEL; log.comment = comment || log.comment; }
    audit(actor, 'approve_campaign', 'campaigns', campaignId, `批准活动「${camp.name}」`, comment || '');
    return { ok: true, campaign: camp };
  }

  function rejectCampaign(campaignId, actor, comment) {
    const camp = DB.campaigns.find((c) => c.campaign_id === campaignId);
    if (!camp) return { ok: false, error: '活动不存在' };
    if (camp.status !== 'pending') return { ok: false, error: `活动状态为「${STATUS.campaign[camp.status]}」，不可再审批` };
    camp.status = 'rejected'; camp.rejected_by = actor; camp.rejected_at = C.NOW_LABEL;
    camp.reject_comment = comment || '';
    const log = DB.approvalLog.filter((l) => l.campaign_id === campaignId).pop();
    if (log) { log.decision = 'rejected'; log.approver = actor; log.approval_date = C.NOW_LABEL; log.comment = comment || log.comment; }
    audit(actor, 'reject_campaign', 'campaigns', campaignId, `驳回活动「${camp.name}」`, comment || '');
    return { ok: true, campaign: camp };
  }

  /**
   * 启停活动（PRD 表 10 权限矩阵）。
   * 服务端强制，fail-closed：
   *   · 门店账号（L3）无启停权限，直接拒绝；
   *   · 草稿 / 待审批 / 已驳回不可启停；
   *   · 必须写明操作原因，写入审计。
   * opts.account 为当前账号；缺省时按「总部调用」处理（内部流程调用）。
   */
  function setCampaignStatus(campaignId, status, actor, reason, opts) {
    const camp = DB.campaigns.find((c) => c.campaign_id === campaignId);
    if (!camp) return { ok: false, code: 'NOT_FOUND', error: '活动不存在。' };

    const account = opts && opts.account;
    if (account && account.scope_type === 'store') {
      return { ok: false, code: 'FORBIDDEN_STORE', error: '门店账号无启停活动权限，请提交总部处理。' };
    }

    const from = camp.status;
    const allowed = { running: ['stopped'], stopped: ['running'], approved: ['running', 'stopped'] };
    if (!allowed[from] || allowed[from].indexOf(status) < 0) {
      return {
        ok: false, code: 'INVALID_STATE',
        error: `活动当前为「${STATUS.campaign[from]}」，不可直接改为「${STATUS.campaign[status]}」。`,
      };
    }
    if (!reason || !String(reason).trim()) {
      return { ok: false, code: 'REASON_REQUIRED', error: '启停活动须填写操作原因。' };
    }

    camp.status = status;
    audit(actor, status === 'stopped' ? 'stop_campaign' : 'start_campaign', 'campaigns', campaignId,
      `将活动「${camp.name}」由「${STATUS.campaign[from]}」改为「${STATUS.campaign[status]}」`, reason);
    return { ok: true, campaign: camp, from, to: status };
  }

  /* ================================================================
   * 11. 账号管理（PRD 5.3 / 表 2）
   * ==============================================================*/
  function updateStoreAccount(accountId, patch, actor, reason) {
    const acc = DB.staffAccount.find((a) => a.account_id === accountId);
    if (!acc) return { ok: false, error: '账号不存在' };
    const before = { role: acc.role, scope_id: acc.scope_id, status: acc.status };
    Object.assign(acc, patch);
    acc.updated_at = C.NOW_LABEL;
    audit(actor, 'update_account', 'staff_account', accountId,
      `变更门店账号 ${accountId}：${JSON.stringify(before)} → ${JSON.stringify({ role: acc.role, scope_id: acc.scope_id, status: acc.status })}`,
      reason || '');
    return { ok: true, account: acc };
  }
  function createStoreAccount(patch, actor, reason) {
    const id = patch.account_id || ('store.new' + String(DB.staffAccount.length + 1).padStart(2, '0'));
    const acc = Object.assign({
      account_id: id, name: '门店员工', role: 'L3_STORE', status: 'active',
      created_at: C.NOW_LABEL, updated_at: C.NOW_LABEL,
    }, patch);
    DB.staffAccount.push(acc);
    audit(actor, 'create_account', 'staff_account', id, `新增门店账号 ${id}（${storeLabel(acc.scope_id)}）`, reason || '');
    return { ok: true, account: acc };
  }

  /* ================================================================
   * 12. 种子数据：初始活动与模拟发放（使看板/记录页有真实内容）
   * ==============================================================*/
  function seedRuntime() {
    DB.staffAccount = ACCOUNTS.map((a) => Object.assign({ status: 'active', updated_at: '2026-10-28T15:30' }, a));
    DB.roleScope = [
      { scope_type: 'all_hk', scope_id: null, label: '全港' },
      { scope_type: 'region', scope_id: null, label: '区域（预留，香港不启用）' },
    ].concat(DB.stores.map((s) => ({ scope_type: 'store', scope_id: s.store_id, label: s.name })));

    // ---- 初始活动（对应 PRD 图 8 活动管理列表）----
    const seeds = [
      { name: '新人礼遇', coupon_type: 'newbie', mode: 'auto', store_scope: 'all_hk', status: 'running',
        segment: '注册 30 天内且注册日期完整的会员', created_at: '2026-06-01T10:00' },
      { name: '生日礼遇', coupon_type: 'birthday', mode: 'auto', store_scope: 'all_hk', status: 'running',
        segment: '生日月日完整且当月的会员', created_at: '2026-06-01T10:05' },
      { name: '30 天回流会员优惠', coupon_type: 'winback', mode: 'auto', store_scope: 'all_hk', status: 'pending',
        segment: '连续 30 天未消费会员', created_at: '2026-10-29T10:20' },
      { name: '回流礼遇（持续规则）', coupon_type: 'winback', mode: 'auto', store_scope: 'all_hk', status: 'running',
        segment: '连续 30 天未消费会员', created_at: '2025-11-01T09:00' },
      { name: '回流礼遇（持续规则）', coupon_type: 'winback', mode: 'auto', store_scope: 'all_hk', status: 'running',
        segment: '连续 30 天未消费会员', created_at: '2025-11-01T09:00' },
      { name: '万圣限定券', coupon_type: 'halloween', mode: 'manual', store_scope: 'all_hk', status: 'approved',
        segment: '全港活跃会员（主题限定）', created_at: '2026-10-20T14:05' },
      { name: '太古城门店周末活动', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-TKO03', status: 'rejected', segment: '曾在本店消费的会员', created_at: '2026-10-18T11:30' },
      { name: '太古城下午茶推广', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-TKO03', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-12T09:00' },
      { name: '中环早高峰常客回馈', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-CEN01', status: 'approved', segment: '曾在本店消费的会员', created_at: '2026-10-15T08:30' },
      { name: '尖沙咀游客下午茶', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-TST04', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-08-20T09:00' },
      { name: '铜锣湾周末轻食', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-CWB07', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-08-22T09:00' },
      { name: '旺角学生加乘', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-MK05', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-01T09:00' },
      { name: '沙田商场家庭日', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-STN09', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-05T09:00' },
      { name: '屯门社区晨间', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-TMN22', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-08T09:00' },
      { name: '金钟商务午市', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-ADM13', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-10T09:00' },
      { name: '佐敦夜归人优惠', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-JDN30', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-15T09:00' },
      { name: '将军澳亲子时光', coupon_type: 'store_local', mode: 'manual', store_scope: 'store',
        store_id: 'PCC-TSK18', status: 'running', segment: '曾在本店消费的会员', created_at: '2026-09-18T09:00' },
      { name: '学生月度优惠', coupon_type: 'student', mode: 'manual', store_scope: 'all_hk', status: 'running',
        segment: '学生资格有效的会员', created_at: '2026-07-01T09:00' },
    ];
    seeds.forEach((s) => {
      const id = 'CMP-' + String(DB.seq.campaign++).padStart(4, '0');
      const ct = COUPON_TYPES[s.coupon_type];
      DB.campaigns.push({
        campaign_id: id, name: s.name, coupon_type: s.coupon_type, coupon_name: ct.name,
        discount: ct.discount, mode: s.mode, channel: 'app_push',
        store_scope: s.store_scope, store_id: s.store_id || null,
        owner: '总部营销人员', created_by: s.store_scope === 'store' ? '太古城店员' : '总部营销人员',
        created_at: s.created_at, status: s.status,
        segment_definition: s.segment, audience_size: 0,
        valid_from: '', valid_until: '',
        per_member: ct.per_member, stack_points: ct.stack_points,
        trigger_label: ct.trigger_label, source: 'manual',
        round: 'r1', is_theme: ct.category === 'theme',
        is_store: s.store_scope === 'store', category: ct.category,
      });
      // 审批轨迹
      const decisions = { running: 'approved', approved: 'approved', rejected: 'rejected', pending: 'pending', stopped: 'approved' };
      const dec = decisions[s.status] || 'pending';
      DB.approvalLog.push({
        approval_id: 'AP-' + String(DB.seq.approval++).padStart(5, '0'),
        campaign_id: id, action: 'submit',
        by: s.store_scope === 'store' ? '太古城店员' : '总部营销人员',
        decision: dec, at: s.created_at,
        approver: dec === 'pending' ? '—' : (s.store_scope === 'store' ? '林主管' : '陈经理'),
        approval_date: dec === 'pending' ? '—' : (s.status === 'pending' ? '—' :
          new Date(d2(s.created_at.slice(0, 10)).getTime() + 86400000).toISOString().slice(0, 10) + 'T' +
          (s.store_scope === 'store' ? '16:42' : '09:16')),
        comment: dec === 'rejected' ? '折扣超出授权上限，请调整后重新提交。'
               : dec === 'approved' ? '同意执行，请留意频控与同意状态。' : '提交审批',
      });
    });

    // ---- 历史发放：为运行中的规则回填 12 个月券实例与核销 ----
    // PRD 要求看板可按券种与日期查询，日期范围需覆盖 12 个月，
    // 因此历史发券按 365 天回填，并在近月加密以贴近持续运行的自动规则。
    seedHistoricalIssues();

    // ---- 一个失败任务 + 一个待处理任务（PRD 图 11/13）----
    seedSendRecords();
  }

  function seedHistoricalIssues() {
    const R = mulberry32(20261029);
    const days = 365;              // 覆盖 12 个月，供看板按日期范围查询
    const running = DB.campaigns.filter((c) => c.status === 'running' || c.status === 'approved');
    // 30 家门店 / 10,000 会员需要更大的样本量；按会员规模线性放大每日发券量。
    const scaleFactor = Math.max(1, Math.min(2.4, DB.customers.length / 5000));
    // 按「会员 + 券种」建立去重索引，避免历史回填在 5 万张券上做 O(n²) 全表扫描。
    const dedupIdx = new Map();

    for (let dOff = days; dOff >= 0; dOff--) {
      const day = addDays(C.DATA_TODAY, -dOff);
      running.forEach((camp) => {
        const ct = COUPON_TYPES[camp.coupon_type];
        // 每日应发规模，按券种特性；早期活动逐步起量（贴合持续运行规则的成长曲线）
        let scale = ({ newbie: 12, birthday: 8, winback: 60, halloween: 18,
                       student: 12, store_local: 10 }[camp.coupon_type] || 6) * scaleFactor;
        if (camp.store_scope === 'store') scale = 10 * scaleFactor;
        const ramp = 0.45 + 0.55 * (1 - dOff / days);          // 越近的日期发得越多
        const seasonal = 1 + 0.16 * Math.sin((dOff / 365) * Math.PI * 2);
        const n = Math.max(0, Math.round(scale * ramp * seasonal * (0.6 + R() * 0.9)));
        // 万圣限定券仅在主题窗口内发放
        if (camp.coupon_type === 'halloween') {
          if (day < ct.window[0] || day > ct.window[1]) return;
        }
        // 学生券每月只在月初几天发
        if (camp.coupon_type === 'student' && day.slice(8, 10) > '05') return;

        for (let i = 0; i < n; i++) {
          const pool = pickHistoricalCandidates(camp, R);
          if (!pool) break;
          const cid = pool;
          const couponId = 'CP-' + String(DB.seq.coupon++).padStart(6, '0');
          const issuedAt = day + 'T09:00';
          // 按券种规则去重：新人券一次、生日券每年一次、学生券每月一次、
          // 回流券同轮一次、主题与门店券每活动一次 —— 与 checkDuplicate 保持一致
          if (!seedDedupOk(camp, cid, day, dedupIdx)) continue;
          let validFrom = day, validUntil = '';
          if (ct.validity_mode === 'fixed_from_issue') validUntil = addDays(day, ct.validity_days);
          else if (ct.validity_mode === 'fixed_window') { validFrom = ct.window[0]; validUntil = ct.window[1]; }
          else validUntil = '';

          // 领取概率与核销概率：不同券种不同（体现人群差异）
          const claimP = { newbie: 0.72, birthday: 0.81, winback: 0.48, halloween: 0.55, student: 0.66, store_local: 0.60 }[camp.coupon_type] || 0.6;
          const redeemP = { newbie: 0.44, birthday: 0.58, winback: 0.19, halloween: 0.27, student: 0.35, store_local: 0.31 }[camp.coupon_type] || 0.3;

          let status = 'unclaimed', claimedAt = null, redeemedAt = null;
          // 领取发生在发放之后的 0–3 天内（并非同日），使看板三事件趋势彼此错开
          if (R() < claimP) {
            const claimLag = Math.floor(R() * 3);
            claimedAt = addDays(day, claimLag) + 'T' + (13 + Math.floor(R() * 8)) + ':' + (R() < .5 ? '20' : '45');
            if (claimedAt.slice(0, 10) > C.DATA_TODAY) {
              status = 'unclaimed'; claimedAt = null;
            } else {
              status = 'claimed';
              if (ct.validity_mode === 'from_claim') {
                validFrom = claimedAt.slice(0, 10);
                validUntil = addDays(validFrom, ct.validity_days);
              }
              // 核销发生在领取之后的 0–2 天内
              if (R() < redeemP) {
                const useLag = Math.floor(R() * 3);
                const rdAt = addDays(claimedAt.slice(0, 10), useLag);
                if (rdAt <= C.DATA_TODAY && (!validUntil || rdAt <= validUntil)) {
                  status = 'used'; redeemedAt = rdAt + 'T' + (11 + Math.floor(R() * 9)) + ':' + (R() < .5 ? '15' : '40');
                }
              }
            }
          }
          // 到期未使用
          if (status === 'claimed' && validUntil && validUntil < C.DATA_TODAY) {
            status = 'expired';
          }
          // 最近 2 天的券保留可操作状态，供消费端原型演示
          if (dOff <= 1 && status === 'expired') status = 'claimed';

          DB.couponInstance.push({
            coupon_id: couponId, campaign_id: camp.campaign_id, customer_id: cid,
            coupon_type: camp.coupon_type, discount: ct.discount, status,
            issued_at: issuedAt, claimed_at: claimedAt, redeemed_at: redeemedAt,
            valid_from: validFrom, valid_until: validUntil,
            idempotency_key: idempotencyKey(camp.campaign_id, cid, 'D' + day),
            round: 'r1', store_scope: camp.store_scope, store_id: camp.store_id || null,
            notify_status: 'sent', notify_channel: camp.channel, requires_claim: !!ct.requires_claim,
          });
          const dk = cid + '|' + camp.coupon_type;
          if (!dedupIdx.has(dk)) dedupIdx.set(dk, []);
          dedupIdx.get(dk).push({
            customer_id: cid, coupon_type: camp.coupon_type, campaign_id: camp.campaign_id,
            issued_at: issuedAt, status,
          });
          if (status === 'used') {
            const order = Math.round((45 + R() * 130) * 10) / 10;
            const usePoints = ct.stack_points && R() < 0.3;
            const ptVal = usePoints ? Math.round(order * 0.25 * 10) / 10 : 0;
            DB.redemption.push({
              redemption_id: 'RD-' + String(DB.seq.redeem++).padStart(6, '0'),
              coupon_id: couponId, transaction_id: 'T-H' + String(DB.seq.redeem).padStart(6, '0'),
              customer_id: cid, store_id: camp.store_id || weightedStoreForSeed(R),
              redeemed_at: redeemedAt, order_amount: order,
              points_used: usePoints ? Math.floor(ptVal * 20) : 0, point_value: ptVal,
              paid_amount: Math.round((order - ptVal) * ct.discount * 100) / 100,
              discount_applied: ct.discount_label, coupon_type: camp.coupon_type,
            });
          }
        }
      });
    }
  }

  /**
   * 历史回填时的去重判定，规则与 checkDuplicate 一致：
   * 新人券终身一次；生日券每年一次；学生券每月一次；回流券同一轮一次；
   * 万圣／门店券每活动一次。
   */
  function seedDedupOk(camp, cid, day, idx) {
    const mine = (idx && idx.get(cid + '|' + camp.coupon_type)) || [];
    switch (camp.coupon_type) {
      case 'newbie':
        return mine.length === 0;                                    // 每位会员一次
      case 'birthday':
        return !mine.some((x) => x.issued_at.slice(0, 4) === day.slice(0, 4));   // 每年一次
      case 'student':
        return !mine.some((x) => x.issued_at.slice(0, 7) === day.slice(0, 7));   // 每月一次
      case 'winback':
        // 同一轮不重复发放：未领取或已领取未使用的券存在时不再发。
        // 券使用后再连续 30 天未消费可进入下一轮（PRD 6.2.1），
        // 故已使用或已过期的券不阻断新的一轮；此处额外要求距上一轮 ≥ 60 天。
        return !mine.some((x) => {
          if (x.status === 'unclaimed' || x.status === 'claimed') return true;
          return dayDiff(day, x.issued_at.slice(0, 10)) < 60;
        });
      default:
        return !mine.some((x) => x.campaign_id === camp.campaign_id);
    }
  }

  /**
   * 构建某活动的候选会员池（一次性），并预打乱。
   * 池子按券种的资格条件过滤，与 checkEligibility 的前置条件保持一致：
   *   · 新人券需有注册日期；生日券需有生日月日；学生券需学生资格有效
   *   · 回流券需「连续 30 天未消费」候选（用最近消费时间近似）
   *   · 门店活动仅限曾在该店消费的会员
   */
  function buildCandidatePool(camp) {
    const R = mulberry32(9001 + camp.campaign_id.length * 977 + camp.coupon_type.length * 31);
    const pool = [];
    for (const c of DB.customers) {
      if (camp.store_scope === 'store') {
        const m = DB.memberStoreIdx.get(c.customer_id) || {};
        if (!m[camp.store_id]) continue;
      }
      if (camp.coupon_type === 'student' && !(c.student_eligibility && c.student_eligibility.eligible)) continue;
      if (camp.coupon_type === 'birthday') {
        if (!c.birthday_mmdd) continue;
        // 生日券在生日当月触发（PRD 表 6）
        if (c.birthday_mmdd.slice(0, 2) !== C.DATA_TODAY.slice(5, 7)) continue;
      }
      if (camp.coupon_type === 'newbie') {
        // 历史回填：新人券在会员各自注册当日发放（每位一次），并非只看「今天」的新人。
        if (!c.signup_date) continue;
      }
      if (camp.coupon_type === 'winback') {
        // 历史回填用较宽口径近似「连续 30 天未消费」，使 12 个月回填有足够样本；
        // 实时发券仍由 checkEligibility 按严格 30 天规则守门。
        const d = c.last_visit_date ? dayDiff(C.DATA_TODAY, c.last_visit_date) : 999;
        if (d < 10) continue;
      }
      pool.push(c.customer_id);
    }
    // 固定种子洗牌，保证可复现
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool;
  }

  function pickHistoricalCandidates(camp, R) {
    if (!camp._pool) camp._pool = buildCandidatePool(camp);
    if (!camp._pool.length) return null;
    return camp._pool[Math.floor(R() * camp._pool.length)];
  }

  /** 全港券的核销门店按门店权重抽样，使 30 家门店的排名有区分度。 */
  function weightedStoreForSeed(R) {
    const total = DB.stores.reduce((s, x) => s + (x.weight || 1), 0);
    let r = R() * total;
    for (const s of DB.stores) {
      r -= (s.weight || 1);
      if (r <= 0) return s.store_id;
    }
    return DB.stores[DB.stores.length - 1].store_id;
  }

  /** 种子：发送记录（含 1 条失败、1 条待处理），对应 PRD 图 11 / 图 13 */
  function seedSendRecords() {
    const winback = DB.campaigns.find((c) => c.coupon_type === 'winback' && c.status === 'running')
                 || DB.campaigns.find((c) => c.coupon_type === 'winback');
    const halloween = DB.campaigns.find((c) => c.coupon_type === 'halloween');
    const mk = (id, camp, mode, source, at, requested, success, failed, status, actor) => ({
      job_id: id, campaign_id: camp.campaign_id, coupon_type: camp.coupon_type, mode,
      source, requested, success, failed, blocked: 0, status,
      created_at: at, executed_at: at, actor,
      store_id: camp.store_id || null,
      coupon_name: COUPON_TYPES[camp.coupon_type].name,
      discount_label: COUPON_TYPES[camp.coupon_type].discount_label,
      attempts: [], blocked_list: [],
    });
    // 回填近 3 天的自动与人工任务
    const jobs = [
      mk('J-0001', winback, 'auto', '30 天规则', C.DATA_TODAY + 'T09:00', 46, 44, 0, 'success', '系统调度器'),
      mk('J-0002', halloween, 'manual', '批次 B-028', addDays(C.DATA_TODAY, -1) + 'T16:20', 12, 12, 0, 'success', '总部营销人员'),
      mk('J-0003', winback, 'auto', '30 天规则', addDays(C.DATA_TODAY, -1) + 'T09:00', 51, 49, 2, 'failed', '系统调度器'),
      mk('J-0004', winback, 'auto', '30 天规则', addDays(C.DATA_TODAY, -2) + 'T09:00', 43, 43, 0, 'success', '系统调度器'),
    ];
    DB.seq.job = 5;
    DB.sendJob.push(...jobs);

    // J-0003 的失败明细（ELIGIBILITY_TIMEOUT，对应 PRD 图 13）
    const failCids = DB.customers.slice(120, 122).map((c) => c.customer_id);
    failCids.forEach((cid) => {
      DB.sendAttempt.push({
        attempt_id: 'A-' + String(DB.seq.attempt++).padStart(5, '0'),
        job_id: 'J-0003', customer_id: cid,
        idempotency_key: idempotencyKey(jobs[2].campaign_id, cid, 'D' + addDays(C.DATA_TODAY, -1)),
        stage: '资格检查', result: 'failed', code: 'ELIGIBILITY_TIMEOUT',
        reason: '资格服务超时，未建立券实例。', at: addDays(C.DATA_TODAY, -1) + 'T09:00',
      });
    });
    jobs[2].attempts = DB.sendAttempt.filter((a) => a.job_id === 'J-0003');

    // 拦截统计回填（供「最近异常」）
    const blockedCodes = ['DUP_WINBACK_SAME_ROUND', 'FREQ_WEEKLY_CAP', 'MISSING_BIRTHDAY', 'DUP_CAMPAIGN_ONCE'];
    for (let i = 0; i < 8; i++) {
      const code = blockedCodes[i % blockedCodes.length];
      DB.sendAttempt.push({
        attempt_id: 'A-' + String(DB.seq.attempt++).padStart(5, '0'),
        job_id: i < 4 ? 'J-0001' : 'J-0004',
        customer_id: DB.customers[300 + i].customer_id,
        idempotency_key: 'seed|' + i, stage: '资格检查', result: 'blocked', code,
        reason: {
          DUP_WINBACK_SAME_ROUND: '同一轮回流券仍有效，同轮不重复发放。',
          FREQ_WEEKLY_CAP: '近 7 天已发 3 张券，达到周上限 3。',
          MISSING_BIRTHDAY: '生日月日缺失，不触发生日券。',
          DUP_CAMPAIGN_ONCE: '本活动每人一次，该会员已发放。',
        }[code],
        at: addDays(C.DATA_TODAY, -(i % 3)) + 'T09:00',
      });
    }
  }

  /* 固定种子 PRNG（保证演示可复现）*/
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================================================================
   * 13. 导出（PRD 表 8 看板数据导出 / 9.1）
   * ==============================================================*/
  function buildExport(metrics, filter, scopeLabel, contents, format) {
    const rows = [];
    if (contents.includes('summary')) {
      rows.push(['【汇总指标】']);
      rows.push(['指标', '数值', '口径']);
      rows.push(['发放数', metrics.issued, '筛选日期内成功发放的券张数']);
      rows.push(['主动领取数', metrics.claimed, '筛选日期内用户点击“领取”的券张数']);
      rows.push(['核销数', metrics.used, '筛选日期内完成核销的券张数']);
      rows.push(['领取率', (metrics.claim_rate * 100).toFixed(1) + '%', '截至统计时点已领取数／发放数（同一发放群体）']);
      rows.push(['核销率', (metrics.redeem_rate * 100).toFixed(1) + '%', '截至统计时点已核销数／发放数（同一发放群体）']);
      rows.push(['相关订单实付', metrics.paid_amount, '与已核销券关联订单的实付金额合计']);
      rows.push([]);
    }
    if (contents.includes('campaigns')) {
      rows.push(['【各活动表现】']);
      rows.push(['活动', '券种', '折扣', '发放方式', '范围', '发放数', '领取数', '核销数', '相关订单实付']);
      metrics.byCampaign.forEach((c) => rows.push([
        c.name, c.coupon_name, c.discount_label,
        c.mode === 'auto' ? '自动规则' : '人工发放',
        c.scope_label, c.issued, c.claimed, c.used, c.paid_amount,
      ]));
      rows.push([]);
    }
    if (contents.includes('trend')) {
      rows.push(['【每日趋势】']);
      rows.push(['日期', '发放数', '领取数', '核销数']);
      metrics.trend.forEach((t) => rows.push([t.date, t.issued, t.claimed, t.used]));
      rows.push([]);
    }
    rows.push(['导出范围', `${scopeLabel} · ${filter.couponTypes.length ? filter.couponTypes.map((k) => COUPON_TYPES[k].name).join('、') : '全部券种 / 活动'} · ${filter.dateFrom} — ${filter.dateTo}`]);
    rows.push(['数据更新时间', metrics.updated_at]);
    rows.push(['导出时间', C.NOW_LABEL]);
    rows.push(['说明', '仅导出当前账号有权查看的汇总数据，不含会员个人明细。']);
    return rows;
  }

  /* ================================================================
   * 导出
   * ==============================================================*/
  global.PCC_ENGINE = {
    DB, init, ACCOUNTS, HQ_POLICY, COUPON_TYPES, STATUS,
    memberStats, filterMembers, maskPhone,
    checkEligibility, checkDuplicate, checkFrequency, idempotencyKey,
    executeSendJob, retrySendJob, markJobHandled,
    claimCoupon, redeemCoupon,
    computeMetrics, permissionGuard, routeApproval,
    audit, approvalLog, guardLog,
    createCampaign, approveCampaign, rejectCampaign, setCampaignStatus,
    updateStoreAccount, createStoreAccount,
    buildExport, couponTypeKeys, scopeLabelOf, campaignCoversStore, inRangeFilter,
    // 规则优先级（老师反馈第 5 条）
    RULE_PRIORITY, priorityLevel, priorityLadder, findHigherPriorityRule, outranks,
    triggerMatches,
    utils: { iso, addDays, dayDiff, d2, storeLabel },
  };
  global.PCC_CONST_COUPON_KEYS = couponTypeKeys;
})(window);
