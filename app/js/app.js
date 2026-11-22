/* ============================================================================
 * PCC 会员营销工作台 —— 应用主程序 (app.js)
 * 页面：数据大盘 / 活动创建 / 活动管理 / 审批中心 / 发送记录 / 设置（账号菜单进入）
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

  /* 新版看板图标（线性、统一 1.8 描边，避免与文字重心打架） */
  const DASH_ICONS = {
    summary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-5 3 3 5-7"/></svg>',
    campaign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M14 8a5 5 0 0 1 0 8"/><path d="M17 5a9 9 0 0 1 0 14"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v2M13 11v2M13 16v2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h6M9 14h6"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    sort: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 20l-3-3M7 20l3-3"/><path d="M17 20V4M17 4l-3 3M17 4l3 3"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63h.08A1.7 1.7 0 0 0 10.11 3.07V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9v.08a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3"/></svg>',
  };

  /* ---------------------------------------------- 可视化组件（纯 DOM） */

  /** KPI 卡：数值 + 上一等长周期对比，数字必须带上下文 */
  function kpiCard(label, value, hint, delta, icon, tone) {
    const m = el('div', 'metric kpi' + (tone ? ' ' + tone : ''));
    const d = delta && delta.text
      ? `<span class="kpi-delta${delta.good === true ? ' good' : delta.good === false ? ' bad' : ''}">${esc(delta.text)}</span>`
      : '';
    m.innerHTML = `
      <div class="metric-label">${esc(label)}</div>
      <div class="metric-value">${esc(value)}</div>
      <div class="metric-foot">${d}<span>${esc(hint)}</span></div>`;
    return m;
  }

  /** 新版看板面板：统一图标 + 标题 + 内容区 */
  function panel(title, subtitle, icon) {
    const p = el('section', 'dash-panel');
    const head = el('div', 'dash-panel-head');
    head.innerHTML = `<div class="dash-panel-icon">${icon || ''}</div>
      <div class="dash-panel-title">${esc(title)}</div>`;
    p.appendChild(head);
    const body = el('div', 'dash-panel-body');
    p.appendChild(body);
    return { root: p, body };
  }

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
    loggedIn: false,
    accountKey: null,
    loginRole: null,   // 登录第一步选择的身份：null|hq|store
    locale: 'zh-Hans',
    cdEscapeBack: null,   // 活动详情下钻：Esc 先返回「发放结果」再关闭弹窗
    // 看板筛选（PRD 5.1）
    ov: {
      couponTypes: [], campaignIds: [], dateFrom: '2026-10-01', dateTo: C.DATA_TODAY,
      storeFilter: null, activityFilter: null, focus: null,
      heatDetail: { view: 'week', from: null, to: null },  // 热力图详情页：快捷区间 + 短时间筛选窗口
      storeMetric: 'used', storeSortDir: -1, drillStore: null,
    },
    // 活动创建页筛选
    create: {
      filters: { recency: 'any', amount: null, cups: null, tier: 'any', channel: 'any', student: 'any', newbie: 'any', birthdayMonth: 'any', storeScope: [] },
      applied: false, result: null,
      draftPrefill: null,      // AI 回填的草稿
    },
    manageTab: 'all',
    storeManageTab: 'submitted',
    approvalTab: 'all', approvalDate: '',
    records: { mode: '', campaignId: '', result: '', range: 'week', sortBy: 'time', sortDir: -1 },
    settings: { denied: false },
    approvalHighlight: null,   // 刚提交的活动编号（审批页高亮）
    // AI 抽屉
    ai: {
      open: false, state: 'idle', // idle|generating|result|blocked|failed|denied
      history: [], lastResult: null, lastInput: '', lastSent: '',
      enlarged: false, pos: null, userMoved: false, restore: null,   // 液态浮窗：放大状态、记忆位置与放大前几何
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
  const PAGES = ['overview', 'create', 'propose', 'manage', 'approval', 'progress', 'records', 'settings', 'store-info', 'audit'];
  const HQ_PAGES = ['overview', 'create', 'manage', 'approval', 'records', 'settings'];
  const STORE_PAGES = ['overview', 'propose', 'manage', 'progress', 'store-info'];

  /** 只取 hash 的页面名，忽略 ?tab=... 子状态 */
  function pageFromHash() {
    const m = /^#\/([a-z-]+)/.exec(location.hash || '');
    const p = m ? m[1] : 'overview';
    return PAGES.indexOf(p) >= 0 ? p : 'overview';
  }

  function tabFromHash() {
    const m = /[?&]tab=([a-z-]+)/.exec(location.hash || '');
    return m ? m[1] : '';
  }

  /** 权限矩阵：越权 hash 一律纠正到对应角色的页面，而不是回退到首页 */
  function resolvePage(raw) {
    const p = PAGES.indexOf(raw) >= 0 ? raw : 'overview';
    if (isStore()) {
      if (p === 'approval') return 'progress';
      if (p === 'settings') return 'store-info';
      if (p === 'create') return 'propose';
      if (p === 'records') return 'overview';
      return STORE_PAGES.indexOf(p) >= 0 ? p : 'overview';
    }
    if (p === 'propose') return 'create';
    if (p === 'progress') return 'approval';
    if (p === 'store-info') return 'settings';
    // 审计日志仅对「总部账号管理员」开放；营销人员与门店一律回总览
    if (p === 'audit') return account().can_manage_accounts ? 'audit' : 'overview';
    return HQ_PAGES.indexOf(p) >= 0 ? p : 'overview';
  }

  const activeManageTab = () => isStore() ? S.storeManageTab : S.manageTab;

  function applyHashTab(p) {
    const tab = tabFromHash();
    if (p !== 'manage' || !tab) return;
    if (isStore() && ['submitted', 'applicable'].indexOf(tab) >= 0) S.storeManageTab = tab;
    if (!isStore() && ['all', 'auto', 'theme', 'store'].indexOf(tab) >= 0) S.manageTab = tab;
  }

  /** 切页后回到顶部（内容在 App 窗口内部滚动） */
  function scrollTop() {
    const c = $('#content');
    if (c) c.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  /** 切页：改 hash，由 hashchange 统一渲染（避免双渲染与状态不同步） */
  function setHash(target) {
    // target 可以是 'manage' 或 'manage?tab=auto'（页面名 + 可选子状态）
    const page = target.split('?')[0];
    const h = '#/' + target;
    if (location.hash === h) {
      // 同地址时也要同步子状态：从 #/manage 进入 #/manage?tab=auto 之外的场景
      const beforeTab = activeManageTab();
      applyHashTab(pageFromHash());
      if (S.page !== page || activeManageTab() !== beforeTab) render();
      scrollTop();
      return;
    }
    location.hash = h;
  }

  function onHashChange() {
    if (!S.loggedIn) { renderLogin($('#boot')); return; }
    const raw = pageFromHash();
    const p = resolvePage(raw);
    if (p !== raw) {
      // 越权地址直接纠正 URL，避免前进/后退再次落到无权页面
      history.replaceState(null, '', location.pathname + location.search + '#/' + p);
    }
    const beforePage = S.page;
    const beforeTab = activeManageTab();
    applyHashTab(p);
    if (p === beforePage && activeManageTab() === beforeTab) return;
    if (p !== 'approval') S.approvalHighlight = null;
    S.page = p;
    render();
    scrollTop();
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
        <p style="color:#999;font-size:13px">请检查网络后刷新重试；若你是直接双击打开 index.html，请改用本地服务或在线地址。</p></div>`;
      return;
    }
    host.innerHTML = '';
    const saved = sessionStorage.getItem('pcc.accountKey');
    const valid = saved && E.ACCOUNTS.some((a) => a.account_id === saved);
    if (valid) {
      S.loggedIn = true;
      S.accountKey = saved;
      S.page = resolvePage(pageFromHash());
      applyHashTab(S.page);
      mountWorkbench();
      render();
    } else {
      S.loggedIn = false;
      S.accountKey = null;
      S.loginRole = null;
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
      renderLogin(host);
    }
    window.addEventListener('hashchange', onHashChange);
  }

  function mountWorkbench() {
    if ($('#root')) return;
    const host = $('#boot');
    host.innerHTML = '';
    host.appendChild(buildShell());
    initAIFloat();
  }

  /* ------------------------------------------------------------ 登录页 */
  const GLOBE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>';

  /** 两步切换时记录当前卡片高度，供高度过渡使用 */
  function loginCardHeight() {
    const c = document.querySelector('.login-card');
    return c ? c.getBoundingClientRect().height : 0;
  }

  /** 卡片以视口中心为轴向上、下平滑延展到新的自然高度 */
  function animateLoginCard(card, fromH) {
    if (!card || !fromH) return;
    const toH = card.getBoundingClientRect().height;
    if (Math.abs(toH - fromH) < 1) return;
    card.style.transition = 'none';
    card.style.height = fromH + 'px';
    card.style.overflow = 'hidden';
    void card.offsetHeight; // 强制回流，锁定起始高度
    card.style.transition = 'height .46s cubic-bezier(.22,.82,.24,1)';
    card.style.height = toH + 'px';
    const finish = () => {
      card.style.transition = ''; card.style.height = ''; card.style.overflow = '';
      card.removeEventListener('transitionend', finish);
    };
    card.addEventListener('transitionend', finish);
    setTimeout(finish, 600); // transitionend 未触发时的兜底
  }

  function renderLogin(host, animateFrom) {
    if (!host) return;
    const wrap = el('div', 'login-page');
    const card = el('div', 'login-card login-card-auth');

    // 语言选择（右上角）：切换后重绘登录页，文案即时生效
    const loc = C.LOCALES.find((l) => l.key === S.locale) || C.LOCALES[0];
    const langWrap = el('div', 'login-lang');
    const langBtn = el('button', 'login-lang-btn');
    langBtn.type = 'button';
    langBtn.innerHTML = `${GLOBE_SVG}<span>${esc(loc.label)}</span>`;
    const langPanel = el('div', 'login-lang-panel');
    langPanel.style.display = 'none';
    C.LOCALES.forEach((l) => {
      const it = el('button', 'login-lang-item' + (l.key === S.locale ? ' on' : ''), esc(l.label));
      it.type = 'button';
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        S.locale = l.key;
        renderLogin(host);
      });
      langPanel.appendChild(it);
    });
    let langOpen = false;
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langOpen = !langOpen;
      langPanel.style.display = langOpen ? 'block' : 'none';
    });
    langWrap.appendChild(langBtn);
    langWrap.appendChild(langPanel);
    card.appendChild(langWrap);

    // 品牌：图标在上、英文名在下，整体左右居中
    const brand = el('div', 'login-brand');
    brand.innerHTML = `${global.UI.pccLogo(52)}<span class="login-brand-name">PACIFIC<br>COFFEE</span>`;
    card.appendChild(brand);

    if (!S.loginRole) {
      const roles = el('div', 'login-roles');
      [{ key: 'hq', label: t('login.role.hq') }, { key: 'store', label: t('login.role.store') }].forEach((r) => {
        const b = el('button', 'login-role', esc(r.label));
        b.type = 'button';
        b.addEventListener('click', () => { S.loginRole = r.key; renderLogin(host, loginCardHeight()); });
        roles.appendChild(b);
      });
      card.appendChild(roles);
    } else {
      const back = el('button', 'login-back', esc(t('login.back')));
      back.type = 'button';
      back.addEventListener('click', () => { S.loginRole = null; renderLogin(host, loginCardHeight()); });
      card.appendChild(back);

      const tag = el('div', 'login-role-tag', esc(S.loginRole === 'store' ? t('login.role.store') : t('login.role.hq')));
      card.appendChild(tag);

      const form = el('form', 'login-form');
      form.innerHTML = `
        <label class="login-field"><span>${esc(t('login.user'))}</span>
          <input type="text" autocomplete="username" placeholder="${esc(t('login.user'))}"></label>
        <label class="login-field"><span>${esc(t('login.password'))}</span>
          <input type="password" autocomplete="current-password" placeholder="${esc(t('login.password'))}"></label>
        <button class="login-submit" type="submit">${esc(t('login.signin'))}</button>`;
      // 测试版：不校验账号密码，按第一步身份直接进入对应工作台
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        doLogin(S.loginRole === 'store' ? 'store.taikoo01' : 'hq.marketing');
      });
      card.appendChild(form);
    }
    wrap.appendChild(card);
    host.innerHTML = '';
    host.appendChild(wrap);
    animateLoginCard(card, animateFrom);
    if (!loginLangBound) {
      loginLangBound = true;
      document.addEventListener('click', (e) => {
        const panel = document.querySelector('.login-lang-panel');
        if (panel && !e.target.closest('.login-lang')) panel.style.display = 'none';
      });
    }
  }
  let loginLangBound = false;

  function doLogin(accountId) {
    const acc = E.ACCOUNTS.find((a) => a.account_id === accountId);
    if (!acc) return;
    S.loggedIn = true;
    S.accountKey = accountId;
    S.loginRole = null;
    sessionStorage.setItem('pcc.accountKey', accountId);
    E.audit(acc.display_name || acc.name, 'login', 'staff_account', accountId,
      `${acc.display_name || acc.name} 登录工作台（${isStore() ? E.utils.storeLabel(acc.scope_id) : '全港'}）`, '演示登录');
    const pending = pageFromHash();   // 登录前访问过的页面，登录后回到原目标
    S.page = null;
    mountWorkbench();
    setHash(pending || 'overview');
    toast(t('login.enter') + ' · ' + (acc.display_name || acc.name), 'ok');
  }

  function doLogout() {
    const acc = account();
    if (S.loggedIn) {
      E.audit(acc.display_name || acc.name, 'logout', 'staff_account', acc.account_id,
        `${acc.display_name || acc.name} 退出工作台`, '演示登录');
    }
    S.loggedIn = false;
    S.accountKey = null;
    S.loginRole = null;
    S.page = null;
    S.ai.open = false;
    sessionStorage.removeItem('pcc.accountKey');
    const root = $('#root');
    if (root) root.remove();
    history.replaceState(null, '', location.pathname + location.search);
    renderLogin($('#boot'));
    toast(t('login.logout_audited'), 'ok');
  }

  /* ------------------------------------------------------------ 外壳 */
  function buildShell() {
    const root = el('div', '');
    root.id = 'root';
    root.innerHTML = `
      <div class="app-window">
        <header class="appbar" id="appbar">
          <div class="appbar-inner">
            <div class="appbar-brand">
              <div class="brand-logo" id="brandLogo"></div>
              <div class="brand-text"><div class="brand-name">PACIFIC<br>COFFEE</div></div>
            </div>
            <nav class="topnav" id="nav"></nav>
            <div class="appbar-tools">
              <span class="store-scope-chip" id="storeScopeChip" style="display:none"></span>
              <button class="ai-search" id="aiSearch" type="button">
                <span class="ai-search-ico">${SVG.ai}</span>
                <span class="ai-search-ph">${esc(t('ai.search.ph'))}</span>
                <span class="ai-search-key">AI</span>
              </button>
              <div class="lang-switch" id="langSwitch"></div>
              <div class="account-menu" id="accountMenu"></div>
            </div>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <div class="ai-drawer" id="aiDrawer"></div>
    `;
    $('#brandLogo', root).innerHTML = global.UI.pccLogo(40);

    // 顶部搜索栏：点击打开 AI 助手浮窗
    $('#aiSearch', root).addEventListener('click', () => { S.ai.enlarged = false; toggleAI(true); });

    // 语言切换（账号信息左侧）
    const langBtn = el('button', 'lang-btn', `<span class="lang-globe">◎</span><span id="langLabel">简体中文</span>`);
    langBtn.type = 'button';
    langBtn.title = '切换语言';
    let langOpen = false;
    const langPanel = el('div', 'lang-panel');
    langPanel.style.display = 'none';
    C.LOCALES.forEach((l) => {
      const it = el('button', 'lang-item', esc(l.label));
      it.type = 'button';
      it.dataset.key = l.key;
      it.addEventListener('click', () => {
        S.locale = l.key;
        langOpen = false;
        langPanel.style.display = 'none';
        render();
        toast('界面语言已切换', 'ok');
      });
      langPanel.appendChild(it);
    });
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      langOpen = !langOpen;
      langPanel.style.display = langOpen ? 'block' : 'none';
    });
    const langWrap = el('div', 'lang-wrap');
    langWrap.appendChild(langBtn);
    langWrap.appendChild(langPanel);
    $('#langSwitch', root).appendChild(langWrap);

    // 账号下拉菜单（悬浮头像展开）：头像 + 账号信息 + 切换 + 设置
    const accMenu = el('div', 'account-menu-wrap');
    const accTrigger = el('button', 'account-trigger');
    accTrigger.type = 'button';
    accTrigger.innerHTML = `<span class="account-avatar" id="uAvatar"></span>
      <span class="account-trigger-name" id="uName"></span><span class="account-caret">⌄</span>`;
    const accPanel = el('div', 'account-dropdown');
    accPanel.innerHTML = `<div class="acc-head">
        <div class="acc-avatar-lg" id="uAvatarLg"></div>
        <div><div class="acc-name" id="uNameLg"></div><div class="acc-scope" id="uDesc"></div></div>
      </div>
      <div class="acc-divider"></div>
      <button class="acc-action" id="accSettings">${DASH_ICONS.settings}<span id="accSettingsLabel">${esc(t('nav.settings'))}</span><span class="acc-arrow">→</span></button>
      <button class="acc-action" id="accLogout"><span class="acc-ico">↪</span><span>${esc(t('login.out'))}</span><span class="acc-arrow">→</span></button>`;
    accMenu.appendChild(accTrigger);
    accMenu.appendChild(accPanel);
    $('#accountMenu', root).appendChild(accMenu);

    // 悬浮展开 / 移出收起（用计时器避免缝隙抖动）
    let accTimer = null;
    accMenu.addEventListener('mouseenter', () => { clearTimeout(accTimer); accMenu.classList.add('open'); });
    accMenu.addEventListener('mouseleave', () => { accTimer = setTimeout(() => accMenu.classList.remove('open'), 180); });

    // 语言面板：点击外部收起
    document.addEventListener('click', () => { langOpen = false; langPanel.style.display = 'none'; });

    // 账号设置入口（总部=账号与权限，门店=本店信息）
    $('#accSettings', root).addEventListener('click', () => {
      accMenu.classList.remove('open');
      setHash(isStore() ? 'store-info' : 'settings');
    });
    $('#accLogout', root).addEventListener('click', () => {
      accMenu.classList.remove('open');
      doLogout();
    });

    return root;
  }

  function pageTitleKey() {
    return {
      overview: isStore() ? 'ov.title.store' : 'ov.title',
      create: 'cr.title', propose: 'propose.title',
      manage: 'mg.title', approval: 'ap.title', progress: 'progress.title',
      records: 'sr.title', settings: 'st.title', 'store-info': 'storeinfo.title',
      audit: 'audit.title',
    }[S.page];
  }

  /* ------------------------------------------------------------ 渲染 */
  function render() {
    if (!S.loggedIn || !$('#content')) return;
    const acc = account();
    // 顶部账号信息（头像 + 下拉）
    $('#uAvatar').textContent = acc.badge;
    $('#uAvatarLg').textContent = acc.badge;
    $('#uName').textContent = acc.display_name || acc.name;
    $('#uNameLg').textContent = acc.display_name || acc.name;
    $('#uDesc').textContent = acc.scope_type === 'store'
      ? `${E.utils.storeLabel(acc.scope_id)} · ${t('login.perm.store')}` : t('perm.ops');
    const scopeChip = $('#storeScopeChip');
    if (scopeChip) {
      scopeChip.style.display = isStore() ? '' : 'none';
      scopeChip.textContent = `${E.utils.storeLabel(acc.scope_id)} · ${t('ov.fixed')}`;
    }
    const settingsLabel = $('#accSettingsLabel');
    if (settingsLabel) {
      settingsLabel.textContent = isStore()
        ? t('nav.settings.store')
        : (acc.can_manage_accounts ? t('nav.settings') : t('nav.settings.readonly'));
    }

    // 语言标签
    const loc = C.LOCALES.find((l) => l.key === S.locale);
    if ($('#langLabel')) $('#langLabel').textContent = loc ? loc.label : '简体中文';
    $$('.lang-item').forEach((it) => it.classList.toggle('on', it.dataset.key === S.locale));

    // 导航（顶部横向）
    const nav = $('#nav');
    nav.innerHTML = '';
    const items = isStore() ? [
      { k: 'overview', l: t('nav.overview.store') },
      { k: 'propose', l: t('nav.create.store') },
      { k: 'manage', l: t('nav.manage') },
      { k: 'progress', l: t('nav.approval.store') },
    ] : [
      { k: 'overview', l: t('nav.overview') },
      { k: 'create', l: t('nav.create') },
      { k: 'manage', l: t('nav.manage') },
      { k: 'approval', l: t('nav.approval') },
      { k: 'records', l: t('nav.records') },
    ];
    // 账号管理员额外拥有只读审计日志入口
    if (!isStore() && acc.can_manage_accounts) items.push({ k: 'audit', l: t('nav.audit') });
    items.forEach((it) => {
      const b = el('button', 'nav-item' + (S.page === it.k ? ' active' : ''), esc(it.l));
      b.addEventListener('click', () => {
        if (it.k === 'overview') { S.ov.storeFilter = isStore() ? acc.scope_id : null; }
        setHash(it.k);
      });
      nav.appendChild(b);
    });

    const content = $('#content');
    content.innerHTML = '';
    ({
      overview: renderOverview,
      create: renderCreate, propose: renderCreate,
      manage: renderManage,
      approval: renderApproval, progress: renderProgress,
      records: renderRecords,
      settings: renderSettings, 'store-info': renderStoreInfo, audit: renderAudit,
    }[S.page] || renderOverview)(content);

    renderAI();
  }

  /* ================================================================
   * 页面 1 —— 数据中心（极简四问 + 原位聚焦详情）
   * 从上到下四问：现在怎样 / 走势如何 / 谁好谁差 / 什么时段核销最多。
   * 任一模块可原位放大：其余模块收进底部玻璃缩略条，点击缩略条切换，
   * 返回或 Esc 时沿原路收回（FLIP）。
   * ==============================================================*/

  const HEAT_SLOTS = [
    { key: '08-10', from: 8, to: 10, labelKey: 'ov.heat.slot.early' },
    { key: '10-12', from: 10, to: 12, labelKey: 'ov.heat.slot.midday' },
    { key: '12-14', from: 12, to: 14, labelKey: 'ov.heat.slot.lunch' },
    { key: '14-17', from: 14, to: 17, labelKey: 'ov.heat.slot.afternoon' },
    { key: '17-19', from: 17, to: 19, labelKey: 'ov.heat.slot.evening' },
    { key: '19-21', from: 19, to: 21, labelKey: 'ov.heat.slot.night' },
  ];
  const HEAT_WEEKDAYS = [
    'ov.heat.mon', 'ov.heat.tue', 'ov.heat.wed', 'ov.heat.thu',
    'ov.heat.fri', 'ov.heat.sat', 'ov.heat.sun',
  ];

  /** 沿用 PCC 浅柠檬 → 沙色 → 玫瑰 → 深酒红的浅到深标尺（半透明以便叠毛玻璃高光） */
  function heatColor(ratio) {
    const stops = [[255, 248, 202], [240, 217, 200], [226, 186, 178], [107, 11, 12]];
    const x = Math.max(0, Math.min(1, ratio));
    const p = x * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(p));
    const f = p - i;
    const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * f));
    return `rgba(${c.join(',')},${(0.30 + x * 0.62).toFixed(3)})`;
  }

  function mondayOf(dateStr) {
    const d = E.utils.d2(dateStr);
    return E.utils.iso(new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000));
  }

  /** 把区间裁剪到顶部日期筛选范围内，返回 null 表示完全不相交 */
  function clampToFilter(s, e) {
    const from = s < S.ov.dateFrom ? S.ov.dateFrom : s;
    const to = e > S.ov.dateTo ? S.ov.dateTo : e;
    return from > to ? null : { from, to };
  }

  /** 天数（含首尾） */
  function daysInclusive(from, to) {
    return Math.max(0, Math.round((E.utils.d2(to) - E.utils.d2(from)) / 86400000) + 1);
  }

  /** 逐日行：区间内每天一行 */
  function heatDailyRows(from, to) {
    const rows = [];
    const n = daysInclusive(from, to);
    for (let i = 0; i < n && rows.length < 400; i++) {
      const d = E.utils.addDays(from, i);
      const wd = HEAT_WEEKDAYS[(E.utils.d2(d).getDay() + 6) % 7];
      rows.push({ from: d, to: d, label: `${t(wd)} ${d.slice(5).replace('-', '/')}` });
    }
    return rows;
  }

  /** 按周聚合行：区间内每个自然周一行 */
  function heatWeeklyRows(from, to) {
    const mondays = new Set();
    const n = daysInclusive(from, to);
    for (let i = 0; i < n && i < 400; i++) mondays.add(mondayOf(E.utils.addDays(from, i)));
    let idx = 0;
    return Array.from(mondays).sort().map((m) => {
      const end = E.utils.addDays(m, 6);
      const s = m < from ? from : m;
      const e = end > to ? to : end;
      return { from: s, to: e, label: t('ov.heat.weekN', { n: ++idx }) };
    });
  }

  /** 与 computeMetrics 完全同口径的核销记录（含券种、门店、日期筛选） */
  function scopedRedemptions(acc, store) {
    const typeSet = S.ov.couponTypes && S.ov.couponTypes.length ? new Set(S.ov.couponTypes) : null;
    const campSet = S.ov.campaignIds && S.ov.campaignIds.length ? new Set(S.ov.campaignIds) : null;
    const scopeStore = store ? acc.scope_id : S.ov.storeFilter;
    const eligible = new Map();
    const campById = new Map(DB.campaigns.map((c) => [c.campaign_id, c]));
    DB.couponInstance.forEach((cp) => {
      if (typeSet && !typeSet.has(cp.coupon_type)) return;
      if (campSet && !campSet.has(cp.campaign_id)) return;
      if (scopeStore && scopeStore !== '__all') {
        const camp = campById.get(cp.campaign_id);
        if (!E.campaignCoversStore(camp, scopeStore)) return;
      }
      eligible.set(cp.coupon_id, cp);
    });
    return DB.redemption.filter((rd) => {
      const cp = eligible.get(rd.coupon_id);
      if (!cp) return false;
      const d = (rd.redeemed_at || '').slice(0, 10);
      if (d < S.ov.dateFrom || d > S.ov.dateTo) return false;
      if (scopeStore && scopeStore !== '__all' && rd.store_id !== scopeStore) return false;
      return true;
    }).map((rd) => Object.assign({}, rd, { coupon: eligible.get(rd.coupon_id) }));
  }

  /* ------------------------------ 详情视图小组件（丰富但不复杂） */

  function detailBars(rows, onPick) {
    const wrap = el('div', 'detail-bars');
    if (!rows.length) { wrap.appendChild(el('div', 'empty', t('ov.detail.empty'))); return wrap; }
    const max = rows.reduce((m, r) => Math.max(m, r.value || 0), 0) || 1;
    rows.forEach((r) => {
      const b = el('button', 'detail-bar-row');
      b.type = 'button';
      const w = Math.max(1.5, ((r.value || 0) / max) * 100);
      b.innerHTML = `<span class="db-name">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
        <span class="db-track"><i style="width:${w.toFixed(1)}%"></i></span>
        <b>${esc(r.text)}</b>`;
      if (typeof onPick === 'function') b.addEventListener('click', () => onPick(r));
      else b.disabled = true;
      wrap.appendChild(b);
    });
    return wrap;
  }

  function detailChart(title, series, height) {
    const box = el('div', 'detail-chart');
    const titleEl = el('div', 'detail-chart-title', esc(title));
    box.appendChild(titleEl);
    const c = el('canvas');
    box.appendChild(c);
    requestAnimationFrame(() => {
      // 在两列 grid 里卡片会被拉伸到与右侧等高，按内容区可用高度绘制，消除卡内留白；
      // 传入 height 作为下限，保证未拉伸处（如门店下钻内的图表）保持原高度。
      const cs = getComputedStyle(box);
      const avail = box.clientHeight
        - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
        - titleEl.offsetHeight;
      lineChart(c, series, { height: Math.max(height || 180, Math.floor(avail)) });
    });
    return box;
  }

  function detailStats(items) {
    const s = el('div', 'detail-stats');
    items.forEach((x) => {
      const d = el('div', 'detail-stat');
      d.innerHTML = `<span>${esc(x.label)}</span><b>${esc(x.value)}</b>`;
      s.appendChild(d);
    });
    return s;
  }

  function detailSection(title, node, hint, wide) {
    const s = el('div', 'detail-section' + (wide ? ' is-wide' : ''));
    // 小标题统一放进内容框内（与 detailChart 一致），不再浮在框外
    const head = el('div', 'detail-section-head', esc(title) + (hint ? ` · ${esc(hint)}` : ''));
    if (node && node.insertBefore) node.insertBefore(head, node.firstChild);
    s.appendChild(node);
    return s;
  }

  function detailList(items, emptyText) {
    const w = el('div', 'detail-list');
    if (!items.length) { w.appendChild(el('div', 'empty', emptyText || t('ov.detail.empty'))); return w; }
    items.forEach((x) => {
      const row = el('div', 'detail-list-row');
      row.innerHTML = `<div class="dl-main"><b>${esc(x.title)}</b><span>${esc(x.meta || '')}</span></div>${x.tag ? `<em>${esc(x.tag)}</em>` : ''}`;
      w.appendChild(row);
    });
    return w;
  }

  function typeNameOf(r) {
    return (E.COUPON_TYPES[r.coupon && r.coupon.coupon_type] || {}).name || '其他';
  }

  function groupSum(rows, keyFn, valFn) {
    const m = new Map();
    rows.forEach((r) => { const k = keyFn(r); m.set(k, (m.get(k) || 0) + (valFn ? valFn(r) : 1)); });
    return Array.from(m, ([k, v]) => ({ name: k, value: v }));
  }

  /** 活动详情下钻：把券实例按时间聚合成日序列（超过 62 天自动按月） */
  function drillDaily(rows, tsKey) {
    const m = new Map();
    rows.forEach((x) => {
      const d = (x[tsKey] || '').slice(0, 10);
      if (d) m.set(d, (m.get(d) || 0) + 1);
    });
    let keys = Array.from(m.keys()).sort();
    if (keys.length > 62) {
      const mm = new Map();
      keys.forEach((d) => { const k = d.slice(0, 7); mm.set(k, (mm.get(k) || 0) + m.get(d)); });
      keys = Array.from(mm.keys()).sort();
      return { labels: keys.map((k) => k.slice(2)), data: keys.map((k) => mm.get(k)) };
    }
    return { labels: keys.map((d) => d.slice(5)), data: keys.map((d) => m.get(d)) };
  }

  /** 活动详情下钻：按门店聚合的横向条（券实例 store_id 为空时归入「全港/未指定」） */
  function drillStoreBars(rows, valFn) {
    const m = new Map();
    rows.forEach((x) => {
      const sid = x.store_id || '__all';
      m.set(sid, (m.get(sid) || 0) + (valFn ? valFn(x) : 1));
    });
    return Array.from(m, ([sid, v]) => ({
      name: sid === '__all' ? '全港/未指定' : E.utils.storeLabel(sid),
      value: v, text: num(v),
    })).sort((a, b) => b.value - a.value).slice(0, 12);
  }

  /** 下钻趋势：发放/领取/核销共用同一日期轴（超过 62 天自动按月合并） */
  function unifiedDrillSeries(iss, cla, use) {
    const mapOf = (rows, k) => {
      const m = new Map();
      rows.forEach((x) => { const d = (x[k] || '').slice(0, 10); if (d) m.set(d, (m.get(d) || 0) + 1); });
      return m;
    };
    const mi = mapOf(iss, 'issued_at'), mc = mapOf(cla, 'claimed_at'), mu = mapOf(use, 'redeemed_at');
    let keys = Array.from(new Set([...mi.keys(), ...mc.keys(), ...mu.keys()])).sort();
    const monthly = keys.length > 62;
    if (monthly) keys = Array.from(new Set(keys.map((d) => d.slice(0, 7)))).sort();
    const kOf = (d) => (monthly ? d.slice(0, 7) : d);
    const arr = (m) => {
      const mm = new Map();
      m.forEach((v, d) => { const k = kOf(d); mm.set(k, (mm.get(k) || 0) + v); });
      return keys.map((k) => mm.get(k) || 0);
    };
    return { labels: keys.map((k) => (monthly ? k.slice(2) : k.slice(5))), issued: arr(mi), claimed: arr(mc), used: arr(mu) };
  }

  /**
   * 活动详情「发放结果」四张卡的下钻内容：
   * 左侧竖排（日期筛选 + 发放/领取/核销数）、右侧三线趋势（跟随日期）、
   * 下方门店核销分布（全港 + TOP5）与最近记录。全程只替换弹窗 body，不跳页、不改 hash。
   */
  function buildCampaignDrill(key, ctx) {
    const { issued, claimedList, usedList, c } = ctx;
    const wrap = el('div', 'cd-drill');

    const bar = el('div', 'cd-drill-bar');
    const back = el('button', 'cd-back', '← ' + t('cd.back'));
    back.type = 'button';
    bar.appendChild(back);
    bar.appendChild(el('span', 'cd-drill-title', t('cd.t.' + key)));
    wrap.appendChild(bar);

    const content = el('div', 'cd-drill-content');
    wrap.appendChild(content);

    const statusText = (cp) => E.STATUS.coupon[cp.status] || cp.status || '—';
    const memberOf = (cp) => E.maskPhone ? E.maskPhone(cp.customer_id || '') : (cp.customer_id || '—');
    const redByCid = new Map(DB.redemption.map((r) => [r.coupon_id, r]));
    const allDates = []
      .concat(issued.map((x) => (x.issued_at || '').slice(0, 10)))
      .concat(claimedList.map((x) => (x.claimed_at || '').slice(0, 10)))
      .concat(usedList.map((x) => (x.redeemed_at || '').slice(0, 10)))
      .filter(Boolean).sort();
    const defFrom = allDates[0] || '2025-01-01';
    const defTo = C.DATA_TODAY;

    const renderBody = (from, to) => {
      content.replaceChildren();
      const inRange = (ts) => { const d = (ts || '').slice(0, 10); return !!d && d >= from && d <= to; };
      const iss = issued.filter((x) => inRange(x.issued_at));
      const cla = claimedList.filter((x) => inRange(x.claimed_at));
      const use = usedList.filter((x) => inRange(x.redeemed_at));

      /* 左：日期筛选 + 三张数字卡（竖排） */
      const main = el('div', 'cd-drill-main');
      const side = el('div', 'cd-drill-side');
      const dateBox = el('div', 'cd-drill-date');
      dateBox.innerHTML = `<label>${esc(t('ov.filter.date'))}</label>`;
      const rp = rangePicker({
        from, to, today: C.DATA_TODAY, maxDate: C.DATA_TODAY,
        onChange: (a, b) => renderBody(a || defFrom, b || defTo),
      });
      dateBox.appendChild(rp);
      side.appendChild(dateBox);
      const stats = detailStats([
        { label: t('ov.detail.issued'), value: num(iss.length) },
        { label: t('ov.detail.claimed'), value: num(cla.length) },
        { label: t('ov.detail.used'), value: num(use.length) },
      ]);
      stats.classList.add('cd-drill-stats-v');
      side.appendChild(stats);
      main.appendChild(side);

      /* 右：三条曲线共用同一日期轴 + 顶部图例 */
      const axis = unifiedDrillSeries(iss, cla, use);
      const chartBox = el('div', 'cd-drill-chart');
      const legend = el('div', 'cd-legend');
      legend.innerHTML = [
        [t('ov.detail.issued'), '#6B0B0C'],
        [t('ov.detail.claimed'), '#BA7517'],
        [t('ov.detail.used'), '#1D9E75'],
      ].map(([n, col]) => `<span><i style="background:${col}"></i>${esc(n)}</span>`).join('');
      chartBox.appendChild(legend);
      const canvas = el('canvas');
      chartBox.appendChild(canvas);
      main.appendChild(chartBox);
      content.appendChild(main);
      requestAnimationFrame(() => {
        // chart 卡片被 stretch 到与左侧等高，按其内容区可用高度绘制，消除框内留白
        const cs = getComputedStyle(chartBox);
        const avail = chartBox.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
          - legend.offsetHeight - parseFloat(getComputedStyle(legend).marginBottom);
        lineChart(canvas, [
          { labels: axis.labels, data: axis.issued, color: '#6B0B0C' },
          { labels: axis.labels, data: axis.claimed, color: '#BA7517' },
          { labels: axis.labels, data: axis.used, color: '#1D9E75' },
        ], { height: Math.max(120, avail) });
      });

      /* 门店分布：核销数（全港 + TOP5） */
      const usedIds = new Set(use.map((x) => x.coupon_id));
      const redRows = DB.redemption.filter((r) => usedIds.has(r.coupon_id) && inRange(r.redeemed_at));
      const dist = [{ name: '全港', value: redRows.length, text: num(redRows.length) }];
      groupSum(redRows, (r) => r.store_id || '__all')
        .sort((a, b) => b.value - a.value).slice(0, 5)
        .forEach((x) => dist.push({ name: x.name === '__all' ? '未指定门店' : E.utils.storeLabel(x.name), value: x.value, text: num(x.value) }));
      content.appendChild(detailSection(`${t('cd.dist')} · ${t('ov.detail.used')}`, detailBars(dist)));

      /* 最近记录：跟随日期与所选卡片 */
      const recBase = key === 'claimed' ? cla : key === 'used' ? use : iss;
      const tsKey = key === 'claimed' ? 'claimed_at' : key === 'used' ? 'redeemed_at' : 'issued_at';
      const recent = recBase.slice().sort((a, b) => String(b[tsKey]).localeCompare(String(a[tsKey]))).slice(0, 8);
      content.appendChild(detailSection(t('cd.recent'), detailList(recent.map((cp) => {
        const r = redByCid.get(cp.coupon_id);
        return {
          title: `${t('cd.member')} ${esc(memberOf(cp))} · ${esc(cp.coupon_id)}`,
          meta: `${t('cd.time')} ${esc(cp[tsKey] || '—')}${r ? ' · ' + esc(E.utils.storeLabel(r.store_id)) : ''}`,
          tag: statusText(cp),
        };
      }), t('cd.noRec'))));
    };

    renderBody(defFrom, defTo);
    return wrap;
  }

  function renderOverview(host) {
    const acc = account();
    const store = isStore();
    const myStore = acc.scope_id;

    // 门店总览：门店范围固定
    if (store) S.ov.storeFilter = myStore;

    // 筛选栏：日期范围、券种多选、门店范围、应用、重置，全部保留不动
    const bar = el('div', 'filterbar');
    const row = el('div', 'filterbar-row');
    bar.appendChild(row);

    const couponOptions = E.couponTypeKeys()
      .filter((k) => !store || true)
      .map((k) => ({ v: k, label: `${E.COUPON_TYPES[k].name} · ${E.COUPON_TYPES[k].discount_label}` }));
    const fCoupon = el('div', 'field field-grow');
    const ms = multiSelect({
      placeholder: t('ov.all_coupons'), allLabel: t('ov.all_coupons'),
      options: couponOptions, values: S.ov.couponTypes, exclusiveAll: true,
      staged: true, onStage: markPending,
      // 勾选期间只暂存，不刷新页面；由「应用筛选」统一提交
      onChange: (v) => { S.ov.couponTypes = v; },
    });
    fCoupon.appendChild(ms);
    fCoupon.style.flex = '0 0 300px';
    row.appendChild(fCoupon);

    let ss = null;
    if (store) {
      const f = el('div', 'field');
      const ctrl = el('div', 'control locked');
      ctrl.innerHTML = `<span class="ctrl-value">${esc(E.utils.storeLabel(myStore))}</span>`;
      f.appendChild(ctrl); f.style.flex = '0 0 200px';
      row.appendChild(f);
    } else {
      const f = el('div', 'field');
      ss = singleSelect({
        options: [{ v: '__all', label: t('cr.all_hk') }].concat(DB.stores.map((s) => ({ v: s.store_id, label: s.name }))),
        value: S.ov.storeFilter || '__all',
        staged: true, onStage: markPending,
        onChange: (v) => { S.ov.storeFilter = (v === '__all' ? null : v); },
      });
      ss.style.minWidth = '180px';
      f.appendChild(ss); f.style.flex = '0 0 190px';
      row.appendChild(f);
    }

    const fDate = el('div', 'field');
    const rp = rangePicker({
      from: S.ov.dateFrom, to: S.ov.dateTo, today: C.DATA_TODAY,
      maxDate: C.DATA_TODAY,
      staged: true, onStage: markPending,
      onChange: (a, b) => {
        if (a && b) { S.ov.dateFrom = a; S.ov.dateTo = b; }
        else { S.ov.dateFrom = '2026-10-01'; S.ov.dateTo = C.DATA_TODAY; }
      },
    });
    rp.style.minWidth = '260px';
    fDate.appendChild(rp); fDate.style.flex = '0 0 280px';
    row.appendChild(fDate);

    const apply = el('button', 'btn btn-primary', esc(t('ov.apply')));
    apply.style.minWidth = '150px';
    apply.dataset.role = 'apply';
    apply.dataset.apply = 'pending';
    apply.addEventListener('click', () => {
      // 统一提交三项暂存筛选，再一次性刷新页面
      ms.commit(); if (ss) ss.commit(); rp.commit();
      render(); toast('已应用筛选条件', 'ok');
    });
    row.appendChild(apply);

    const reset = el('button', 'btn btn-ghost', '重置');
    reset.style.marginLeft = '10px';
    reset.addEventListener('click', () => {
      S.ov.couponTypes = []; S.ov.campaignIds = [];
      S.ov.dateFrom = '2026-10-01'; S.ov.dateTo = C.DATA_TODAY;
      S.ov.storeFilter = isStore() ? acc.scope_id : null;
      S.ov.activityFilter = null;
      render();
      toast('已重置全部筛选条件', 'ok');
    });
    row.appendChild(reset);

    // 导出数据：按当前已应用的筛选与账号范围导出（openExport 之前丢失入口）
    const exp = el('button', 'btn btn-ghost', esc(t('ov.export')));
    exp.style.marginLeft = '10px';
    exp.addEventListener('click', () => openExport());
    row.appendChild(exp);

    host.appendChild(bar);

    /* ---------- 模块聚焦骨架：正常流 / 主视图 / 底部缩略条 ---------- */
    const board = el('div', 'dash-board');
    const toolbar = el('div', 'focus-toolbar');
    toolbar.innerHTML = `<button class="focus-back" type="button">${DASH_ICONS.collapse}<span>${esc(t('ov.focus.back'))}</span></button>
      <span class="focus-crumb"></span>`;
    const normalFlow = el('div', 'dash-normal');
    const kpiRow = el('div', 'metrics metrics-4 dash-metrics dash-kpis ' + (store ? 'store-kpis' : 'hq-kpis'));
    const topGrid = el('div', 'dash-chart-home' + (store ? ' is-solo' : ''));
    const trendCol = el('div', 'dash-top-col');
    const storeCol = el('div', 'dash-top-col');
    topGrid.appendChild(trendCol);
    if (!store) topGrid.appendChild(storeCol);
    const lower = el('div', 'dash-lower');
    const couponCol = el('div', 'dash-lower-col');
    const heatCol = el('div', 'dash-lower-col');
    lower.appendChild(couponCol); lower.appendChild(heatCol);
    normalFlow.appendChild(kpiRow);
    normalFlow.appendChild(topGrid);
    normalFlow.appendChild(lower);
    const stage = el('div', 'dash-stage');
    const strip = el('div', 'dash-thumbstrip');
    board.appendChild(toolbar);
    board.appendChild(normalFlow);
    board.appendChild(stage);
    board.appendChild(strip);
    host.appendChild(board);

    const mods = [];
    /** 包装模块：平时留在原布局位置，聚焦时移入 stage，其余移入 strip */
    function addMod(cfg) {
      const wrap = el('div', 'dash-module');
      wrap.dataset.mod = cfg.key;
      if (cfg.kind) wrap.dataset.kind = cfg.kind;
      const full = el('div', 'mod-full');
      full.appendChild(cfg.node);
      wrap.appendChild(full);
      const ex = el('button', 'mod-expand');
      ex.type = 'button';
      ex.title = t('ov.focus.expand');
      ex.setAttribute('aria-label', t('ov.focus.expand'));
      ex.innerHTML = DASH_ICONS.expand;
      ex.addEventListener('click', (ev) => { ev.stopPropagation(); focusTo(cfg.key); });
      wrap.appendChild(ex);
      const thumb = el('button', 'mod-thumb');
      thumb.type = 'button';
      thumb.innerHTML = `<span class="thumb-ic">${cfg.icon || ''}</span>
        <span class="thumb-txt"><b>${esc(cfg.title)}</b><span>${esc(cfg.meta || '')}</span></span>`;
      thumb.addEventListener('click', (ev) => { ev.stopPropagation(); focusTo(cfg.key); });
      wrap.appendChild(thumb);
      wrap.addEventListener('click', (ev) => {
        if (S.ov.focus) return;
        if (ev.target.closest('button, a, input, select, canvas, .dropdown-panel, .calendar')) return;
        focusTo(cfg.key);
      });
      cfg.home.appendChild(wrap);
      mods.push({ key: cfg.key, title: cfg.title, wrap, home: cfg.home, anchor: cfg.anchor || null, detail: cfg.detail || null });
      return wrap;
    }

    /** FLIP：记录旧位置 → 改 DOM → 从旧位置平滑 anim 回新位置 */
    function focusTo(key, instant) {
      const cur = S.ov.focus;
      if (cur === key) return;
      const first = new Map();
      mods.forEach((m) => { if (m.wrap.isConnected) first.set(m.wrap, m.wrap.getBoundingClientRect()); });
      mods.forEach((m) => m.wrap.getAnimations().forEach((a) => a.cancel()));

      if (key) {
        const target = mods.find((m) => m.key === key);
        if (!target) return;
        board.classList.add('is-focused');
        stage.appendChild(target.wrap);
        mods.filter((m) => m !== target).forEach((m) => strip.appendChild(m.wrap));
        toolbar.querySelector('.focus-crumb').innerHTML = `${esc(t('ov.focus.crumb'))}：<b>${esc(target.title)}</b>`;
        if (target.detail) target.detail();
      } else {
        board.classList.remove('is-focused');
        mods.forEach((m) => {
          if (m.anchor && m.anchor.parentNode === m.home) m.home.insertBefore(m.wrap, m.anchor);
          else m.home.appendChild(m.wrap);
        });
      }
      S.ov.focus = key;

      if (!instant) {
        mods.forEach((m) => {
          const f = first.get(m.wrap);
          if (!f) return;
          const l = m.wrap.getBoundingClientRect();
          if (l.width < 1 || l.height < 1) return;
          const dx = f.left - l.left, dy = f.top - l.top;
          const sx = f.width / l.width, sy = f.height / l.height;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01) return;
          const anim = m.wrap.animate([
            { transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: .84 },
            { transform: 'none', opacity: 1 },
          ], { duration: 460, easing: 'cubic-bezier(.22,.8,.22,1)', fill: 'none' });
          // 兜底：无头/后台节流环境下动画时间轴可能停住，定时清除避免残留 transform
          setTimeout(() => { try { anim.cancel(); } catch (_) { /* noop */ } }, 520);
        });
      }
      if (key === 'trend' || cur === 'trend') requestAnimationFrame(drawTrend);
    }
    toolbar.querySelector('.focus-back').addEventListener('click', () => focusTo(null));

    /* ---------- 数据：全部实时来自引擎，不写死 ---------- */
    const metrics = E.computeMetrics(S.ov, acc);
    S.lastMetrics = metrics;
    const scoped = scopedRedemptions(acc, store);
    // 门店维度聚合：供门店对比卡片与单店下钻共用，与核销 KPI 完全同源
    const storeStats = (() => {
      const map = new Map();
      scoped.forEach((rd) => {
        const sid = rd.store_id || '未知门店';
        let v = map.get(sid);
        if (!v) {
          const meta = DB.stores.find((x) => x.store_id === sid) || {};
          v = { sid, name: E.utils.storeLabel(sid), district: meta.district || '',
                count: 0, paid: 0, days: new Set(), daily: new Map(), types: new Map(), slots: new Map() };
          map.set(sid, v);
        }
        const day = (rd.redeemed_at || '').slice(0, 10);
        const paid = Number(rd.paid_amount) || 0;
        v.count++; v.paid += paid;
        if (day) { v.days.add(day); v.daily.set(day, (v.daily.get(day) || 0) + 1); }
        const tn = typeNameOf(rd); v.types.set(tn, (v.types.get(tn) || 0) + 1);
        const hour = Number((rd.redeemed_at || '').slice(11, 13));
        const slot = HEAT_SLOTS.find((x) => hour >= x.from && hour < x.to);
        if (slot) { const l = t(slot.labelKey); v.slots.set(l, (v.slots.get(l) || 0) + 1); }
      });
      const all = Array.from(map.values());
      const totalCount = all.reduce((a, v) => a + v.count, 0) || 1;
      const totalPaid = all.reduce((a, v) => a + v.paid, 0) || 1;
      return all.map((v) => Object.assign({}, v, { share: v.count / totalCount, paidShare: v.paid / totalPaid }));
    })();
    const storeRank = (metric) => storeStats.slice().sort((a, b) => {
      const delta = metric === 'paid' ? a.paid - b.paid : a.count - b.count;
      return ((delta || a.count - b.count) * S.ov.storeSortDir);
    });
    const scopeLabel = store ? E.utils.storeLabel(myStore)
      : (S.ov.storeFilter ? E.utils.storeLabel(S.ov.storeFilter) : '全港门店');

    // 上一等长周期：让核心数字保留「较上期」标注
    const dayCount = Math.max(1, Math.round(
      (new Date(S.ov.dateTo) - new Date(S.ov.dateFrom)) / 86400000) + 1);
    const prev = E.computeMetrics({
      ...S.ov,
      dateFrom: E.utils.addDays(S.ov.dateFrom, -dayCount),
      dateTo: E.utils.addDays(S.ov.dateFrom, -1),
    }, acc);
    const deltaOf = (cur, before, isRate) => {
      if (!before && !cur) return { text: '与上期同为 0', good: null };
      if (!before) return { text: '上期无数据', good: null };
      const d = isRate ? (cur - before) * 100 : ((cur - before) / before) * 100;
      const good = d >= 0;
      return { text: `${d >= 0 ? '↑' : '↓'} ${Math.abs(d).toFixed(1)}${isRate ? 'pt' : '%'} 较上期`, good };
    };

    /* ---------- KPI 详情：每个指标回答一个更细的问题 ---------- */
    function kpiBlocks(key) {
      const blocks = [];
      const dates = metrics.trend.map((x) => x.date.slice(5).replace('-', '/'));
      const typeName = typeNameOf;
      const typeIssued = Object.values(metrics.byType).filter((x) => x.issued > 0)
        .map((x) => ({ name: x.name, sub: x.discount_label, value: x.issued, text: num(x.issued), key: x.key }))
        .sort((a, b) => b.value - a.value);
      const typeClaim = Object.values(metrics.byType).filter((x) => x.issued > 0)
        .map((x) => ({ name: x.name, sub: `已领 ${num(x.claimed)} / 发放 ${num(x.issued)}`, value: x.claim_rate, text: pct(x.claim_rate), key: x.key }))
        .sort((a, b) => b.value - a.value);
      const typeRedeem = Object.values(metrics.byType).filter((x) => x.issued > 0)
        .map((x) => ({ name: x.name, sub: `已核销 ${num(x.used)} / 发放 ${num(x.issued)}`, value: x.redeem_rate, text: pct(x.redeem_rate), key: x.key }))
        .sort((a, b) => b.value - a.value);
      const paidByType = groupSum(scoped, typeName, (r) => r.paid_amount)
        .map((x) => ({ ...x, text: money(x.value) })).sort((a, b) => b.value - a.value);
      const usedByType = groupSum(scoped, typeName)
        .map((x) => ({ ...x, text: num(x.value) + ' 笔' })).sort((a, b) => b.value - a.value);
      const paidByStore = groupSum(scoped, (r) => E.utils.storeLabel(r.store_id), (r) => r.paid_amount)
        .map((x) => ({ ...x, text: money(x.value) })).sort((a, b) => b.value - a.value);
      const usedByStore = groupSum(scoped, (r) => E.utils.storeLabel(r.store_id))
        .map((x) => ({ ...x, text: num(x.value) + ' 笔' })).sort((a, b) => b.value - a.value);
      const paidByDay = groupSum(scoped, (r) => (r.redeemed_at || '').slice(5, 10), (r) => r.paid_amount);
      const usedByDay = groupSum(scoped, (r) => (r.redeemed_at || '').slice(5, 10))
        .sort((a, b) => a.name.localeCompare(b.name));
      const slotUsed = groupSum(scoped, (r) => {
        const h = Number((r.redeemed_at || '').slice(11, 13));
        const s = HEAT_SLOTS.find((x) => h >= x.from && h < x.to);
        return s ? t(s.labelKey) : '其他';
      }).map((x) => ({ ...x, text: num(x.value) + ' 笔' })).sort((a, b) => b.value - a.value);
      const pickCoupon = (r) => {
        if (!r.key) return;
        S.ov.couponTypes = [r.key];
        render();
        toast(t('ov.coupon.picked', { name: r.name }), 'ok');
      };
      const aov = scoped.length ? metrics.paid_amount / scoped.length : 0;

      if (key === 'issued') {
        blocks.push(detailStats([
          { label: t('ov.detail.issued'), value: num(metrics.issued) },
          { label: t('ov.detail.coverage'), value: num(metrics.trend.length) + ' 天' },
          { label: t('ov.detail.campaigns'), value: num(metrics.byCampaign.filter((x) => x.issued > 0).length) },
          { label: t('ov.detail.types'), value: num(typeIssued.length) },
        ]));
        blocks.push(detailChart(t('ov.detail.dayIssued'),
          [{ labels: dates, data: metrics.trend.map((x) => x.issued), color: '#6B0B0C' }], 200));
        // 统一发券 TOP6：券种即发券单位，按发放量由多到少，一行一券种，点击可筛选
        blocks.push(detailSection(t('ov.detail.issueTop6'), detailBars(typeIssued.slice(0, 6), pickCoupon), t('ov.detail.clickHint')));
      } else if (key === 'claim') {
        blocks.push(detailStats([
          { label: t('ov.detail.issued'), value: num(metrics.issued) },
          { label: t('ov.detail.claimed'), value: num(metrics.claimed_of_issued) },
          { label: t('ov.detail.rate'), value: pct(metrics.claim_rate) },
          { label: t('ov.detail.prev'), value: pct(prev.claim_rate) },
        ]));
        blocks.push(detailChart(t('ov.detail.dayClaim'), [
          { labels: dates, data: metrics.trend.map((x) => x.issued), color: '#6B0B0C' },
          { labels: dates, data: metrics.trend.map((x) => x.claimed), color: '#7FA8B4' },
        ], 200));
        blocks.push(detailSection(t('ov.detail.typeClaim'), detailBars(typeClaim, pickCoupon), t('ov.detail.clickHint')));
      } else if (key === 'redeem') {
        blocks.push(detailStats([
          { label: t('ov.detail.issued'), value: num(metrics.issued) },
          { label: t('ov.detail.used'), value: num(metrics.used_of_issued) },
          { label: t('ov.detail.rate'), value: pct(metrics.redeem_rate) },
          { label: t('ov.detail.prev'), value: pct(prev.redeem_rate) },
        ]));
        blocks.push(detailChart(t('ov.detail.dayUsed'),
          [{ labels: dates, data: metrics.trend.map((x) => x.used), color: '#6B0B0C' }], 200));
        blocks.push(detailSection(t('ov.detail.typeRedeem'), detailBars(typeRedeem, pickCoupon), t('ov.detail.clickHint')));
        if (!store) blocks.push(detailSection(t('ov.detail.storeUsed'), detailBars(usedByStore, (r) => {
          const v = storeStats.find((x) => x.name === r.name);
          if (v) openStoreDetail(v.sid);
        }), t('ov.store.rankHint'), true));
      } else if (key === 'paid') {
        blocks.push(detailStats([
          { label: t('ov.detail.total'), value: money(metrics.paid_amount) },
          { label: t('ov.detail.count'), value: num(scoped.length) },
          { label: t('ov.detail.aov'), value: money(aov) },
          { label: t('ov.detail.prev'), value: money(prev.paid_amount) },
        ]));
        blocks.push(detailChart(t('ov.detail.dayPaid'), [
          { labels: paidByDay.map((x) => x.name), data: paidByDay.map((x) => x.value), color: '#6B0B0C' },
        ], 200));
        blocks.push(detailSection(t('ov.detail.typePaid'), detailBars(paidByType)));
        if (!store) blocks.push(detailSection(t('ov.detail.storePaid'), detailBars(paidByStore, (r) => {
          const v = storeStats.find((x) => x.name === r.name);
          if (v) openStoreDetail(v.sid);
        }), t('ov.store.rankHint'), true));
      } else if (key === 'used') {
        blocks.push(detailStats([
          { label: t('ov.detail.used'), value: num(metrics.used) },
          { label: t('ov.detail.total'), value: money(metrics.paid_amount) },
          { label: t('ov.detail.aov'), value: money(aov) },
          { label: t('ov.detail.prev'), value: num(prev.used) },
        ]));
        blocks.push(detailChart(t('ov.detail.dayUsed'), [
          { labels: usedByDay.map((x) => x.name), data: usedByDay.map((x) => x.value), color: '#6B0B0C' },
        ], 200));
        blocks.push(detailSection(t('ov.detail.typeUsed'), detailBars(usedByType)));
        blocks.push(detailSection(t('ov.detail.slotUsed'), detailBars(slotUsed)));
      } else if (key === 'applicable') {
        const apps = DB.campaigns.filter((c) => c.status === 'running' && E.campaignCoversStore(c, acc.scope_id));
        blocks.push(detailStats([
          { label: t('ov.detail.applicable'), value: num(apps.length) },
          { label: t('ov.detail.types'), value: num(new Set(apps.map((c) => c.coupon_type)).size) },
        ]));
        blocks.push(detailSection(t('ov.detail.applicable'), detailList(apps.map((c) => ({
          title: c.name,
          meta: `${E.COUPON_TYPES[c.coupon_type].name} · ${E.COUPON_TYPES[c.coupon_type].discount_label} · ${E.scopeLabelOf(c)}`,
          tag: t('ov.detail.running'),
        })))));
      } else if (key === 'anomaly') {
        blocks.push(detailStats([
          { label: t('ov.metric.anomaly'), value: num(metrics.anomalies.length) },
          { label: t('ov.detail.coverage'), value: num(metrics.trend.length) + ' 天' },
        ]));
        blocks.push(detailSection(t('ov.detail.anomaly'), detailList(metrics.anomalies.map((a) => ({
          title: a.label, meta: `${a.code} · ${a.reason}`, tag: (a.at || '').slice(5, 16),
        })), t('ov.detail.noAnomaly'))));
      }
      return blocks;
    }

    /* ---------- 模块 2：一排 4 个数字卡（每张可点开详情） ---------- */
    const kpiDefs = store ? [
      { key: 'used', title: t('ov.metric.used'), value: num(metrics.used), meta: `本店核销 ${num(metrics.used)}`, icon: DASH_ICONS.check,
        card: kpiCard(t('ov.metric.used'), num(metrics.used), '本店发生的核销', deltaOf(metrics.used, prev.used, false), DASH_ICONS.check, 'tone-lemon') },
      { key: 'paid', title: t('ov.metric.paid'), value: money(metrics.paid_amount), meta: `实付 ${money(metrics.paid_amount)}`, icon: DASH_ICONS.coin,
        card: kpiCard(t('ov.metric.paid'), money(metrics.paid_amount), '核销关联订单实付', deltaOf(metrics.paid_amount, prev.paid_amount, false), DASH_ICONS.coin, 'tone-blue') },
      { key: 'applicable', title: t('ov.metric.applicable'), value: num(metrics.applicable_campaigns || 0), meta: '本店可核销活动', icon: DASH_ICONS.campaign,
        card: kpiCard(t('ov.metric.applicable'), num(metrics.applicable_campaigns || 0), '总部与本店适用的运行中活动', null, DASH_ICONS.campaign, 'tone-rose') },
      { key: 'anomaly', title: t('ov.metric.anomaly'), value: num(metrics.anomalies.length), meta: '需复核记录', icon: DASH_ICONS.alert,
        card: kpiCard(t('ov.metric.anomaly'), num(metrics.anomalies.length), metrics.anomalies.length ? '需总部复核' : '链路运行正常', null, DASH_ICONS.alert, 'tone-sand') },
    ] : [
      { key: 'issued', title: t('ov.metric.issued'), value: num(metrics.issued), meta: `发放 ${num(metrics.issued)}`, icon: DASH_ICONS.ticket,
        card: kpiCard(t('ov.metric.issued'), num(metrics.issued), `${scopeLabel} · 覆盖 ${metrics.trend.length} 天`, deltaOf(metrics.issued, prev.issued, false), DASH_ICONS.ticket, 'tone-lemon') },
      { key: 'claim', title: t('ov.label.claim_rate'), value: pct(metrics.claim_rate), meta: `领取率 ${pct(metrics.claim_rate)}`, icon: DASH_ICONS.check,
        card: kpiCard(t('ov.label.claim_rate'), pct(metrics.claim_rate), `已领取 ${num(metrics.claimed_of_issued)} / 发放 ${num(metrics.issued)} 张`, deltaOf(metrics.claim_rate, prev.claim_rate, true), DASH_ICONS.check, 'tone-blue') },
      { key: 'redeem', title: t('ov.label.redeem_rate'), value: pct(metrics.redeem_rate), meta: `核销率 ${pct(metrics.redeem_rate)}`, icon: DASH_ICONS.campaign,
        card: kpiCard(t('ov.label.redeem_rate'), pct(metrics.redeem_rate), `已核销 ${num(metrics.used_of_issued)} 张`, deltaOf(metrics.redeem_rate, prev.redeem_rate, true), DASH_ICONS.campaign, 'tone-rose') },
      { key: 'paid', title: t('ov.label.related_paid'), value: money(metrics.paid_amount), meta: `实付 ${money(metrics.paid_amount)}`, icon: DASH_ICONS.coin,
        card: kpiCard(t('ov.label.related_paid'), money(metrics.paid_amount), '本期核销带来的实际支付', deltaOf(metrics.paid_amount, prev.paid_amount, false), DASH_ICONS.coin, 'tone-sand') },
    ];
    kpiDefs.forEach((def) => {
      const body = el('div', 'kpi-module-body');
      body.appendChild(def.card);
      const detail = el('div', 'kpi-detail');
      body.appendChild(detail);
      addMod({
        key: def.key, title: def.title, meta: def.meta, icon: def.icon,
        node: body, home: kpiRow, kind: 'kpi',
        detail: () => {
          if (detail.dataset.built) return;
          const p = panel(def.title, t('ov.detail.sub'), def.icon);
          p.body.classList.add('detail-body');
          const hero = el('div', 'detail-hero');
          hero.innerHTML = `<span>${esc(def.title)}</span><b>${esc(def.value)}</b>${def.card.querySelector('.kpi-delta') ? `<em class="${def.card.querySelector('.kpi-delta').className.replace('kpi-delta', '').trim()}">${esc(def.card.querySelector('.kpi-delta').textContent)}</em>` : ''}`;
          p.body.appendChild(hero);
          kpiBlocks(def.key).forEach((b) => p.body.appendChild(b));
          detail.appendChild(p.root);
          detail.dataset.built = '1';
        },
      });
    });

    /* ---------- 模块 3：发放与核销趋势（总部两条线，门店一条线） ---------- */
    const primaryTrend = metrics.trend.map((x) => (store ? x.used : x.issued));
    const trendAvg = primaryTrend.length ? primaryTrend.reduce((a, b) => a + b, 0) / primaryTrend.length : 0;
    const trendPeak = primaryTrend.length ? Math.max(...primaryTrend) : 0;
    const trendLow = primaryTrend.length ? Math.min(...primaryTrend) : 0;
    const chartCard = el('div', 'chart-card dash-chart');
    chartCard.innerHTML = `<div class="chart-head">
        <div class="chart-title-wrap"><span class="chart-icon">${DASH_ICONS.chart}</span><span class="chart-title">${esc(t(store ? 'ov.trend.store' : 'ov.trend.simple'))}</span></div>
        <div class="legend">
          ${store ? '' : `<span><i class="lg-issued"></i>${esc(t('ov.legend.issued'))}</span>`}
          <span><i class="${store ? 'lg-issued' : 'lg-used'}"></i>${esc(t('ov.legend.used'))}</span>
        </div>
      </div>`;
    const trendInsight = el('div', 'trend-insight');
    trendInsight.innerHTML = `<span>${esc(t('ov.trend.avg'))} <b>${num(Math.round(trendAvg))}</b> / ${esc(t('ov.trend.day'))}</span>
      <span>${esc(t('ov.trend.peak'))} <b>${num(trendPeak)}</b></span>
      <span>${esc(t('ov.trend.low'))} <b>${num(trendLow)}</b></span>`;
    chartCard.appendChild(trendInsight);
    const canvas = el('canvas');
    chartCard.appendChild(canvas);
    addMod({
      key: 'trend', title: t(store ? 'ov.trend.store' : 'ov.trend.simple'),
      meta: `${metrics.trend.length} 天`, icon: DASH_ICONS.chart,
      node: chartCard, home: trendCol,
    });

    function drawTrend() {
      const labels = metrics.trend.map((x) => x.date.slice(5).replace('-', '/'));
      const series = store
        ? [{ labels, data: metrics.trend.map((x) => x.used), color: '#6B0B0C' }]
        : [
            { labels, data: metrics.trend.map((x) => x.issued), color: '#6B0B0C' },
            { labels, data: metrics.trend.map((x) => x.used), color: '#7FA8B4' },
          ];
      // 正常流：卡片被同行等高网格拉伸，按内容区可用高度绘制曲线，消除卡内留白；
      // 聚焦态用固定更大高度，保证放大后曲线更舒展。
      let height = 420;
      if (S.ov.focus !== 'trend') {
        const cs = getComputedStyle(chartCard);
        const head = chartCard.querySelector('.chart-head');
        const ins = chartCard.querySelector('.trend-insight');
        const avail = chartCard.clientHeight
          - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
          - (head ? head.offsetHeight : 0) - (ins ? ins.offsetHeight : 0);
        height = Math.max(200, Math.floor(avail));
      }
      lineChart(canvas, series, { height });
    }
    requestAnimationFrame(drawTrend);

    /* ---------- 模块 3.5：门店对比（核销数 / 实付，TOP5） ---------- */
    let storeDetailBuild = null;
    let redrawStoreRank = null;
    function openStoreDetail(sid) {
      if (S.ov.focus !== 'stores') focusTo('stores');
      if (storeDetailBuild) storeDetailBuild(sid);
    }

    if (!store) {
      const storePanel = panel(t('ov.store.title'), t('ov.store.sub'), DASH_ICONS.summary);
      const storeHead = storePanel.root.querySelector('.dash-panel-head');
      const storeSeg = el('div', 'seg store-seg');
      const storeSegBtns = {};
      [['used', 'ov.store.metric.used'], ['paid', 'ov.store.metric.paid']].forEach((entry) => {
        const v = entry[0], key = entry[1];
        const b = el('button', S.ov.storeMetric === v ? 'on' : '', esc(t(key)));
        b.type = 'button'; b.dataset.metric = v;
        b.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (S.ov.storeMetric === v) return;
          S.ov.storeMetric = v;
          Object.keys(storeSegBtns).forEach((k) => storeSegBtns[k].classList.toggle('on', k === v));
          drawStoreBars();
          if (redrawStoreRank) redrawStoreRank();
        });
        storeSegBtns[v] = b; storeSeg.appendChild(b);
      });
      storeHead.appendChild(storeSeg);
      const sortBtn = el('button', 'icon-tip sort-toggle' + (S.ov.storeSortDir === 1 ? ' asc' : ''));
      sortBtn.type = 'button';
      sortBtn.setAttribute('aria-label', t('ov.sort.toggle'));
      sortBtn.innerHTML = `${DASH_ICONS.sort}<span class="icon-tip-text">${esc(t('ov.sort.toggle'))}</span>`;
      sortBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        S.ov.storeSortDir = -S.ov.storeSortDir;
        sortBtn.classList.toggle('asc', S.ov.storeSortDir === 1);
        drawStoreBars();
        if (redrawStoreRank) redrawStoreRank();
      });
      storeHead.appendChild(sortBtn);
      const storeHost = el('div', 'store-host');
      storeHost.appendChild(storePanel.root);
      const storeDetailHost = el('div', 'store-detail-host');
      storeHost.appendChild(storeDetailHost);
      const storeBody = el('div', 'store-bars');
      storePanel.body.appendChild(storeBody);
      const storeMore = el('button', 'store-more', esc(t('ov.store.more')));
      storeMore.type = 'button';
      storeMore.addEventListener('click', (ev) => { ev.stopPropagation(); focusTo('stores'); });
      storePanel.body.appendChild(storeMore);

      function drawStoreBars() {
        storeBody.innerHTML = '';
        const rows = storeRank(S.ov.storeMetric).slice(0, 5);
        if (!rows.length) {
          storeBody.appendChild(el('div', 'empty', esc(t('ov.store.empty'))));
          storeMore.style.display = 'none';
          return;
        }
        storeMore.style.display = '';
        const mv = S.ov.storeMetric === 'paid' ? 'paid' : 'count';
        const max = rows.reduce((m, r) => Math.max(m, r[mv]), 0) || 1;
        rows.forEach((r) => {
          const b = el('button', 'rate-row store-row');
          b.type = 'button';
          const w = Math.max(2, (r[mv] / max) * 100);
          b.innerHTML = `<span class="rate-name">${esc(r.name)}<small>${esc(r.district || t('ov.store.hk'))} · ${esc(t('ov.store.metric.used'))} ${num(r.count)}</small></span>
            <span class="rate-track"><i class="rate-fill" style="width:${w.toFixed(1)}%"></i></span>
            <b class="rate-val">${esc(S.ov.storeMetric === 'paid' ? money(r.paid) : num(r.count))}</b>`;
          b.addEventListener('click', (ev) => { ev.stopPropagation(); openStoreDetail(r.sid); });
          storeBody.appendChild(b);
        });
      }
      drawStoreBars();

      addMod({
        key: 'stores', title: t('ov.store.title'),
        meta: `${t('ov.store.top')} ${Math.min(5, storeStats.length)} / ${storeStats.length}`,
        icon: DASH_ICONS.summary, node: storeHost, home: storeCol,
        detail: () => { if (!storeDetailBuild) storeDetailBuild = buildStoreDetail(); },
      });

      /** 门店对比详情：全部排名 + 点击任一门店展示该店下钻图表 */
      function buildStoreDetail() {
        const p = panel(t('ov.store.title'), t('ov.store.detail.sub'), DASH_ICONS.summary);
        p.root.classList.add('store-detail-panel');
        storeDetailHost.appendChild(p.root);
        p.body.classList.add('detail-body', 'store-detail-body');

        const top = storeRank(S.ov.storeMetric)[0];
        p.body.appendChild(detailStats([
          { label: t('ov.store.metric.used'), value: num(storeStats.reduce((a, v) => a + v.count, 0)) + ' ' + t('ov.heat.unit') },
          { label: t('ov.store.metric.paid'), value: money(storeStats.reduce((a, v) => a + v.paid, 0)) },
          { label: t('ov.store.count'), value: num(storeStats.length) },
          { label: t('ov.store.topStore'), value: top ? top.name : '—' },
        ]));

        const rankSec = el('div', 'detail-section store-rank-section');
        rankSec.appendChild(el('div', 'detail-section-head', esc(t('ov.store.rank') + ' · ' + t('ov.store.rankHint'))));
        const rankList = el('div', 'detail-bars store-rank-list');
        rankSec.appendChild(rankList);
        p.body.appendChild(rankSec);

        const drill = el('div', 'detail-section store-drill');
        p.body.appendChild(drill);

        // 排名列与下钻列齐平：以下钻实际渲染高度同步排名列表上限，列内滚动看全部门店。
        // 双 rAF 等图表 canvas 绘完再量高；ResizeObserver 兜底捕获后续尺寸变化。
        let syncRankHeight = () => {};
        syncRankHeight = () => {
          const head = rankSec.querySelector('.detail-section-head');
          // 用 offsetHeight 而非 getBoundingClientRect：后者会被聚焦展开时的 scale 动画缩放，量到偏小值
          const h = drill.offsetHeight - (head ? head.offsetHeight : 0);
          if (h > 40) rankList.style.maxHeight = h + 'px';
        };
        if (window.ResizeObserver) new ResizeObserver(syncRankHeight).observe(drill);

        function renderRank() {
          rankList.innerHTML = '';
          const rows = storeRank(S.ov.storeMetric);
          if (!rows.length) { rankList.appendChild(el('div', 'empty', esc(t('ov.store.empty')))); return; }
          const mv = S.ov.storeMetric === 'paid' ? 'paid' : 'count';
          const max = rows.reduce((m, r) => Math.max(m, r[mv]), 0) || 1;
          rows.forEach((r) => {
            const b = el('button', 'detail-bar-row store-rank-row' + (S.ov.drillStore === r.sid ? ' selected' : ''));
            b.type = 'button';
            b.innerHTML = `<span class="db-name">${esc(r.name)}<small>${esc(r.district || t('ov.store.hk'))} · ${esc(t('ov.store.metric.used'))} ${num(r.count)} · ${esc(t('ov.store.metric.paid'))} ${money(r.paid)}</small></span>
              <span class="db-track"><i style="width:${((r[mv] / max) * 100).toFixed(1)}%"></i></span>
              <b>${esc(S.ov.storeMetric === 'paid' ? money(r.paid) : num(r.count))}</b>`;
            b.addEventListener('click', (ev) => { ev.stopPropagation(); selectStore(r.sid); });
            rankList.appendChild(b);
          });
        }
        redrawStoreRank = renderRank;

        function renderDrill(v) {
          drill.innerHTML = '';
          drill.appendChild(el('div', 'detail-section-head', esc(t('ov.store.drill.title', { name: v.name }))));
          drill.appendChild(detailStats([
            { label: t('ov.store.metric.used'), value: num(v.count) + ' ' + t('ov.heat.unit') },
            { label: t('ov.store.metric.paid'), value: money(v.paid) },
            { label: t('ov.store.activeDays'), value: num(v.days.size) + ' ' + t('ov.store.days') },
            { label: t('ov.store.share'), value: pct(v.share) },
          ]));
          const days = Array.from(v.daily.keys()).sort();
          drill.appendChild(detailChart(t('ov.store.dailyUsed'),
            [{ labels: days.map((d) => d.slice(5).replace('-', '/')), data: days.map((d) => v.daily.get(d)), color: '#6B0B0C' }], 200));
          const types = Array.from(v.types, (kv) => ({ name: kv[0], value: kv[1], text: num(kv[1]) + ' ' + t('ov.heat.unit') }))
            .sort((a, b) => b.value - a.value);
          drill.appendChild(detailSection(t('ov.store.typeDist'), detailBars(types)));
          const slots = Array.from(v.slots, (kv) => ({ name: kv[0], value: kv[1], text: num(kv[1]) + ' ' + t('ov.heat.unit') }))
            .sort((a, b) => b.value - a.value);
          drill.appendChild(detailSection(t('ov.store.slotDist'), detailBars(slots)));
          // 图表 canvas 在 rAF 内绘制，等两帧后高度稳定再同步排名列高度
          requestAnimationFrame(() => requestAnimationFrame(syncRankHeight));
        }

        function selectStore(sid) {
          const v = storeStats.find((x) => x.sid === sid);
          if (!v) return;
          S.ov.drillStore = sid;
          renderRank();
          renderDrill(v);
        }

        renderRank();
        const initial = storeStats.find((x) => x.sid === S.ov.drillStore) || storeRank(S.ov.storeMetric)[0];
        if (initial) selectStore(initial.sid);
        return selectStore;
      }
    }

    /* ---------- 模块 4：券种核销率横向条形图（纯 HTML/CSS） ----------
     * 总界面：仅显示核销率 TOP6；
     * 详情页：显示全部券种，并分「全港统一券种」「门店活动券」两列各自排名。 */
    /** 生成一行券种/活动条形（甜甜圈 + 进度条 + 核销率），两处共用 */
    function couponRateRow(x, max, onPick) {
      const b = el('button', 'rate-row coupon-rate');
      b.type = 'button';
      b.style.setProperty('--donut-deg', (Math.min(1, x.rate) * 300).toFixed(1) + 'deg');
      const w = max > 0 ? Math.max(2, (x.rate / max) * 100) : 0;
      b.innerHTML = `<span class="rate-name">${esc(x.name)}<small>${esc(x.sub)}</small></span>
        <span class="rate-track"><i class="rate-fill" style="width:${w.toFixed(1)}%"></i></span>
        <b class="rate-val">${esc(x.text)}</b>`;
      b.title = x.title || '';
      if (typeof onPick === 'function') b.addEventListener('click', (ev) => { ev.stopPropagation(); onPick(); });
      else b.disabled = true;
      return b;
    }
    const couponHost = el('div', 'coupon-host');
    const couponPanel = panel(t('ov.coupon.bar'), t('ov.coupon.bar.sub'), DASH_ICONS.ticket);
    const rateRows = Object.values(metrics.byType)
      .filter((x) => x.issued > 0)
      .sort((a, b) => (b.redeem_rate - a.redeem_rate) || (b.used - a.used));
    const maxRate = rateRows.reduce((m, x) => Math.max(m, x.redeem_rate), 0);
    if (!rateRows.length) {
      couponPanel.body.appendChild(el('div', 'empty', esc(t('ov.coupon.empty'))));
    } else {
      // 数据中心只显示 TOP6
      rateRows.slice(0, 6).forEach((x) => {
        couponPanel.body.appendChild(couponRateRow({
          name: x.name, sub: `${x.discount_label} · ${num(x.used)} ${t('ov.heat.unit')}`,
          rate: x.redeem_rate, text: pct(x.redeem_rate),
          title: `${x.name} · ${t('ov.coupon.picked', { name: x.name })}`,
        }, maxRate, () => {
          S.ov.couponTypes = [x.key];
          render();
          toast(t('ov.coupon.picked', { name: x.name }), 'ok');
        }));
      });
    }
    couponHost.appendChild(couponPanel.root);
    const couponDetailHost = el('div', 'coupon-detail-host');
    couponHost.appendChild(couponDetailHost);

    /* 券种详情：
     * 上方「全部券种排名」= 统一券种 + 门店活动券合并后按核销率统一排名，左右两列；
     * 下方左「全港统一券种」/ 右「门店活动券」两列，列内滚动保证左右对齐。 */
    const unifiedCouponRows = Object.values(metrics.byType)
      .filter((x) => x.issued > 0 && E.COUPON_TYPES[x.key] && E.COUPON_TYPES[x.key].scope === 'all_hk')
      .map((x) => ({
        name: x.name, sub: `${x.discount_label} · ${num(x.used)} ${t('ov.heat.unit')}`,
        rate: x.redeem_rate, text: pct(x.redeem_rate), key: x.key,
        pick: () => {
          S.ov.couponTypes = [x.key]; S.ov.campaignIds = [];
          render();
          toast(t('ov.coupon.picked', { name: x.name }), 'ok');
        },
      }))
      .sort((a, b) => b.rate - a.rate);
    const storeCouponRows = metrics.byCampaign
      .filter((x) => x.issued > 0 && x.coupon_type === 'store_local')
      .map((x) => {
        const rate = x.issued ? x.used / x.issued : 0;
        return {
          name: x.name, sub: `${x.scope_label} · ${num(x.used)}/${num(x.issued)}`,
          rate, text: pct(rate), cid: x.campaign_id,
          pick: () => {
            S.ov.couponTypes = []; S.ov.campaignIds = [x.campaign_id];
            render();
            toast(t('ov.coupon.pickCampaign', { name: x.name }), 'ok');
          },
        };
      })
      .sort((a, b) => b.rate - a.rate);
    // 全部券种合并排名（两类共用行组件与筛选逻辑）
    const allCouponRows = unifiedCouponRows.concat(storeCouponRows).sort((a, b) => b.rate - a.rate);
    const allCouponMax = allCouponRows.reduce((m, x) => Math.max(m, x.rate), 0);

    let couponDetailBuilt = false;
    function buildCouponDetail() {
      if (couponDetailBuilt) return;
      couponDetailBuilt = true;
      const p = panel(t('ov.coupon.bar'), t('ov.coupon.detail.sub'), DASH_ICONS.ticket);
      p.root.classList.add('coupon-detail-panel');
      p.body.classList.add('coupon-detail-body');
      couponDetailHost.appendChild(p.root);

      p.body.appendChild(detailStats([
        { label: t('ov.coupon.detail.unifiedCount'), value: num(unifiedCouponRows.length) },
        { label: t('ov.coupon.detail.storeCount'), value: num(storeCouponRows.length) },
        { label: t('ov.coupon.detail.overall'), value: pct(metrics.redeem_rate) },
        { label: t('ov.coupon.detail.typeCount'), value: num(rateRows.length) },
      ]));

      // 上方：全部券种统一排名（两类合并），左右两列。左列从上到下排满再接右列，序号连续。
      const allRank = el('div', 'coupon-allrank');
      const allHead = el('div', 'coupon-grid-head');
      allHead.innerHTML = `<b>${esc(t('ov.coupon.detail.allRank'))}</b><span>${esc(t('ov.coupon.detail.allRankHint'))}</span>`;
      allRank.appendChild(allHead);
      const allCols = el('div', 'coupon-allrank-cols');
      const half = Math.ceil(allCouponRows.length / 2);
      [allCouponRows.slice(0, half), allCouponRows.slice(half)].forEach((part) => {
        const col = el('div', 'coupon-allrank-col');
        if (!part.length) col.appendChild(el('div', 'empty', esc(t('ov.coupon.empty'))));
        part.forEach((x, i) => {
          const rank = allCouponRows.indexOf(x) + 1;
          col.appendChild(couponRateRow({
            ...x,
            name: `${String(rank).padStart(2, '0')} · ${x.name}`,
          }, allCouponMax, x.pick));
        });
        allCols.appendChild(col);
      });
      allRank.appendChild(allCols);
      p.body.appendChild(allRank);

      // 下方：左「全港统一券种」/ 右「门店活动券」，列内滚动、两列等高对齐
      const grid = el('div', 'coupon-detail-grid');
      function detailCol(title, hint, rows) {
        const c = el('div', 'coupon-detail-col');
        const head = el('div', 'coupon-detail-col-head');
        head.innerHTML = `<b>${esc(title)}</b><span>${esc(hint)}</span>`;
        c.appendChild(head);
        const list = el('div', 'coupon-detail-col-list');
        const mx = rows.reduce((m, x) => Math.max(m, x.rate), 0);
        if (!rows.length) list.appendChild(el('div', 'empty', esc(t('ov.coupon.empty'))));
        else rows.forEach((x) => list.appendChild(couponRateRow(x, mx, x.pick)));
        c.appendChild(list);
        return c;
      }
      grid.appendChild(detailCol(
        t('ov.coupon.detail.unified'), t('ov.coupon.detail.unifiedHint'), unifiedCouponRows));
      grid.appendChild(detailCol(
        t('ov.coupon.detail.store'), t('ov.coupon.detail.storeHint'), storeCouponRows));
      p.body.appendChild(grid);
    }

    addMod({
      key: 'coupon', title: t('ov.coupon.bar'), meta: `${rateRows.length} 个券种`,
      icon: DASH_ICONS.ticket, node: couponHost, home: couponCol,
      detail: () => buildCouponDetail(),
    });

    /* ---------- 模块 5：核销时段热力图 ----------
     * 主视图：跟随顶部日期筛选；区间 ≥7 天只显示最近 7 天，不足 7 天按所选天数逐日显示。
     * 详情页：本周 / 本月快捷键 + 短时间筛选窗口，自选区间查看核销时段分布。 */
    const heatHost = el('div', 'heat-host');
    const heat = el('section', 'dash-panel heat-panel');
    const heatHead = el('div', 'dash-panel-head heat-head');
    heatHead.innerHTML = `<div class="dash-panel-icon">${DASH_ICONS.chart}</div>
      <div class="dash-panel-title">${esc(t('ov.heat.title'))}</div>`;
    heat.appendChild(heatHead);
    const heatBody = el('div', 'dash-panel-body heat-body');
    heat.appendChild(heatBody);
    const heatDetailHost = el('div', 'heat-detail-host');
    heatHost.appendChild(heat);
    heatHost.appendChild(heatDetailHost);
    addMod({
      key: 'heat', title: t('ov.heat.title'), meta: t('ov.heat.sub'),
      icon: DASH_ICONS.chart, node: heatHost, home: heatCol,
      detail: () => buildHeatDetail(),
    });

    /** 把热力网格渲染到指定容器（主视图与详情页共用，数据均来自 scoped） */
    function renderHeatInto(bodyEl, rows, aggregated) {
      bodyEl.innerHTML = '';
      const rowByDate = new Map();
      rows.forEach((r, i) => {
        let d = r.from;
        let guard = 0;
        while (d <= r.to && guard++ < 400) { rowByDate.set(d, i); d = E.utils.addDays(d, 1); }
      });

      const grid = rows.map(() => HEAT_SLOTS.map(() => 0));
      let total = 0;
      scoped.forEach((rd) => {
        const row = rowByDate.get((rd.redeemed_at || '').slice(0, 10));
        if (row == null) return;
        const hour = Number((rd.redeemed_at || '').slice(11, 13));
        const slot = HEAT_SLOTS.findIndex((s) => hour >= s.from && hour < s.to);
        if (slot < 0) return;
        grid[row][slot]++;
        total++;
      });

      const max = grid.reduce((m, r) => Math.max(m, ...r), 0);
      const sorted = [];
      grid.forEach((r, ri) => r.forEach((v, si) => { if (v > 0) sorted.push({ ri, si, v }); }));
      sorted.sort((a, b) => b.v - a.v);
      const peaks = new Set(sorted.slice(0, 2).map((p) => `${p.ri}:${p.si}`));

      const table = el('div', 'heat-table');
      const headRow = el('div', 'heat-row');
      headRow.appendChild(el('div', 'heat-row-label heat-corner', esc(t('ov.heat.date'))));
      const slotHead = el('div', 'heat-grid');
      HEAT_SLOTS.forEach((s) => {
        const full = t(s.labelKey);
        const h = el('div', 'heat-slot', esc(full.split(' ')[0]));
        h.title = full;
        slotHead.appendChild(h);
      });
      headRow.appendChild(slotHead);
      table.appendChild(headRow);

      rows.forEach((r, i) => {
        const rowEl = el('div', 'heat-row');
        rowEl.appendChild(el('div', 'heat-row-label', esc(r.label)));
        const cells = el('div', 'heat-grid');
        HEAT_SLOTS.forEach((s, j) => {
          const v = grid[i][j];
          const ratio = max > 0 ? Math.sqrt(v / max) : 0;
          const cell = el('div', 'heat-cell' + (peaks.has(`${i}:${j}`) ? ' is-peak' : '') + (ratio > .62 ? ' on-dark' : ''));
          cell.style.backgroundColor = heatColor(ratio);
          cell.textContent = String(v);
          cell.title = `${r.label} · ${t(s.labelKey)}：${v} ${t('ov.heat.unit')}`;
          cells.appendChild(cell);
        });
        rowEl.appendChild(cells);
        table.appendChild(rowEl);
      });

      if (!total) bodyEl.appendChild(el('div', 'notice', esc(t('ov.heat.empty'))));
      bodyEl.appendChild(table);
      const foot = el('div', 'heat-foot');
      foot.innerHTML = `<div class="heat-legend"><span>${esc(t('ov.heat.less'))}</span><i class="heat-legend-bar"></i><span>${esc(t('ov.heat.more'))}</span></div>
        <div class="heat-summary"><b>${num(total)}</b> ${esc(t('ov.heat.unit'))}${aggregated ? ' · ' + esc(t('ov.heat.aggregated')) : ''}</div>`;
      bodyEl.appendChild(foot);
    }

    /** 主视图行数规则：筛选区间 ≥7 天取最近 7 天，否则按所选天数 */
    function drawHeat() {
      const from = S.ov.dateFrom, to = S.ov.dateTo;
      const days = daysInclusive(from, to);
      const start = days >= 7 ? E.utils.addDays(to, -6) : from;
      renderHeatInto(heatBody, heatDailyRows(start, to), false);
    }
    drawHeat();

    /* ---------- 热力图详情：本周 / 本月快捷键 + 短时间筛选窗口 ---------- */
    let heatDetailBuilt = false;
    let heatDetailRedraw = null;
    function buildHeatDetail() {
      if (heatDetailBuilt) { if (heatDetailRedraw) heatDetailRedraw(); return; }
      heatDetailBuilt = true;
      const hd = S.ov.heatDetail;
      const p = panel(t('ov.heat.title'), t('ov.heat.detail.sub'), DASH_ICONS.chart);
      p.root.classList.add('heat-detail-panel');
      p.body.classList.add('heat-detail-body');
      heatDetailHost.appendChild(p.root);

      const tool = el('div', 'heat-detail-tool');
      const seg = el('div', 'seg heat-detail-seg');
      const segBtns = {};
      ['week', 'month'].forEach((v) => {
        const b = el('button', '', esc(t('ov.heat.' + v)));
        b.type = 'button';
        b.dataset.view = v;
        b.addEventListener('click', () => {
          hd.view = v;
          const r = detailRange(v);
          hd.from = r.from; hd.to = r.to;
          rp.setValue(r.from, r.to);
          syncSeg();
          drawDetailHeat();
        });
        segBtns[v] = b;
        seg.appendChild(b);
      });
      tool.appendChild(seg);

      const rpWrap = el('div', 'heat-detail-range');
      rpWrap.appendChild(el('span', 'heat-detail-range-label', esc(t('ov.heat.detail.range'))));
      const rp = rangePicker({
        from: hd.from || S.ov.dateFrom, to: hd.to || S.ov.dateTo,
        today: C.DATA_TODAY, minDate: S.ov.dateFrom, maxDate: S.ov.dateTo,
        onChange: (a, b) => {
          if (!a || !b) return;
          hd.view = 'custom'; hd.from = a; hd.to = b;
          syncSeg(); drawDetailHeat();
        },
      });
      rpWrap.appendChild(rp);
      tool.appendChild(rpWrap);
      p.body.appendChild(tool);

      const detailGrid = el('div', 'heat-detail-grid');
      p.body.appendChild(detailGrid);

      function syncSeg() {
        Object.keys(segBtns).forEach((k) => segBtns[k].classList.toggle('on', hd.view === k));
      }
      function detailRange(view) {
        const anchor = S.ov.dateTo;
        if (view === 'week') {
          const mon = mondayOf(anchor);
          return clampToFilter(mon, E.utils.addDays(mon, 6)) || { from: S.ov.dateFrom, to: S.ov.dateTo };
        }
        if (view === 'month') {
          const ym = anchor.slice(0, 7), first = `${ym}-01`;
          const monthEnd = E.utils.iso(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));
          return clampToFilter(first, monthEnd) || { from: S.ov.dateFrom, to: S.ov.dateTo };
        }
        return clampToFilter(hd.from || S.ov.dateFrom, hd.to || S.ov.dateTo) || { from: S.ov.dateFrom, to: S.ov.dateTo };
      }
      function drawDetailHeat() {
        const r = detailRange(hd.view);
        const days = daysInclusive(r.from, r.to);
        const aggregated = days > 14;
        renderHeatInto(detailGrid, aggregated ? heatWeeklyRows(r.from, r.to) : heatDailyRows(r.from, r.to), aggregated);
      }
      heatDetailRedraw = drawDetailHeat;
      const init = detailRange(hd.view);
      hd.from = init.from; hd.to = init.to;
      rp.setValue(init.from, init.to);
      syncSeg();
      drawDetailHeat();
    }

    // 筛选 / 语言切换会重建页面：恢复聚焦模块（无动画，避免闪烁）
    if (S.ov.focus) {
      const keep = S.ov.focus;
      S.ov.focus = null;
      focusTo(keep, true);
    }
  }

  function metric(label, value, foot, alarm, small, tone, icon) {
    const m = el('div', 'metric' + (tone ? ' ' + tone : ''));
    m.innerHTML = `${icon ? `<div class="metric-icon">${icon}</div>` : ''}
      <div class="metric-label">${esc(label)}</div>
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
    const contents = {
      issued: true, claimed: true, used: true,
      claim_rate: true, redeem_rate: true, paid_amount: true,
      detail: true,
    };
    let format = 'xlsx';

    const metricCards = [
      ['issued', '发放数'], ['claimed', '领取数'], ['used', '核销数'],
      ['claim_rate', '领取率'], ['redeem_rate', '核销率'], ['paid_amount', '相关订单实付'],
    ].map(([k, label]) => `<div class="check-card on" data-k="${k}"><span class="check-box">${SVG.check}</span><span>${label}</span></div>`).join('');

    const body = el('div');
    body.innerHTML = `
      <div class="form-item" style="margin-bottom:22px">
        <label>导出范围</label>
        <div class="range-box" id="expRange"></div>
      </div>
      <div class="form-item" style="margin-bottom:22px">
        <label>导出内容</label>
        <div class="export-group-label">数据总览</div>
        <div class="check-cards" id="expContents">${metricCards}</div>
        <div class="export-group-label">逐单数据</div>
        <div class="check-cards detail-cards" id="expDetail">
          <div class="check-card on" data-k="detail"><span class="check-box">${SVG.check}</span><span>逐单核销明细</span></div>
        </div>
      </div>
      <div class="form-item" style="margin-bottom:20px">
        <label>文件格式</label>
        <div class="seg" id="expFormat">
          <button class="on" data-f="xlsx">XLSX</button><button data-f="csv">CSV</button>
        </div>
      </div>
    `;
    const rangeEl = $('#expRange', body);
    rangeEl.textContent = `${scopeLabel} · ${S.ov.couponTypes.length ? S.ov.couponTypes.map((k) => E.COUPON_TYPES[k].name).join('、') : '全部券种 / 活动'} · ${S.ov.dateFrom} — ${S.ov.dateTo}`;

    $$('#expContents .check-card, #expDetail .check-card', body).forEach((c) => {
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
        const sheets = E.buildExport(metrics, S.ov, scopeLabel, picked, format, acc);
        downloadFile(sheets, format, `PCC_营销数据_${S.ov.dateFrom}_${S.ov.dateTo}`);
        E.audit(acc.display_name || acc.name, 'export_data', 'dashboard', `${S.ov.dateFrom}~${S.ov.dateTo}`,
          `导出 ${picked.length} 项内容（${picked.join('、')}）格式 ${format.toUpperCase()}，范围 ${scopeLabel}`,
          '看板导出');
        mo.close();
        toast('导出成功，操作人、时间及筛选范围已写入审计记录', 'ok');
      } catch (err) {
        toast('导出失败：' + err.message, 'err');
      }
    });
  }

  function downloadFile(payload, format, baseName) {
    // 兼容旧的单行表调用；新导出传入 [{ name, rows }]，每个名称对应一个工作表
    const sheets = Array.isArray(payload) && payload.length && Array.isArray(payload[0].rows)
      ? payload : [{ name: '导出数据', rows: payload }];
    let blob, name;
    if (format === 'csv') {
      const rows = sheets.length === 1 ? sheets[0].rows
        : sheets.reduce((all, s) => all.concat([[`【${s.name}】`]], s.rows, [[]]), []);
      const csv = '\ufeff' + rows.map((r) => r.map((c) => {
        const s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',')).join('\r\n');
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      name = baseName + '.csv';
    } else {
      // 生成 SpreadsheetML 2003 XML —— Excel 可直接打开，保留中文与多工作表结构
      const worksheets = sheets.map((s) => {
        const sheetRows = s.rows.map((r, i) => '<Row>' + r.map((c) => {
          const isNum = typeof c === 'number';
          return `<Cell${i === 0 ? ' ss:StyleID="hdr"' : ''}><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(c == null ? '' : c)}</Data></Cell>`;
        }).join('') + '</Row>').join('');
        return `<Worksheet ss:Name="${esc(s.name.slice(0, 31))}"><Table>${sheetRows}</Table></Worksheet>`;
      }).join('');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#FBEEF0" ss:Pattern="Solid"/></Style></Styles>
 ${worksheets}
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
        <h2 class="page-title">${esc(t(store ? 'propose.title' : 'cr.title'))}</h2>
      </div>`;
    const createBtn = el('button', 'btn btn-primary', esc(t(store ? 'dlg.submit' : 'cr.create')));
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
    fStore.innerHTML = `<label>${esc(t(store ? 'dlg.scope.redeem' : 'cr.store.scope'))}</label>`;
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
    const applyWrap = el('div', 'filter-apply-sticky');
    applyWrap.appendChild(applyBtn);
    filterCard.appendChild(applyWrap);
    wrap.appendChild(filterCard);

    /* ---------- 右：人数 + 预览 ---------- */
    const right = el('div', '');

    const countCard = el('div', 'card card-pad');
    const n = S.create.result ? S.create.result.total : null;   // null = 还没应用筛选
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
        <span style="font-size:46px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums">${n === null ? '—' : esc(num(n))}</span>
        <span style="font-size:15px;color:var(--ink-3)">${n === null ? esc(t('cr.not_applied')) : esc(t('cr.person'))}</span>
      </div>`;
    right.appendChild(countCard);

    const prevCard = el('div', 'card');
    prevCard.style.marginTop = '20px';
    const pt = el('div', '');
    pt.style.cssText = 'padding:20px 24px 6px;font-size:17px;font-weight:700';
    pt.textContent = t(store ? 'cr.preview.store' : 'cr.preview');
    prevCard.appendChild(pt);

    if (S.create.applied) {
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
          <label>${esc(t(store ? 'dlg.scope.redeem' : 'dlg.scope'))}</label>
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
    if (store) scopeHint.textContent = t('rule.claim_redeem', { store: E.utils.storeLabel(acc.scope_id) });
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
      const d = {
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
        source: pre.source || (store ? 'store_submit' : 'manual'),
      };
      if (store) d.submit_note = t('dlg.source.store');
      return d;
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
    const mo = modal({ title: t(store ? 'propose.title' : 'dlg.title'), subtitle: `${esc(t('dlg.audience'))}：${esc(audienceText)}`, body, footer: foot });
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
      const route = E.routeApproval(draft, acc);
      mo.close();
      S.create.draftPrefill = null;
      toast(store ? t('dlg.submit.store') : `活动「${camp.name}」已提交审批（${camp.campaign_id}）`, 'ok', store ? 5200 : 3200);
      S.approvalHighlight = store ? null : camp.campaign_id;
      E.audit(who, 'route_approval', 'campaign', camp.campaign_id,
        `活动「${camp.name}」按权限路由至 ${route.target}（${route.approver}）`, '提交后审批路由');
      setHash(store ? 'progress' : 'approval');
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
      </div>`;
    host.appendChild(head);

    /* ---------- 门店版：本店提报 / 本店适用 两个 Tab ---------- */
    if (store) {
      const tabs = el('div', 'tabs');
      const defs = [
        { k: 'submitted', l: t('manage.tab.submitted') },
        { k: 'applicable', l: t('manage.tab.applicable') },
      ];
      defs.forEach((d) => {
        const b = el('button', 'tab' + (S.storeManageTab === d.k ? ' active' : ''), esc(d.l));
        b.type = 'button';
        b.addEventListener('click', () => setHash('manage?tab=' + d.k));
        tabs.appendChild(b);
      });
      host.appendChild(tabs);

      if (S.storeManageTab === 'applicable') {
        const note = el('div', 'notice', esc(t('manage.applicable.note')));
        note.style.marginBottom = '18px';
        host.appendChild(note);
      }

      const list = S.storeManageTab === 'applicable'
        ? DB.campaigns.filter((c) => c.status === 'running' && E.campaignCoversStore(c, myStore))
        : storeSubmitted(acc);

      if (!list.length) { host.appendChild(el('div', 'empty', esc(t('mg.none')))); return; }

      const wrap = el('div', 'camp-list');
      list.forEach((c) => {
        const ct = E.COUPON_TYPES[c.coupon_type];
        const item = el('div', 'camp-item');
        const meta = S.storeManageTab === 'applicable'
          ? `<span>${esc(t('dlg.coupon'))}：${esc(ct.name)} · ${esc(ct.discount_label)}</span>
             <span>${esc(t('dlg.scope.redeem'))}：${esc(E.scopeLabelOf(c))}</span>
             <span>${esc(t('progress.col.status'))}：${esc(E.STATUS.campaign[c.status] || c.status)}</span>`
          : `<span>${esc(t('manage.source'))}：${esc(E.utils.storeLabel(c.store_id || myStore))}</span>
             <span>${esc(t('dlg.scope.redeem'))}：${esc(E.scopeLabelOf(c))}</span>
             <span>${esc(ct.name)} · ${esc(ct.discount_label)}</span>
             <span>${esc(t('ap.submit_date'))}：${esc((c.created_at || '').replace('T', ' '))}</span>`;
        item.innerHTML = `<div class="camp-main">
            <div class="camp-name-row">
              <span class="camp-name">${esc(c.name)}</span>
              ${S.storeManageTab === 'submitted' ? statusChip(c.status) : ''}
              ${c.source === 'store_submit' ? `<span class="chip chip-red">${esc(t('manage.store_submit'))}</span>` : ''}
            </div>
            <div class="camp-meta">${meta}</div>
          </div>
          <div class="camp-right"><button class="btn btn-ghost btn-sm" data-a="detail">${esc(t('mg.detail'))}</button></div>`;
        $('[data-a="detail"]', item).addEventListener('click', () => openCampaignDetail(c));
        wrap.appendChild(item);
      });
      host.appendChild(wrap);
      return;
    }

    /* ---------- 总部版：全部活动按类型分类 ---------- */
    const tabs = el('div', 'tabs');
    const defs = [
      { k: 'all', l: t('mg.tab.all') }, { k: 'auto', l: t('mg.tab.auto') },
      { k: 'theme', l: t('mg.tab.theme') }, { k: 'store', l: t('mg.tab.store') },
    ];
    defs.forEach((d) => {
      const b = el('button', 'tab' + (S.manageTab === d.k ? ' active' : ''), esc(d.l));
      b.type = 'button';
      b.addEventListener('click', () => setHash('manage?tab=' + d.k));
      tabs.appendChild(b);
    });
    const right = el('div', 'tabs-right');
    right.innerHTML = `<span>${esc(t('mg.type_filter'))}</span><span class="t-bold t-red">${esc((defs.find((d) => d.k === S.manageTab) || {}).l || '')}</span>`;
    tabs.appendChild(right);
    host.appendChild(tabs);

    let list = DB.campaigns.slice();
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
      const sourceChip = c.source === 'store_submit'
        ? `<span class="chip chip-red">${esc(t('manage.store_submit'))}</span>`
        : '';

      item.innerHTML = `
        <div class="camp-main">
          <div class="camp-name-row">
            <span class="camp-name">${esc(c.name)}</span>
            ${modeChip}${catChip}${sourceChip}
          </div>
          <div class="camp-meta">
            <span>${esc(t('mg.scope'))}：${esc(E.scopeLabelOf(c))}</span>
            ${c.source === 'store_submit' ? `<span>${esc(t('manage.source'))}：${esc(E.utils.storeLabel(c.store_id))}</span>` : ''}
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
    const acc = account();
    const store = isStore();
    const ct = E.COUPON_TYPES[c.coupon_type];
    const issued = DB.couponInstance.filter((x) => x.campaign_id === c.campaign_id);
    const claimedList = issued.filter((x) => x.claimed_at);
    const usedList = issued.filter((x) => x.redeemed_at);
    const claimed = claimedList.length;
    const used = usedList.length;
    const storeName = E.utils.storeLabel(acc.scope_id || c.store_id || '');

    const resultBlock = `<div class="cd-result">
        <div class="cd-sec"><span class="cd-sec-t">发放结果</span><span class="cd-sec-line"></span></div>
        <div class="metrics metrics-4 cd-metrics" style="margin-bottom:0">
          <button type="button" class="metric cd-metric" data-cd="issued" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">发放 <span class="cd-go">↗</span></div><div class="metric-value small">${esc(num(issued.length))}</div></button>
          <button type="button" class="metric cd-metric" data-cd="claimed" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">领取 <span class="cd-go">↗</span></div><div class="metric-value small">${esc(num(claimed))}</div></button>
          <button type="button" class="metric cd-metric" data-cd="used" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">核销 <span class="cd-go">↗</span></div><div class="metric-value small">${esc(num(used))}</div></button>
          <button type="button" class="metric cd-metric" data-cd="rate" style="min-height:auto;padding:14px 16px">
            <div class="metric-label">核销率 <span class="cd-go">↗</span></div><div class="metric-value small">${esc(issued.length ? pct(used / issued.length) : '0.0%')}</div></button>
        </div>
      </div>`;
    const ruleLines = ct.rules.slice();
    if (store) {
      ruleLines.push(t('rule.claim_all'));
      ruleLines.push(t('rule.redeem_store', { store: storeName }));
    }

    // 信息项改为「卡片网格」：标签在上、值在下，铺满宽弹窗，避免横排中间大片留白
    const infoCard = (k, v, cls = '') => `<div class="cd-info${cls ? ' ' + cls : ''}"><span class="cd-info-k">${esc(k)}</span><div class="cd-info-v">${v}</div></div>`;
    const body = el('div', 'cd-detail');
    body.innerHTML = `
      <div class="cd-sec"><span class="cd-sec-t">活动概览</span><span class="cd-sec-line"></span></div>
      <div class="cd-info-grid">
        ${infoCard('活动编号', `<span class="mono">${esc(c.campaign_id)}</span>`)}
        ${infoCard('券种', esc(ct.name) + ' · ' + esc(ct.discount_label))}
        ${infoCard('触发条件', esc(ct.trigger_label))}
        ${infoCard('有效期', esc(ct.validity_label))}
        ${infoCard('每人次数', esc(ct.per_member_label))}
        ${infoCard('积分同用', esc(ct.stack_label))}
        ${infoCard(t(store ? 'dlg.scope.redeem' : 'mg.scope'), esc(E.scopeLabelOf(c)), c.source === 'store_submit' ? '' : 'cd-info-wide')}
        ${c.source === 'store_submit' ? infoCard(t('manage.source'), esc(E.utils.storeLabel(c.store_id))) : ''}
        ${infoCard('目标人群', esc(c.segment_definition || '—'), 'cd-info-wide')}
        ${infoCard('创建人 / 时间', esc(c.created_by) + ' · ' + esc((c.created_at || '').replace('T', ' ')))}
        ${infoCard('状态', statusChip(c.status))}
      </div>
      ${resultBlock}
      <div class="cd-rules">
        <div class="cd-sec"><span class="cd-sec-t">券规则</span><span class="cd-sec-line"></span></div>
        <ul>${ruleLines.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>`;

    // 门店：本店发券任务记录（只读；只含本店任务，失败可看原因）
    if (store) {
      const myStore = acc.scope_id;
      const jobs = DB.sendJob
        .filter((j) => j.campaign_id === c.campaign_id && (!j.store_id || j.store_id === myStore))
        .slice().reverse();
      const sec = el('div', '');
      sec.style.marginTop = '18px';
      let html = `<div class="cd-sec"><span class="cd-sec-t">${esc(t('cd.store.jobs'))}</span><span class="cd-sec-line"></span>`
        + `<span class="cd-hint">${esc(t('cd.store.jobs.hint'))}</span></div>`;
      if (!jobs.length) {
        html += `<div class="t-small t-muted" style="padding:8px 0">${esc(t('cd.store.jobs.none'))}</div>`;
      } else {
        html += `<div class="table-wrap"><table class="data"><thead><tr>
            <th>${esc(t('sr.col.id'))}</th><th>${esc(t('sr.col.time'))}</th>
            <th>${esc(t('sr.col.result'))}</th><th>${esc(t('cd.store.jobs.ok'))}</th>
            <th>${esc(t('cd.store.jobs.fail'))}</th><th>${esc(t('sr.col.detail'))}</th>
          </tr></thead><tbody>${jobs.slice(0, 6).map((j) => `<tr>
            <td class="mono">${esc(j.job_id)}</td>
            <td class="mono">${esc((j.executed_at || '').replace('T', ' ').slice(5))}</td>
            <td>${j.status === 'failed' ? `<span class="t-red t-bold">${esc(t('sr.result.failed'))}</span>` : esc(t('sr.result.success'))}</td>
            <td>${esc(num(j.success))}</td>
            <td>${esc(num(j.failed))}</td>
            <td><button class="btn-text" data-job="${esc(j.job_id)}">${esc(t('sr.col.detail'))}</button></td>
          </tr>`).join('')}</tbody></table></div>`;
      }
      sec.innerHTML = html;
      Array.prototype.forEach.call(sec.querySelectorAll('[data-job]'), (b) => {
        b.addEventListener('click', () => {
          const j = DB.sendJob.find((x) => x.job_id === b.dataset.job);
          if (j) openJobDrawer(j);
        });
      });
      body.appendChild(sec);
    }

    const foot = el('div', '');
    // 管理层（总部）可停止运行中/已批准的活动，也可重新启用已停止的活动；门店账号不显示
    const canStop = !store && (c.status === 'running' || c.status === 'approved');
    const canStart = !store && c.status === 'stopped';
    if (canStop || canStart) {
      const toStop = canStop;
      const b = el('button', toStop ? 'btn btn-primary' : 'btn btn-ghost',
        esc(t(toStop ? 'mg.stop' : 'mg.start')));
      b.type = 'button';
      b.addEventListener('click', async () => {
        const next = toStop ? 'stopped' : 'running';
        const r = await confirm({
          title: t(toStop ? 'mg.stop' : 'mg.start'),
          message: toStop
            ? `确认停止活动「${c.name}」？`
            : `确认重新启用活动「${c.name}」？`,
          detail: toStop
            ? '停止后系统不再按该活动发券；已发出的券仍可领取与核销，不受影响。'
            : '启用后系统按该活动规则继续发券。',
          okText: toStop ? '确认停止' : '确认启用',
          reasonLabel: '操作原因',
          reasonPlaceholder: '填写停止/启用原因（写入审计记录）',
          reasonRequired: true,
        });
        if (!r) return;
        const res = E.setCampaignStatus(c.campaign_id, next, acc.display_name || acc.name, r.reason, { account: acc });
        if (!res.ok) { toast(res.error, 'err', 4200); return; }
        mo.close();
        toast(toStop ? '活动已停止，不再发券' : '活动已重新启用', 'ok', 3200);
        render();
      });
      foot.appendChild(b);
    }
    const close = el('button', 'btn btn-primary', esc(t('ap.dlg.close')));
    close.type = 'button';
    foot.appendChild(close);
    const mo = modal({ title: c.name, subtitle: `${c.campaign_id} · ${E.scopeLabelOf(c)}`, body, footer: foot });
    const baseClose = mo.close;
    mo.close = () => { S.cdEscapeBack = null; baseClose(); };
    close.addEventListener('click', mo.close);

    // 「发放结果」四张卡：点击后在弹窗内原位下钻，不跳页、不改 hash；
    // 返回按钮 / Esc 先退回结果卡片，再按 Esc 才关闭弹窗，绝不会跳走后回不来。
    const drillCtx = { c, issued, claimedList, usedList };
    const backToResult = () => {
      S.cdEscapeBack = null;
      mo.body.replaceChildren(body);
      mo.body.scrollTop = 0;
    };
    body.querySelectorAll('.cd-metric').forEach((btn) => {
      btn.addEventListener('click', () => {
        const detail = buildCampaignDrill(btn.dataset.cd, drillCtx);
        detail.querySelector('.cd-back').addEventListener('click', backToResult);
        S.cdEscapeBack = backToResult;
        mo.body.replaceChildren(detail);
        mo.body.scrollTop = 0;
      });
    });

    // 活动详情 → 对应角色的审批页；总部额外提供发送记录直达
    const goAp = el('button', 'btn btn-ghost', store ? t('nav.approval.store') : '查看审批记录');
    goAp.type = 'button';
    goAp.addEventListener('click', () => {
      mo.close();
      S.approvalTab = 'all';
      setHash(store ? 'progress' : 'approval');
    });
    foot.insertBefore(goAp, close);
    if (!store) {
      const goSr = el('button', 'btn btn-ghost', '查看发送记录');
      goSr.type = 'button';
      goSr.addEventListener('click', () => {
        mo.close();
        S.records.mode = ''; S.records.result = ''; S.records.campaignId = c.campaign_id;
        setHash('records');
      });
      foot.insertBefore(goSr, close);
    }

    // 门店：撤回自己尚在待审批的提报（服务端只允许本店 + pending）
    if (store && c.status === 'pending' && c.store_id === acc.scope_id) {
      const wd = el('button', 'btn btn-ghost', esc(t('cd.withdraw')));
      wd.type = 'button';
      wd.addEventListener('click', async () => {
        const r = await confirm({
          title: t('cd.withdraw'),
          message: t('cd.withdraw.confirm', { name: c.name }),
          detail: t('cd.withdraw.detail'),
          okText: t('cd.withdraw'),
          reasonLabel: t('cd.withdraw.reason'),
          reasonPlaceholder: t('cd.withdraw.reason.ph'),
          reasonRequired: true,
        });
        if (!r) return;
        const res = E.withdrawCampaign(c.campaign_id, acc.display_name || acc.name, r.reason, { account: acc });
        if (!res.ok) { toast(res.error, 'err', 4200); return; }
        mo.close();
        toast(t('cd.withdraw.ok'), 'ok', 3200);
        render();
      });
      foot.insertBefore(wd, close);
    }
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
      </div>`;
    host.appendChild(head);

    // 刚提交的活动：顶部提示条 + 列表高亮
    if (S.approvalHighlight) {
      const hl = DB.campaigns.find((x) => x.campaign_id === S.approvalHighlight);
      const bar = el('div', 'notice');
      bar.style.marginBottom = '16px';
      bar.innerHTML = `<span>刚提交的活动「${esc(hl ? hl.name : S.approvalHighlight)}」（${esc(S.approvalHighlight)}）已进入待审批，下方已高亮。</span>
        <button class="btn btn-ghost btn-sm" data-x="clear" style="margin-left:12px">知道了</button>`;
      bar.querySelector('[data-x="clear"]').addEventListener('click', () => {
        S.approvalHighlight = null; render();
      });
      host.appendChild(bar);
    }

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
        // 刚提交的活动高亮，避免用户跳过来后不知道哪条是新的
        if (S.approvalHighlight === c.campaign_id) item.classList.add('camp-item-new');
        const modeChip = c.mode === 'auto'
          ? `<span class="chip chip-red">${esc(t('mg.tab.auto'))}</span>`
          : `<span class="chip chip-grey">${esc(t('sr.mode.manual'))}</span>`;
        const sourceChip = c.source === 'store_submit'
          ? `<span class="chip chip-red">${esc(t('manage.store_submit'))}</span>` : '';
        item.innerHTML = `
          <div class="camp-main">
            <div class="camp-name-row">
              <span class="camp-name">${esc(c.name)}</span>
              ${statusChip(c.status)}
              ${modeChip}${sourceChip}
            </div>
            <div class="camp-meta">
              <span>${esc(t('ap.submitter'))}：${esc(log.by || c.created_by)}</span>
              ${c.source === 'store_submit' ? `<span>${esc(t('manage.source'))}：${esc(E.utils.storeLabel(c.store_id))}</span>` : ''}
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
    }
  }

  function openApprovalDialog(c, log) {
    const acc = account();
    const ct = E.COUPON_TYPES[c.coupon_type];
    const editable = c.status === 'pending' && acc.can_approve;
    const scopeLabelText = c.source === 'store_submit' ? t('dlg.scope.redeem') : t('mg.scope');
    const body = el('div');
    body.innerHTML = `
      <div class="dl-row"><span class="k">活动编号</span><span class="v mono">${esc(c.campaign_id)}</span></div>
      <div class="dl-row"><span class="k">券种 / 折扣</span><span class="v">${esc(ct.name)} · ${esc(ct.discount_label)}</span></div>
      <div class="dl-row"><span class="k">活动类型</span><span class="v">${esc(c.mode === 'auto' ? t('mg.tab.auto') : t('sr.mode.manual'))}</span></div>
      <div class="dl-row"><span class="k">${esc(scopeLabelText)}</span><span class="v">${esc(E.scopeLabelOf(c))}</span></div>
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

      // 批准是高影响动作：先给出影响摘要并二次确认，避免误批导致持续发券
      if (approve) {
        const modeText = c.mode === 'auto' ? t('mg.tab.auto') : t('sr.mode.manual');
        const effText = c.mode === 'auto'
          ? '批准后将按规则自动持续发券，已发出的券不受影响。'
          : '批准后由总部统一发放并进入运行中；全港会员可领取，核销按活动的核销范围统计。';
        const confirmed = await global.UI.confirm({
          title: '批准活动',
          message: `确认批准「${c.name}」？`,
          detail: `<div class="ap-impact">
            <div class="ap-impact-row"><span>目标会员</span><b>${c.audience_size ? num(c.audience_size) + ' 人' : '按筛选人群动态确定'}</b></div>
            <div class="ap-impact-row"><span>券种 / 折扣</span><b>${esc(ct.name)} · ${esc(ct.discount_label)}</b></div>
            <div class="ap-impact-row"><span>适用范围</span><b>${esc(E.scopeLabelOf(c))}</b></div>
            <div class="ap-impact-row"><span>执行方式</span><b>${esc(modeText)}</b></div>
          </div>
          <div class="ap-impact-note">${esc(effText)} 可随时在活动管理中停用。</div>`,
          okText: '确认批准', cancelText: '返回', tone: 'warn',
        });
        if (!confirmed) return;
      }

      const r = approve
        ? E.approveCampaign(c.campaign_id, who, cmt)
        : E.rejectCampaign(c.campaign_id, who, cmt);
      if (!r.ok) { toast(r.error, 'err'); return; }
      // 批准即进入总部统一发放：手批活动由「已批准」转为运行中，
      // 门店审批进度与本店适用列表因此能立即反映结果（状态仍由引擎写入）。
      if (approve && r.campaign && r.campaign.status === 'approved') {
        E.setCampaignStatus(c.campaign_id, 'running', who, '批准后由总部统一发放', { account: acc });
        E.audit(who, 'distribute_campaign', 'campaign', c.campaign_id,
          `批准「${c.name}」后由总部统一发放，活动进入运行中`, cmt || '审批后统一发放');
      }
      mo.close();
      toast(approve ? `已批准「${c.name}」` : `已驳回「${c.name}」`, approve ? 'ok' : 'warn');
      render();
    }
    if (app) app.addEventListener('click', () => decide(true));
    if (rej) rej.addEventListener('click', () => decide(false));
  }

  /* ================================================================
   * 门店只读页面 —— 审批进度 / 本店信息
   * ==============================================================*/
  function storeSubmitted(acc) {
    const who = acc.display_name || acc.name;
    return DB.campaigns.filter((c) => c.source === 'store_submit' &&
      (c.created_by === who || c.owner === who));
  }

  function renderProgress(host) {
    const acc = account();
    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('progress.title'))}</h2>
      </div>`;
    host.appendChild(head);

    const list = storeSubmitted(acc);
    if (!list.length) { host.appendChild(el('div', 'empty', esc(t('progress.empty')))); return; }

    const wrap = el('div', 'camp-list');
    list.forEach((c) => {
      const log = DB.approvalLog.filter((l) => l.campaign_id === c.campaign_id).slice(-1)[0] || {};
      const item = el('div', 'camp-item');
      item.innerHTML = `<div class="camp-main">
          <div class="camp-name-row"><span class="camp-name">${esc(c.name)}</span>${statusChip(c.status)}
            <span class="chip chip-red">${esc(t('manage.store_submit'))}</span></div>
          <div class="camp-meta">
            <span>${esc(E.COUPON_TYPES[c.coupon_type].name)} · ${esc(E.COUPON_TYPES[c.coupon_type].discount_label)}</span>
            <span>${esc(t('dlg.scope.redeem'))}：${esc(E.scopeLabelOf(c))}</span>
            <span>${esc(t('progress.col.approver'))}：${esc(log.approver || '—')}</span>
            <span>${esc(t('progress.col.date'))}：${esc(log.approval_date && log.approval_date !== '—' ? log.approval_date.replace('T', ' ') : '—')}</span>
            <span>${esc(t('progress.col.comment'))}：${esc(log.comment || '—')}</span>
          </div>
        </div>
        <div class="camp-right"><button class="btn btn-ghost btn-sm" data-a="detail">${esc(t('ap.detail'))}</button></div>`;
      $('[data-a="detail"]', item).addEventListener('click', () => openApprovalDialog(c, log));
      wrap.appendChild(item);
    });
    host.appendChild(wrap);
  }

  function renderStoreInfo(host) {
    const acc = account();
    const storeName = E.utils.storeLabel(acc.scope_id);
    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('storeinfo.title'))}</h2>
      </div>`;
    host.appendChild(head);

    const card = el('div', 'card card-pad');
    const floor = E.HQ_POLICY.store_discount_floor;
    const couponNames = E.HQ_POLICY.store_allowed_coupon_types
      .map((k) => E.COUPON_TYPES[k] && E.COUPON_TYPES[k].name).filter(Boolean).join('、');
    card.innerHTML = `
      <div class="dl-row"><span class="k">${esc(t('storeinfo.name'))}</span><span class="v">${esc(storeName)}</span></div>
      <div class="dl-row"><span class="k">${esc(t('storeinfo.code'))}</span><span class="v mono">${esc(acc.scope_id)}</span></div>
      <div class="dl-row"><span class="k">${esc(t('storeinfo.scope'))}</span><span class="v">${esc(storeName)} · ${esc(t('ov.fixed'))}</span></div>
      <div class="dl-row"><span class="k">${esc(t('storeinfo.coupons'))}</span><span class="v">${esc(couponNames)}</span></div>
      <div class="dl-row"><span class="k">${esc(t('storeinfo.discount'))}</span><span class="v">${(floor * 10).toFixed(1).replace('.0', '')} 折</span></div>
      <div class="dl-row"><span class="k">${esc(t('storeinfo.approval'))}</span><span class="v">${E.HQ_POLICY.store_require_approval ? esc(t('dlg.source.store')) : '—'}</span></div>
      <div class="notice grey" style="margin-top:20px">${esc(t('storeinfo.readonly'))}</div>`;
    host.appendChild(card);
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

    // 筛选即时生效，无需「查询」按钮；改为如实的结果计数提示
    const resultCount = el('div', 'filter-result-count');
    row.appendChild(resultCount);
    host.appendChild(bar);

    // 指标
    const jobs = filteredJobs();
    resultCount.innerHTML = `共 <b>${num(jobs.length)}</b> 条记录 · 筛选即时生效`;
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
    tt.innerHTML = `<span style="font-size:17px;font-weight:700">${esc(t('sr.detail.title'))}</span>`;
    card.appendChild(tt);

    if (!jobs.length) {
      card.appendChild(el('div', 'empty', esc(t('sr.none'))));
    } else {
      const tw = el('div', 'table-wrap');
      const table = el('table', 'data');
      // 表头可排序（点击切换升/降序，默认按时间倒序）
      const cols = [
        { k: 'id', l: t('sr.col.id') },
        { k: 'campaign', l: t('sr.col.campaign') },
        { k: 'mode', l: t('sr.col.mode') },
        { k: 'source', l: t('sr.col.source') },
        { k: 'time', l: t('sr.col.time') },
        { k: 'result', l: t('sr.col.result') },
        { k: '', l: t('sr.col.detail') },
      ];
      table.innerHTML = `<thead><tr>${cols.map((c) => {
        if (!c.k) return `<th>${esc(c.l)}</th>`;
        const on = S.records.sortBy === c.k;
        const arrow = on ? (S.records.sortDir === 1 ? ' ↑' : ' ↓') : '';
        return `<th class="sortable" data-sort="${c.k}" aria-sort="${on ? (S.records.sortDir === 1 ? 'ascending' : 'descending') : 'none'}">`
          + `${esc(c.l)}<span class="sort-ind">${arrow}</span></th>`;
      }).join('')}</tr></thead><tbody></tbody>`;
      $$('th.sortable', table).forEach((th) => {
        th.addEventListener('click', () => {
          const k = th.dataset.sort;
          if (S.records.sortBy === k) S.records.sortDir = -S.records.sortDir;
          else { S.records.sortBy = k; S.records.sortDir = 1; }
          render();
        });
      });
      const tb = $('tbody', table);
      const sk = S.records.sortBy;
      const dir = S.records.sortDir;
      const val = (j) => {
        if (sk === 'time') return j.executed_at || j.created_at || '';
        if (sk === 'result') return j.status || '';
        return String(j[sk === 'campaign' ? 'campaign_id' : sk] || '');
      };
      jobs.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        return x < y ? -dir : x > y ? dir : 0;
      }).forEach((j) => {
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
        ${isFailed ? `<div style="margin-top:12px;font-size:13px;color:var(--ink-3)">${esc(t('sr.drawer.not_retried'))}</div>` : ''}
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
  /* ================================================================
   * 页面 8 —— 操作审计日志（仅总部账号管理员，只读）
   * 数据来自 DB.auditLog（审批、启停、导出、账号变更、AI 守门等均会写入）
   * ==============================================================*/
  function renderAudit(host) {
    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('audit.title'))}</h2>
      </div>`;
    const tag = el('div', '');
    tag.innerHTML = `<span class="chip chip-grey">${esc(t('audit.readonly'))}</span>`;
    head.appendChild(tag);
    host.appendChild(head);

    const rows = DB.auditLog.slice().reverse();
    const card = el('div', 'card');
    if (!rows.length) {
      card.appendChild(el('div', 'empty', esc(t('audit.empty'))));
    } else {
      const tw = el('div', 'table-wrap');
      const table = el('table', 'data');
      table.innerHTML = `<thead><tr>
          <th>${esc(t('audit.col.time'))}</th><th>${esc(t('audit.col.actor'))}</th>
          <th>${esc(t('audit.col.action'))}</th><th>${esc(t('audit.col.object'))}</th>
          <th>${esc(t('audit.col.detail'))}</th><th>${esc(t('audit.col.reason'))}</th>
        </tr></thead><tbody>${rows.slice(0, 120).map((a) => `<tr>
          <td class="mono">${esc((a.at || '').replace('T', ' '))}</td>
          <td>${esc(a.actor)}</td>
          <td class="mono">${esc(a.action)}</td>
          <td class="mono">${esc(a.object_type)}·${esc(a.object_id)}</td>
          <td>${esc(a.detail || '—')}</td>
          <td class="t-muted">${esc(a.reason || '—')}</td>
        </tr>`).join('')}</tbody>`;
      tw.appendChild(table);
      card.appendChild(tw);
    }
    host.appendChild(card);

    const note = el('div', 't-small t-muted');
    note.style.marginTop = '12px';
    note.textContent = t('audit.foot', { n: rows.length });
    host.appendChild(note);
  }

  function renderSettings(host) {
    const acc = account();
    const canManage = acc.can_manage_accounts;

    const head = el('div', 'page-head');
    head.innerHTML = `<div>
        <h2 class="page-title">${esc(t('st.title'))}</h2>
      </div>`;
    host.appendChild(head);

    if (S.settings.denied) {
      const d = el('div', 'denied');
      d.innerHTML = `<span class="ico">${SVG.warn}</span><div>${esc(t('st.denied'))}</div>`;
      host.appendChild(d);
    }

    // 规则优先级（老师反馈第 5 条；工作台可配置项）
    const ladder = E.priorityLadder();
    const prCard = el('div', 'card card-pad');
    prCard.style.marginBottom = '24px';
    prCard.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-size:17px;font-weight:700">规则优先级</div>
      </div>
      <div class="prio-head">
        <span>级别</span><span>运行中规则</span><span>券种</span><span>适用范围</span><span>编号</span>
      </div>
      ${ladder.map((r) => `<div class="prio-row">
        <span class="prio-level">L${r.level}</span>
        <span class="prio-name">${esc(r.name)}</span>
        <span class="prio-type">${esc(r.coupon_name)}</span>
        <span class="prio-scope">${esc(r.scope)}</span>
        <span class="prio-id mono">${esc(r.campaign_id)}</span>
      </div>`).join('') || '<div class="t-small t-muted" style="padding:12px 0">当前没有运行中的规则。</div>'}`;
    host.appendChild(prCard);

    // 界面语言
    const langCard = el('div', 'card card-pad');
    langCard.style.marginBottom = '24px';
    const lr = el('div', '');
    lr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:22px;flex-wrap:wrap';
    lr.innerHTML = `<div>
        <div style="font-size:17px;font-weight:700;margin-bottom:6px">${esc(t('st.lang'))}</div>
      </div>`;
    const lsel = el('div', 'field');
    lsel.style.minWidth = '230px';
    const ss = singleSelect({
      options: C.LOCALES.map((l) => ({ v: l.key, label: l.label })),
      value: S.locale, onChange: (v) => { S.locale = v; render(); toast('界面语言已切换', 'ok'); },
    });
    lsel.appendChild(ss);
    lr.appendChild(lsel);
    langCard.appendChild(lr);
    host.appendChild(langCard);

    // 门店账号
    const secHead = el('div', '');
    secHead.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:16px;flex-wrap:wrap';
    secHead.innerHTML = `<div>
        <div style="font-size:17px;font-weight:700;margin-bottom:5px">${esc(t('st.accounts'))}</div>
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
   * AI 活动助手 · 可拖拽液态玻璃浮窗
   * 顶部拖动，可放到任意位置；折叠后缩成小窗，不挡数据。
   * ==============================================================*/
  const AI_POS_KEY = 'pcc_ai_float_pos';
  function moveAIFloat(d, x, y) {
    const r = d.getBoundingClientRect();
    const p = clampAIXY(x, y, r.width, r.height);
    d.style.left = p.x + 'px';
    d.style.top = p.y + 'px';
    d.style.right = 'auto'; d.style.bottom = 'auto';
  }
  function aiTargetSize(enlarged) {
    return enlarged
      ? { w: Math.min(816, Math.max(280, window.innerWidth - 48)), h: Math.min(1180, Math.max(240, window.innerHeight - 48)) }
      : { w: Math.min(408, Math.max(280, window.innerWidth - 32)), h: Math.min(620, Math.max(240, window.innerHeight - 48)) };
  }
  function clampAIXY(x, y, w, h) {
    return {
      x: Math.round(Math.max(8, Math.min(x, Math.max(8, window.innerWidth - w - 8)))),
      y: Math.round(Math.max(8, Math.min(y, Math.max(8, window.innerHeight - h - 8)))),
    };
  }
  function persistAIPos(x, y) {
    S.ai.pos = { x: Math.round(x), y: Math.round(y) };
    try { localStorage.setItem(AI_POS_KEY, JSON.stringify(S.ai.pos)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function setAIPosition(d, x, y, instant) {
    if (instant) d.classList.add('ai-no-anim');
    d.style.left = Math.round(x) + 'px';
    d.style.top = Math.round(y) + 'px';
    d.style.right = 'auto'; d.style.bottom = 'auto';
    if (instant) { void d.offsetWidth; d.classList.remove('ai-no-anim'); }
  }
  function lockAIHeight(d, h) {
    d.classList.add('ai-no-anim');
    d.style.height = Math.round(h) + 'px';
    void d.offsetWidth;
    d.classList.remove('ai-no-anim');
  }
  function releaseAIHeight(d) {
    clearTimeout(d._aiHeightTimer);
    d._aiHeightTimer = setTimeout(() => { d.style.height = ''; }, 480);
  }
  function saveAIFloat(d) {
    const r = d.getBoundingClientRect();
    S.ai.pos = { x: Math.round(r.left), y: Math.round(r.top) };
    try { localStorage.setItem(AI_POS_KEY, JSON.stringify(S.ai.pos)); } catch (e) { /* 隐私模式忽略 */ }
  }
  /** 点击检索框打开时，把浮窗锚定到检索框正下方（右缘对齐），随后仍可自由拖动 */
  function anchorAIBelowSearch(d) {
    const s = $('#aiSearch');
    if (!s || !d) return;
    const sr = s.getBoundingClientRect();
    const w = d.offsetWidth || 408;
    moveAIFloat(d, sr.right - w, sr.bottom + 10);
  }
  function initAIFloat() {
    const d = $('#aiDrawer');
    if (!d || d.dataset.floatReady) return;
    d.dataset.floatReady = '1';
    try {
      const saved = JSON.parse(localStorage.getItem(AI_POS_KEY) || 'null');
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        S.ai.pos = saved;
        d.style.left = saved.x + 'px'; d.style.top = saved.y + 'px';
        d.style.right = 'auto'; d.style.bottom = 'auto';
      }
    } catch (e) { /* 忽略损坏的本地记录 */ }

    let dragging = false, offX = 0, offY = 0;
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (!e.target.closest('.ai-head') || e.target.closest('button, input, a')) return;
      const r = d.getBoundingClientRect();
      dragging = true;
      offX = e.clientX - r.left; offY = e.clientY - r.top;
      d.setPointerCapture(e.pointerId);
      d.classList.add('dragging');
      e.preventDefault();
    });
    d.addEventListener('pointermove', (e) => {
      if (dragging) moveAIFloat(d, e.clientX - offX, e.clientY - offY);
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false; d.classList.remove('dragging');
      S.ai.userMoved = true;   // 用户手动拖过：后续打开沿用该位置，不再自动锚定到检索框下方
      saveAIFloat(d);
    };
    d.addEventListener('pointerup', stop);
    d.addEventListener('pointercancel', stop);
    window.addEventListener('resize', () => {
      if (!S.ai.open) return;
      const r = d.getBoundingClientRect();
      if (r.width < 50 || r.height < 40) return;   // 过渡态尺寸不参与重算
      moveAIFloat(d, r.left, r.top);
    });
  }

  function toggleAI(open) {
    S.ai.open = open;
    const d = $('#aiDrawer');
    if (open && d) {
      // 每次从检索框重新打开：清掉拖动与放大记忆，固定锚到检索框下方后重新滑出
      S.ai.enlarged = false;
      S.ai.userMoved = false;
      S.ai.pos = null;
      S.ai.restore = null;
      d.classList.remove('enlarged');
      clearTimeout(d._aiHeightTimer);
      d.style.height = '';
      try { localStorage.removeItem(AI_POS_KEY); } catch (e) { /* 隐私模式忽略 */ }
      d.classList.add('ai-no-anim');
      anchorAIBelowSearch(d);
      void d.offsetWidth;
      d.classList.remove('ai-no-anim');
    }
    renderAI();
  }

  function renderAI() {
    const d = $('#aiDrawer');
    const aiSearch = $('#aiSearch');
    if (!d) return;
    d.classList.toggle('open', S.ai.open);
    d.classList.toggle('enlarged', !!S.ai.enlarged && S.ai.open);
    // 已有模态窗口打开时禁用顶部搜索入口
    const modalOpen = !!document.querySelector('.overlay');
    if (aiSearch) aiSearch.disabled = modalOpen;
    if (!S.ai.open) { d.innerHTML = ''; return; }

    const acc = account();
    const caps = AI.availableCapabilities(S.page, acc);

    d.innerHTML = `
      <div class="ai-head" id="aiDragHead">
        <span class="ai-grip" title="拖动以移动浮窗">⠿</span>
        <div class="ai-head-logo">${global.UI.pccLogo(38)}</div>
        <div style="flex:1;min-width:0">
          <h2>${esc(t('ai.title'))}</h2>
        </div>
        <button class="ai-min" id="aiMin" title="${esc(t('ai.enlarge'))}">${S.ai.enlarged ? DASH_ICONS.collapse : DASH_ICONS.expand}</button>
        <button class="modal-close" id="aiClose">${SVG.close}</button>
      </div>
      <div class="ai-body" id="aiBody"></div>
      <div class="ai-foot">
        <div class="ai-input-row">
          <input class="ai-input" id="aiInput" placeholder="${esc(t('ai.placeholder'))}" value="${esc(S.ai.lastInput)}">
          <button class="btn btn-primary" id="aiSend" style="padding:0 22px">${esc(t('ai.send'))}</button>
        </div>
      </div>`;

    $('#aiClose', d).addEventListener('click', () => toggleAI(false));
    $('#aiMin', d).addEventListener('click', () => {
      const cur = d.getBoundingClientRect();
      if (!S.ai.enlarged) {
        const target = aiTargetSize(true);
        // 记住放大前的几何，之后无论拖到哪里都沿原路还原
        S.ai.restore = { x: Math.round(cur.left), y: Math.round(cur.top), w: cur.width, h: cur.height };
        // 先锁住当前实际高度，避免 auto → max-height 时从 620px 起跳
        lockAIHeight(d, cur.height);
        // 上边缘不动，以中心向两侧展开，高度向下延伸
        const x = cur.left + (cur.width - target.w) / 2;
        const pos = clampAIXY(x, cur.top, target.w, target.h);
        S.ai.enlarged = true;
        setAIPosition(d, pos.x, pos.y, false);
        renderAI();
        d.style.height = Math.round(target.h) + 'px';
        persistAIPos(pos.x, pos.y);
        releaseAIHeight(d);
      } else {
        const back = S.ai.restore || (() => {
          const s = aiTargetSize(false);
          const p = clampAIXY(cur.left, cur.top, s.w, s.h);
          return { x: p.x, y: p.y, w: s.w, h: s.h };
        })();
        const pos = clampAIXY(back.x, back.y, back.w, back.h);
        lockAIHeight(d, cur.height);
        S.ai.enlarged = false;
        setAIPosition(d, pos.x, pos.y, false);
        renderAI();
        d.style.height = Math.round(back.h) + 'px';
        persistAIPos(pos.x, pos.y);
        S.ai.restore = null;
        releaseAIHeight(d);
      }
      const b = $('#aiBody', d);
      if (b) b.scrollTop = b.scrollHeight;
    });

    const body = $('#aiBody', d);
    const enabledCaps = caps.filter((c) => c.enabled).map((c) => c.key);

    // 用户可能想问的问题（直接提问，不再展示不可用的能力入口）
    if (enabledCaps.length && S.ai.state === 'idle') {
      const qa = el('div', 'quick-asks');
      askSuggestions(acc, enabledCaps).forEach((a) => {
        const b = el('button', 'quick-ask', esc(a.label));
        b.title = a.text;
        b.addEventListener('click', () => sendAI(a.text, a.action));
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
      b.addEventListener('click', () => sendAI(S.ai.lastSent || S.ai.lastInput));
      body.appendChild(b);
    }

    const send = $('#aiSend', d);
    const input = $('#aiInput', d);
    if (send) send.addEventListener('click', () => sendAI(input.value));
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAI(input.value); });
    // 首次打开停在问题区；有对话后跟随最新消息
    body.scrollTop = (S.ai.state === 'idle' && S.ai.history.length <= 1) ? 0 : body.scrollHeight;
  }

  function askSuggestions(acc, enabled) {
    const has = (k) => enabled.includes(k);
    const store = acc.scope_type === 'store';
    const page = ({ propose: 'create', progress: 'approval', 'store-info': 'settings' })[S.page] || S.page;
    let pool = [];

    if (page === 'create') {
      pool = store
        ? [
            { label: '本店 8.5 折回流活动，权限允许吗？', text: '本店做 8.5 折回流活动，权限上允许吗？', action: 'permission' },
            { label: '本店这批券预计能核销多少？', text: '按本店当前活动配置，预计能核销多少张券？', action: 'predict' },
            { label: '把总部活动改成本店周末专场', text: '把总部回流活动改成太古城店周末买一送一，发给附近会员。', action: 'localize' },
          ]
        : [
            { label: '回流券用 8 折合适吗？', text: '回流券用 8 折合适吗？给我一个折扣建议。', action: 'value' },
            { label: '这批券预计能核销多少？', text: '按当前活动配置，预计能核销多少张券？', action: 'predict' },
            { label: '帮我写一段生日券短信文案', text: '帮我写一段生日券会员短信文案。', action: 'copy' },
          ];
    } else if (page === 'records') {
      pool = [
        { label: '最近一次为什么没发出去？', text: '最近一次发送失败是什么原因？', action: 'explain' },
        { label: 'R-1003 为什么失败？', text: 'R-1003 为什么失败？引用原始记录说明。', action: 'explain' },
        { label: '这次拦截影响了多少会员？', text: '这次拦截影响了多少会员？原因是什么？', action: 'explain' },
      ];
    } else if (page === 'manage') {
      pool = [
        { label: '我这个账号能启停哪些规则？', text: '检查当前账号可启停的自动规则范围。', action: 'permission' },
        { label: '当前账号能修改哪些活动设置？', text: '检查当前账号可修改的活动设置范围。', action: 'permission' },
        { label: '帮我写一段核销提醒文案', text: '帮我写一段提醒会员尽快核销的短信文案。', action: 'copy' },
      ];
    } else {
      pool = [
        { label: '回流券用 8 折合适吗？', text: '回流券用 8 折合适吗？给我一个折扣建议。', action: 'value' },
        { label: '这批券预计能核销多少？', text: '按当前活动配置，预计能核销多少张券？', action: 'predict' },
        { label: '最近一次为什么没发出去？', text: '最近一次发送失败是什么原因？', action: 'explain' },
      ];
    }
    return pool.filter((a) => has(a.action)).slice(0, 3);
  }

  function inferAIAction(text, enabled, acc) {
    const t = String(text || '');
    const has = (k) => enabled.includes(k);
    if (/为什么|为何|原因|失败|拦截|没发|未发送|没收到|收不到/.test(t) && has('explain')) return 'explain';
    if (/面额|几折|折扣|优惠力度|定价|合适吗/.test(t) && has('value')) return 'value';
    if (/预计|预测|估计|能核销|核销多少|会有多少/.test(t) && has('predict')) return 'predict';
    if (/文案|短信|标题|话术|怎么写/.test(t) && has('copy')) return 'copy';
    if (acc.scope_type === 'store' && /本地|本店|改成|周末|门店/.test(t) && has('localize')) return 'localize';
    if (/权限|允许|范围|启停|能修改|能创建|可以.*吗/.test(t) && has('permission')) return 'permission';
    return 'draft';
  }

  function renderMsg(h, drawer) {
    const wrap = el('div', 'msg ' + (h.role === 'user' ? 'user' : 'ai'));
    if (h.role === 'user') {
      wrap.innerHTML = `<div class="msg-bubble">${esc(h.text)}</div>`;
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
      const card = el('div', 'ai-card ai-plain');
      // 先用一句大白话讲清结果，用户扫一眼就懂
      card.innerHTML = `<h4>${esc(h.title || t('ai.explain.title'))}</h4>`
        + (h.headline ? `<div class="ai-headline">${esc(h.headline)}</div>` : '')
        + h.lines.map((l) => `<div class="ai-plain-line">${esc(l)}</div>`).join('');
      // 原始记录不再一上来铺一大段：折叠收起，想核对时再点开
      if (h.evidence && h.evidence.length) {
        const det = el('details', 'ai-evidence-fold');
        const sum = el('summary', '', esc(t('ai.evidence.more', { n: h.evidence.length })));
        det.appendChild(sum);
        const ev = el('div', 'ai-evidence-list');
        ev.innerHTML = h.evidence.map((e) => `<div class="dl-row" style="padding:9px 0;font-size:12.5px">
            <span class="k mono">${esc(e.ref)}</span>
            <span class="v t-small">${esc(e.code)} · ${esc(e.at.replace('T', ' '))}<br><span class="t-muted">${esc(e.reason)}</span></span>
          </div>`).join('');
        det.appendChild(ev);
        card.appendChild(det);
      }
      if (h.denied) card.style.borderColor = '#F3D6DA';
      frag.appendChild(card);
      return frag;
    }

    // 券文案草稿（PRD 3.3 组件 G）
    if (h.kind === 'copy') {
      const card = el('div', 'ai-card');
      card.innerHTML = `<h4>${esc(h.title)}</h4>`;
      (h.variants || []).forEach((v) => {
        const box = el('div', 'ai-kv copy-box');
        box.style.cssText = 'flex-direction:column;align-items:flex-start;gap:6px;padding:12px 0;border-bottom:1px solid var(--line-2)';
        box.innerHTML = `<div class="t-small t-muted">${esc(v.tone)}</div>
          <div style="font-weight:700;font-size:14px">${esc(v.title)}</div>
          <div style="font-size:13px;line-height:1.7;color:var(--ink-2)">${esc(v.body)}</div>
          <div style="font-size:12px;line-height:1.7;color:var(--ink-3)">${esc(v.terms)}</div>
          <div style="font-size:12px;color:var(--ink-3)">${esc(h.unsub || '')}</div>
          <div style="display:flex;gap:8px;margin-top:4px">
            <button class="btn btn-ghost btn-sm" data-copy="1">复制这段文案</button>
            <span class="t-small t-muted">按鈕：${esc(v.cta)}</span>
          </div>`;
        box.querySelector('[data-copy]').addEventListener('click', () => {
          const text = `${v.title}\n${v.body}\n${v.terms}\n${h.unsub || ''}`;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
              () => toast('已复制到剪贴板', 'ok', 2200),
              () => toast('复制失败，请手动选择文字', 'warn', 2600));
          } else {
            toast('当前环境不支持自动复制，请手动选择文字', 'warn', 2600);
          }
        });
        card.appendChild(box);
      });
      if (h.guard) {
        const ul = el('ul', 'ai-checks');
        ul.style.marginTop = '12px';
        h.guard.checks.forEach((c) => {
          const li = el('li', '');
          li.innerHTML = `<span style="color:${c.pass ? 'var(--green)' : 'var(--pcc-red)'}">${c.pass ? '✓' : '✗'}</span>
            <span class="t-small">${esc(c.name)}</span>`;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      if (h.evidence && h.evidence.length) {
        const ev = el('div', '');
        ev.style.marginTop = '12px';
        ev.innerHTML = h.evidence.map((e) => `<div class="ai-reason">· ${esc(e)}</div>`).join('');
        card.appendChild(ev);
      }
      frag.appendChild(card);
      return frag;
    }

    // 券面额建议 / 核销预测（老师反馈第 4 条）
    if (h.kind === 'value' || h.kind === 'predict') {
      const card = el('div', 'ai-card');
      card.innerHTML = `<h4>${esc(h.title)}</h4>`
        + (h.lines || []).map((l) => `<div style="font-size:13.5px;line-height:1.75;margin-bottom:6px">${esc(l)}</div>`).join('');
      if (h.evidence && h.evidence.length) {
        const ev = el('div', '');
        ev.style.marginTop = '12px';
        ev.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:6px">依据</div>`
          + h.evidence.map((e) => `<div class="ai-reason">· ${esc(e)}</div>`).join('');
        card.appendChild(ev);
      }
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
    frag.appendChild(foot);
    return frag;
  }

  let _session = 'S-' + Date.now().toString(36);
  function sessionId() { return _session; }

  function sendAI(text, forcedAction) {
    const input = String(text || '').trim();
    if (!input) { toast('请输入内容', 'warn'); return; }
    if (S.ai.state === 'generating') { toast(t('ai.state.generating'), 'warn'); return; }
    const acc = account();
    const caps = AI.availableCapabilities(S.page, acc);
    const enabled = caps.filter((c) => c.enabled).map((c) => c.key);
    if (!enabled.length) { toast(t('ai.state.denied'), 'warn'); return; }

    // 发送后立即清空输入框；另存最近一次问题，供失败时「重试」使用
    S.ai.lastSent = input;
    S.ai.lastInput = '';
    const inputEl = $('#aiInput');
    if (inputEl) inputEl.value = '';
    S.ai.history.push({ role: 'user', text: input });
    S.ai.state = 'generating';
    renderAI();

    // 服务端工具调用层：优先用问题的明确指向，再用关键词推断，最后按页面兜底
    const pageHint = S.page;
    const intentKey = forcedAction || inferAIAction(input, enabled, acc);
    const aiCtx = () => ({ sessionId: sessionId(), currentDraft: S.create.draftPrefill,
      audienceSize: (S.create.result || {}).total || 0 });

    setTimeout(() => {
      try {
        let res;
        if (intentKey === 'explain' && enabled.includes('explain')) {
          res = AI.explainBlock(input, acc);
        } else if (intentKey === 'permission' && enabled.includes('permission')) {
          res = AI.permissionCheck(acc, aiCtx());
        } else if (intentKey === 'value' && enabled.includes('value')) {
          res = AI.suggestValue(acc, aiCtx());
        } else if (intentKey === 'predict' && enabled.includes('predict')) {
          res = AI.predictRedemption(acc, aiCtx());
        } else if (intentKey === 'copy' && enabled.includes('copy')) {
          res = AI.generateCopy(acc, aiCtx());
        } else if (intentKey === 'localize' && acc.scope_type === 'store' && enabled.includes('localize')) {
          res = AI.localize(input, acc, aiCtx());
        } else if (pageHint === 'records' || pageHint === 'overview') {
          res = AI.explainBlock(input, acc);
        } else {
          res = AI.generateDraft(input, acc, aiCtx());
        }
        S.ai.state = 'result';
        S.ai.history.push({
          role: 'ai', kind: res.kind, result: res, title: res.title, headline: res.headline,
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
  // 捕获阶段先拦 Esc：活动详情下钻时先退回「发放结果」，不触发 UI 的关闭弹窗
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.cdEscapeBack) {
      e.preventDefault();
      e.stopPropagation();
      S.cdEscapeBack();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || S.page !== 'overview' || !S.ov.focus) return;
    const back = $('#content .focus-back');
    if (back) back.click();
  });
  document.addEventListener('DOMContentLoaded', boot);
})(window);
