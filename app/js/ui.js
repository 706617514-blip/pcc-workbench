/* ============================================================================
 * PCC 会员营销工作台 —— UI 基础组件 (ui.js)
 * 实现 PRD 5.2 的交互规范：
 *   · 查询字段「鼠标移入或点击展开下拉框；键盘和触屏使用点击展开」
 *   · 「全部」与其他选项互斥，其余可多选
 *   · 日期字段点击后展开单月日历，两次点击选择起止日，可跨月
 * ==========================================================================*/
(function (global) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const num = (n) => Number(n || 0).toLocaleString('en-US');
  const money = (n) => 'HK$ ' + num(Math.round(Number(n || 0)));
  const pct = (n, d) => (Number(n || 0) * 100).toFixed(d == null ? 1 : d) + '%';

  const SVG = {
    caret: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    ai: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"/></svg>',
    export: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
    warn: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    info: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
    shield: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };

  /* ---------------------------------------------------------------- Toast */
  let toastHost = null;
  function toast(msg, kind, ms) {
    if (!toastHost) { toastHost = el('div', 'toasts'); document.body.appendChild(toastHost); }
    const t = el('div', 'toast ' + (kind || ''), esc(msg));
    toastHost.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0'; t.style.transform = 'translateY(-10px)';
      setTimeout(() => t.remove(), 260);
    }, ms || 3000);
  }

  /* ---------------------------------------------------- 全局浮层管理 */
  const openLayers = new Set();
  function registerLayer(node, onClose) {
    openLayers.add({ node, onClose });
    // 使用一次性 document 监听统一关闭
  }
  let closerBound = false;
  const layers = [];
  function pushLayer(layer) { layers.push(layer); }
  function popLayer(layer) {
    const i = layers.indexOf(layer);
    if (i >= 0) layers.splice(i, 1);
  }
  function closeTopLayer() {
    const l = layers[layers.length - 1];
    if (l) { l.close(); return true; }
    return false;
  }
  /** 打开某个筛选面板时收起其他仍处于展开态的筛选控件 */
  function closeOtherFilters(except) {
    layers.slice().forEach((l) => {
      if (l.node !== except && l.node && l.node.classList && l.node.classList.contains('control')) l.close();
    });
  }
  function bindGlobalCloser() {
    if (closerBound) return;
    closerBound = true;
    document.addEventListener('mousedown', (e) => {
      // 从最上层往下关闭那些点击在外部且允许外部关闭的层
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (l.modal) continue;                       // 模态窗口不因外部点击关闭
        if (!l.node.contains(e.target)) {
          if (l.trigger && l.trigger.contains(e.target)) continue;
          l.close();
        }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // 模态优先
        for (let i = layers.length - 1; i >= 0; i--) {
          if (layers[i].modal) { layers[i].close(); return; }
        }
        closeTopLayer();
      }
    });
  }

  /* ================================================================
   * 多选下拉（PRD 5.1：券种／活动收纳为一个筛选字段；「全部」互斥）
   * ==============================================================*/
  function multiSelect(opts) {
    const { placeholder, options, values, onChange, exclusiveAll, onApply, staged, onStage } = opts;
    const wrap = el('div', 'control');
    wrap.innerHTML = `<span class="ctrl-value"></span><span class="ctrl-caret">${SVG.caret}</span>`;
    const valueEl = $('.ctrl-value', wrap);
    let selected = new Set(values || []);
    let open = false, panel = null;
    // 批量选择：勾选期间只更新草稿与文案，不触发 onChange；
    // 用户点「应用」、点击面板外部或按 Esc 时才一次性提交。
    let committed = new Set(selected);
    let dirty = false;

    function label() {
      if (!selected.size || (exclusiveAll && selected.has('__all'))) return placeholder;
      if (selected.size === 1) {
        const v = Array.from(selected)[0];
        const o = options.find((x) => x.v === v);
        return o ? o.label : v;
      }
      return `已选 ${selected.size} 项`;
    }
    function render() {
      valueEl.textContent = label();
      valueEl.classList.toggle('placeholder', !selected.size || (exclusiveAll && selected.has('__all')));
      wrap.classList.toggle('dirty', dirty);
      // 面板已展开时，只刷新勾选样式与页脚文案，不重建节点
      if (panel) syncPanel();
    }
    /** 就地刷新面板的勾选状态（不重建 DOM，保持动画与滚动位置） */
    function syncPanel() {
      const items = panel.querySelectorAll('.dd-item');
      let idx = 0;
      if (exclusiveAll) {
        const on0 = !selected.size || selected.has('__all');
        applyItemState(items[idx++], on0);
      }
      options.forEach((o) => applyItemState(items[idx++], selected.has(o.v)));
    }
    function applyItemState(node, on) {
      if (!node) return;
      node.classList.toggle('selected', !!on);
      const box = node.querySelector('.dd-check');
      if (box) box.innerHTML = on ? SVG.check : '';
    }
    function buildPanel() {
      // 逐项增删而非清空重建：避免容器重排导致入场动画反复重启
      panel.textContent = '';
      if (exclusiveAll) {
        panel.appendChild(mkItem({ v: '__all', label: opts.allLabel || '全部' }, true));
        panel.appendChild(el('div', 'dd-sep'));
      }
      options.forEach((o) => panel.appendChild(mkItem(o, false)));
      // 底部操作条：staged 模式只留「重置」，由页面级「应用筛选」统一提交
      const foot = el('div', 'dd-foot');
      const btns = el('span', 'dd-foot-btns');
      if (!staged) {
        const apply = el('button', 'dd-apply', '应用');
        apply.classList.toggle('on', dirty);
        apply.addEventListener('click', (e) => {
          e.stopPropagation();
          commit();
          closePanel();
        });
        btns.appendChild(apply);
      }
      const reset = el('button', 'dd-reset', '重置');
      reset.addEventListener('click', (e) => {
        e.stopPropagation();
        selected = new Set();
        dirty = !sameSet(selected, committed);
        render();
        if (staged && onStage) onStage();
      });
      btns.appendChild(reset);
      foot.appendChild(btns);
      panel.appendChild(foot);
    }
    function mkItem(o, isAll) {
      const on = isAll ? (!selected.size || selected.has('__all')) : selected.has(o.v);
      const it = el('div', 'dd-item' + (on ? ' selected' : ''),
        `<span class="dd-check">${on ? SVG.check : ''}</span><span>${esc(o.label)}</span>`);
      it.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isAll) { selected = new Set(); }
        else {
          selected.delete('__all');
          if (selected.has(o.v)) selected.delete(o.v); else selected.add(o.v);
        }
        dirty = !sameSet(selected, committed);
        render();          // 只重绘下拉面板，不关闭、不触发页面重建
        if (staged && onStage) onStage();
      });
      return it;
    }
    function sameSet(a, b) {
      if (a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    }
    /** 提交本次批量选择 */
    function commit() {
      if (!dirty) return;
      committed = new Set(selected);
      dirty = false;
      render();
      onChange(Array.from(selected));
      if (onApply) onApply(Array.from(selected));
    }
    function openPanel() {
      if (open) return;
      closeOtherFilters(wrap);
      open = true; wrap.classList.add('open');
      panel = el('div', 'dropdown');
      buildPanel();
      wrap.appendChild(panel);
      const layer = { node: wrap, trigger: wrap, close: closePanel };
      pushLayer(layer);
      wrap._layer = layer;
    }
    function closePanel() {
      if (!open) return;
      // staged 模式由页面级「应用筛选」统一提交；关闭面板本身不提交
      if (dirty && !staged) commit();
      open = false; wrap.classList.remove('open');
      if (panel) { panel.remove(); panel = null; }
      if (wrap._layer) { popLayer(wrap._layer); wrap._layer = null; }
    }
    // PRD：鼠标移入或点击展开；键盘和触屏使用点击展开
    let hoverTimer = null;
    wrap.addEventListener('mouseenter', () => {
      if (wrap.dataset.touch === '1') return;
      // 面板内有未提交改动时不因鼠标移出而开合，避免误关
      hoverTimer = setTimeout(openPanel, 120);
    });
    wrap.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      setTimeout(() => {
        if (open && !dirty && !wrap.matches(':hover')) closePanel();
      }, 220);
    });
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      open ? closePanel() : openPanel();
    });
    wrap.addEventListener('touchstart', () => { wrap.dataset.touch = '1'; }, { passive: true });
    wrap.setValue = (vals) => {
      selected = new Set(vals || []);
      committed = new Set(selected);
      dirty = false;
      render();
    };
    wrap.getValue = () => (selected.has('__all') ? [] : Array.from(selected));
    wrap.commit = () => { commit(); };   // staged 模式：由页面级「应用筛选」统一提交
    wrap.setOptions = (opts2) => { options.length = 0; opts2.forEach((o) => options.push(o)); render(); };
    render();
    return wrap;
  }

  /* ================================================================
   * 自由数值区间输入（累计消费 / 购买杯数）
   * ----------------------------------------------------------------
   * PRD 表 12 只要求「按杯数、消费金额筛选」，未限定档位，
   * 因此提供最小／最大两个输入框，任一端留空表示该方向不限。
   * 常见的几个快捷区间以 chip 形式提供，点击即可一键填入，仍可自由修改。
   * ==============================================================*/
  function rangeInput(opts) {
    const { min, max, unit, prefix, placeholderMin, placeholderMax, onChange, presets } = opts;
    const wrap = el('div', 'range-input');
    const box = el('div', 'range-box-input');

    const mk = (ph, val, which) => {
      const input = el('input', 'range-field');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.placeholder = ph;
      if (val !== null && val !== undefined && val !== '') input.value = val;
      // 只允许数字与小数点
      input.addEventListener('input', () => {
        const cleaned = input.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
        if (cleaned !== input.value) input.value = cleaned;
        emit();
      });
      return input;
    };
    const minIn = mk(placeholderMin || '不限', min, 'min');
    const maxIn = mk(placeholderMax || '不限', max, 'max');

    box.appendChild(prefix ? el('span', 'range-prefix', esc(prefix)) : el('span', ''));
    box.appendChild(minIn);
    box.appendChild(el('span', 'range-sep', '—'));
    box.appendChild(maxIn);
    if (unit) box.appendChild(el('span', 'range-unit', esc(unit)));
    wrap.appendChild(box);

    // 快捷区间
    let chipHost = null;
    if (presets && presets.length) {
      chipHost = el('div', 'range-presets');
      presets.forEach((ps) => {
        const b = el('button', 'range-chip', esc(ps.label));
        b.type = 'button';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          minIn.value = ps.min == null ? '' : ps.min;
          maxIn.value = ps.max == null ? '' : ps.max;
          emit();
          if (onChange) onChange(getValue());
        });
        chipHost.appendChild(b);
      });
      wrap.appendChild(chipHost);
    }

    function getValue() {
      const lo = minIn.value.trim(), hi = maxIn.value.trim();
      if (!lo && !hi) return null;
      return { min: lo === '' ? null : Number(lo), max: hi === '' ? null : Number(hi) };
    }
    let debounce = null;
    function emit() {
      // 输入过程中高频触发，去抖后再回调，避免频繁重算
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { debounce = null; if (onChange) onChange(getValue()); }, 220);
    }
    /** 立即提交（不等去抖）：供「应用筛选」等主动操作调用，避免用到过期值 */
    wrap.flush = () => {
      if (debounce) { clearTimeout(debounce); debounce = null; }
      if (onChange) onChange(getValue());
      return getValue();
    };
    // 输入框在区间控件内部，不应触发外层控件/页面级关闭
    wrap.addEventListener('mousedown', (e) => e.stopPropagation());
    wrap.addEventListener('click', (e) => e.stopPropagation());

    wrap.getValue = getValue;
    wrap.setValue = (v) => {
      if (!v) { minIn.value = ''; maxIn.value = ''; return; }
      minIn.value = v.min == null ? '' : v.min;
      maxIn.value = v.max == null ? '' : v.max;
    };
    wrap.focusMin = () => minIn.focus();
    return wrap;
  }

  /* ================================================================
   * 单选下拉
   * ==============================================================*/
  function singleSelect(opts) {
    const { options, value, onChange, placeholder, staged, onStage } = opts;
    const wrap = el('div', 'control');
    wrap.innerHTML = `<span class="ctrl-value"></span><span class="ctrl-caret">${SVG.caret}</span>`;
    const valueEl = $('.ctrl-value', wrap);
    let cur = value, committed = value, open = false, panel = null;
    function render() {
      const o = options.find((x) => x.v === cur);
      valueEl.textContent = o ? o.label : (placeholder || '');
      valueEl.classList.toggle('placeholder', !o);
      wrap.classList.toggle('dirty', staged && cur !== committed);
      if (panel) build();
    }
    function build() {
      panel.innerHTML = '';
      options.forEach((o) => {
        const it = el('div', 'dd-item' + (o.v === cur ? ' selected' : ''),
          `<span>${esc(o.label)}</span>${o.v === cur ? `<span style="margin-left:auto;color:var(--pcc-red)">${SVG.check}</span>` : ''}`);
        it.addEventListener('click', (e) => {
          e.stopPropagation();
          cur = o.v; render();
          if (staged) { if (onStage) onStage(); }   // 暂存，交给页面级「应用筛选」统一提交
          else { closePanel(); onChange(o.v); }
        });
        panel.appendChild(it);
      });
    }
    function openPanel() {
      if (open) return;
      closeOtherFilters(wrap);
      open = true; wrap.classList.add('open');
      panel = el('div', 'dropdown'); build(); wrap.appendChild(panel);
      const layer = { node: wrap, trigger: wrap, close: closePanel };
      pushLayer(layer); wrap._layer = layer;
    }
    function closePanel() {
      if (!open) return;
      open = false; wrap.classList.remove('open');
      if (panel) { panel.remove(); panel = null; }
      if (wrap._layer) { popLayer(wrap._layer); wrap._layer = null; }
    }
    wrap.addEventListener('mouseenter', () => { if (wrap.dataset.touch !== '1') setTimeout(openPanel, 130); });
    wrap.addEventListener('mouseleave', () => setTimeout(() => { if (open && !wrap.matches(':hover')) closePanel(); }, 220));
    wrap.addEventListener('click', (e) => { e.stopPropagation(); open ? closePanel() : openPanel(); });
    wrap.addEventListener('touchstart', () => { wrap.dataset.touch = '1'; }, { passive: true });
    wrap.setValue = (v) => { cur = v; committed = v; render(); };
    wrap.getValue = () => cur;
    wrap.commit = () => {
      if (!staged || cur === committed) return;
      committed = cur; render(); onChange(cur);
    };
    render();
    return wrap;
  }

  /* ================================================================
   * 日期范围日历（PRD 5.1 与图 4）
   * 第一次点击选开始日，第二次点击选结束日；单日可点同一天两次。
   * 左右箭头切换月份，点击年月栏选择月份和年份，支持跨月。
   * 第二次点击早于开始日时，以该日重设开始日。
   * ==============================================================*/
  function rangePicker(opts) {
    const { from, to, onChange, minDate, maxDate, staged, onStage } = opts;
    const wrap = el('div', 'control');
    wrap.innerHTML = `<span class="ctrl-value"></span><span class="ctrl-caret">${SVG.caret}</span>`;
    const valueEl = $('.ctrl-value', wrap);

    let start = from, end = to;
    let committedStart = from, committedEnd = to;
    let resetDraft = false;   // 日历内「重置」：待应用时恢复默认区间
    let viewY, viewM, mode = 'days', selecting = false;
    let open = false, panel = null;
    const todayStr = opts.today || null;

    if (start) { const d = new Date(start + 'T00:00:00'); viewY = d.getFullYear(); viewM = d.getMonth(); }
    else if (maxDate) { const d = new Date(maxDate + 'T00:00:00'); viewY = d.getFullYear(); viewM = d.getMonth(); }
    else { const d = new Date(); viewY = d.getFullYear(); viewM = d.getMonth(); }

    function fmt(s) {
      if (!s) return '';
      const [y, m, d] = s.split('-');
      return `${y}/${m}/${d}`;
    }
    function renderLabel() {
      valueEl.textContent = (start && end) ? `${fmt(start)} — ${fmt(end)}` : (start ? fmt(start) : '');
      valueEl.classList.toggle('placeholder', !start);
      wrap.classList.toggle('dirty', staged && (start !== committedStart || end !== committedEnd));
      if (panel) build();
    }
    const iso = (d) => {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    function build() {
      panel.innerHTML = '';
      const head = el('div', 'cal-head');
      const title = el('div', 'cal-title clickable');
      title.textContent = mode === 'days' ? `${viewY} 年 ${viewM + 1} 月`
        : mode === 'months' ? `${viewY} 年` : `${viewY - 6} – ${viewY + 5}`;
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        mode = mode === 'days' ? 'months' : mode === 'months' ? 'years' : 'days';
        build();
      });
      const nav = el('div', 'cal-nav');
      const prev = el('button', '', SVG.left), next = el('button', '', SVG.right);
      prev.addEventListener('click', (e) => { e.stopPropagation(); shift(-1); });
      next.addEventListener('click', (e) => { e.stopPropagation(); shift(1); });
      nav.appendChild(prev); nav.appendChild(next);
      head.appendChild(title); head.appendChild(nav);
      panel.appendChild(head);

      if (mode === 'days') {
        const grid = el('div', 'cal-grid');
        ['一', '二', '三', '四', '五', '六', '日'].forEach((d) => {
          grid.appendChild(el('div', 'cal-dow', d));
        });
        const first = new Date(viewY, viewM, 1);
        let offset = first.getDay() - 1; if (offset < 0) offset = 6;    // 周一起始
        const dim = new Date(viewY, viewM + 1, 0).getDate();
        const prevDim = new Date(viewY, viewM, 0).getDate();
        for (let i = offset - 1; i >= 0; i--) {
          grid.appendChild(el('div', 'cal-day out disabled', String(prevDim - i)));
        }
        for (let d = 1; d <= dim; d++) {
          const ds = iso(new Date(viewY, viewM, d));
          const cell = el('div', 'cal-day', String(d));
          const dis = (minDate && ds < minDate) || (maxDate && ds > maxDate);
          if (dis) cell.classList.add('disabled');
          if (todayStr && ds === todayStr) cell.classList.add('today');
          if (start && end && ds >= start && ds <= end) cell.classList.add('in-range');
          if (ds === start) cell.classList.add('start');
          if (ds === end) cell.classList.add('end');
          if (!dis) cell.addEventListener('click', (e) => { e.stopPropagation(); pick(ds); });
          grid.appendChild(cell);
        }
        const total = offset + dim;
        const tail = (7 - (total % 7)) % 7;
        for (let i = 1; i <= tail; i++) grid.appendChild(el('div', 'cal-day out disabled', String(i)));
        panel.appendChild(grid);
      } else if (mode === 'months') {
        const grid = el('div', 'cal-grid months');
        for (let m = 0; m < 12; m++) {
          const c = el('div', 'cal-cell' + (m === viewM ? ' sel' : ''), `${m + 1} 月`);
          c.addEventListener('click', (e) => { e.stopPropagation(); viewM = m; mode = 'days'; build(); });
          grid.appendChild(c);
        }
        panel.appendChild(grid);
      } else {
        const grid = el('div', 'cal-grid years');
        for (let y = viewY - 6; y <= viewY + 5; y++) {
          const c = el('div', 'cal-cell' + (y === viewY ? ' sel' : ''), String(y));
          c.addEventListener('click', (e) => { e.stopPropagation(); viewY = y; mode = 'months'; build(); });
          grid.appendChild(c);
        }
        panel.appendChild(grid);
      }

      const foot = el('div', 'cal-foot');
      const reset = el('button', 'btn-text', '重置');
      reset.style.fontSize = '12.5px';
      reset.addEventListener('click', (e) => {
        e.stopPropagation();
        start = null; end = null; selecting = false; resetDraft = true; renderLabel();
        if (staged) { if (onStage) onStage(); }
        else onChange(null, null);
      });
      foot.appendChild(reset);
      panel.appendChild(foot);
    }
    function shift(n) {
      if (mode === 'days') {
        viewM += n;
        if (viewM > 11) { viewM = 0; viewY++; }
        if (viewM < 0) { viewM = 11; viewY--; }
      } else if (mode === 'months') viewY += n;
      else viewY += n * 10;
      build();
    }
    function pick(ds) {
      resetDraft = false;
      if (!selecting || !start) {
        start = ds; end = null; selecting = true;
      } else {
        if (ds < start) { start = ds; end = null; selecting = true; }   // 以该日重设开始日
        else { end = ds; selecting = false; }
      }
      renderLabel();
      if (staged) {
        if (onStage) onStage();
      } else if (!selecting) { onChange(start, end); }
    }
    function openPanel() {
      if (open) return;
      closeOtherFilters(wrap);
      open = true; wrap.classList.add('open');
      panel = el('div', 'calendar'); build(); wrap.appendChild(panel);
      const layer = { node: wrap, trigger: wrap, close: closePanel };
      pushLayer(layer); wrap._layer = layer;
    }
    function closePanel() {
      if (!open) return;
      open = false; wrap.classList.remove('open'); selecting = false;
      if (panel) { panel.remove(); panel = null; }
      if (wrap._layer) { popLayer(wrap._layer); wrap._layer = null; }
    }
    // 与其他两个筛选框一致：鼠标移入自动滑出，移出后收起（暂存态保留）
    let hoverTimer = null;
    wrap.addEventListener('mouseenter', () => {
      if (wrap.dataset.touch === '1') return;
      hoverTimer = setTimeout(openPanel, 120);
    });
    wrap.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      setTimeout(() => {
        if (open && !wrap.matches(':hover') && !(staged && wrap.classList.contains('dirty'))) closePanel();
      }, 220);
    });
    wrap.addEventListener('touchstart', () => { wrap.dataset.touch = '1'; }, { passive: true });
    wrap.addEventListener('click', (e) => { e.stopPropagation(); open ? closePanel() : openPanel(); });
    wrap.setValue = (f, t) => {
      start = f; end = t; committedStart = f; committedEnd = t;
      if (f) { const d = new Date(f + 'T00:00:00'); viewY = d.getFullYear(); viewM = d.getMonth(); }
      renderLabel();
    };
    wrap.getValue = () => ({ from: start, to: end });
    wrap.commit = () => {
      if (!staged || (start === committedStart && end === committedEnd && !resetDraft)) return;
      // 只选了开始日、尚未选结束日时不提交，避免出现半截日期区间
      if (!resetDraft && (!start || !end)) return;
      committedStart = start; committedEnd = end; resetDraft = false; renderLabel(); onChange(start, end);
    };
    renderLabel();
    return wrap;
  }

  /* ================================================================
   * 模态窗口
   * ==============================================================*/
  function modal(opts) {
    const { title, subtitle, body, footer, size, onClose } = opts;
    // 防御：任何时刻只允许一个模态窗口存在，避免叠加
    Array.prototype.slice.call(document.querySelectorAll('.overlay')).forEach((o) => o.remove());
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i].modal) layers.splice(i, 1);
    const overlay = el('div', 'overlay');
    const m = el('div', 'modal' + (size ? ' ' + size : ''));
    const head = el('div', 'modal-head');
    head.innerHTML = `<div><h3 class="modal-title">${esc(title)}</h3>${subtitle ? `<div class="modal-sub">${subtitle}</div>` : ''}</div>`;
    const closeBtn = el('button', 'modal-close', SVG.close);
    head.appendChild(closeBtn);
    const bodyEl = el('div', 'modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    m.appendChild(head); m.appendChild(bodyEl);
    if (footer) {
      const f = el('div', 'modal-foot');
      if (typeof footer === 'string') f.innerHTML = footer; else f.appendChild(footer);
      m.appendChild(f);
    }
    overlay.appendChild(m);
    document.body.appendChild(overlay);

    function close() {
      overlay.remove();
      popLayer(layer);
      if (onClose) onClose();
    }
    const layer = { node: m, modal: true, close };
    pushLayer(layer);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    return { overlay, modal: m, body: bodyEl, close };
  }

  /** 通用确认框 */
  function confirm(opts) {
    return new Promise((resolve) => {
      const body = el('div');
      body.innerHTML = `<div class="notice${opts.tone === 'grey' ? ' grey' : ''}">${esc(opts.message)}</div>`
        + (opts.detail ? `<div style="margin-top:14px;font-size:13.5px;color:var(--ink-3);line-height:1.6">${opts.detail}</div>` : '')
        + (opts.reasonLabel ? `<div class="form-item" style="margin-top:16px"><label>${esc(opts.reasonLabel)}</label>
            <input class="input" id="cfm-reason" placeholder="${esc(opts.reasonPlaceholder || '')}" value="${esc(opts.reasonDefault || '')}"></div>` : '');
      const foot = el('div', '', `<button class="btn btn-ghost" data-x="cancel">${esc(opts.cancelText || '取消')}</button>
        <button class="btn btn-primary" data-x="ok">${esc(opts.okText || '确定')}</button>`);
      const mo = modal({ title: opts.title, subtitle: opts.subtitle, body, footer: foot, size: 'narrow' });
      foot.querySelector('[data-x="cancel"]').addEventListener('click', () => { mo.close(); resolve(null); });
      foot.querySelector('[data-x="ok"]').addEventListener('click', () => {
        const r = body.querySelector('#cfm-reason');
        const val = r ? r.value.trim() : '';
        if (opts.reasonRequired && !val) {
          // 审计要求：启停类操作必须写明原因，不允许空提交
          if (r) r.focus();
          toast('请填写操作原因（将写入审计记录）', 'warn', 3000);
          return;
        }
        mo.close();
        resolve({ ok: true, reason: val });
      });
    });
  }

  /* ================================================================
   * 右侧抽屉（AI 助手 / 发送记录详情）
   * ==============================================================*/
  function sideDrawer(opts) {
    const d = el('div', 'drawer-right');
    const head = el('div', 'drawer-head');
    head.innerHTML = `<div><h3>${esc(opts.title)}</h3>${opts.subtitle ? `<div class="tl-item" style="padding:4px 0 0;color:var(--ink-3);font-size:12.5px">${opts.subtitle}</div>` : ''}</div>`;
    const closeBtn = el('button', 'modal-close', SVG.close);
    head.appendChild(closeBtn);
    const body = el('div', 'drawer-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    d.appendChild(head); d.appendChild(body);
    if (opts.footer) {
      const f = el('div', 'drawer-foot');
      if (typeof opts.footer === 'string') f.innerHTML = opts.footer; else f.appendChild(opts.footer);
      d.appendChild(f);
    }
    document.body.appendChild(d);
    requestAnimationFrame(() => d.classList.add('open'));
    function close() {
      d.classList.remove('open');
      setTimeout(() => d.remove(), 250);
      popLayer(layer);
      if (opts.onClose) opts.onClose();
    }
    const layer = { node: d, close };
    pushLayer(layer);
    closeBtn.addEventListener('click', close);
    return { node: d, body, close };
  }

  /* ================================================================
   * 折线图（Canvas 绘制，对应 PRD 图 2 趋势图）
   * ==============================================================*/
  function lineChart(canvas, series, options) {
    const opt = options || {};
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // 用 100% 跟随容器宽度；若写死像素，首次在隐藏/未完成布局时测到的窄宽度会永久残留，
    // 导致曲线挤在左侧（模块聚焦/收回时容器宽度变化尤其明显）。
    // clientWidth 是布局宽度，不受 FLIP 动画的 transform 缩放影响。
    const W = canvas.clientWidth > 40 ? canvas.clientWidth : (rect.width > 40 ? rect.width : 600);
    const H = opt.height || 260;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = '100%'; canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const padL = 42, padR = 18, padT = 18, padB = 34;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const allVals = series.reduce((a, s) => a.concat(s.data), []);
    let maxV = Math.max(1, ...allVals);
    maxV = Math.ceil(maxV / 4) * 4;
    const n = series[0] ? series[0].data.length : 0;
    const xAt = (i) => padL + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const yAt = (v) => padT + innerH - (innerH * v) / maxV;
    const family = getComputedStyle(document.body).fontFamily;

    // 水平参考线：弱化网格，让曲线成为主角
    ctx.font = '11px ' + family;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = (maxV * g) / 4, y = Math.round(yAt(v)) + .5;
      ctx.beginPath();
      ctx.setLineDash(g === 0 ? [] : [3, 5]);
      ctx.strokeStyle = g === 0 ? '#E8DDD6' : '#F0E8E2';
      ctx.lineWidth = 1;
      ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = '#A79A93';
      ctx.fillText(String(Math.round(v)), padL - 10, y);
    }
    ctx.setLineDash([]);

    // X 轴：最多 6 个标签，末端必显示
    const labels = (series[0] && series[0].labels) || [];
    const labelStep = Math.max(1, Math.ceil(Math.max(0, n - 1) / 5));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#A79A93';
    const xs = [];
    for (let i = 0; i < n; i += labelStep) xs.push(i);
    if (n && xs[xs.length - 1] !== n - 1) xs.push(n - 1);
    xs.forEach((i) => ctx.fillText(labels[i] || '', xAt(i), padT + innerH + 12));

    const rgba = (hex, a) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
      return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(107,11,12,${a})`;
    };
    // Catmull-Rom → 三次贝塞尔，曲线平滑但不伪造数据点
    const trace = (pts) => {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        ctx.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
          p2.x, p2.y);
      }
    };

    series.forEach((s, si) => {
      if (!s.data.length) return;
      const pts = s.data.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
      if (si === 0 && opt.area !== false) {
        const grad = ctx.createLinearGradient(0, padT, 0, padT + innerH);
        grad.addColorStop(0, rgba(s.color, .22));
        grad.addColorStop(1, rgba(s.color, 0));
        ctx.beginPath();
        trace(pts);
        ctx.lineTo(pts[pts.length - 1].x, padT + innerH);
        ctx.lineTo(pts[0].x, padT + innerH);
        ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
      }
      ctx.beginPath();
      trace(pts);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = si === 0 ? 2.6 : 1.9;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = si === 0 ? 1 : .82;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 仅标出终点，避免满屏圆点
      if (pts.length) {
        const last = pts[pts.length - 1];
        ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = s.color; ctx.lineWidth = 2.2; ctx.stroke();
      }
    });
  }

  /* ---------------------------------------------------- 图标：PCC logo
   * 使用官方图形资源，替代此前的线框 SVG；color 参数保留兼容，但图形颜色固定。 */
  const PCC_LOGO_SRC = 'assets/pcc-logo.png?v=1795327986';
  function pccLogo(size) {
    const s = size || 46;
    return `<img class="pcc-logo-img" src="${PCC_LOGO_SRC}" width="${s}" height="${s}" alt="PCC" draggable="false">`;
  }

  global.UI = {
    $, $$, el, esc, num, money, pct, SVG, pccLogo,
    toast, multiSelect, singleSelect, rangePicker, rangeInput, modal, confirm, sideDrawer, lineChart,
    bindGlobalCloser, pushLayer, popLayer,
  };
  bindGlobalCloser();
})(window);
