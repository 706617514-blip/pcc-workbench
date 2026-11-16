/* ============================================================================
 * PRD 表 14「核心验收场景」自动化验收脚本
 * 在浏览器控制台执行：await PCC_ACCEPTANCE.run()
 * 逐条核对 13 个验收场景，并输出 PASS/FAIL 汇总。
 * ==========================================================================*/
(function (global) {
  'use strict';

  const results = [];
  function rec(id, name, pass, detail) {
    results.push({ id, name, pass: !!pass, detail });
    return pass;
  }

  async function run() {
    const E = global.PCC_ENGINE, AI = global.PCC_AI, C = global.PCC_CONST;
    const DB = E.DB;
    results.length = 0;

    const hq = E.ACCOUNTS.find((a) => a.account_id === 'hq.marketing');
    const hqAdmin = E.ACCOUNTS.find((a) => a.account_id === 'hq.admin');
    const store = E.ACCOUNTS.find((a) => a.account_id === 'store.taikoo01');
    const myStore = store.scope_id;

    /* ---- 1. 人工发券 ---- */
    try {
      const res = E.filterMembers({ recency: 'dormant30' }, hq);
      const camp = E.createCampaign({
        name: '验收·人工发放活动', coupon_type: 'winback', discount: 0.8,
        mode: 'manual', store_scope: 'all_hk', segment_definition: '连续 30 天未消费',
        audience_size: res.total,
      }, hq, '总部营销人员');
      const appr = E.approveCampaign(camp.campaign_id, '陈经理', '同意');
      const job = E.executeSendJob({
        campaign: camp, audience: res.list.slice(0, 30), mode: 'manual',
        actor: '总部营销人员', reason: '验收测试', now: C.DATA_TODAY + 'T09:00',
      });
      const instances = DB.couponInstance.filter((c) => c.campaign_id === camp.campaign_id).length;
      rec(1, '人工发券', res.total > 0 && appr.ok && job.success > 0 && instances > 0,
        `筛选 ${res.total} 人；批准 ${appr.ok}；应发 ${job.requested} 实发建券 ${job.success}，券实例 ${instances} 张`);
    } catch (e) { rec(1, '人工发券', false, 'ERR ' + e.message); }

    /* ---- 2. 自动规则 + 重复命中拦截 ---- */
    try {
      const cid = E.filterMembers({ recency: 'dormant30' }, hq).list[0].customer_id;
      const c1 = E.checkEligibility(cid, 'winback', { channel: 'app_push' });
      // 首轮发放
      const autoCamp = DB.campaigns.find((c) => c.coupon_type === 'winback' && c.status === 'running');
      // 模拟：给该会员建一张同轮券，再次检查应被拦截
      const before = DB.couponInstance.length;
      DB.couponInstance.push({
        coupon_id: 'CP-TEST-DUP', campaign_id: autoCamp.campaign_id, customer_id: cid,
        coupon_type: 'winback', discount: 0.8, status: 'unclaimed',
        issued_at: C.DATA_TODAY + 'T09:00', claimed_at: null, redeemed_at: null,
        valid_from: C.DATA_TODAY, valid_until: '', idempotency_key: 'test|dup', round: 'r1',
        store_scope: 'all_hk', store_id: null, notify_status: 'sent', notify_channel: 'app_push',
      });
      const c2 = E.checkEligibility(cid, 'winback', { channel: 'app_push' });
      DB.couponInstance.pop();  // 清理
      rec(2, '自动规则 / 重复命中拦截',
        c2.eligible === false && /DUP_WINBACK/.test(c2.code),
        `首次检查 eligible=${c1.eligible}；注入同轮券后 eligible=${c2.eligible} code=${c2.code} — ${c2.reason}`);
    } catch (e) { rec(2, '自动规则 / 重复命中拦截', false, 'ERR ' + e.message); }

    /* ---- 3. 门店活动与数据隔离 ---- */
    try {
      const storeMembers = E.filterMembers({}, store);
      const hqMembers = E.filterMembers({}, hq);
      // 门店只能看到本店消费过的会员
      const allStoreValid = storeMembers.list.every((m) => !!DB.memberStoreIdx.get(m.customer_id)[myStore]);
      const hqHasOther = hqMembers.list.some((m) => !(DB.memberStoreIdx.get(m.customer_id) || {})[myStore]);
      // 门店电话掩码
      const masked = storeMembers.list.every((m) => /^\*{4} \d{4}$/.test(m.phone_masked));
      // 门店创建全港活动应被拦截
      const badDraft = { coupon_type: 'winback', discount: 0.8, store_scope: 'all_hk', store_id: null };
      const g = E.permissionGuard(badDraft, store);
      // 门店折扣超限应被拦截
      const badDiscount = { coupon_type: 'store_local', discount: 0.5, offer_label: '买一送一', store_scope: 'store', store_id: myStore };
      const g2 = E.permissionGuard(badDiscount, store);
      // 门店总览仅本店核销
      const sm = E.computeMetrics({ couponTypes: [], campaignIds: [], dateFrom: '2025-11-01', dateTo: C.DATA_TODAY }, store);
      const hm = E.computeMetrics({ couponTypes: [], campaignIds: [], dateFrom: '2025-11-01', dateTo: C.DATA_TODAY }, hq);
      rec(3, '门店活动与数据隔离',
        allStoreValid && hqHasOther && masked && g.pass === false && g2.pass === false && sm.used < hm.used,
        `门店可见会员 ${storeMembers.total} 全为本店消费过=${allStoreValid}；总部可见跨店会员=${hqHasOther}；` +
        `电话掩码=${masked}；门店创建全港活动被拦截=${!g.pass}；门店折扣超限被拦截=${!g2.pass}；` +
        `门店核销 ${sm.used} < 总部核销 ${hm.used}`);
    } catch (e) { rec(3, '门店活动与数据隔离', false, 'ERR ' + e.message); }

    /* ---- 4. 回流券领取（未领取不计有效期）---- */
    try {
      const cp = DB.couponInstance.find((c) => c.coupon_type === 'winback' && c.status === 'unclaimed');
      const beforeValid = cp.valid_until;
      const r = E.claimCoupon(cp.coupon_id, cp.customer_id);
      const expValid = E.utils.addDays(C.DATA_TODAY, 3);
      rec(4, '回流券领取',
        r.ok && !beforeValid && cp.status === 'claimed' && cp.valid_from === C.DATA_TODAY && cp.valid_until === expValid,
        `领取前 valid_until="${beforeValid || '(空，不计有效期)'}"；领取后 valid_from=${cp.valid_from} valid_until=${cp.valid_until}（领取日起 3 天）`);
    } catch (e) { rec(4, '回流券领取', false, 'ERR ' + e.message); }

    /* ---- 5. 积分与用券 ---- */
    try {
      const cp = DB.couponInstance.find((c) => c.coupon_type === 'winback' && c.status === 'claimed');
      const r = E.redeemCoupon(cp.coupon_id, 68, 400, cp.customer_id);  // 400 分 = HK$20
      const noStack = DB.couponInstance.find((c) => c.coupon_type === 'birthday' && c.status === 'claimed');
      let blockMsg = '';
      if (noStack) {
        const r2 = E.redeemCoupon(noStack.coupon_id, 68, 400, noStack.customer_id);
        blockMsg = r2.ok ? '不可叠加券未被拦截' : r2.error;
      }
      const stuOk = E.COUPON_TYPES.student.discount === 0.75
        && E.COUPON_TYPES.student.validity_days === 7
        && E.COUPON_TYPES.student.per_member_label === '每月一次';
      // 一笔订单最多一张券：结构上 redemption 与 coupon 一对一
      const oneToOne = DB.redemption.every((rd) => DB.couponInstance.filter((c) => c.coupon_id === rd.coupon_id).length === 1);
      rec(5, '积分与用券',
        r.ok && r.redemption.point_value === 20 && Math.abs(r.redemption.paid_amount - 38.4) < 0.01
        && (blockMsg === '' || /不可与积分/.test(blockMsg)) && stuOk && oneToOne,
        `可叠加券：原价 68，积分抵付 HK$${r.redemption.point_value}，实付 HK$${r.redemption.paid_amount}；` +
        `不可叠加券拦截="${blockMsg}"；学生券 7.5 折/7 天/每月一次=${stuOk}；券与核销一对一=${oneToOne}`);
    } catch (e) { rec(5, '积分与用券', false, 'ERR ' + e.message); }

    /* ---- 6. 数据看板 ---- */
    try {
      const m = E.computeMetrics({ couponTypes: [], campaignIds: [], dateFrom: '2025-11-01', dateTo: C.DATA_TODAY }, hq);
      const m2 = E.computeMetrics({ couponTypes: ['winback'], campaignIds: [], dateFrom: '2025-11-01', dateTo: C.DATA_TODAY }, hq);
      // 多选
      const m3 = E.computeMetrics({ couponTypes: ['winback', 'birthday'], campaignIds: [], dateFrom: '2025-11-01', dateTo: C.DATA_TODAY }, hq);
      // 单日
      const m4 = E.computeMetrics({ couponTypes: [], campaignIds: [], dateFrom: C.DATA_TODAY, dateTo: C.DATA_TODAY }, hq);
      const allTypes = Object.keys(m.byType).every((k) => m.byType[k].issued >= 0);
      const threeEvents = m.trend.some((t) => t.issued > 0) && m.trend.some((t) => t.claimed > 0) && m.trend.some((t) => t.used > 0);
      rec(6, '数据看板',
        m.issued > 0 && allTypes && threeEvents && m2.issued <= m.issued && m3.issued >= m2.issued && m4.issued >= 0,
        `全量发放 ${m.issued}；单券种(回流) ${m2.issued}；多选(回流+生日) ${m3.issued}；单日 ${m4.issued}；` +
        `三事件趋势齐全=${threeEvents}`);
    } catch (e) { rec(6, '数据看板', false, 'ERR ' + e.message); }

    /* ---- 7. 总览数据导出 ---- */
    try {
      const m = E.computeMetrics({ couponTypes: [], campaignIds: [], dateFrom: '2026-10-01', dateTo: C.DATA_TODAY }, hq);
      const rows = E.buildExport(m, { couponTypes: [], dateFrom: '2026-10-01', dateTo: C.DATA_TODAY },
        '全港门店', ['summary', 'campaigns', 'trend'], 'xlsx');
      const txt = JSON.stringify(rows);
      const noMemberDetail = !/M-\d{4}/.test(txt);
      E.audit('总部营销人员', 'export_data', 'dashboard', '2026-10-01~2026-10-29', '验收导出', '验收');
      const audited = DB.auditLog.some((a) => a.action === 'export_data');
      rec(7, '总览数据导出',
        rows.length > 10 && noMemberDetail && audited,
        `导出 ${rows.length} 行；不含会员个人明细=${noMemberDetail}；写入审计记录=${audited}`);
    } catch (e) { rec(7, '总览数据导出', false, 'ERR ' + e.message); }

    /* ---- 8. 审批历史 ---- */
    try {
      const hist = DB.campaigns.filter((c) => ['approved', 'running', 'stopped', 'rejected'].includes(c.status));
      const withApprover = hist.every((c) => {
        const l = DB.approvalLog.filter((x) => x.campaign_id === c.campaign_id).slice(-1)[0];
        return l && l.approver && l.approver !== '—' && l.approval_date && l.approval_date !== '—';
      });
      // 已审批不可再审批
      const done = hist[0];
      const again = E.approveCampaign(done.campaign_id, '陈经理', 'again');
      rec(8, '审批历史',
        hist.length > 0 && withApprover && again.ok === false,
        `历史记录 ${hist.length} 条，均含审批人与审批日期=${withApprover}；再次审批被拒绝="${again.error}"`);
    } catch (e) { rec(8, '审批历史', false, 'ERR ' + e.message); }

    /* ---- 9. 发送记录 ---- */
    try {
      const jobs = DB.sendJob;
      const failed = jobs.filter((j) => j.status === 'failed');
      const hasAttempts = failed.every((j) => DB.sendAttempt.some((a) => a.job_id === j.job_id && a.result === 'failed'));
      // 重试沿用同一幂等键
      let idemOk = true, retryMsg = '无失败任务可重试';
      if (failed.length) {
        const j = failed[0];
        const keysBefore = DB.sendAttempt.filter((a) => a.job_id === j.job_id && a.result === 'failed').map((a) => a.idempotency_key);
        const r = E.retrySendJob(j.job_id, '总部营销人员', '验收重试');
        const keysAfter = DB.sendAttempt.filter((a) => a.job_id === j.job_id && a.result === 'failed').map((a) => a.idempotency_key);
        idemOk = JSON.stringify(keysBefore) === JSON.stringify(keysAfter) || keysAfter.length === 0;
        retryMsg = `重试恢复 ${r.recovered} 张，幂等键保持=${idemOk}`;
      }
      // 发送记录不含领取核销字段
      const noRedeemField = jobs.every((j) => j.redeemed === undefined && j.claimed === undefined);
      rec(9, '发送记录',
        jobs.length > 0 && hasAttempts && idemOk && noRedeemField,
        `任务 ${jobs.length} 条；失败任务含原因记录=${hasAttempts}；${retryMsg}；不展示领取核销=${noRedeemField}`);
    } catch (e) { rec(9, '发送记录', false, 'ERR ' + e.message); }

    /* ---- 10. 设置与权限 ---- */
    try {
      // 门店账号无账号管理权限
      const storeNoPerm = store.can_manage_accounts === false;
      const hqAdminPerm = hqAdmin.can_manage_accounts === true;
      // 区域负责人未启用
      const regionDisabled = E.HQ_POLICY.region_role_enabled === false
        && !DB.staffAccount.some((a) => a.role === 'L2_REGION');
      // 账号变更写审计
      const before = DB.auditLog.length;
      E.updateStoreAccount('store.central02', { status: 'disabled' }, '总部账号管理员', '验收测试');
      const audited = DB.auditLog.length > before && DB.auditLog.slice(-1)[0].action === 'update_account';
      E.updateStoreAccount('store.central02', { status: 'active' }, '总部账号管理员', '恢复');
      rec(10, '设置与权限',
        storeNoPerm && hqAdminPerm && regionDisabled && audited,
        `门店无账号管理权=${storeNoPerm}；总部管理员有=${hqAdminPerm}；区域角色未启用=${regionDisabled}；变更留审计=${audited}`);
    } catch (e) { rec(10, '设置与权限', false, 'ERR ' + e.message); }

    /* ---- 11. 消费端静态原型 ---- */
    try {
      const cp = DB.couponInstance.find((c) => c.coupon_type === 'winback' && c.status === 'unclaimed');
      const beforeValid = cp.valid_until;
      const r = E.claimCoupon(cp.coupon_id, cp.customer_id);
      rec(11, '消费端静态原型',
        r.ok && cp.status === 'claimed' && !beforeValid && cp.valid_until,
        `待领取状态 valid_until 为空（有效期未开始），点击领取后 status=${cp.status} valid_until=${cp.valid_until}`);
    } catch (e) { rec(11, '消费端静态原型', false, 'ERR ' + e.message); }

    /* ---- 12. AI 助手与权限守门 ---- */
    try {
      // 总部：生成草稿 + 审批去向
      const hqRes = AI.generateDraft('为连续 30 天未消费会员创建 8 折回流活动，覆盖全港门店', hq, { sessionId: 'acc' });
      // 门店：超限拦截
      const stRes = AI.localize('把总部回流活动改成太古城店周末买一送一，发给附近会员。', store, { sessionId: 'acc' });
      // 门店：授权内通过
      const okRes = AI.generateDraft('为本店连续 30 天未消费会员创建 8.5 折回流活动', store, { sessionId: 'acc' });
      // 解释拦截引用原始记录
      const ex = AI.explainBlock('J-0003 为什么失败？', hq);
      // 能力矩阵：解释拦截在活动创建页不可用
      const capsStoreCreate = AI.availableCapabilities('create', store);
      const explainDisabled = capsStoreCreate.find((c) => c.key === 'explain').enabled === false;
      // guardLog 记录
      const guarded = DB.guardLog.length > 0;
      rec(12, 'AI 助手与权限守门',
        hqRes.guard.pass && hqRes.route.target && stRes.guard.pass === false
        && okRes.guard.pass === true && ex.evidence && ex.evidence.length > 0
        && explainDisabled && guarded,
        `总部草稿通过=${hqRes.guard.pass} 路由=${hqRes.route.target}；门店超限被拦截=${!stRes.guard.pass}；` +
        `门店授权内通过=${okRes.guard.pass}；解释引用记录 ${ex.evidence ? ex.evidence.length : 0} 条；` +
        `草稿页禁用解释拦截=${explainDisabled}；守门日志=${guarded}`);
    } catch (e) { rec(12, 'AI 助手与权限守门', false, 'ERR ' + e.message); }

    /* ---- 13. 门店范围筛选与多门店活动（PRD 2.1 门店可见性 / 9.1 数据隔离）---- */
    try {
      // 总部：可多选门店；不选=全港
      const all = E.filterMembers({}, hq);
      const one = E.filterMembers({ storeScope: ['PCC-TKO03'] }, hq);
      const two = E.filterMembers({ storeScope: ['PCC-TKO03', 'PCC-CEN01'] }, hq);
      const scopeMonotonic = all.total >= two.total && two.total >= one.total;
      const tagged = two.list.some((m) => m.matched_stores && m.matched_stores.length === 2);

      // 门店账号：忽略外部传入的 storeScope，始终锁定本店（服务端强制）
      const hijack = E.filterMembers({ storeScope: ['PCC-CEN01'] }, store);
      const storeLocked = hijack.total === E.filterMembers({}, store).total
        && hijack.list.every((m) => !!DB.memberStoreIdx.get(m.customer_id)[myStore]);

      // 多门店活动：范围持久化 + 覆盖判定
      const camp = E.createCampaign({
        name: '验收·多门店活动', coupon_type: 'winback', discount: 0.8, mode: 'manual',
        store_scope: 'stores', store_ids: ['PCC-TKO03', 'PCC-CEN01'],
        segment_definition: '太古城＋中环',
      }, hq, '总部营销人员');
      const covers = E.campaignCoversStore(camp, 'PCC-TKO03') && E.campaignCoversStore(camp, 'PCC-CEN01')
        && !E.campaignCoversStore(camp, 'PCC-MK05');
      const labelOk = E.scopeLabelOf(camp) === '太古城店、中环店';

      // 门店不得创建多门店活动（守门 fail-closed）
      const g = E.permissionGuard({
        coupon_type: 'winback', discount: 0.8,
        store_scope: 'stores', store_ids: ['PCC-CEN01'],
      }, store);

      rec(13, '门店范围筛选与多门店活动',
        scopeMonotonic && tagged && storeLocked && covers && labelOk && g.pass === false,
        `总部 全港 ${all.total} ≥ 多店 ${two.total} ≥ 单店 ${one.total}；会员标记覆盖门店=${tagged}；` +
        `门店越权传入被忽略并锁定本店=${storeLocked}；多店活动覆盖判定=${covers}；范围文案「${E.scopeLabelOf(camp)}」；` +
        `门店创建多店活动被拦截=${!g.pass}`);
    } catch (e) { rec(13, '门店范围筛选与多门店活动', false, 'ERR ' + e.message); }

    /* ---- 14. 数据契约与规模 ---- */
    try {
      const a = DB.assumptions;
      const ok = a.counts.customers >= 5000 && a.counts.transactions_total_12m >= 50000
        && a.seed && a.assumptions && a.assumptions.length >= 5;
      // 字段契约
      const c0 = DB.customers[0], t0 = DB.transactions[0], e0 = DB.events[0], cs0 = DB.consent[0];
      const schemaOk = ['customer_id', 'signup_date', 'signup_channel', 'home_district', 'member_tier', 'birthday_mmdd']
          .every((k) => k in c0)
        && ['transaction_id', 'customer_id', 'store_id', 'timestamp', 'items', 'amount', 'order_channel'].every((k) => k in t0)
        && ['event_id', 'customer_id', 'event_type', 'timestamp', 'source_platform'].every((k) => k in e0)
        && ['customer_id', 'channel', 'status', 'basis', 'updated_at', 'source'].every((k) => k in cs0);
      rec(14, '数据契约与规模',
        ok && schemaOk,
        `会员 ${a.counts.customers}（≥5,000）；12 个月交易 ${a.counts.transactions_total_12m}（≥50,000）；` +
        `固定种子 ${a.seed}；假设清单 ${a.assumptions.length} 条；字段契约符合=${schemaOk}`);
    } catch (e) { rec(13, '数据契约与规模', false, 'ERR ' + e.message); }

    /* ---- 15. 多选下拉批量选择交互（不因单次点击而关闭）---- */
    try {
      // 直接构造一个多选控件做隔离测试，避免依赖当前页面
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(host);
      const picked = [];
      const ms = global.UI.multiSelect({
        placeholder: '全部', allLabel: '全部', exclusiveAll: true,
        options: [{ v: 'a', label: 'A' }, { v: 'b', label: 'B' }, { v: 'c', label: 'C' }],
        values: [], onChange: (v) => picked.push(v.slice()),
      });
      host.appendChild(ms);
      ms.click();                                   // 展开
      const openedOk = !!host.querySelector('.dropdown')
        && getComputedStyle(host.querySelector('.dropdown')).opacity === '1';
      // 连续点击三个选项
      const clickOpt = (label) => {
        const items = [...host.querySelectorAll('.dropdown .dd-item')];
        const t = items.find((i) => i.textContent.includes(label));
        if (t) t.click();
      };
      clickOpt('A'); clickOpt('B'); clickOpt('C');
      const stillOpen = !!host.querySelector('.dropdown');
      const selectedCount = host.querySelectorAll('.dropdown .dd-item.selected').length;
      const noPrematureCommit = picked.length === 0;      // 勾选期间不提交
      // 点击应用 → 一次性提交
      host.querySelector('.dd-apply').click();
      const closedAfterApply = !host.querySelector('.dropdown');
      const committedOnce = picked.length === 1 && picked[0].length === 3;
      host.remove();
      rec(15, '多选下拉批量选择',
        openedOk && stillOpen && selectedCount === 3 && noPrematureCommit
        && closedAfterApply && committedOnce,
        `展开可见=${openedOk}；连点 3 项后仍展开=${stillOpen}；已勾选 ${selectedCount} 项；` +
        `勾选期间不提交=${noPrematureCommit}；点应用后关闭=${closedAfterApply}；一次性提交 3 项=${committedOnce}`);
    } catch (e) { rec(15, '多选下拉批量选择', false, 'ERR ' + e.message); }

    /* ---- 16. 累计消费／购买杯数自由区间（PRD 表 12 未限定档位）---- */
    try {
      const F = (f) => E.filterMembers(f, hq).total;
      const base = F({});
      // 自由区间：任意数值均可，不受固定档位限制
      const custom = F({ amount: { min: 137, max: 642 } });
      const customCups = F({ cups: { min: 3, max: 11 } });
      // 只填一端
      const onlyMin = F({ amount: { min: 1000, max: null } });
      const onlyMax = F({ amount: { min: null, max: 100 } });
      // 互补区间之和应等于全集（证明区间边界闭合且无遗漏）
      const lo = F({ amount: { min: null, max: 300 } });
      const hi = F({ amount: { min: 300.01, max: null } });
      const partitionOk = lo + hi === base;
      // 空区间＝不筛选
      const emptyOk = F({ amount: { min: null, max: null } }) === base
        && F({ amount: null, cups: null }) === base;
      // min>max 自动交换
      const swapOk = F({ amount: { min: 800, max: 300 } }) === F({ amount: { min: 300, max: 800 } });
      // 组合筛选
      const combo = F({ amount: { min: 300, max: 800 }, cups: { min: 10, max: null } });
      // 覆盖率递减
      const monotonic = base >= custom && base >= customCups && custom >= combo;
      rec(16, '消费金额／杯数自由区间',
        custom > 0 && custom < base && customCups > 0 && onlyMin > 0 && onlyMax > 0
        && partitionOk && emptyOk && swapOk && monotonic,
        `全集 ${base}；自定义区间 HK$137–642 → ${custom} 人；杯数 3–11 → ${customCups} 人；` +
        `仅下限 ≥HK$1000 → ${onlyMin} 人；仅上限 ≤HK$100 → ${onlyMax} 人；` +
        `互补区间之和=${lo}+${hi}=${lo + hi} 等于全集=${partitionOk}；空区间不筛选=${emptyOk}；` +
        `min>max 自动交换=${swapOk}；组合筛选 ${combo} 人；单调递减=${monotonic}`);
    } catch (e) { rec(16, '消费金额／杯数自由区间', false, 'ERR ' + e.message); }

    const pass = results.filter((r) => r.pass).length;
    const summary = {
      total: results.length, pass, fail: results.length - pass,
      results: results.map((r) => ({ id: r.id, name: r.name, pass: r.pass, detail: r.detail })),
    };
    console.table(results.map((r) => ({ 场景: r.id + '. ' + r.name, 结果: r.pass ? 'PASS' : 'FAIL', 说明: r.detail })));
    console.log(`%c验收汇总：${pass}/${results.length} 通过`,
      `font-size:14px;font-weight:bold;color:${pass === results.length ? '#2E7D5B' : '#A5192E'}`);
    return summary;
  }

  global.PCC_ACCEPTANCE = { run };
})(window);
