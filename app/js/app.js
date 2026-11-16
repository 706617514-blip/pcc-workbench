/* ============================================================================
 * PCC 会员营销工作台 —— 应用主程序 (app.js)
 * 页面：总览 / 活动创建 / 活动管理 / 审批中心 / 发送记录 / 设置 + 消费端原型
 * 依据 PRD 5.1 信息架构与 5.2 核心后台页面原型。
 * ==========================================================================*/
(function (global) {
  'use strict';

  const { $, $$, el, esc, num, money, pct, SVG, toast, multiSelect, singleSelect,
          rangePicker, modal, confirm, sideDrawer, lineChart } = global.UI;
  const E = global.PCC_ENGINE;
  const AI = global.PCC_AI;
  const C = global.PCC_CONST;
  const DB = E.DB;

  /**
   * 标记「筛选条件已改动、等待应用」。
   * 多选下拉在勾选期间不能重建页面（否则下拉会被销毁关闭），
   * 因此这里只在「应用筛选」按钮上给出视觉提示，由用户主动点击后再生效。
   */
  function markPending() {
    const b = document.querySelector('[data-apply="pending"]')
           || document.querySelector('#content .btn-primary[data-role="apply"]');
    if (b) {
      b.classList.add('pulse');
      const tip = b.querySelector('.apply-tip');
      if (tip) tip.textContent = '有改动';
    }
  }

  /* ------------------------------------------------------------ 状态 */
  const S = {
    page: 'overview',
    accountKey: 'hq.marketing',
    locale: 'zh-Hans',
    // 看板筛选（PRD 5.1）
    ov: {
      couponTypes: [], campaignIds: [], dateFrom: '2026-10-01', dateTo: C.DATA_TODAY,
      storeFilter: null, activityFilter: null,
    },
    // 活动创建页筛选
    create: {
      filters: { recency: 'any', amount: null, cups: null, tier: 'any', channel: 'any', student: 'any', newbie: 'any', birthdayMonth: 'any', storeScope: [] },
      applied: false, result: null,
      draftPrefill: null,      // AI 回填的草稿
    },
    manageTab: 'all',
    approvalTab: 'all', approvalDate: '',
    records: { mode: '', campaignId: '', result: '', range: 'week' },
    settings: { denied: false },
    // AI 抽屉
    ai: {
      open: false, tab: 'draft', state: 'idle', // idle|generating|result|blocked|failed|denied
      history: [], lastResult: null, lastInput: '',
    },
    lastMetrics: null,
  };

  const t = (k, vars) => global.t(k, S.locale, vars);
  const account = () => E.ACCOUNTS.find((a) => a.account_id === S.accountKey) || E.ACCOUNTS[0];
  const isStore = () => account().scope_type === 'store';

  /* ------------------------------------------------------------ 路由
   * 每个页面都对应一个 #/xxx 地址：
   *   · 刷新后停留在原页面（演示时不会一刷新就跳回总览）
   *   · 浏览器前进 / 后退可用
   *   · 可以直接把某个页面的链接发给别人（如 #/records）
   * --------------------------------------------------------------*/
  const PAGES = ['overview', 'create', 'manage', 'approval', 'records', 'settings', 'consumer'];

  function pageFromHash() {
    const m = /^#\/([a-z]+)/.exec(location.hash || '');
    const p = m ? m[1] : 'overview';
    return PAGES.indexOf(p) >= 0 ? p : 'overview';
  }

  /** 切页：改 hash，由 hashchange 统一渲染（避免双渲染与状态不同步） */
  function setHash(page) {
    const h = '#/' + page;
    if (location.hash === h) {
      if (S.page !== page) { S.page = page; render(); }
      window.scrollTo(0, 0);
      return;
    }
    location.hash = h;
  }

  function onHashChange() {
    const p = pageFromHash();
    if (p === S.page) return;
    S.page = p;
    render();
    window.scrollTo(0, 0);
  }


  /* ------------------------------------------------------------ 启动 */
  async function boot() {
    const host = $('#boot');
    host.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
      <div style="width:52px;height:52px">${global.UI.pccLogo(52)}</div>
      <div style="color:#6B6B6B;font-size:14px">正在加载合成数据…</div>
      <div class="spinner" style="width:22px;height:22px;border-width:3px"></div>
    </div>`;
    try {
      await E.init();
    } catch (err) {
      host.innerHTML = `<div style="padding:60px;text-align:center;color:#A5192E;font-family:sans-serif">
        <h2>数据加载失败</h2><p style="color:#666">${esc(err.message)}</p>
        <p style="color:#999;font-size:13px">请通过本地 HTTP 服务访问（data/*.json 需要经 fetch 读取）。</p></div>`;
      return;
    }
    host.innerHTML = '';
    S.page = pageFromHash();          // 支持 #/records 这类深链与刷新保持
    host.appendChild(buildShell());
    render();
    window.addEventListener('hashchange', onHashChange);
  }

  /* ------------------------------------------------------------ 外壳 */
  function buildShell() {
    const root = el('div', '');
    root.id = 'root';
    root.style.display = 'flex';
    root.style.minHeight = '100vh';
    root.innerHTML = `
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo" id="brandLogo"></div>
          <div class="brand-text">
            <div class="brand-name">PACIFIC<br>COFFEE</div>
          </div>
        </div>
        <div class="side-label" id="sideLabel"></div>
        <nav class="nav" id="nav"></nav>
        <div class="side-user">
          <div class="avatar" id="uAvatar"></div>
          <div>
            <div class="u-name" id="uName"></div>
            <div class="u-desc" id="uDesc"></div>
          </div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <h1 id="pageTitle"></h1>
          <div style="display:flex;align-items:center;gap:16px">
            <div id="accountSwitch"></div>
            <span class="demo-tag" id="demoTag"></span>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <button class="ai-fab" id="aiFab" title="AI 活动助手">${SVG.ai}</button>
      <div class="ai-drawer" id="aiDrawer"></div>
    `;
    $('#brandLogo', root).innerHTML = global.UI.pccLogo(46);

    // 账号切换器（演示用；真实系统由登录态确定操作人）
    const sel = singleSelect({
      options: E.ACCOUNTS.map((a) => ({
        v: a.account_id,
        label: `${a.display_name || a.name}${a.scope_type === 'store' ? '（' + E.utils.storeLabel(a.scope_id) + '）' : '（全港）'}`,
      })),
      value: S.accountKey,
      onChange: (v) => {
        S.accountKey = v;
        S.create.applied = false; S.create.result = null;
        S.create.filters.storeScope = [];      // 切换账号后重置门店范围，避免范围串用
        S.ov.couponTypes = []; S.ov.campaignIds = [];
        S.settings.denied = false;
        if (isStore()) { S.ov.storeFilter = account().scope_id; } else { S.ov.storeFilter = null; }
        E.audit(account().display_name || account().name, 'switch_account', 'staff_account', v,
          `切换工作台账号至 ${v}`, '演示账号切换');
        render();
        toast(`已切换为${account().display_name || account().name} · ${isStore() ? E.utils.storeLabel(account().scope_id) : '全港范围'}`, 'ok');
      },
    });
    sel.style.minWidth = '230px';
    $('#accountSwitch', root).appendChild(sel);

    $('#aiFab', root).addEventListener('click', () => toggleAI(true));
    return root;
  }

  function pageTitleKey() {
    return {
      overview: isStore() ? 'ov.title.store' : 'ov.title',
      create: 'cr.title', manage: 'mg.title', approval: 'ap.title',
      records: 'sr.title', settings: 'st.title', consumer: 'nav.consumer',
    }[S.page];
  }

  /* ------------------------------------------------------------ 渲染 */
  function render() {
    const acc = account();
    // 假名/描述
    $('#uAvatar').textContent = acc.badge;
    $('#uName').textContent = acc.display_name || acc.name;
    $('#uDesc').textContent = acc.scope_type === 'store' ? E.utils.storeLabel(acc.scope_id) : t('perm.ops');
    $('#sideLabel').textContent = t('app.subtitle');
    $('#demoTag').textContent = t('app.demo');

    // 导航
    const nav = $('#nav');
    nav.innerHTML = '';
    const items = [
      { k: 'overview', l: t('nav.overview') },
      { k: 'create', l: t('nav.create') },
      { k: 'manage', l: t('nav.manage') },
      { k: 'approval', l: t('nav.approval') },
      { k: 'records', l: t('nav.records') },
      { k: 'settings', l: t('nav.settings') },
      { k: 'consumer', l: t('nav.consumer') },
    ];
    items.forEach((it) => {
      const b = el('button', 'nav-item' + (S.page === it.k ? ' active' : ''),
        `<span class="nav-dot"></span><span>${esc(it.l)}</span>`);
      b.addEventListener('click', () => {
        if (it.k === 'overview') { S.ov.storeFilter = isStore() ? acc.scope_id : null; }
        setHash(it.k);
      });
      nav.appendChild(b);
    });

    $('#pageTitle').textContent = t(pageTitleKey());

    const content = $('#content');
    content.innerHTML = '';
    ({
      overview: renderOverview, create: renderCreate, manage: renderManage,
      approval: renderApproval, records: renderRecords, settings: renderSettings,
      consumer: renderConsumer,
    }[S.page] || renderOverview)(content);

    renderAI();
  }

  /* ================================================================
   * 页面 1 —— 总览（PRD 5.1 / 图 2–5 / 图 14）
   * ==============================================================*/
  function renderOverview(host) {
    const acc = account();
    const store = isStore();
    const myStore = acc.scope_id;

    // 门店总览：门店范围固定
    if (store) S.ov.storeFilter = myStore;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t(store ? 'ov.title.store' : 'ov.title'))}</h2>
        <p class="page-desc">${esc(t(store ? 'ov.desc.store' : 'ov.desc', { store: store ? E.utils.storeLabel(myStore) : '' }))}</p>
      </div>`;
    const rightBox = el('div', '');
    rightBox.style.display = 'flex'; rightBox.style.gap = '12px'; rightBox.style.alignItems = 'center';
    if (store) {
      const tag = el('div', 'chip chip-red', `${esc(E.utils.storeLabel(myStore))} · ${esc(t('ov.fixed'))}`);
      tag.style.height = '42px'; tag.style.padding = '0 18px'; tag.style.fontSize = '13.5px';
      rightBox.appendChild(tag);
    }
    const exp = el('button', 'btn btn-ghost', `${SVG.export}<span>${esc(t('ov.export'))}</span>`);
    exp.addEventListener('click', () => openExport());
    rightBox.appendChild(exp);
    head.appendChild(rightBox);
    host.appendChild(head);

    // 方案定位：所属模块 + 上下游衔接 + 研究问题（默认收起，不干扰日常使用）
    host.appendChild(buildPositionBar());

    // 筛选栏
    const bar = el('div', 'filterbar');
    const row = el('div', 'filterbar-row');
    bar.appendChild(row);

    // 券种 / 活动（多选，「全部」互斥）
    const couponOptions = E.couponTypeKeys()
      .filter((k) => !store || true)
      .map((k) => ({ v: k, label: `${E.COUPON_TYPES[k].name} · ${E.COUPON_TYPES[k].discount_label}` }));
    const fCoupon = el('div', 'field field-grow');
    fCoupon.innerHTML = `<label>${esc(t('ov.filter.coupon'))}</label>`;
    const ms = multiSelect({
      placeholder: t('ov.all_coupons'), allLabel: t('ov.all_coupons'),
      options: couponOptions, values: S.ov.couponTypes, exclusiveAll: true,
      // 批量选择：勾选期间不重建页面（否则下拉会关闭），点「应用」后再刷新
      onChange: (v) => { S.ov.couponTypes = v; markPending(); },
      onApply: () => render(),
    });
    fCoupon.appendChild(ms);
    fCoupon.style.flex = '0 0 300px';
    row.appendChild(fCoupon);

    // 门店范围（门店账号锁定）
    if (store) {
      const f = el('div', 'field');
      f.innerHTML = `<label>${esc(t('ov.filter.store'))}</label>`;
      const ctrl = el('div', 'control locked');
      ctrl.innerHTML = `<span class="ctrl-value">${esc(E.utils.storeLabel(myStore))}</span>`;
      f.appendChild(ctrl); f.style.flex = '0 0 200px';
      row.appendChild(f);
    } else {
      const f = el('div', 'field');
      f.innerHTML = `<label>${esc(t('ov.filter.store'))}</label>`;
      const ss = singleSelect({
        options: [{ v: '__all', label: t('cr.all_hk') }].concat(DB.stores.map((s) => ({ v: s.store_id, label: s.name }))),
        value: '__all', onChange: () => {},
      });
      ss.style.minWidth = '180px';
      f.appendChild(ss); f.style.flex = '0 0 190px';
      row.appendChild(f);
    }

    // 日期范围
    const fDate = el('div', 'field');
    fDate.innerHTML = `<label>${esc(t('ov.filter.date'))}</label>`;
    const rp = rangePicker({
      from: S.ov.dateFrom, to: S.ov.dateTo, today: C.DATA_TODAY,
      maxDate: C.DATA_TODAY,
      onChange: (a, b) => { if (a && b) { S.ov.dateFrom = a; S.ov.dateTo = b; render(); } },
    });
    rp.style.minWidth = '260px';
    fDate.appendChild(rp); fDate.style.flex = '0 0 280px';
    row.appendChild(fDate);

    const apply = el('button', 'btn btn-primary', esc(t('ov.apply')));
    apply.style.minWidth = '150px';
    apply.dataset.role = 'apply';
    apply.dataset.apply = 'pending';
    apply.addEventListener('click', () => { render(); toast('已应用筛选条件', 'ok'); });
    row.appendChild(apply);
    host.appendChild(bar);

    // 指标
    const metrics = E.computeMetrics(S.ov, acc);
    S.lastMetrics = metrics;

    const mg = el('div', 'metrics ' + (store ? 'metrics-4' : 'metrics-4'));
    if (store) {
      const anomalies = metrics.anomalies.filter((a) => a.type === 'blocked' || a.type === 'send_failed').length;
      mg.appendChild(metric(t('ov.metric.used'), num(metrics.used), t('ov.sub.store_used'), false));
      mg.appendChild(metric(t('ov.metric.paid'), money(metrics.paid_amount), t('ov.sub.store_order'), false, true));
      mg.appendChild(metric(t('ov.metric.applicable'), num(metrics.applicable_campaigns || 0), t('ov.sub.include_hq'), false));
      mg.appendChild(metric(t('ov.metric.anomaly'), num(metrics.anomalies.length), t('ov.sub.pending_check'), metrics.anomalies.length > 0));
    } else {
      mg.appendChild(metric(t('ov.metric.issued'), num(metrics.issued), t('ov.sub.success_issued'), false));
      mg.appendChild(metric(t('ov.metric.claimed'), num(metrics.claimed), t('ov.sub.click'), false));
      mg.appendChild(metric(t('ov.metric.used'), num(metrics.used), t('ov.sub.used'), false));
      mg.appendChild(metric(t('ov.metric.winback'), num(metrics.winback_yesterday), t('ov.sub.dedup'), false));
    }
    host.appendChild(mg);

    // 图表区
    const grid = el('div', 'chart-grid');
    const chartCard = el('div', 'chart-card');
    chartCard.innerHTML = `<div class="chart-head">
        <div class="chart-title">${esc(t(store ? 'ov.trend.store' : 'ov.trend'))}</div>
        <div class="legend">
          ${store ? '' : `<span><i class="lg-issued"></i>${esc(t('ov.legend.issued'))}</span>`}
          ${store ? '' : `<span><i class="lg-claimed"></i>${esc(t('ov.legend.claimed'))}</span>`}
          <span><i class="${store ? 'lg-issued' : 'lg-used'}"></i>${esc(t('ov.legend.used'))}</span>
        </div>
      </div>`;
    const canvas = el('canvas');
    chartCard.appendChild(canvas);
    const upd = el('div', 't-small t-muted');
    upd.style.marginTop = '10px';
    upd.textContent = `${t('ov.updated')}：${metrics.updated_at}`;
    chartCard.appendChild(upd);
    grid.appendChild(chartCard);

    // 侧栏：券种表现与异常 / 本店适用活动
    const side = el('div', 'chart-card');
    if (store) {
      side.innerHTML = `<div class="chart-head"><div class="chart-title">${esc(t('ov.side.applicable'))}</div></div>`;
      const list = el('div', 'side-list');
      DB.campaigns.filter((c) => c.status === 'running' && E.campaignCoversStore(c, myStore))
        .forEach((c) => {
          const r = el('div', 'side-row');
          r.innerHTML = `<span class="k">${esc(c.name)}</span>
            <span class="t-small t-muted">${esc(c.store_scope === 'all_hk' ? '总部活动' : c.store_scope === 'stores' ? '总部活动（指定门店）' : '门店活动')}</span>`;
          list.appendChild(r);
        });
      if (!list.children.length) list.innerHTML = `<div class="empty">${esc(t('mg.none'))}</div>`;
      side.appendChild(list);
    } else {
      side.innerHTML = `<div class="chart-head"><div class="chart-title">${esc(t('ov.side.title'))}</div></div>`;
      const list = el('div', 'side-list');
      const wb = metrics.byType.winback;
      list.appendChild(sideRow(`${E.COUPON_TYPES.winback.name}核销率`, pct(wb ? wb.redeem_rate : 0), false));
      Object.keys(metrics.byType).forEach((k) => {
        if (k === 'winback') return;
        const x = metrics.byType[k];
        if (!x.issued) return;
        list.appendChild(sideRow(`${x.name}核销率`, pct(x.redeem_rate), false));
      });
      const dupBlock = metrics.anomalies.filter((a) => /DUP|IDEMPOTENT/.test(a.code)).length;
      const sendFail = metrics.anomalies.filter((a) => a.type === 'send_failed').length;
      list.appendChild(sideRow('重复发放拦截', num(dupBlock), dupBlock > 0));
      list.appendChild(sideRow('模拟发送失败', num(sendFail), sendFail > 0));
      side.appendChild(list);

      // 最近异常明细
      if (metrics.anomalies.length) {
        const dt = el('div', 't-small t-muted');
        dt.style.marginTop = '14px';
        dt.textContent = '最近可追查记录：';
        side.appendChild(dt);
        const an = el('div', '');
        an.style.marginTop = '6px';
        metrics.anomalies.slice(0, 4).forEach((a) => {
          const line = el('button', 'anomaly-row');
          line.type = 'button';
          line.title = '跳转到发送记录查看相关任务';
          line.innerHTML = `<span>${esc(a.label)}</span><span class="t-muted mono">${esc(a.code)}</span><span class="anomaly-go">查看 →</span>`;
          line.addEventListener('click', () => {
            // 异常 → 发送记录：失败类直接带上「失败」筛选，避免用户在另一页再从零筛
            S.records.result = a.type === 'send_failed' ? 'failed' : '';
            S.records.mode = '';
            S.records.campaignId = a.campaign_id || '';
            setHash('records');
            toast('已跳转到发送记录，并套用与该异常相关的筛选', 'ok', 2800);
          });
          an.appendChild(line);
        });
        side.appendChild(an);
      }
    }
    grid.appendChild(side);
    host.appendChild(grid);

    requestAnimationFrame(() => {
      const labels = metrics.trend.map((x) => x.date.slice(5).replace('-', '/'));
      const series = store
        ? [{ labels, data: metrics.trend.map((x) => x.used), color: '#A5192E' }]
        : [
            { labels, data: metrics.trend.map((x) => x.issued), color: '#A5192E' },
            { labels, data: metrics.trend.map((x) => x.claimed), color: '#E9A9B4' },
            { labels, data: metrics.trend.map((x) => x.used), color: '#B8B8BB' },
          ];
      lineChart(canvas, series, { height: 280 });
    });
    if (!metrics.issued && !metrics.used) {
      const em = el('div', 'empty', esc(t('ov.empty')));
      host.appendChild(em);
    }
  }

  /* 方案定位条：说明本产品属于哪个模块、与上下游模块怎么衔接 */
  function buildPositionBar() {
    const wrap = el('div', 'posbar');
    const head = el('button', 'posbar-head');
    head.type = 'button';
    head.innerHTML = `<span class="posbar-tag">Module 2</span>
      <span class="posbar-title">${esc(t('pos.bar'))}</span>
      <span class="posbar-chain">${esc(t('pos.chain'))}</span>
      <span class="posbar-toggle">${esc(t('pos.more'))}</span>`;
    const body = el('div', 'posbar-body');
    body.style.display = 'none';
    body.innerHTML = String(t('pos.body')).split('\n').filter(Boolean)
      .map((line) => `<div class="posbar-line">${esc(line)}</div>`).join('');
    head.addEventListener('click', () => {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      head.querySelector('.posbar-toggle').textContent = isOpen ? t('pos.more') : t('pos.less');
      wrap.classList.toggle('open', !isOpen);
    });
    wrap.appendChild(head);
    wrap.appendChild(body);
    return wrap;
  }

  function metric(label, value, foot, alarm, small) {    const m = el('div', 'metric');
    m.innerHTML = `<div class="metric-label">${esc(label)}</div>
      <div class="metric-value${small ? ' small' : ''}${alarm ? ' alarm' : ''}">${esc(value)}</div>
      <div class="metric-foot">${esc(foot)}</div>`;
    return m;
  }
  function sideRow(k, v, alarm) {
    const r = el('div', 'side-row');
    r.innerHTML = `<span class="k">${esc(k)}</span><span class="v${alarm ? ' alarm' : ''}">${esc(v)}</span>`;
    return r;
  }

  /* ------------------------------------------------- 导出弹窗（图 5）*/
  function openExport() {
    const acc = account();
    const store = isStore();
    const scopeLabel = store ? E.utils.storeLabel(acc.scope_id) : '全港门店';
    const contents = { summary: true, campaigns: true, trend: true };
    let format = 'xlsx';

    const body = el('div');
    body.innerHTML = `
      <div class="form-item" style="margin-bottom:22px">
        <label>导出范围</label>
        <div class="range-box" id="expRange"></div>
      </div>
      <div class="form-item" style="margin-bottom:22px">
        <label>导出内容</label>
        <div class="check-cards" id="expContents">
          <div class="check-card on" data-k="summary"><span class="check-box">${SVG.check}</span><span>汇总指标</span></div>
          <div class="check-card on" data-k="campaigns"><span class="check-box">${SVG.check}</span><span>各活动表现</span></div>
          <div class="check-card on" data-k="trend"><span class="check-box">${SVG.check}</span><span>每日趋势</span></div>
        </div>
      </div>
      <div class="form-item" style="margin-bottom:20px">
        <label>文件格式</label>
        <div class="seg" id="expFormat">
          <button class="on" data-f="xlsx">XLSX</button><button data-f="csv">CSV</button>
        </div>
      </div>
      <div class="notice">仅导出当前账号可查看的汇总数据，不含会员个人明细。</div>
    `;
    const rangeEl = $('#expRange', body);
    rangeEl.textContent = `${scopeLabel} · ${S.ov.couponTypes.length ? S.ov.couponTypes.map((k) => E.COUPON_TYPES[k].name).join('、') : '全部券种 / 活动'} · ${S.ov.dateFrom} — ${S.ov.dateTo}`;

    $$('#expContents .check-card', body).forEach((c) => {
      c.addEventListener('click', () => {
        const k = c.dataset.k;
        contents[k] = !contents[k];
        c.classList.toggle('on', contents[k]);
      });
    });
    $$('#expFormat button', body).forEach((b) => {
      b.addEventListener('click', () => {
        format = b.dataset.f;
        $$('#expFormat button', body).forEach((x) => x.classList.toggle('on', x === b));
      });
    });

    const foot = el('div', '', `<button class="btn btn-ghost" data-x="cancel">取消</button>
      <button class="btn btn-primary" data-x="ok">导出文件</button>`);
    const mo = modal({ title: '导出营销数据', subtitle: '按总览中已应用的筛选条件生成文件', body, footer: foot });
    foot.querySelector('[data-x="cancel"]').addEventListener('click', mo.close);
    foot.querySelector('[data-x="ok"]').addEventListener('click', () => {
      const picked = Object.keys(contents).filter((k) => contents[k]);
      if (!picked.length) { toast('请至少选择一项导出内容', 'warn'); return; }
      try {
        const metrics = E.computeMetrics(S.ov, acc);
        const rows = E.buildExport(metrics, S.ov, scopeLabel, picked, format);
        downloadFile(rows, format, `PCC_营销数据_${S.ov.dateFrom}_${S.ov.dateTo}`);
        E.audit(acc.display_name || acc.name, 'export_data', 'dashboard', `${S.ov.dateFrom}~${S.ov.dateTo}`,
          `导出汇总数据（${picked.join('、')}）格式 ${format.toUpperCase()}，范围 ${scopeLabel}`,
          '看板导出');
        mo.close();
        toast('导出成功，操作人、时间及筛选范围已写入审计记录', 'ok');
      } catch (err) {
        toast('导出失败：' + err.message, 'err');
      }
    });
  }

  function downloadFile(rows, format, baseName) {
    let blob, name;
    if (format === 'csv') {
      const csv = '\ufeff' + rows.map((r) => r.map((c) => {
        const s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',')).join('\r\n');
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      name = baseName + '.csv';
    } else {
      // 生成 SpreadsheetML 2003 XML —— Excel 可直接打开，保留中文与多工作表结构
      const sheetRows = rows.map((r) => '<Row>' + r.map((c) => {
        const isNum = typeof c === 'number';
        return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(c == null ? '' : c)}</Data></Cell>`;
      }).join('') + '</Row>').join('');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#FBEEF0" ss:Pattern="Solid"/></Style></Styles>
 <Worksheet ss:Name="营销数据导出"><Table>${sheetRows}</Table></Worksheet>
