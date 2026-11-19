#!/usr/bin/env node
/**
 * 把浏览器端种子逻辑产生的券实例 / 核销记录导出为 JSON，供 build_excel.py 生成 PPT 用工作簿。
 * 运行：node scripts/export_runtime_data.mjs [输出路径]
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..', 'app');
const out = process.argv[2] || path.join(here, '..', '.runtime-export.json');

globalThis.window = globalThis;
globalThis.fetch = async (url) => {
  const fp = path.join(appDir, url);
  if (!fs.existsSync(fp)) throw new Error('缺少数据文件：' + fp);
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(fp, 'utf8')) };
};
for (const f of ['js/const.js', 'js/engine.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(appDir, f), 'utf8'), { filename: f });
}

const E = globalThis.PCC_ENGINE;
const C = globalThis.PCC_CONST;
await E.init();

const hq = E.ACCOUNTS.find((a) => a.role.startsWith('L1_HQ'));
const dateFrom = C.DATA_TODAY.slice(0, 8) + '01';
const metrics = E.computeMetrics({ couponTypes: [], campaignIds: [], dateFrom, dateTo: C.DATA_TODAY }, hq);
const couponById = new Map(E.DB.couponInstance.map((c) => [c.coupon_id, c]));

const redemptions = E.DB.redemption.map((r) => {
  const cp = couponById.get(r.coupon_id) || {};
  return {
    redemption_id: r.redemption_id, coupon_id: r.coupon_id,
    coupon_type: r.coupon_type || cp.coupon_type || '未知',
    campaign_id: cp.campaign_id || '', store_id: r.store_id,
    redeemed_at: r.redeemed_at, order_amount: r.order_amount,
    paid_amount: r.paid_amount, discount_applied: r.discount_applied,
  };
});

const payload = {
  generated_at: new Date().toISOString(),
  today: C.DATA_TODAY,
  date_from: dateFrom,
  metrics: {
    issued: metrics.issued, claimed: metrics.claimed, used: metrics.used,
    paid_amount: metrics.paid_amount, claim_rate: metrics.claim_rate,
    redeem_rate: metrics.redeem_rate,
    byType: metrics.byType, byCampaign: metrics.byCampaign, trend: metrics.trend,
  },
  redemptions,
  stores: E.DB.stores,
  campaigns: E.DB.campaigns.map((c) => ({
    campaign_id: c.campaign_id, name: c.name, coupon_type: c.coupon_type,
    mode: c.mode, status: c.status, store_scope: c.store_scope,
    store_id: c.store_id, scope_label: E.scopeLabelOf(c),
  })),
};
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`已导出 ${redemptions.length} 条核销记录 → ${out}`);