</Workbook>`;
      blob = new Blob(['\ufeff' + xml], { type: 'application/vnd.ms-excel' });
      name = baseName + '.xls';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  }

  /* ================================================================
   * 页面 2 —— 活动创建（PRD 5.2 / 图 6 / 图 7 / 图 15）
   * ==============================================================*/
  function renderCreate(host) {
    const acc = account();
    const store = isStore();
    const myStore = acc.scope_id;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('cr.title'))}</h2>
        <p class="page-desc">${esc(t(store ? 'cr.desc.store' : 'cr.desc'))}</p>
      </div>`;
    const createBtn = el('button', 'btn btn-primary', esc(t('cr.create')));
    createBtn.style.minWidth = '150px';
    createBtn.addEventListener('click', () => {
      if (!S.create.applied) { toast('请先应用筛选条件，确认目标人群', 'warn'); return; }
      openCreateDialog();
    });
    head.appendChild(createBtn);
    host.appendChild(head);

    const wrap = el('div', '');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '360px 1fr';
    wrap.style.gap = '22px';
    wrap.style.alignItems = 'start';
    host.appendChild(wrap);

    /* ---------- 左：筛选条件 ---------- */
    const filterCard = el('div', 'card card-pad');
    filterCard.innerHTML = `<h3 style="font-size:17px;font-weight:700;margin:0 0 18px">${esc(t(store ? 'cr.filter.title.store' : 'cr.filter.title'))}</h3>`;
    const f = S.create.filters;

    // 门店范围（PRD 2.1 / 9.1）
    //   总部账号：可多选门店，不选任何门店 = 全港门店
    //   门店账号：由账号权限锁定为本店，服务端强制，前端不可更改
    const fStore = el('div', 'field');
    fStore.style.marginBottom = '16px';
    fStore.innerHTML = `<label>${esc(t('cr.store.scope'))}</label>`;
    if (store) {
      const c = el('div', 'control locked');
      c.innerHTML = `<span class="ctrl-value">${esc(E.utils.storeLabel(myStore))}（${esc(t('ov.fixed'))}）</span>`;
      fStore.appendChild(c);
      const hint = el('div', '', esc(t('cr.fixed_by_perm')));
      hint.style.cssText = 'font-size:12px;color:var(--pcc-red);margin-top:2px';
      fStore.appendChild(hint);
    } else {
      const ms = multiSelect({
        placeholder: t('cr.all_hk'), allLabel: t('cr.all_hk'),
        options: DB.stores.map((s) => ({ v: s.store_id, label: `${s.name}（${s.district}）` })),
        values: f.storeScope || [], exclusiveAll: true,
        // 批量选择：勾选期间不重建页面，点「应用」后再重算人数
        onChange: (v) => {
          f.storeScope = v;
          // 改变门店范围后需重新应用筛选，避免展示旧范围的预览
          S.create.applied = false;
          S.create.result = null;
          markPending();
        },
        onApply: () => render(),
      });
      fStore.appendChild(ms);
      const hint = el('div', '', t('cr.hq_scope_hint'));
      hint.style.cssText = 'font-size:12px;color:var(--ink-3);margin-top:2px';
      fStore.appendChild(hint);
    }
    filterCard.appendChild(fStore);

    const mkField = (labelKey, key, opts) => {
      const box = el('div', 'field');
      box.style.marginBottom = '16px';
      box.innerHTML = `<label>${esc(t(labelKey))}</label>`;
      const ss = singleSelect({
        options: opts.map((o) => ({ v: o.v, label: o[localeKey(o)] || o.zh })),
        value: f[key], onChange: (v) => { f[key] = v; },
      });
      box.appendChild(ss);
      filterCard.appendChild(box);
      return ss;
    };
    const localeKey = (o) => S.locale === 'zh-Hant' ? 'hant' : S.locale === 'en' ? 'en' : 'zh';

    mkField(store ? 'cr.recency.store' : 'cr.recency', 'recency', C.RECENCY_OPTIONS);

    // 累计消费 / 购买杯数：自由区间（可只填最小、只填最大，或都填）
    const rangeCtrls = [];
    const mkRange = (labelKey, key, cfg) => {
      const box = el('div', 'field');
      box.style.marginBottom = '16px';
      box.innerHTML = `<label>${esc(t(labelKey))}</label>`;
      const ri = global.UI.rangeInput({
        min: f[key] ? f[key].min : null,
        max: f[key] ? f[key].max : null,
        prefix: cfg.prefix, unit: cfg.unit,
        placeholderMin: cfg.phMin, placeholderMax: cfg.phMax,
        presets: cfg.presets,
        onChange: (v) => { f[key] = v; },
      });
      box.appendChild(ri);
      rangeCtrls.push(ri);
      filterCard.appendChild(box);
      return ri;
    };
    mkRange(store ? 'cr.amount.store' : 'cr.amount', 'amount', {
      prefix: 'HK$', unit: '', phMin: '最低', phMax: '最高',
      presets: [
        { label: '≥ 200', min: 200, max: null },
        { label: '200 – 500', min: 200, max: 500 },
        { label: '≥ 500', min: 500, max: null },
        { label: '≥ 1000', min: 1000, max: null },
      ],
    });
    mkRange(store ? 'cr.cups.store' : 'cr.cups', 'cups', {
      prefix: '', unit: '杯', phMin: '最低', phMax: '最高',
      presets: [
        { label: '≥ 5', min: 5, max: null },
        { label: '5 – 15', min: 5, max: 15 },
        { label: '≥ 30', min: 30, max: null },
      ],
    });

    mkField('cr.tier', 'tier', C.TIER_OPTIONS);
    mkField('cr.channel', 'channel', C.CHANNEL_OPTIONS);
    mkField('cr.student', 'student', C.STUDENT_OPTIONS);

    const applyBtn = el('button', 'btn btn-primary btn-block', esc(t('cr.apply')));
    applyBtn.dataset.role = 'apply';
    applyBtn.dataset.apply = 'pending';
    applyBtn.style.marginTop = '8px';
    applyBtn.addEventListener('click', () => {
      // 区间输入有去抖，先立即取值，避免用户「输完即点」用到旧值
      rangeCtrls.forEach((c) => c.flush && c.flush());
      S.create.applied = true;
      S.create.result = E.filterMembers(f, acc);
      render();
      if (!S.create.result.total) toast('没有符合条件的会员，请调整筛选条件', 'warn');
      else toast(`筛选完成，共 ${num(S.create.result.total)} 位会员`, 'ok');
    });
    filterCard.appendChild(applyBtn);
    if (store) {
      const note = el('div', 'notice grey');
      note.style.marginTop = '16px';
      note.style.fontSize = '12px';
      note.textContent = t('cr.isolation.note');
      filterCard.appendChild(note);
    }
    wrap.appendChild(filterCard);

    /* ---------- 右：人数 + 预览 ---------- */
    const right = el('div', '');

    const countCard = el('div', 'card card-pad');
    const n = S.create.result ? S.create.result.total : 0;
    const scopeIds = (S.create.result && S.create.result.scope_ids) || [];
    const scopeText = store ? E.utils.storeLabel(myStore)
      : scopeIds.length ? `${t('cr.scope.selected')}：${scopeIds.map((s) => E.utils.storeLabel(s)).join('、')}`
      : t('cr.all_hk');
    countCard.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
        <div class="field" style="margin-bottom:0"><label>${esc(t(store ? 'cr.matched.store' : 'cr.matched'))}</label></div>
        <span class="chip ${store ? 'chip-red' : (scopeIds.length ? 'chip-amber' : 'chip-grey')}">${esc(scopeText)}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px">
        <span style="font-size:46px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${esc(num(n))}</span>
        <span style="font-size:15px;color:var(--ink-3)">${esc(t('cr.person'))}</span>
      </div>`;
    right.appendChild(countCard);

    const prevCard = el('div', 'card');
    prevCard.style.marginTop = '20px';
    const pt = el('div', '');
    pt.style.cssText = 'padding:20px 24px 6px;font-size:17px;font-weight:700';
    pt.textContent = t(store ? 'cr.preview.store' : 'cr.preview');
    prevCard.appendChild(pt);

    if (!S.create.applied) {
      const em = el('div', 'empty', '请先在左侧设置并应用筛选条件。');
      prevCard.appendChild(em);
    } else {
      // 总部多选门店时，额外展示「覆盖门店」列，说明该会员命中哪几家所选门店
      const multiScope = !store && (S.create.result.scope_type === 'stores');
      const tw = el('div', 'table-wrap');
      tw.style.maxHeight = '520px'; tw.style.overflowY = 'auto';
      const table = el('table', 'data');
      table.innerHTML = store
        ? `<thead><tr>
            <th>${esc(t('cr.col.id'))}</th><th>${esc(t('cr.col.phone'))}</th>
            <th>${esc(t('cr.col.last_store'))}</th><th>${esc(t('cr.col.visits'))}</th>
            <th>${esc(t('cr.col.amount_store'))}</th><th>${esc(t('cr.col.cups'))}</th>
          </tr></thead><tbody></tbody>`
        : `<thead><tr>
            <th>${esc(t('cr.col.id'))}</th><th>${esc(t('cr.col.last'))}</th>
            <th>${esc(t('cr.col.amount'))}</th><th>${esc(t('cr.col.cups'))}</th>
            ${multiScope ? `<th>${esc(t('cr.col.matched'))}</th>` : ''}
            <th>${esc(t('cr.col.status'))}</th>
          </tr></thead><tbody></tbody>`;
      const tb = $('tbody', table);
      S.create.result.list.slice(0, 200).forEach((m) => {
        const tr = el('tr');
        if (store) {
          tr.innerHTML = `<td class="mono">${esc(m.customer_id)}</td>
            <td class="mono t-muted">${esc(m.phone_masked)}</td>
            <td>${esc(m.days_since)} ${esc(t('cr.days_ago'))}</td>
            <td class="num">${esc(m.visit_count)}</td>
            <td class="num">${esc(money(m.amount))}</td>
            <td class="num">${esc(m.cups)}</td>`;
        } else {
          const matched = multiScope && m.matched_stores
            ? `<td class="t-small">${esc(m.matched_stores.map((s) => E.utils.storeLabel(s)).join('、'))}</td>` : '';
          tr.innerHTML = `<td class="mono">${esc(m.customer_id)}</td>
            <td>${esc(m.days_since)} ${esc(t('cr.days_ago'))}</td>
            <td class="num">${esc(money(m.amount))}</td>
            <td class="num">${esc(m.cups)}</td>
            ${matched}
            <td class="t-red t-bold">${esc(t('cr.qualified'))}</td>`;
        }
        tb.appendChild(tr);
      });
      tw.appendChild(table);
      prevCard.appendChild(tw);
      if (S.create.result.total > 200) {
        const more = el('div', 't-small t-muted');
        more.style.cssText = 'padding:12px 24px 18px';
        more.textContent = `仅预览前 200 位；共 ${num(S.create.result.total)} 位会员。`;
        prevCard.appendChild(more);
      }
    }
    right.appendChild(prevCard);
    wrap.appendChild(right);
  }

  /* ------------------------------------------------- 创建活动弹窗（图 7）*/
  function openCreateDialog() {
    const acc = account();
    const store = isStore();
    const pre = S.create.draftPrefill || {};
    const res = S.create.result || { total: 0, list: [] };

    const fr = S.create.filters;
    const rangeText = (r, unit, pre) => {
      if (!r) return '';
      const lo = r.min == null ? '' : `${pre || ''}${num(r.min)}`;
      const hi = r.max == null ? '' : `${pre || ''}${num(r.max)}`;
      if (lo && hi) return `${lo}–${hi}${unit || ''}`;
      if (lo) return `≥${lo}${unit || ''}`;
      if (hi) return `≤${hi}${unit || ''}`;
      return '';
    };
    const segParts = [
      fr.recency === 'any' ? '全部会员' : (C.RECENCY_OPTIONS.find((o) => o.v === fr.recency) || {}).zh,
      rangeText(fr.amount, '', 'HK$'),
      rangeText(fr.cups, '杯', ''),
    ].filter(Boolean);
    const audienceText = `${segParts.join(' · ')} · ` +
      `${store ? E.utils.storeLabel(acc.scope_id) : t('cr.all_hk')} · ${num(res.total)} ${t('cr.person')}`;

    const couponOpts = Object.keys(E.COUPON_TYPES).map((k) => {
      const ct = E.COUPON_TYPES[k];
      return { v: k, label: `${ct.name} · ${ct.discount_label}` };
    });

    let curCoupon = pre.coupon_type || (store ? 'store_local' : 'winback');
    let curMode = pre.mode || (E.COUPON_TYPES[curCoupon].auto ? 'auto' : 'manual');
    let curDiscount = pre.discount != null ? pre.discount : E.COUPON_TYPES[curCoupon].discount;

    const body = el('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="form-item">
          <label>${esc(t('dlg.name'))}</label>
          <input class="input" id="dlgName" value="${esc(pre.name || defaultName(curCoupon, curMode))}">
        </div>
        <div class="form-item">
          <label>${esc(t('dlg.type'))}</label>
          <select class="input" id="dlgMode">
            <option value="auto"${curMode === 'auto' ? ' selected' : ''}>${esc(t('dlg.type.auto'))}</option>
            <option value="manual"${curMode === 'manual' ? ' selected' : ''}>${esc(t('dlg.type.manual'))}</option>
          </select>
        </div>
        <div class="form-item">
          <label>${esc(t('dlg.coupon'))}</label>
          <select class="input" id="dlgCoupon"></select>
        </div>
        <div class="form-item">
          <label>${esc(t('dlg.mode'))}</label>
          <select class="input" id="dlgDelivery">
            <option value="auto">${esc(t('dlg.mode.auto'))}</option>
            <option value="manual">${esc(t('dlg.mode.manual'))}</option>
          </select>
        </div>
        <div class="form-item">
          <label>${esc(t('dlg.validity'))}</label>
          <div class="control locked"><span class="ctrl-value" id="dlgValidity"></span></div>
        </div>
        <div class="form-item">
          <label>${esc(t('dlg.per_member'))}</label>
          <div class="control locked"><span class="ctrl-value" id="dlgPer"></span></div>
        </div>
        <div class="form-item">
          <label>有效期开始</label>
          <input class="input" type="date" id="dlgFrom" value="${esc(pre.valid_from || '')}">
        </div>
        <div class="form-item">
          <label>有效期结束</label>
          <input class="input" type="date" id="dlgTo" value="${esc(pre.valid_until || '')}">
        </div>
        <div class="form-item full">
          <label>折扣力度（门店受总部授权上限约束）</label>
          <select class="input" id="dlgDiscount">
            <option value="0.5">5 折（买一送一等价）</option>
            <option value="0.7">7 折</option>
            <option value="0.75">7.5 折</option>
            <option value="0.8">8 折</option>
            <option value="0.85">8.5 折</option>
            <option value="0.9">9 折</option>
          </select>
        </div>
        <div class="form-item full">
          <label>${esc(t('dlg.scope'))}</label>
          ${store
            ? `<div class="control locked"><span class="ctrl-value">${esc(E.utils.storeLabel(acc.scope_id))}（${esc(t('cr.fixed_by_perm'))}）</span></div>`
            : `<select class="input" id="dlgScope">
                 <option value="all_hk">${esc(t('cr.all_hk'))}</option>
                 <option value="selected">${esc(t('dlg.scope.selected'))}</option>
                 <option value="single">${esc(t('dlg.scope.single'))}</option>
               </select>
               <select class="input" id="dlgScopeStore" style="margin-top:10px;display:none"></select>`}
          <div class="t-small t-muted" id="dlgScopeHint" style="margin-top:6px"></div>
        </div>
        <div class="form-item full">
          <label>目标人群说明</label>
          <input class="input" id="dlgSegment" value="${esc(pre.segment_definition || audienceText)}">
        </div>
      </div>
      <div class="notice" id="dlgNotice" style="margin-top:20px"></div>
      <div id="dlgGuard" style="margin-top:14px"></div>
    `;

    const couponSel = $('#dlgCoupon', body);
    couponOpts.forEach((o) => {
      const op = document.createElement('option');
      op.value = o.v; op.textContent = o.label;
      if (o.v === curCoupon) op.selected = true;
      couponSel.appendChild(op);
    });
    const discSel = $('#dlgDiscount', body);
    discSel.value = String(curDiscount);
    if (!discSel.value) discSel.value = '0.8';

    // ---- 适用范围控件（总部）----
    const scopeSel = $('#dlgScope', body);
    const scopeStoreSel = $('#dlgScopeStore', body);
    const scopeHint = $('#dlgScopeHint', body);
    const pickedStoreIds = (S.create.filters.storeScope || []);
    if (scopeSel) {
      // 单店下拉：列出全部门店
      DB.stores.forEach((st) => {
        const op = document.createElement('option');
        op.value = st.store_id; op.textContent = `${st.name}（${st.district}）`;
        scopeStoreSel.appendChild(op);
      });
      if (pickedStoreIds.length === 1) scopeStoreSel.value = pickedStoreIds[0];
      // 默认：筛选已选门店 → 活动只覆盖这些门店；否则全港
      scopeSel.value = pickedStoreIds.length ? 'selected' : 'all_hk';
    }
    function syncScope() {
      if (!scopeSel) return;
      const mode = scopeSel.value;
      scopeStoreSel.style.display = mode === 'single' ? '' : 'none';
      if (mode === 'all_hk') scopeHint.textContent = '活动适用于全港所有门店。';
      else if (mode === 'selected') {
        scopeHint.textContent = pickedStoreIds.length
          ? `活动仅适用于筛选所选的 ${pickedStoreIds.length} 家门店：${pickedStoreIds.map((x) => E.utils.storeLabel(x)).join('、')}`
          : '当前未选择具体门店，等同全港门店。';
      } else {
        scopeHint.textContent = `活动仅适用于「${E.utils.storeLabel(scopeStoreSel.value)}」。`;
      }
    }
    if (scopeSel) {
      scopeSel.addEventListener('change', () => { syncScope(); refresh(); });
      scopeStoreSel.addEventListener('change', () => { syncScope(); refresh(); });
      syncScope();
    }

    function refresh() {
      const ct = E.COUPON_TYPES[curCoupon];
      $('#dlgValidity', body).textContent = ct.validity_label;
      $('#dlgPer', body).textContent = `${ct.per_member_label} · ${ct.stack_label}`;
      $('#dlgNotice', body).textContent = t(store ? 'dlg.approval_note.store' : 'dlg.approval_note') + ' ' + t('dlg.order_note');
      // 实时守门
      const draft = curDraft();
      const g = E.permissionGuard(draft, acc);
      const box = $('#dlgGuard', body);
      box.innerHTML = '';
      if (!g.pass) {
        const d = el('div', 'notice');
        d.style.background = '#FFF3F4';
        d.innerHTML = `<strong>${esc(t('ai.perm.fail'))}</strong><ul style="margin:8px 0 0;padding-left:18px">`
          + g.checks.filter((c) => !c.pass).map((c) => `<li style="margin-bottom:6px">${esc(c.detail)}</li>`).join('')
          + `</ul>`;
        box.appendChild(d);
      }
    }
    /** 解析当前弹窗的适用范围（门店账号一律锁定为本店，服务端同样强制） */
    function resolveScope() {
      if (store) return { store_scope: 'store', store_id: acc.scope_id, store_ids: null };
      const mode = scopeSel ? scopeSel.value : 'all_hk';
      if (mode === 'single') return { store_scope: 'store', store_id: scopeStoreSel.value, store_ids: null };
      if (mode === 'selected' && pickedStoreIds.length)
        return { store_scope: 'stores', store_id: null, store_ids: pickedStoreIds.slice() };
      return { store_scope: 'all_hk', store_id: null, store_ids: null };
    }
    function curDraft() {
      return {
        name: $('#dlgName', body).value.trim(),
        coupon_type: curCoupon,
        discount: parseFloat(discSel.value),
        offer_label: discSel.options[discSel.selectedIndex].textContent,
        mode: $('#dlgDelivery', body).value,
        store_scope: resolveScope().store_scope,
        store_id: resolveScope().store_id,
        store_ids: resolveScope().store_ids,
        segment_definition: $('#dlgSegment', body).value,
        audience_size: res.total,
        valid_from: $('#dlgFrom', body).value,
        valid_until: $('#dlgTo', body).value,
        source: pre.source || 'manual',
      };
    }
    couponSel.addEventListener('change', () => {
      curCoupon = couponSel.value;
      const ct = E.COUPON_TYPES[curCoupon];
      discSel.value = String(ct.discount);
      curMode = ct.auto ? 'auto' : 'manual';
      $('#dlgMode', body).value = curMode;
      const nm = $('#dlgName', body);
      if (!nm.value.trim() || /券|活动/.test(nm.value)) nm.value = defaultName(curCoupon, curMode);
      refresh();
    });
    [$('#dlgFrom', body), $('#dlgTo', body)].forEach((n) => n.addEventListener('change', refresh));
    discSel.addEventListener('change', refresh);
    refresh();

    const foot = el('div', '', `<button class="btn btn-ghost" data-x="cancel">${esc(t('dlg.cancel'))}</button>
      <button class="btn btn-primary" data-x="ok">${esc(t('dlg.submit'))}</button>`);
    const mo = modal({ title: t('dlg.title'), subtitle: `${esc(t('dlg.audience'))}：${esc(audienceText)}`, body, footer: foot });
    foot.querySelector('[data-x="cancel"]').addEventListener('click', () => {
      // PRD 5.2：弹窗关闭且未提交时保留筛选条件
      mo.close();
    });
    foot.querySelector('[data-x="ok"]').addEventListener('click', () => {
      const draft = curDraft();
      const who = acc.display_name || acc.name;
      if (!draft.name) { toast(t('dlg.required'), 'warn'); return; }
      if (draft.valid_from && draft.valid_until && draft.valid_until < draft.valid_from) {
        toast(t('dlg.date_invalid'), 'warn'); return;
      }
      // 服务端守门（确定性，fail-closed）
      const g = E.permissionGuard(draft, acc);
      if (!g.pass) {
        const bad = g.checks.filter((c) => !c.pass);
        toast('权限守门拦截：' + bad[0].detail, 'err', 5200);
        E.audit(who, 'guard_block_draft', 'campaign_draft', draft.name,
          `草稿被确定性权限守门拦截：${bad.map((b) => b.name).join('、')}`, '创建活动提交前校验');
        return;
      }
      const camp = E.createCampaign(draft, acc, who);
      mo.close();
      S.create.draftPrefill = null;
      toast(`活动「${camp.name}」已提交审批（${camp.campaign_id}）`, 'ok');
      setHash('approval');
    });
  }

  function defaultName(couponKey, mode) {
    const ct = E.COUPON_TYPES[couponKey];
    if (couponKey === 'winback') return '30 天回流会员优惠';
    if (couponKey === 'store_local') return E.utils.storeLabel(account().scope_id).replace('店', '') + '门店活动';
    return ct.name.replace('券', '') + '活动';
  }

  /* ================================================================
   * 页面 3 —— 活动管理（图 8）
   * ==============================================================*/
  function renderManage(host) {
    const acc = account();
    const store = isStore();
    const myStore = acc.scope_id;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('mg.title'))}</h2>
        <p class="page-desc">${esc(t('mg.desc'))}</p>
      </div>`;
    host.appendChild(head);

    const tabs = el('div', 'tabs');
    const defs = [
      { k: 'all', l: t('mg.tab.all') }, { k: 'auto', l: t('mg.tab.auto') },
      { k: 'theme', l: t('mg.tab.theme') }, { k: 'store', l: t('mg.tab.store') },
    ];
    defs.forEach((d) => {
      const b = el('button', 'tab' + (S.manageTab === d.k ? ' active' : ''), esc(d.l));
      b.addEventListener('click', () => { S.manageTab = d.k; render(); });
      tabs.appendChild(b);
    });
    const right = el('div', 'tabs-right');
    right.innerHTML = `<span>${esc(t('mg.type_filter'))}</span><span class="t-bold t-red">${esc((defs.find((d) => d.k === S.manageTab) || {}).l || '')}</span>`;
    tabs.appendChild(right);
    host.appendChild(tabs);

    // 门店账号只看到适用于本店的活动
    let list = DB.campaigns.slice();
    if (store) list = list.filter((c) => E.campaignCoversStore(c, myStore));
    if (S.manageTab === 'auto') list = list.filter((c) => c.category === 'auto_rule');
    else if (S.manageTab === 'theme') list = list.filter((c) => c.category === 'theme');
    else if (S.manageTab === 'store') list = list.filter((c) => c.is_store);

    if (!list.length) {
      host.appendChild(el('div', 'empty', esc(t('mg.none'))));
      return;
    }

    const wrap = el('div', 'camp-list');
    list.forEach((c) => {
      const issued = DB.couponInstance.filter((x) => x.campaign_id === c.campaign_id).length;
      const item = el('div', 'camp-item');
      const modeChip = c.mode === 'auto'
        ? `<span class="chip chip-red">${esc(t('mg.tab.auto'))}</span>`
        : `<span class="chip chip-grey">${esc(t('sr.mode.manual'))}</span>`;
      const catChip = c.is_theme ? `<span class="chip chip-grey">${esc(t('mg.tab.theme'))}</span>` : '';
      const stChip = statusChip(c.status);

      item.innerHTML = `
        <div class="camp-main">
          <div class="camp-name-row">
            <span class="camp-name">${esc(c.name)}</span>
            ${modeChip}${catChip}
          </div>
          <div class="camp-meta">
            <span>${esc(t('mg.scope'))}：${esc(E.scopeLabelOf(c))}</span>
            <span>${esc(t('mg.recent'))}：${esc(num(issued))} ${esc(t('mg.sheets'))}</span>
            <span>${esc(E.COUPON_TYPES[c.coupon_type].name)} · ${esc(E.COUPON_TYPES[c.coupon_type].discount_label)}</span>
          </div>
        </div>
        <div class="camp-right">
          ${stChip}
          <button class="btn btn-ghost btn-sm" data-a="detail">${esc(t('mg.detail'))}</button>
        </div>`;
      $('[data-a="detail"]', item).addEventListener('click', () => openCampaignDetail(c));
      wrap.appendChild(item);
    });
    host.appendChild(wrap);

    const note = el('div', 't-small t-muted');
    note.style.marginTop = '18px';
    note.textContent = '切换「限定主题」或「门店活动」后，在同一列表显示相应活动。';
    host.appendChild(note);
  }

  function statusChip(st) {
    const map = {
      running: ['chip-green', '运行中'], approved: ['chip-green', '已批准'],
      pending: ['chip-amber', '待审批'], rejected: ['chip-red', '已驳回'],
      draft: ['chip-grey', '草稿'], stopped: ['chip-grey', '停用'],
    };
    const m = map[st] || ['chip-grey', st];
    return `<span class="chip ${m[0]}">${esc(m[1])}</span>`;
  }

  function openCampaignDetail(c) {
    const ct = E.COUPON_TYPES[c.coupon_type];
    const issued = DB.couponInstance.filter((x) => x.campaign_id === c.campaign_id);
    const claimed = issued.filter((x) => x.claimed_at).length;
    const used = issued.filter((x) => x.redeemed_at).length;

    const body = el('div');
    body.innerHTML = `
      <div class="dl-row"><span class="k">活动编号</span><span class="v mono">${esc(c.campaign_id)}</span></div>
      <div class="dl-row"><span class="k">券种</span><span class="v">${esc(ct.name)} · ${esc(ct.discount_label)}</span></div>
      <div class="dl-row"><span class="k">触发条件</span><span class="v">${esc(ct.trigger_label)}</span></div>
      <div class="dl-row"><span class="k">有效期</span><span class="v">${esc(ct.validity_label)}</span></div>
      <div class="dl-row"><span class="k">每人次数</span><span class="v">${esc(ct.per_member_label)}</span></div>
      <div class="dl-row"><span class="k">积分同用</span><span class="v">${esc(ct.stack_label)}</span></div>
      <div class="dl-row"><span class="k">适用范围</span><span class="v">${esc(E.scopeLabelOf(c))}</span></div>
      <div class="dl-row"><span class="k">目标人群</span><span class="v">${esc(c.segment_definition || '—')}</span></div>
      <div class="dl-row"><span class="k">创建人 / 时间</span><span class="v">${esc(c.created_by)} · ${esc(c.created_at)}</span></div>
      <div class="dl-row"><span class="k">状态</span><span class="v">${statusChip(c.status)}</span></div>
      <div style="margin-top:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:10px">发放结果</div>
        <div class="metrics metrics-4" style="margin-bottom:0">
          <div class="metric" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">发放</div><div class="metric-value small">${esc(num(issued.length))}</div></div>
          <div class="metric" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">领取</div><div class="metric-value small">${esc(num(claimed))}</div></div>
          <div class="metric" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">核销</div><div class="metric-value small">${esc(num(used))}</div></div>
          <div class="metric" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">核销率</div><div class="metric-value small">${esc(issued.length ? pct(used / issued.length) : '0.0%')}</div></div>
        </div>
      </div>
      <div style="margin-top:20px">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">券规则</div>
        <ul style="margin:0;padding-left:20px;font-size:13.5px;color:var(--ink-2);line-height:1.9">
          ${ct.rules.map((r) => `<li>${esc(r)}</li>`).join('')}
        </ul>
      </div>`;

    const foot = el('div', '');
    if (c.mode === 'auto' && (c.status === 'running' || c.status === 'stopped')) {
      const b = el('button', 'btn btn-ghost', esc(c.status === 'running' ? t('mg.stop') : t('mg.start')));
      b.addEventListener('click', async () => {
        const next = c.status === 'running' ? 'stopped' : 'running';
        const r = await confirm({
          title: c.status === 'running' ? '停用自动规则' : '启用自动规则',
          message: `确认将活动「${c.name}」${c.status === 'running' ? '停用' : '启用'}？`,
          detail: '停用后系统不再按该规则发券；已发出的券不受影响。',
          okText: '确认', reasonLabel: '操作原因', reasonPlaceholder: '填写操作原因（写入审计记录）',
        });
        if (!r) return;
        E.setCampaignStatus(c.campaign_id, next, account().display_name || account().name, r.reason);
        toast(`活动已${next === 'running' ? '启用' : '停用'}`, 'ok');
        render();
      });
      foot.appendChild(b);
    }
    const close = el('button', 'btn btn-primary', esc(t('ap.dlg.close')));
    foot.appendChild(close);
    const mo = modal({ title: c.name, subtitle: `${c.campaign_id} · ${E.scopeLabelOf(c)}`, body, footer: foot });
    close.addEventListener('click', mo.close);

    // 活动详情 → 其他页面的直达入口（此前只能关掉弹窗再自己找菜单）
    const goAp = el('button', 'btn btn-ghost', '查看审批记录');
    goAp.addEventListener('click', () => { mo.close(); S.approvalTab = 'all'; setHash('approval'); });
    foot.insertBefore(goAp, close);
    const goSr = el('button', 'btn btn-ghost', '查看发送记录');
    goSr.addEventListener('click', () => {
      mo.close();
      S.records.mode = ''; S.records.result = ''; S.records.campaignId = c.campaign_id;
      setHash('records');
    });
    foot.insertBefore(goSr, close);
  }

  /* ================================================================
   * 页面 4 —— 审批中心（图 9 / 图 10）
   * ==============================================================*/
  function renderApproval(host) {
    const acc = account();
    const store = isStore();
    const myStore = acc.scope_id;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('ap.title'))}</h2>
        <p class="page-desc">${esc(t('ap.desc'))}</p>
      </div>`;
    host.appendChild(head);

    // 筛选栏
    const bar = el('div', 'filterbar');
    const row = el('div', 'filterbar-row');
    bar.appendChild(row);
    const tabsBox = el('div', '');
    tabsBox.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
    const defs = [
      { k: 'all', l: t('ap.tab.all') }, { k: 'pending', l: t('ap.tab.pending') },
      { k: 'approved', l: t('ap.tab.approved') }, { k: 'rejected', l: t('ap.tab.rejected') },
    ];
    defs.forEach((d) => {
      const b = el('button', 'tab' + (S.approvalTab === d.k ? ' active' : ''), esc(d.l));
      b.addEventListener('click', () => { S.approvalTab = d.k; render(); });
      tabsBox.appendChild(b);
    });
    row.appendChild(tabsBox);

    const fDate = el('div', 'field');
    fDate.innerHTML = `<label>${esc(t('ap.date'))}</label>`;
    const ss = singleSelect({
      options: [
        { v: '', label: t('ap.all_dates') },
        { v: 'week', label: '近一周' }, { v: 'month', label: '近一个月' },
      ],
      value: S.approvalDate, onChange: (v) => { S.approvalDate = v; render(); },
    });
    ss.style.minWidth = '160px';
    fDate.appendChild(ss);
    row.appendChild(fDate);
    const fb = el('button', 'btn btn-primary', esc(t('ap.filter')));
    fb.style.minWidth = '110px';
    fb.addEventListener('click', () => { render(); toast('已应用审批筛选', 'ok'); });
    row.appendChild(fb);
    host.appendChild(bar);

    // 数据：审批列表默认同时保留待办与历史记录
    let list = DB.campaigns.slice().map((c) => {
      const log = DB.approvalLog.filter((l) => l.campaign_id === c.campaign_id).slice(-1)[0] || {};
      return { c, log };
    });
    if (store) list = list.filter((x) => E.campaignCoversStore(x.c, myStore));
    if (S.approvalTab !== 'all') {
      list = list.filter((x) => {
        if (S.approvalTab === 'pending') return x.c.status === 'pending';
        if (S.approvalTab === 'approved') return ['approved', 'running', 'stopped'].includes(x.c.status);
        if (S.approvalTab === 'rejected') return x.c.status === 'rejected';
        return true;
      });
    }
    if (S.approvalDate) {
      const days = S.approvalDate === 'week' ? 7 : 30;
      const cut = E.utils.addDays(C.DATA_TODAY, -days);
      list = list.filter((x) => x.c.created_at.slice(0, 10) >= cut);
    }
    list.sort((a, b) => (b.c.created_at > a.c.created_at ? 1 : -1));

    if (!list.length) {
      host.appendChild(el('div', 'empty', esc(t('ap.none'))));
    } else {
      const wrap = el('div', 'camp-list');
      list.forEach(({ c, log }) => {
        const item = el('div', 'camp-item');
        const modeChip = c.mode === 'auto'
          ? `<span class="chip chip-red">${esc(t('mg.tab.auto'))}</span>`
          : `<span class="chip chip-grey">${esc(t('sr.mode.manual'))}</span>`;
        item.innerHTML = `
          <div class="camp-main">
            <div class="camp-name-row">
              <span class="camp-name">${esc(c.name)}</span>
              ${statusChip(c.status)}
              ${modeChip}
            </div>
            <div class="camp-meta">
              <span>${esc(t('ap.submitter'))}：${esc(log.by || c.created_by)}</span>
              <span>${esc(t('ap.submit_date'))}：${esc((c.created_at || '').replace('T', ' '))}</span>
              <span>${esc(t('ap.approver'))}：${esc(log.approver || '—')}</span>
              <span>${esc(t('ap.approval_date'))}：${esc(log.approval_date === '—' ? '—' : (log.approval_date || '—').replace('T', ' '))}</span>
            </div>
          </div>
          <div class="camp-right">
            <button class="btn btn-ghost btn-sm" data-a="detail">${esc(t('ap.detail'))}</button>
          </div>`;
        $('[data-a="detail"]', item).addEventListener('click', () => openApprovalDialog(c, log));
        wrap.appendChild(item);
      });
      host.appendChild(wrap);
      const note = el('div', 't-small t-muted');
      note.style.marginTop = '16px';
      note.textContent = t('ap.no_approve');
      host.appendChild(note);
    }
  }

  function openApprovalDialog(c, log) {
    const acc = account();
    const ct = E.COUPON_TYPES[c.coupon_type];
    const editable = c.status === 'pending' && acc.can_approve;
    const body = el('div');
    body.innerHTML = `
      <div class="dl-row"><span class="k">活动编号</span><span class="v mono">${esc(c.campaign_id)}</span></div>
      <div class="dl-row"><span class="k">券种 / 折扣</span><span class="v">${esc(ct.name)} · ${esc(ct.discount_label)}</span></div>
      <div class="dl-row"><span class="k">活动类型</span><span class="v">${esc(c.mode === 'auto' ? t('mg.tab.auto') : t('sr.mode.manual'))}</span></div>
      <div class="dl-row"><span class="k">适用范围</span><span class="v">${esc(E.scopeLabelOf(c))}</span></div>
      <div class="dl-row"><span class="k">目标人群</span><span class="v">${esc(c.segment_definition || '—')}</span></div>
      <div class="dl-row"><span class="k">${esc(t('ap.submitter'))}</span><span class="v">${esc(log.by || c.created_by)}</span></div>
      <div class="dl-row"><span class="k">${esc(t('ap.submit_date'))}</span><span class="v">${esc((c.created_at || '').replace('T', ' '))}</span></div>
      <div class="dl-row"><span class="k">${esc(t('ap.approver'))}</span><span class="v">${esc(log.approver || '—')}</span></div>
      <div class="dl-row"><span class="k">${esc(t('ap.approval_date'))}</span><span class="v">${esc(log.approval_date === '—' ? '—' : (log.approval_date || '—').replace('T', ' '))}</span></div>
      <div class="dl-row"><span class="k">审批意见</span><span class="v">${esc(log.comment || '—')}</span></div>
      ${editable ? `<div class="form-item" style="margin-top:20px">
          <label>${esc(t('ap.dlg.comment'))}</label>
          <textarea class="textarea" id="apComment" placeholder="${esc(t('ap.dlg.comment_ph'))}"></textarea>
        </div>` : `<div class="notice grey" style="margin-top:20px">${esc(t('ap.dlg.readonly'))}</div>`}
    `;
    const foot = el('div', '');
    const close = el('button', 'btn btn-ghost', esc(t('ap.dlg.close')));
    foot.appendChild(close);
    let rej, app;
    if (editable) {
      rej = el('button', 'btn btn-ghost btn-danger-text', esc(t('ap.dlg.reject')));
      app = el('button', 'btn btn-primary', esc(t('ap.dlg.approve')));
      foot.appendChild(rej); foot.appendChild(app);
    } else {
      const ctrl = el('div', 'control locked');
      ctrl.style.display = 'none';
    }
    const mo = modal({ title: t('ap.dlg.title'), subtitle: c.name, body, footer: foot });
    close.addEventListener('click', mo.close);

    async function decide(approve) {
      const cmt = ($('#apComment', body) || {}).value || '';
      if (!approve && !cmt.trim()) { toast('驳回时请填写审批意见', 'warn'); return; }
      const who = acc.display_name || acc.name;
      const r = approve
        ? E.approveCampaign(c.campaign_id, who, cmt)
        : E.rejectCampaign(c.campaign_id, who, cmt);
      if (!r.ok) { toast(r.error, 'err'); return; }
      mo.close();
      toast(approve ? `已批准「${c.name}」` : `已驳回「${c.name}」`, approve ? 'ok' : 'warn');
      render();
    }
    if (app) app.addEventListener('click', () => decide(true));
    if (rej) rej.addEventListener('click', () => decide(false));
  }

  /* ================================================================
   * 页面 5 —— 发送记录（图 11 / 图 12 / 图 13）
   * ==============================================================*/
  function renderRecords(host) {
    const acc = account();
    const store = isStore();
    const myStore = acc.scope_id;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('sr.title'))}</h2>
        <p class="page-desc">${esc(t('sr.desc'))}</p>
      </div>`;
    const exp = el('button', 'btn btn-ghost', `${SVG.export}<span>${esc(t('sr.export'))}</span>`);
    exp.addEventListener('click', () => {
      const jobs = filteredJobs();
      const rows = [['记录编号', '活动', '券种', '折扣', '发放方式', '任务来源', '执行时间', '请求', '成功', '失败', '结果']];
      jobs.forEach((j) => rows.push([j.job_id, campaignName(j.campaign_id), j.coupon_name, j.discount_label,
        j.mode === 'auto' ? '自动规则' : '人工发放', j.source, j.executed_at, j.requested, j.success, j.failed,
        E.STATUS.job[j.status] || j.status]));
      downloadFile(rows, 'csv', `PCC_发送记录_${C.DATA_TODAY}`);
      E.audit(acc.display_name || acc.name, 'export_records', 'send_job', '-', '导出发送记录 CSV', '发送记录导出');
      toast('发送记录已导出（不含会员领取核销明细）', 'ok');
    });
    head.appendChild(exp);
    host.appendChild(head);

    // 筛选栏
    const bar = el('div', 'filterbar');
    const row = el('div', 'filterbar-row');
    bar.appendChild(row);

    const f1 = el('div', 'field');
    f1.innerHTML = `<label>${esc(t('sr.f.mode'))}</label>`;
    const ms = multiSelect({
      placeholder: t('sr.all_modes'), allLabel: t('sr.all_modes'),
      options: [{ v: 'auto', label: t('sr.mode.auto') }, { v: 'manual', label: t('sr.mode.manual') }],
      values: S.records.mode ? [S.records.mode] : [], exclusiveAll: true,
      onChange: (v) => { S.records.mode = v.length === 1 ? v[0] : ''; render(); },
    });
    ms.style.minWidth = '190px';
    f1.appendChild(ms); row.appendChild(f1);

    const f2 = el('div', 'field');
    f2.innerHTML = `<label>${esc(t('sr.f.campaign'))}</label>`;
    const campOpts = DB.campaigns
      .filter((c) => !store || E.campaignCoversStore(c, myStore))
      .map((c) => ({ v: c.campaign_id, label: `${c.name} · ${E.COUPON_TYPES[c.coupon_type].discount_label}` }));
    const ss = singleSelect({
      options: [{ v: '', label: t('sr.all_campaigns') }].concat(campOpts),
      value: S.records.campaignId, onChange: (v) => { S.records.campaignId = v; render(); },
    });
    ss.style.minWidth = '230px';
    f2.appendChild(ss); row.appendChild(f2);

    const f3 = el('div', 'field');
    f3.innerHTML = `<label>${esc(t('sr.f.result'))}</label>`;
    const ss2 = singleSelect({
      options: [
        { v: '', label: t('sr.all_results') },
        { v: 'success', label: t('sr.result.success') },
        { v: 'failed', label: t('sr.result.failed') },
        { v: 'handled', label: t('sr.result.handled') },
      ],
      value: S.records.result, onChange: (v) => { S.records.result = v; render(); },
    });
    ss2.style.minWidth = '150px';
    f3.appendChild(ss2); row.appendChild(f3);

    const f4 = el('div', 'field');
    f4.innerHTML = `<label>${esc(t('sr.f.date'))}</label>`;
    const ss3 = singleSelect({
      options: [{ v: 'week', label: t('sr.last_week') }, { v: 'month', label: t('sr.last_month') }],
      value: S.records.range, onChange: (v) => { S.records.range = v; render(); },
    });
    ss3.style.minWidth = '140px';
    f4.appendChild(ss3); row.appendChild(f4);

    const q = el('button', 'btn btn-primary', esc(t('sr.query')));
    q.style.minWidth = '120px';
    q.addEventListener('click', () => { render(); toast('查询完成', 'ok'); });
    row.appendChild(q);
    host.appendChild(bar);

    // 指标
    const jobs = filteredJobs();
    const totalReq = jobs.reduce((s, j) => s + j.requested, 0);
    const totalOk = jobs.reduce((s, j) => s + j.success, 0);
    const totalFail = jobs.reduce((s, j) => s + j.failed, 0);
    const pending = jobs.filter((j) => j.status === 'failed').length;

    const mg = el('div', 'metrics metrics-4');
    mg.appendChild(metric(t('sr.metric.request'), num(totalReq), t('sr.sub.this_filter'), false));
    mg.appendChild(metric(t('sr.metric.success'), num(totalOk), t('sr.sub.instance'), false));
    mg.appendChild(metric(t('sr.metric.fail'), num(totalFail), t('sr.sub.view_reason'), totalFail > 0));
    mg.appendChild(metric(t('sr.metric.pending'), num(pending), t('sr.sub.view_task'), pending > 0));
    host.appendChild(mg);

    // 明细表
    const card = el('div', 'card');
    const tt = el('div', '');
    tt.style.cssText = 'padding:20px 24px 4px;display:flex;justify-content:space-between;align-items:center';
    tt.innerHTML = `<span style="font-size:17px;font-weight:700">${esc(t('sr.detail.title'))}</span>
      <span class="t-small t-muted">${esc(t('sr.detail.note'))}</span>`;
    card.appendChild(tt);

    if (!jobs.length) {
      card.appendChild(el('div', 'empty', esc(t('sr.none'))));
    } else {
      const tw = el('div', 'table-wrap');
      const table = el('table', 'data');
      table.innerHTML = `<thead><tr>
          <th>${esc(t('sr.col.id'))}</th><th>${esc(t('sr.col.campaign'))}</th>
          <th>${esc(t('sr.col.mode'))}</th><th>${esc(t('sr.col.source'))}</th>
          <th>${esc(t('sr.col.time'))}</th><th>${esc(t('sr.col.result'))}</th>
          <th>${esc(t('sr.col.detail'))}</th>
        </tr></thead><tbody></tbody>`;
      const tb = $('tbody', table);
      jobs.slice().reverse().forEach((j) => {
        const tr = el('tr');
        const st = j.status === 'failed'
          ? `<span class="t-red t-bold">${esc(t('sr.result.failed'))}</span>`
          : j.status === 'handled'
            ? `<span class="t-muted">${esc(t('sr.result.handled'))}</span>`
            : `${esc(t('sr.result.success'))}`;
        tr.innerHTML = `<td class="mono">${esc(j.job_id)}</td>
          <td>${esc(campaignName(j.campaign_id))} · ${esc(j.discount_label)}</td>
          <td>${esc(j.mode === 'auto' ? t('sr.mode.auto') : t('sr.mode.manual'))}</td>
          <td class="t-muted">${esc(j.source)}</td>
          <td class="mono">${esc((j.executed_at || '').replace('T', ' ').slice(5))}</td>
          <td>${st}</td>
          <td><button class="btn-text" data-a="d">${esc(t('sr.col.detail'))}</button></td>`;
        $('[data-a="d"]', tr).addEventListener('click', () => openJobDrawer(j));
        tb.appendChild(tr);
      });
      tw.appendChild(table);
      card.appendChild(tw);
    }
    host.appendChild(card);

    const note = el('div', 't-small t-muted');
    note.style.marginTop = '14px';
    note.textContent = t('sr.drawer.notify_note');
    host.appendChild(note);

    function filteredJobs() {
      let list = DB.sendJob.slice();
      if (store) list = list.filter((j) => !j.store_id || j.store_id === myStore);
      if (S.records.mode) list = list.filter((j) => j.mode === S.records.mode);
      if (S.records.campaignId) list = list.filter((j) => j.campaign_id === S.records.campaignId);
      if (S.records.result) list = list.filter((j) => j.status === S.records.result);
      const days = S.records.range === 'week' ? 7 : 30;
      const cut = E.utils.addDays(C.DATA_TODAY, -days);
      list = list.filter((j) => (j.executed_at || '').slice(0, 10) >= cut);
      return list;
    }
  }

  function campaignName(cid) {
    const c = DB.campaigns.find((x) => x.campaign_id === cid);
    return c ? c.name : cid;
  }

  /* ------------------------------------------------- 失败详情抽屉（图 13）*/
  function openJobDrawer(job) {
    const acc = account();
    const attempts = DB.sendAttempt.filter((a) => a.job_id === job.job_id);
    const failed = attempts.filter((a) => a.result === 'failed');
    const blocked = attempts.filter((a) => a.result === 'blocked');
    const isFailed = job.status === 'failed' || failed.length > 0;

    const body = el('div');
    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap">
        <span class="mono" style="font-size:16px;font-weight:700">${esc(job.job_id)}</span>
        <span class="t-muted">·</span>
        <span style="font-weight:600">${esc(campaignName(job.campaign_id))} ${esc(job.discount_label)}</span>
        ${job.status === 'failed' ? `<span class="chip chip-red">待处理</span>` :
          job.status === 'handled' ? `<span class="chip chip-grey">已处理</span>` :
          `<span class="chip chip-green">成功</span>`}
      </div>
      <div class="dl-row"><span class="k">${esc(t('sr.col.mode'))}</span><span class="v">${esc(job.mode === 'auto' ? t('sr.mode.auto') : t('sr.mode.manual'))}</span></div>
      <div class="dl-row"><span class="k">${esc(t('sr.drawer.source'))}</span><span class="v">${esc(job.source)}</span></div>
      <div class="dl-row"><span class="k">${esc(t('sr.drawer.time'))}</span><span class="v mono">${esc((job.executed_at || '').replace('T', ' '))}</span></div>
      <div class="dl-row"><span class="k">发券请求 / 成功 / 失败 / 拦截</span><span class="v">${esc(job.requested)} / ${esc(job.success)} / ${esc(job.failed)} / ${esc(job.blocked)}</span></div>
      ${isFailed ? `
        <div class="dl-row"><span class="k">${esc(t('sr.drawer.stage'))}</span><span class="v">资格检查</span></div>
        <div class="dl-row"><span class="k">${esc(t('sr.drawer.code'))}</span><span class="v t-red mono t-bold">${esc(failed[0].code)}</span></div>
        <div class="dl-row"><span class="k">${esc(t('sr.drawer.reason'))}</span><span class="v">${esc(failed[0].reason)}</span></div>
        <div class="dl-row"><span class="k">${esc(t('sr.drawer.first'))}</span><span class="v mono">${esc((failed[0].at || '').replace('T', ' '))}</span></div>
        <div class="dl-row"><span class="k">${esc(t('sr.drawer.last_retry'))}</span><span class="v mono">${esc(job.retry_history && job.retry_history.length ? job.retry_history[job.retry_history.length - 1].at.replace('T', ' ') : '—')}</span></div>
        <div class="dl-row"><span class="k">${esc(t('sr.drawer.status'))}</span><span class="v">${esc(job.status === 'handled' ? '已处理' : '待处理')}</span></div>
      ` : ''}
      <div style="margin-top:22px">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">${esc(t('sr.drawer.history'))}</div>
        <div class="timeline">
          ${(job.retry_history || []).map((h) => `<div class="tl-item"><span class="tl-dot green"></span>
            <span><span class="mono">${esc(h.at.replace('T', ' '))}</span> ${esc(h.by)} 重试，恢复 ${esc(h.recovered)} 张券${h.reason ? '（' + esc(h.reason) + '）' : ''}</span></div>`).join('')}
          ${failed.map((f) => `<div class="tl-item"><span class="tl-dot"></span>
            <span><span class="mono">${esc((f.retried_at || f.at).replace('T', ' '))}</span> ${esc(f.result === 'failed' ? '首次执行失败' : '重试成功')} · ${esc(f.code)}</span></div>`).join('')}
          ${blocked.slice(0, 6).map((b) => `<div class="tl-item"><span class="tl-dot grey"></span>
            <span><span class="mono">${esc(b.at.replace('T', ' '))}</span> 资格检查拦截 · ${esc(b.code)}：${esc(b.reason)}</span></div>`).join('')}
          ${!job.retry_history?.length && !isFailed ? `<div class="tl-item"><span class="tl-dot green"></span>
            <span><span class="mono">${esc((job.executed_at || '').replace('T', ' '))}</span> 执行完成，已建立 ${esc(job.success)} 张券实例</span></div>` : ''}
        </div>
        ${isFailed ? `<div style="margin-top:12px;font-size:13px;color:var(--ink-3)">${esc(t('sr.drawer.not_retried'))}</div>
          <div style="margin-top:6px;font-size:13px;color:var(--pcc-red)">${esc(t('sr.drawer.idem_note'))}</div>` : ''}
      </div>
      ${blocked.length ? `<div style="margin-top:22px">
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">${esc(t('sr.blocked.title'))}</div>
        ${blocked.slice(0, 8).map((b) => `<div class="dl-row"><span class="k mono">${esc(b.code)}</span><span class="v t-small">${esc(b.reason)}</span></div>`).join('')}
      </div>` : ''}
    `;

    const foot = el('div', '');
    if (isFailed && job.status !== 'handled') {
      const h = el('button', 'btn btn-ghost', esc(t('sr.drawer.handle')));
      h.addEventListener('click', async () => {
        const r = await confirm({ title: '标记已处理', message: `确认将任务 ${job.job_id} 标记为已处理？`,
          okText: '确认', reasonLabel: '处理原因', reasonPlaceholder: '填写处理原因（写入审计记录）' });
        if (!r) return;
        E.markJobHandled(job.job_id, acc.display_name || acc.name, r.reason);
        toast('任务已标记为已处理', 'ok');
        dr.close(); render();
      });
      const rt = el('button', 'btn btn-primary', esc(t('sr.drawer.retry')));
      rt.addEventListener('click', async () => {
        const r = await confirm({ title: '重试发送', message: `确认重试任务 ${job.job_id} 的失败记录？`,
          detail: '重试将沿用原发券幂等键，避免重复建券。',
          okText: '重试', reasonLabel: '重试原因', reasonPlaceholder: '填写重试原因（写入审计记录）' });
        if (!r) return;
        const res = E.retrySendJob(job.job_id, acc.display_name || acc.name, r.reason);
        if (!res.ok) { toast(res.error, 'err'); return; }
        toast(`重试成功，恢复 ${res.recovered} 张券`, 'ok');
        dr.close(); render();
      });
      foot.appendChild(h); foot.appendChild(rt);
    } else {
      const c = el('button', 'btn btn-ghost', esc(t('sr.drawer.close')));
      c.style.flex = '1';
      c.addEventListener('click', () => dr.close());
      foot.appendChild(c);
    }
    const dr = sideDrawer({ title: isFailed ? t('sr.drawer.title') : '任务详情', body, footer: foot });
  }

  /* ================================================================
   * 页面 6 —— 设置（图 19 / 图 20）
   * ==============================================================*/
  function renderSettings(host) {
    const acc = account();
    const canManage = acc.can_manage_accounts;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('st.title'))}</h2>
        <p class="page-desc">${esc(t('st.desc'))}</p>
      </div>`;
    host.appendChild(head);

    if (S.settings.denied) {
      const d = el('div', 'denied');
      d.innerHTML = `<span class="ico">${SVG.warn}</span><div>${esc(t('st.denied'))}</div>`;
      host.appendChild(d);
    }

    // 界面语言
    const langCard = el('div', 'card card-pad');
    langCard.style.marginBottom = '24px';
    const lr = el('div', '');
    lr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap';
    lr.innerHTML = `<div>
        <div style="font-size:17px;font-weight:700;margin-bottom:6px">${esc(t('st.lang'))}</div>
        <div class="t-small t-muted">${esc(t('st.lang.note'))}</div>
      </div>`;
    const lsel = el('div', 'field');
    lsel.style.minWidth = '230px';
    const ss = singleSelect({
      options: C.LOCALES.map((l) => ({ v: l.key, label: l.label })),
      value: S.locale, onChange: (v) => { S.locale = v; render(); toast('界面语言已切换', 'ok'); },
    });
    lsel.appendChild(ss);
    const hint = el('div', 't-small t-muted', esc(t('st.lang.options')));
    hint.style.marginTop = '6px';
    lsel.appendChild(hint);
    lr.appendChild(lsel);
    langCard.appendChild(lr);
    host.appendChild(langCard);

    // 门店账号
    const secHead = el('div', '');
    secHead.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:16px;flex-wrap:wrap';
    secHead.innerHTML = `<div>
        <div style="font-size:17px;font-weight:700;margin-bottom:5px">${esc(t('st.accounts'))}</div>
        <div class="t-small t-muted">${esc(canManage ? t('st.accounts.note') : t('st.no_perm'))}</div>
      </div>`;
    if (canManage) {
      const add = el('button', 'btn btn-primary', esc(t('st.accounts.add')));
      add.addEventListener('click', () => openAccountDialog(null));
      secHead.appendChild(add);
    }
    host.appendChild(secHead);

    const card = el('div', 'card');
    const tw = el('div', 'table-wrap');
    const table = el('table', 'data');
    table.innerHTML = `<thead><tr>
        <th>${esc(t('st.col.account'))}</th><th>${esc(t('st.col.store'))}</th>
        <th>${esc(t('st.col.role'))}</th><th>${esc(t('st.col.status'))}</th>
        <th>${esc(t('st.col.updated'))}</th><th>${esc(t('st.col.action'))}</th>
      </tr></thead><tbody></tbody>`;
    const tb = $('tbody', table);
    DB.staffAccount.filter((a) => a.role === 'L3_STORE' || a.scope_type === 'store').forEach((a) => {
      const tr = el('tr');
      tr.innerHTML = `<td class="mono">${esc(a.account_id)}</td>
        <td>${esc(E.utils.storeLabel(a.scope_id))}</td>
        <td>${esc(t('role.store'))}</td>
        <td>${a.status === 'active' ? esc(t('st.enabled')) : `<span class="t-muted">${esc(t('st.disabled'))}</span>`}</td>
        <td class="mono t-muted">${esc((a.updated_at || '').replace('T', ' '))}</td>
        <td>${canManage ? `<button class="btn-text" data-a="e">${esc(t('st.edit'))}</button>` : '<span class="t-muted">—</span>'}</td>`;
      const b = $('[data-a="e"]', tr);
      if (b) b.addEventListener('click', () => openAccountDialog(a));
      tb.appendChild(tr);
    });
    tw.appendChild(table);
    card.appendChild(tw);
    const note = el('div', 't-small t-muted');
    note.style.cssText = 'padding:14px 24px 18px';
    note.textContent = t('st.region.note');
    card.appendChild(note);
    host.appendChild(card);
  }

  function openAccountDialog(acc0) {
    const me = account();
    const isNew = !acc0;
    const a = acc0 || { account_id: '', scope_id: DB.stores[0].store_id, role: 'L3_STORE', status: 'active' };
    const body = el('div');
    body.innerHTML = `
      <div class="form-item" style="margin-bottom:18px">
        <label>${esc(t('st.col.account'))}</label>
        <input class="input" id="acId" value="${esc(a.account_id)}" ${isNew ? '' : 'readonly'} placeholder="store.new01">
      </div>
      <div class="form-item" style="margin-bottom:18px">
        <label>${esc(t('st.edit.role'))}</label>
        <select class="input" id="acRole">
          <option value="L3_STORE"${a.role === 'L3_STORE' ? ' selected' : ''}>${esc(t('role.store'))}</option>
          <option value="L2_REGION" disabled>${esc(t('st.region.option'))}</option>
        </select>
      </div>
      <div class="form-item" style="margin-bottom:18px">
        <label>${esc(t('st.edit.store'))}</label>
        <select class="input" id="acStore">
          ${DB.stores.map((s) => `<option value="${esc(s.store_id)}"${s.store_id === a.scope_id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-item" style="margin-bottom:18px">
        <label>${esc(t('st.edit.status'))}</label>
        <select class="input" id="acStatus">
          <option value="active"${a.status === 'active' ? ' selected' : ''}>${esc(t('st.enabled'))}</option>
          <option value="disabled"${a.status !== 'active' ? ' selected' : ''}>${esc(t('st.disabled'))}</option>
        </select>
      </div>
      <div class="form-item">
        <label>${esc(t('st.edit.reason'))}</label>
        <input class="input" id="acReason" placeholder="${esc(t('st.edit.reason_ph'))}">
      </div>
      <div class="notice grey" style="margin-top:18px">权限以角色与门店范围组合配置，不开放任意逐项勾选。区域负责人角色及辖区门店范围保留为未来配置。</div>
    `;
    const foot = el('div', '', `<button class="btn btn-ghost" data-x="c">${esc(t('st.cancel'))}</button>
      <button class="btn btn-primary" data-x="s">${esc(t('st.save'))}</button>`);
    const mo = modal({ title: isNew ? t('st.accounts.add') : t('st.edit.title'), body, footer: foot, size: 'narrow' });
    foot.querySelector('[data-x="c"]').addEventListener('click', mo.close);
    foot.querySelector('[data-x="s"]').addEventListener('click', () => {
      const id = $('#acId', body).value.trim();
      const reason = $('#acReason', body).value.trim();
      const patch = {
        role: $('#acRole', body).value,
        scope_id: $('#acStore', body).value,
        status: $('#acStatus', body).value,
      };
      if (!id) { toast('请填写账号名称', 'warn'); return; }
      const who = me.display_name || me.name;
      if (isNew) {
        const r = E.createStoreAccount(Object.assign({ account_id: id, badge: '店',
          display_name: E.utils.storeLabel(patch.scope_id).replace('店', '') + '店员' }, patch), who, reason);
        toast(`已新增门店账号 ${id}`, 'ok');
      } else {
        const r = E.updateStoreAccount(a.account_id, patch, who, reason);
        if (!r.ok) { toast(r.error, 'err'); return; }
        toast(`已更新账号 ${a.account_id}`, 'ok');
      }
      mo.close(); render();
    });
  }

  /* ================================================================
   * 页面 7 —— 消费端静态原型（PRD 5.5 / 9.2 图 21）
   * ==============================================================*/
  function renderConsumer(host) {
    // 优先展示近 2 天、尚未领取的回流券，形成完整演示链路
    const pickCustomer = () => {
      const todayClaimable = E.DB.couponInstance.filter((c) =>
        c.status === 'unclaimed' && c.coupon_type === 'winback');
      if (todayClaimable.length) return todayClaimable[todayClaimable.length - 1].customer_id;
      return DB.customers[0].customer_id;
    };
    const state = {
      cid: pickCustomer(),
      screen: 'home',       // home | rewards | detail
      rewardsTab: 'unclaimed',
    };
    function coupons() { return E.DB.couponInstance.filter((c) => c.customer_id === state.cid); }

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">消费端静态原型</h2>
        <p class="page-desc">参考现有 PCC App 首页与「我的奖赏」入口，仅制作待领取、领取操作与券详情的静态原型；实际 App 页面与核销入口待接入确认。</p>
      </div>`;
    const lim = el('div', 'chip chip-amber', '静态原型 · 不代表真实 App');
    head.appendChild(lim);
    host.appendChild(head);

    host.appendChild(el('div', 'notice grey', '本期消费端只提供静态原型，不改造现有 PCC App。以下券数据来自工作台的模拟发放结果，可直接点击「領取優惠券」完成领取，随后在后台「总览」中查看领取与核销指标变化。'));

    const wrap = el('div', 'app-shell');
    wrap.style.marginTop = '22px';

    // 三部手机分别展示三个状态
    wrap.appendChild(phoneHome());
    wrap.appendChild(phoneRewards());
    wrap.appendChild(phoneDetail());
    host.appendChild(wrap);

    const actions = el('div', '');
    actions.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:6px';
    const b1 = el('button', 'btn btn-ghost', '换一位会员演示');
    b1.addEventListener('click', () => {
      const list = E.DB.couponInstance.filter((c) => c.coupon_type === 'winback');
      const idx = list.findIndex((c) => c.customer_id === state.cid);
      const next = list[(idx + 1) % list.length];
      state.cid = next.customer_id;
      render();
      toast(`已切换演示会员 ${next.customer_id}`, 'ok');
    });
    actions.appendChild(b1);
    const b2 = el('button', 'btn btn-primary', '模拟核销一张已领取券');
    b2.addEventListener('click', async () => {
      const claimed = coupons().filter((c) => c.status === 'claimed');
      if (!claimed.length) { toast('该会员当前没有已领取的券，请先领取', 'warn'); return; }
      const cp = claimed[0];
      const ct = E.COUPON_TYPES[cp.coupon_type];
      const r = await confirm({
        title: '模拟核销',
        message: `模拟一笔 HK$68 的订单核销「${ct.name}」（${ct.discount_label}）？`,
        detail: ct.stack_points ? '该券可与积分同单使用：先以积分抵付，再对剩余金额应用折扣。' : '该券不可与积分同单使用。',
        okText: '核销', reasonLabel: '是否使用积分抵付', reasonPlaceholder: '填写积分数量，留空表示不使用',
      });
      if (!r) return;
      const points = parseInt(r.reason, 10);
      const usePoints = !isNaN(points) && points > 0 ? points : (ct.stack_points ? 400 : 0);
      const res = E.redeemCoupon(cp.coupon_id, 68, ct.stack_points ? usePoints : 0, state.cid);
      if (!res.ok) { toast(res.error, 'err', 4200); return; }
      toast(`核销成功：原价 HK$68，积分抵付 HK$${res.redemption.point_value}，实付 HK$${res.redemption.paid_amount}`, 'ok', 4600);
      render();
    });
    actions.appendChild(b2);
    host.appendChild(actions);
    const n2 = el('div', 't-small t-muted');
    n2.style.cssText = 'text-align:center;margin-top:12px';
    n2.textContent = `当前演示会员：${state.cid} · 共 ${coupons().length} 张券`;
    host.appendChild(n2);

    /* -------- 手机 1：首页 -------- */
    function phoneHome() {
      const unclaimed = coupons().filter((c) => c.status === 'unclaimed').length;
      const box = el('div', 'phone-wrap');
      box.innerHTML = `<div class="proto-label">首页（已登录）</div>`;
      const p = el('div', 'phone');
      p.innerHTML = `<div class="phone-screen">
        <div class="ph-status"><span>9:41</span><span>▮▮▮ ⌾ ▰</span></div>
        <div class="ph-body">
          <div class="ph-head">
            <div class="ph-avatar"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></svg></div>
            <div class="ph-hello">${esc(t('app.home.greeting'))}</div>
          </div>
          <div class="ph-notice">
            <span>${esc(t('app.home.banner', { n: unclaimed }))}</span>
            <span style="color:var(--pcc-red-light);font-size:16px">›</span>
          </div>
          <div class="ph-banner">
            <div><div class="t1">${esc(t('app.member_only'))}</div>
              <div class="t2">深圳直通巴<br>即享减 $20 優惠</div></div>
            <svg width="52" height="42" viewBox="0 0 52 42" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="7" width="46" height="22" rx="4"/><path d="M10 29v5M42 29v5M3 17h46"/><circle cx="13" cy="33" r="3" fill="#fff"/><circle cx="39" cy="33" r="3" fill="#fff"/></svg>
          </div>
          <div class="ph-quick">
            ${quickIcon('我的訂單', '<path d="M4 7h16M4 12h16M4 17h10"/>', false)}
            ${quickIcon('我的獎賞', '<rect x="3" y="8" width="18" height="11" rx="2"/><path d="M12 8v11M8 8a2.5 2.5 0 1 1 4-2 2.5 2.5 0 1 1 4 2"/>', unclaimed > 0, unclaimed)}
            ${quickIcon('手機增值', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 9v6M9 12h6"/>', false)}
            ${quickIcon('交易紀錄', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>', false)}
          </div>
          <div class="ph-sec-title">最新消息</div>
          <div class="ph-news-card">
            <div><div class="t1">${esc(t('app.limited'))}</div>
              <div class="t2">Cheers Monday<br>手調飲品 9 折</div></div>
            <svg width="44" height="44" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2" opacity=".85">
              <circle cx="24" cy="24" r="21"/><path d="M14 21c0-1.1.9-2 2-2h1.2c.5-3.2 3.3-5.6 6.8-5.6 3.8 0 6.9 3.1 6.9 6.9 0 .3 0 .6-.1.9.9.3 1.6 1.2 1.6 2.2"/>
              <path d="M17 21h14"/><path d="M12 25h24l-2.4 6.5c-.7 1.9-2.5 3.2-4.5 3.2H18.9c-2 0-3.8-1.3-4.5-3.2L12 25z"/></svg>
          </div>
          <div class="ph-dots"><span class="ph-dot on"></span><span class="ph-dot"></span><span class="ph-dot"></span></div>
        </div>
        ${phTabbar(0)}
      </div>`;
      box.appendChild(p);
      return box;
    }
    function quickIcon(label, svgPath, badge, n) {
      return `<div class="ph-q">
        ${badge ? `<span class="ph-badge">${n}</span>` : ''}
        <svg class="qi" viewBox="0 0 24 24" fill="none" stroke="#C9C9CC" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>
        <span>${esc(label)}</span></div>`;
    }
    function phTabbar(active) {
      const tabs = [
        ['主頁', 0, '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'],
        ['訂購', 1, '<path d="M4 5h16l-1.5 11H6z"/><path d="M4 5L3 2H1"/>'],
        ['禮賓', 2, '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M3 11h18M12 7v13"/>'],
        ['分店', 3, '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'],
        ['我的', 4, '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>'],
      ];
      return `<div class="ph-tabbar">${tabs.map(([l, i, d]) =>
        `<div class="ph-tab${i === active ? ' on' : ''}">
          <svg class="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>
          <span>${esc(l)}</span></div>`).join('')}</div>`;
    }

    /* -------- 手机 2：我的奖赏 -------- */
    function phoneRewards() {
      const unclaimedList = coupons().filter((c) => c.status === 'unclaimed');
      const claimedList = coupons().filter((c) => c.status === 'claimed');
      const usedList = coupons().filter((c) => c.status === 'used' || c.status === 'expired');
      const first = unclaimedList[0] || claimedList[0] || usedList[0];
      const box = el('div', 'phone-wrap');
      box.innerHTML = `<div class="proto-label">我的獎賞（待領取）</div>`;
      const p = el('div', 'phone');
      let cardHtml = `<div class="empty" style="color:#6E6E73;padding:40px 20px">${esc(t('app.rewards.empty'))}</div>`;
      if (first) {
        const ct = E.COUPON_TYPES[first.coupon_type];
        cardHtml = `<div class="coupon-card">
            <div class="cc-top">${esc(t('app.rewards.tier'))}</div>
            <div class="cc-name">${esc(ct.name)}</div>
            <div class="cc-disc">${esc(ct.discount_label)}</div>
            <div class="cc-valid">${esc(t('app.rewards.valid', { n: ct.validity_days }))}</div>
            <svg class="cc-logo" width="52" height="52" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2">
              <circle cx="24" cy="24" r="21"/><path d="M14 21c0-1.1.9-2 2-2h1.2c.5-3.2 3.3-5.6 6.8-5.6 3.8 0 6.9 3.1 6.9 6.9 0 .3 0 .6-.1.9.9.3 1.6 1.2 1.6 2.2"/>
              <path d="M17 21h14"/><path d="M12 25h24l-2.4 6.5c-.7 1.9-2.5 3.2-4.5 3.2H18.9c-2 0-3.8-1.3-4.5-3.2L12 25z"/></svg>
          </div>
          <div class="cc-note">${esc(t('app.rewards.exclusive', { n: 30 }))}<br>${esc(t('app.rewards.no_start'))}</div>`;
      }
      p.innerHTML = `<div class="phone-screen">
        <div class="ph-status"><span>9:41</span><span>▮▮▮ ⌾ ▰</span></div>
        <div class="ph-body">
          <div class="ph-back"><span style="font-size:20px">‹</span> 我的獎賞</div>
          <div class="ph-tabs2">
            <div class="on">待領取${unclaimedList.length ? ` (${unclaimedList.length})` : ''}</div>
            <div>可使用${claimedList.length ? ` (${claimedList.length})` : ''}</div>
            <div>已使用</div>
          </div>
          ${cardHtml}
          <button class="ph-cta" id="claimBtn" ${first && first.status === 'unclaimed' ? '' : 'disabled'}>${esc(t('app.rewards.claim'))}</button>
        </div>
        ${phTabbar(4)}
      </div>`;
      box.appendChild(p);
      const btn = $('#claimBtn', p);
      if (btn && first && first.status === 'unclaimed') {
        btn.addEventListener('click', () => {
          const r = E.claimCoupon(first.coupon_id, state.cid);
          if (!r.ok) { toast(r.error, 'err'); return; }
          toast(`领取成功：${E.COUPON_TYPES[r.coupon.coupon_type].name}，有效期至 ${r.coupon.valid_until}`, 'ok', 4400);
          render();
        });
      }
      return box;
    }

    /* -------- 手机 3：券详情 -------- */
    function phoneDetail() {
      const claimed = coupons().filter((c) => c.status === 'claimed');
      const cp = claimed[0] || coupons().filter((c) => c.status === 'unclaimed')[0];
      const box = el('div', 'phone-wrap');
      box.innerHTML = `<div class="proto-label">優惠券詳情</div>`;
      const p = el('div', 'phone');
      let inner;
      if (!cp) {
        inner = `<div class="ph-back"><span style="font-size:20px">‹</span> ${esc(t('app.rewards.detail'))}</div>
          <div class="empty" style="color:#6E6E73;padding:50px 20px">${esc(t('app.rewards.empty'))}</div>`;
      } else {
        const ct = E.COUPON_TYPES[cp.coupon_type];
        const statusText = cp.status === 'claimed' ? t('app.rewards.claimed')
          : cp.status === 'used' ? '已使用' : cp.status === 'expired' ? '已過期' : '待領取';
        const validity = cp.status === 'unclaimed' && !cp.valid_until
          ? t('app.rewards.no_start') : (cp.valid_until ? `至 ${cp.valid_until}` : '—');
        inner = `<div class="ph-back"><span style="font-size:20px">‹</span> ${esc(t('app.rewards.detail'))}</div>
          <div class="ph-detail-hero">
            <span class="chip" style="background:#2A2A2C;color:#EDEDF0;height:26px">${esc(statusText)}</span>
            <div class="coupon-card" style="margin:16px 0 0">
              <div class="cc-top">${esc(t('app.rewards.tier'))}</div>
              <div class="cc-name">${esc(ct.name)}</div>
              <div class="cc-disc">${esc(ct.discount_label)}</div>
              <div class="cc-valid">${esc(validity)}</div>
              <svg class="cc-logo" width="52" height="52" viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2">
                <circle cx="24" cy="24" r="21"/><path d="M14 21c0-1.1.9-2 2-2h1.2c.5-3.2 3.3-5.6 6.8-5.6 3.8 0 6.9 3.1 6.9 6.9 0 .3 0 .6-.1.9.9.3 1.6 1.2 1.6 2.2"/>
                <path d="M17 21h14"/><path d="M12 25h24l-2.4 6.5c-.7 1.9-2.5 3.2-4.5 3.2H18.9c-2 0-3.8-1.3-4.5-3.2L12 25z"/></svg>
            </div>
          </div>
          <div style="font-size:15.5px;font-weight:700;padding:24px 20px 6px">${esc(t('app.rewards.usage'))}</div>
          <div class="ph-kv"><span class="k">${esc(t('app.rewards.stores'))}</span><span class="v">${esc(ct.scope === 'all_hk' ? '全港門店' : E.utils.storeLabel(cp.store_id))}</span></div>
          <div class="ph-kv"><span class="k">${esc(t('app.rewards.points'))}</span>
            <span class="v" style="max-width:62%;text-align:right">${esc(ct.stack_points ? t('app.rewards.points_yes') : t('app.rewards.points_no'))}</span></div>
          <div class="ph-kv"><span class="k">有效期限</span><span class="v">${esc(validity)}</span></div>
          <div class="ph-note">${esc(t('app.rewards.pos_note'))}</div>`;
      }
      p.innerHTML = `<div class="phone-screen">
        <div class="ph-status"><span>9:41</span><span>▮▮▮ ⌾ ▰</span></div>
        <div class="ph-body">${inner}</div>
        ${phTabbar(4)}
      </div>`;
      box.appendChild(p);
      return box;
    }
  }

  /* ================================================================
   * AI 活动助手抽屉（PRD 5.2 AI 抽屉交互 / 6.3）
   * ==============================================================*/
  function toggleAI(open) {
    S.ai.open = open;
    renderAI();
    if (open && !S.ai.history.length) {
      S.ai.history.push({ role: 'ai', kind: 'welcome' });
      renderAI();
    }
  }

  function renderAI() {
    const d = $('#aiDrawer');
    const fab = $('#aiFab');
    if (!d || !fab) return;
    d.classList.toggle('open', S.ai.open);
    // PRD 5.1：已有模态窗口打开时隐藏入口
    const modalOpen = !!document.querySelector('.overlay');
    fab.classList.toggle('hidden', modalOpen || S.ai.open);
    if (!S.ai.open) { d.innerHTML = ''; return; }

    const acc = account();
    const caps = AI.availableCapabilities(S.page, acc);

    d.innerHTML = `
      <div class="ai-head">
        <div class="ai-head-logo">${global.UI.pccLogo(38)}</div>
        <div style="flex:1">
          <h2>${esc(t('ai.title'))}</h2>
          <div class="sub">${esc(acc.display_name || acc.name)} · ${esc(acc.scope_type === 'store' ? E.utils.storeLabel(acc.scope_id) : '全港范围')}</div>
        </div>
        <button class="modal-close" id="aiClose">${SVG.close}</button>
      </div>
      <div class="ai-body" id="aiBody"></div>
      <div class="ai-foot">
        <div class="ai-input-row">
          <input class="ai-input" id="aiInput" placeholder="${esc(t('ai.placeholder'))}" value="${esc(S.ai.lastInput)}">
          <button class="btn btn-primary" id="aiSend" style="padding:0 22px">${esc(t('ai.send'))}</button>
        </div>
        <div class="ai-note">${esc(t('ai.note'))}</div>
      </div>`;

    $('#aiClose', d).addEventListener('click', () => toggleAI(false));

    // 快捷入口（按角色与当前页面启用，其余禁用）
    const tabsBox = el('div', 'ai-tabs');
    caps.forEach((c) => {
      const b = el('button', 'ai-tab' + (S.ai.tab === c.key ? ' on' : ''), esc(t('ai.tab.' + c.key)));
      if (!c.enabled) b.disabled = true;
      b.addEventListener('click', () => {
        if (!c.enabled) { toast(t('ai.state.denied'), 'warn'); return; }
        S.ai.tab = c.key;
        runQuickCapability(c.key);
      });
      tabsBox.appendChild(b);
    });

    const body = $('#aiBody', d);
    body.appendChild(tabsBox);

    // 欢迎 / 快捷提问
    if (!S.ai.history.length) S.ai.history.push({ role: 'ai', kind: 'welcome' });
    if (caps.some((c) => c.enabled) && S.ai.state === 'idle') {
      const qa = el('div', 'quick-asks');
      const asks = askSuggestions(acc);
      asks.forEach((a) => {
        const b = el('button', 'quick-ask', esc(a.label));
        b.addEventListener('click', () => {
          $('#aiInput', d).value = a.text;
          sendAI(a.text);
        });
        qa.appendChild(b);
      });
      body.appendChild(qa);
    }

    // 对话历史
    S.ai.history.forEach((h) => body.appendChild(renderMsg(h, d)));

    // 生成中状态（禁止重复提交）
    if (S.ai.state === 'generating') {
      const g = el('div', 'ai-loading');
      g.innerHTML = `<span class="spinner"></span><span>${esc(t('ai.state.generating'))}</span>`;
      body.appendChild(g);
      const send = $('#aiSend', d);
      if (send) send.disabled = true;
    }
    if (S.ai.state === 'failed') {
      const f = el('div', 'notice amber');
      f.textContent = t('ai.state.failed');
      body.appendChild(f);
      const b = el('button', 'btn btn-ghost btn-sm', esc(t('ai.retry')));
      b.style.marginTop = '10px';
      b.addEventListener('click', () => sendAI(S.ai.lastInput));
      body.appendChild(b);
    }

    const send = $('#aiSend', d);
    const input = $('#aiInput', d);
    if (send) send.addEventListener('click', () => sendAI(input.value));
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAI(input.value); });
    body.scrollTop = body.scrollHeight;
  }

  function askSuggestions(acc) {
    const store = acc.scope_type === 'store';
    if (S.page === 'create') {
      return store
        ? [{ label: '本地化门店活动', text: '把总部回流活动改成太古城店周末买一送一，发给附近会员。' },
           { label: '创建本店草稿', text: '为本店连续 30 天未消费的会员创建一个 8.5 折回流活动。' }]
        : [{ label: '生成回流活动草稿', text: '为连续 30 天未消费会员创建 8 折回流活动，覆盖全港门店。' },
           { label: '生成生日活动草稿', text: '为生日当月会员创建 5 折生日活动，自动发放。' }];
    }
    if (S.page === 'records') {
      return [{ label: '解释最近失败', text: '最近一次发送失败是什么原因？' },
              { label: '解释拦截 R-1003', text: 'R-1003 为什么失败？引用原始记录说明。' }];
    }
    if (S.page === 'manage') {
      return [{ label: '检查自动规则权限', text: '检查当前账号可启停的自动规则范围。' }];
    }
    return [{ label: '权限检查', text: '检查当前账号的活动创建权限范围。' }];
  }

  function renderMsg(h, drawer) {
    const wrap = el('div', 'msg ' + (h.role === 'user' ? 'user' : 'ai'));
    if (h.role === 'user') {
      wrap.innerHTML = `<div class="msg-bubble">${esc(h.text)}</div>`;
      return wrap;
    }
    const b = el('div', 'msg-bubble');
    if (h.kind === 'welcome') {
      b.style.background = '#F6F6F7';
      b.textContent = t('ai.welcome');
      wrap.appendChild(b);
      return wrap;
    }
    // AI 结构化结果
    const holder = el('div', 'msg-bubble');
    holder.style.background = 'transparent';
    holder.style.padding = '0';
    holder.style.maxWidth = '100%';
    holder.appendChild(buildAIResult(h, drawer));
    wrap.appendChild(holder);
    return wrap;
  }

  function buildAIResult(h, drawer) {
    const frag = el('div', '');
    frag.style.width = '100%';

    if (h.kind === 'explain') {
      const card = el('div', 'ai-card');
      card.innerHTML = `<h4>${esc(h.title)}</h4>`
        + h.lines.map((l) => `<div style="font-size:13.5px;line-height:1.7;margin-bottom:6px">${esc(l)}</div>`).join('');
      if (h.evidence && h.evidence.length) {
        const ev = el('div', '');
        ev.style.marginTop = '14px';
        ev.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:6px">${esc(t('ai.evidence'))}</div>`
          + h.evidence.map((e) => `<div class="dl-row" style="padding:9px 0;font-size:12.5px">
              <span class="k mono">${esc(e.ref)}</span>
              <span class="v t-small">${esc(e.code)} · ${esc(e.at.replace('T', ' '))}<br><span class="t-muted">${esc(e.reason)}</span></span>
            </div>`).join('');
        card.appendChild(ev);
      }
      if (h.ruleVersion) {
        const rv = el('div', 'ai-reason');
        rv.style.marginTop = '10px';
        rv.textContent = `规则版本：${h.ruleVersion} · 本解释不提供直接重试或发送按钮`;
        card.appendChild(rv);
      }
      if (h.denied) card.style.borderColor = '#F3D6DA';
      frag.appendChild(card);
      return frag;
    }

    // draft / localize / permission
    const res = h.result;
    const card = el('div', 'ai-card');
    card.appendChild(Object.assign(el('h4'), { textContent: res.title }));

    if (res.kind === 'draft' || res.kind === 'localize') {
      const d = res.draft;
      const rows = [
        ['目标人群', d.segment_definition],
        ['优惠内容', `${E.COUPON_TYPES[d.coupon_type].name} · ${d.offer_label}`],
        ['适用门店', E.scopeLabelOf(d)],
        ['执行方式', d.mode === 'auto' ? '规则批准后自动发放' : '逐批人工批准发放'],
      ];
      rows.forEach(([k, v]) => {
        const r = el('div', 'ai-kv');
        r.innerHTML = `<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>`;
        card.appendChild(r);
      });
      const badge = el('div', 'ai-badge-row');
      const g = res.guard;
      if (g.pass) {
        badge.innerHTML = `<span style="color:var(--green)">${SVG.check}</span>
          <span style="color:var(--pcc-red)">${esc(t('ai.perm.pass'))} · ${esc(t('ai.route'))}${esc(res.route.target)}（${esc(res.route.approver)}）</span>`;
      } else {
        badge.innerHTML = `<span style="color:var(--pcc-red)">${SVG.warn}</span>
          <span style="color:var(--pcc-red)">${esc(t('ai.perm.fail'))}</span>`;
      }
      card.appendChild(badge);

      // 门店本地化理由
      if (res.kind === 'localize') {
        const rb = el('div', '');
        rb.style.marginTop = '12px';
        rb.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:4px">本地化理由</div>`
          + res.reasons.map((x) => `<div class="ai-reason">· ${esc(x)}</div>`).join('');
        card.appendChild(rb);
      }
      // 理解说明
      if (res.intent && res.intent.understood) {
        const ub = el('div', '');
        ub.style.marginTop = '12px';
        ub.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:4px">${esc(t('ai.intent'))}</div>`
          + res.intent.understood.map((x) => `<div class="ai-reason">· ${esc(x)}</div>`).join('');
        card.appendChild(ub);
      }
    } else if (res.kind === 'permission') {
      const d = res.draft;
      const r0 = el('div', 'ai-kv');
      r0.innerHTML = `<span class="k">检查草稿</span><span class="v">${esc(E.COUPON_TYPES[d.coupon_type].name)} · ${esc(d.offer_label || '')} · ${esc(E.scopeLabelOf(d))}</span>`;
      card.appendChild(r0);
    }

    // 权限检查清单
    if (res.guard) {
      const ul = el('ul', 'ai-checks');
      ul.style.marginTop = '12px';
      res.guard.checks.forEach((c) => {
        const li = el('li');
        li.innerHTML = `<span class="ico ${c.pass ? 'pass' : 'fail'}">${c.pass ? SVG.check : SVG.close}</span>
          <span><strong>${esc(c.name)}</strong>：${esc(c.detail)}<div class="ai-reason">规则：${esc(c.rule)}</div></span>`;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }
    frag.appendChild(card);

    // 底部按钮
    const foot = el('div', '');
    foot.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:2px';
    if (res.guard && res.guard.pass && (res.kind === 'draft' || res.kind === 'localize')) {
      const fill = el('button', 'btn btn-primary btn-block', esc(res.kind === 'localize' ? t('ai.view_draft') : t('ai.fill')));
      fill.addEventListener('click', () => {
        // 草稿回填：仍需人工核对后自行提交
        S.create.draftPrefill = res.draft;
        S.create.applied = true;
        if (!S.create.result) S.create.result = E.filterMembers(S.create.filters, account());
        toggleAI(false);
        setHash('create');
        toast(t('ai.filled'), 'ok', 4000);
      });
      foot.appendChild(fill);
    }
    const note = el('div', 'ai-reason');
    note.style.textAlign = 'center';
    note.textContent = res.kind === 'localize' ? t('ai.note.local') : t('ai.note');
    foot.appendChild(note);
    frag.appendChild(foot);
    return frag;
  }

  function runQuickCapability(key) {
    const acc = account();
    if (key === 'permission') {
      pushResult(AI.permissionCheck(acc, { sessionId: sessionId() , currentDraft: S.create.draftPrefill }));
      return;
    }
    if (key === 'explain') {
      if (S.page !== 'records' && S.page !== 'overview') { toast(t('ai.state.denied'), 'warn'); return; }
      pushResult(AI.explainBlock('最近一次发送失败', acc));
      return;
    }
    // draft / localize 需要用户输入，给出提示
    const d = $('#aiDrawer');
    const inp = d && $('#aiInput', d);
    if (inp) { inp.focus(); inp.placeholder = key === 'localize' ? '描述要本地化的门店活动…' : '描述活动需求…'; }
    toast(key === 'localize' ? '请输入要本地化的活动需求' : '请输入活动需求', 'warn');
  }

  let _session = 'S-' + Date.now().toString(36);
  function sessionId() { return _session; }

  function pushResult(res) {
    S.ai.history.push({ role: 'ai', kind: res.kind, result: res,
      title: res.title, lines: res.lines, evidence: res.evidence,
      ruleVersion: res.ruleVersion, denied: res.denied });
    S.ai.state = 'result';
    renderAI();
    const d = $('#aiDrawer');
    if (d) { const b = $('#aiBody', d); if (b) b.scrollTop = b.scrollHeight; }
  }

  function sendAI(text) {
    const input = String(text || '').trim();
    if (!input) { toast('请输入内容', 'warn'); return; }
    if (S.ai.state === 'generating') { toast(t('ai.state.generating'), 'warn'); return; }
    const acc = account();
    const caps = AI.availableCapabilities(S.page, acc);
    const enabled = caps.filter((c) => c.enabled).map((c) => c.key);
    if (!enabled.length) { toast(t('ai.state.denied'), 'warn'); return; }

    S.ai.lastInput = input;
    S.ai.history.push({ role: 'user', text: input });
    S.ai.state = 'generating';
    renderAI();

    // 服务端工具调用层：按页面与角色选择意图
    const pageHint = S.page;
    const intentKey = S.ai.tab;

    setTimeout(() => {
      try {
        let res;
        if (pageHint === 'records' || pageHint === 'overview' || (intentKey === 'explain' && enabled.includes('explain'))) {
          if (enabled.includes('explain')) res = AI.explainBlock(input, acc);
          else res = AI.explainBlock(input, acc);
        } else if (intentKey === 'permission' && enabled.includes('permission')) {
          res = AI.permissionCheck(acc, { sessionId: sessionId(), currentDraft: S.create.draftPrefill });
        } else if (intentKey === 'localize' && acc.scope_type === 'store' && enabled.includes('localize')) {
          res = AI.localize(input, acc, { sessionId: sessionId(), audienceSize: (S.create.result || {}).total || 0 });
        } else {
          res = AI.generateDraft(input, acc, { sessionId: sessionId(), audienceSize: (S.create.result || {}).total || 0 });
        }
        S.ai.state = 'result';
        S.ai.history.push({
          role: 'ai', kind: res.kind, result: res, title: res.title,
          lines: res.lines, evidence: res.evidence, ruleVersion: res.ruleVersion, denied: res.denied,
        });
      } catch (err) {
        S.ai.state = 'failed';
      }
      renderAI();
      const d = $('#aiDrawer');
      if (d) { const b = $('#aiBody', d); if (b) b.scrollTop = b.scrollHeight; }
    }, 620);
  }

  /* ------------------------------------------------------------ 启动 */
  document.addEventListener('DOMContentLoaded', boot);
})(window);
