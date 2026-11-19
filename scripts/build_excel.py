#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 PCC 工作台的合成数据整理成 PPT 用 Excel 工作簿。

用法：
    node scripts/export_runtime_data.mjs
    python3 scripts/build_excel.py

产出：docs/PCC_模拟数据演示.xlsx
"""
import json
from collections import defaultdict
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'app' / 'data'
RUNTIME = ROOT / '.runtime-export.json'
OUT = ROOT / 'docs' / 'PCC_模拟数据演示.xlsx'

CREAM = 'FFF8EF'
CARD = 'FFFDF8'
BURGUNDY = '6B0B0C'
BROWN = '3B1E17'
GOLD = 'B8893B'
LINE = 'E8DAD2'
MUTED = '7A5C52'

HEAD_FILL = PatternFill('solid', fgColor=BURGUNDY)
HEAD_FONT = Font(name='Avenir Next', size=10.5, bold=True, color='FFFFFF')
TITLE_FONT = Font(name='Avenir Next', size=18, bold=True, color=BROWN)
SUB_FONT = Font(name='Avenir Next', size=10.5, color=MUTED)
CELL_FONT = Font(name='Avenir Next', size=10, color=BROWN)
ALT_FILL = PatternFill('solid', fgColor='FBF3EA')
THIN = Side(style='hair', color=LINE)
BORDER = Border(bottom=THIN)

FMT_INT = '#,##0'
FMT_MONEY = '"HK$"#,##0.0'
FMT_PCT = '0.0%'
FMT_DATE = 'yyyy-mm-dd'


def load(name):
    return json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))


def header(ws, row, labels, widths=None):
    for i, label in enumerate(labels, 1):
        c = ws.cell(row=row, column=i, value=label)
        c.fill = HEAD_FILL
        c.font = HEAD_FONT
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[row].height = 26
    if widths:
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w


def write_rows(ws, rows, start=2, formats=None, stripe=True):
    for r_idx, row in enumerate(rows, start):
        for c_idx, value in enumerate(row, 1):
            c = ws.cell(row=r_idx, column=c_idx, value=value)
            c.font = CELL_FONT
            c.border = BORDER
            c.alignment = Alignment(vertical='center')
            if stripe and r_idx % 2 == 0:
                c.fill = ALT_FILL
            if formats and formats.get(c_idx):
                c.number_format = formats[c_idx]
    ws.freeze_panes = ws.cell(row=start, column=1)
    if rows:
        ws.auto_filter.ref = f'A{start - 1}:{get_column_letter(len(rows[0]))}{start + len(rows) - 1}'


def title(ws, text, subtitle=None):
    ws['A1'] = text
    ws['A1'].font = TITLE_FONT
    if subtitle:
        ws['A2'] = subtitle
        ws['A2'].font = SUB_FONT
    ws.sheet_view.showGridLines = False


def sheet_intro(wb, assumptions, runtime):
    ws = wb.active
    ws.title = '使用说明'
    ws.sheet_properties.tabColor = BURGUNDY
    ws.sheet_view.showGridLines = False
    for col, w in {'A': 26, 'B': 60, 'C': 46, 'D': 34}.items():
        ws.column_dimensions[col].width = w
    title(ws, 'PCC 会员营销工作台 · 模拟数据说明',
          '全部为合成演示数据，不含任何真实 Pacific Coffee 会员或经营数据。')
    row = 4
    ws.cell(row=row, column=1, value='数据口径').font = Font(bold=True, color=BURGUNDY, size=12)
    row += 1
    counts = assumptions.get('counts', {})
    facts = [
        ('参考日期', assumptions.get('reference_date', '')),
        ('覆盖区间', assumptions.get('coverage', '')),
        ('门店数量', f"{len(assumptions.get('stores', []))} 家（香港 18 区，6 种商圈类型）"),
        ('会员数量', f"{counts.get('customers', 0):,} 人"),
        ('12 个月会员交易', f"{counts.get('transactions_total_12m', 0):,} 笔"),
        ('门店日销售记录', f"{counts.get('daily_agg_rows', 0):,} 行（每日 × 每店）"),
        ('券实例', f"约 {len(runtime.get('redemptions', [])):,} 笔核销；近 30 天发放 {runtime['metrics']['issued']:,} 张"),
        ('固定随机种子', assumptions.get('seed', '')),
        ('生成方法', '会员行为由 6 种原型驱动；时段、季节、假期、商圈与客单价均为非均匀假设。'),
        ('日销售额口径', '会员交易 + 按门店类型估算的非会员散客；散客客流参考香港咖啡店公开报道。'),
    ]
    for k, v in facts:
        ws.cell(row=row, column=1, value=k).font = Font(bold=True, color=BROWN, size=10)
        c = ws.cell(row=row, column=2, value=v)
        c.font = CELL_FONT
        c.alignment = Alignment(wrap_text=True, vertical='center')
        row += 1

    row += 1
    ws.cell(row=row, column=1, value='公开参考基准（仅用于设定量级，非真实品牌数据）').font = Font(bold=True, color=BURGUNDY, size=12)
    row += 1
    header(ws, row, ['参考报道 / 口径', '关键数字', '来源', '链接'], [26, 60, 46, 34])
    row += 1
    for b in assumptions.get('benchmarks', []):
        ws.cell(row=row, column=1, value=b['title']).font = CELL_FONT
        ws.cell(row=row, column=2, value=b['source']).font = CELL_FONT
        c = ws.cell(row=row, column=3, value=b['url'])
        c.font = Font(name='Avenir Next', size=9, color='0563C1', underline='single')
        c.hyperlink = b['url']
        row += 1

    row += 1
    ws.cell(row=row, column=1, value='假设条款').font = Font(bold=True, color=BURGUNDY, size=12)
    row += 1
    for i, note in enumerate(assumptions.get('assumptions', []), 1):
        ws.cell(row=row, column=1, value=f'{i:02d}')
        c = ws.cell(row=row, column=2, value=note)
        c.font = CELL_FONT
        c.alignment = Alignment(wrap_text=True, vertical='center')
        row += 1

    row += 1
    ws.cell(row=row, column=1, value='重新生成').font = Font(bold=True, color=BURGUNDY, size=12)
    row += 1
    for line in [
        'python3 scripts/generate_data.py && python3 scripts/compact_store_stats.py',
        'node scripts/export_runtime_data.mjs && python3 scripts/build_excel.py',
    ]:
        ws.cell(row=row, column=1, value=line).font = Font(name='Menlo', size=9.5, color=BROWN)
        row += 1


def sheet_stores(wb, assumptions, daily, runtime):
    ws = wb.create_sheet('门店总览')
    ws.sheet_properties.tabColor = GOLD
    title(ws, '30 家门店 · 12 个月汇总与近 30 天核销',
          '日均销售额 = 会员交易 + 非会员散客估算；核销数据来自券实例，口径与看板一致。')
    by_store = defaultdict(lambda: defaultdict(float))
    for d in daily:
        s = by_store[d['store_id']]
        for k in ('txns', 'amount', 'cups', 'member_txns', 'member_amount', 'walkin_txns', 'walkin_amount'):
            s[k] += d.get(k, 0)
        s['days'] += 1
    from_date = runtime['date_from']
    red = defaultdict(lambda: {'count': 0, 'paid': 0.0})
    for r in runtime['redemptions']:
        if r['redeemed_at'][:10] >= from_date:
            red[r['store_id']]['count'] += 1
            red[r['store_id']]['paid'] += r['paid_amount']
    total_red = sum(v['count'] for v in red.values()) or 1

    rows = []
    for s in assumptions['stores']:
        agg = by_store[s['store_id']]
        r = red.get(s['store_id'], {'count': 0, 'paid': 0.0})
        rows.append([
            s['store_id'], s['name'], s['district'], s['type'], s['weight'],
            int(agg['days']), int(agg['txns']), round(agg['amount'], 1),
            round(agg['amount'] / max(1, agg['days']), 1),
            int(agg['cups']), int(agg['member_txns']), int(agg['walkin_txns']),
            round(agg['member_amount'], 1), round(agg['walkin_amount'], 1),
            r['count'], round(r['paid'], 1), r['count'] / total_red,
        ])
    rows.sort(key=lambda x: -x[8])
    header(ws, 3, ['门店ID', '门店', '行政区', '商圈类型', '客流权重', '营业天数',
                   '12月交易笔数', '12月销售额', '日均销售额', '12月杯数',
                   '会员交易', '散客交易', '会员销售额', '散客销售额',
                   '近30天核销', '近30天实付', '核销占比'],
           [15, 18, 13, 13, 10, 10, 14, 15, 15, 12, 12, 12, 15, 15, 13, 15, 11])
    write_rows(ws, rows, start=4, formats={5: '0.00', 7: FMT_INT, 8: FMT_MONEY, 9: FMT_MONEY,
                                           10: FMT_INT, 11: FMT_INT, 12: FMT_INT,
                                           13: FMT_MONEY, 14: FMT_MONEY, 15: FMT_INT,
                                           16: FMT_MONEY, 17: FMT_PCT}, stripe=True)
    chart = BarChart()
    chart.type = 'bar'
    chart.style = 10
    chart.title = '日均销售额（HK$）· 30 家门店'
    chart.height, chart.width = 17, 26
    chart.add_data(Reference(ws, min_col=9, min_row=3, max_row=3 + len(rows)), titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=2, min_row=4, max_row=3 + len(rows)))
    chart.legend = None
    ws.add_chart(chart, 'S3')


def sheet_daily(wb, assumptions, daily):
    ws = wb.create_sheet('门店日销售')
    ws.sheet_properties.tabColor = 'CDE3E8'
    names = {s['store_id']: s['name'] for s in assumptions['stores']}
    districts = {s['store_id']: s['district'] for s in assumptions['stores']}
    types = {s['store_id']: s['type'] for s in assumptions['stores']}
    rows = [[d['date'], d['store_id'], names.get(d['store_id'], ''),
             districts.get(d['store_id'], ''), types.get(d['store_id'], ''),
             int(d.get('member_txns', 0)), int(d.get('walkin_txns', 0)), int(d['txns']),
             int(d['cups']), round(d.get('member_amount', 0), 1),
             round(d.get('walkin_amount', 0), 1), round(d['amount'], 1)] for d in daily]
    header(ws, 1, ['日期', '门店ID', '门店', '行政区', '商圈类型', '会员交易', '散客交易',
                   '总交易', '杯数', '会员销售额', '散客销售额', '日销售额'],
           [13, 15, 18, 13, 13, 11, 11, 11, 10, 15, 15, 15])
    write_rows(ws, rows, start=2, formats={6: FMT_INT, 7: FMT_INT, 8: FMT_INT, 9: FMT_INT,
                                           10: FMT_MONEY, 11: FMT_MONEY, 12: FMT_MONEY})

    ws2 = wb.create_sheet('月度趋势')
    ws2.sheet_properties.tabColor = 'F4D6D3'
    monthly = defaultdict(float)
    for d in daily:
        monthly[(d['date'][:7], types.get(d['store_id'], '其他'))] += d['amount']
    months = sorted({k[0] for k in monthly})
    cats = ['office', 'mall', 'tourist', 'retail', 'residential', 'campus']
    header(ws2, 1, ['月份'] + [f'{c} 销售额' for c in cats] + ['合计'],
           [13] + [17] * len(cats) + [16])
    rows2 = []
    for m in months:
        vals = [round(monthly.get((m, c), 0), 1) for c in cats]
        rows2.append([m] + vals + [round(sum(vals), 1)])
    write_rows(ws2, rows2, start=2, formats={i: FMT_MONEY for i in range(2, len(cats) + 3)})
    chart = LineChart()
    chart.title = '按商圈类型的月销售额走势'
    chart.height, chart.width = 10, 24
    chart.add_data(Reference(ws2, min_col=2, max_col=2 + len(cats), min_row=1, max_row=1 + len(rows2)), titles_from_data=True)
    chart.set_categories(Reference(ws2, min_col=1, min_row=2, max_row=1 + len(rows2)))
    ws2.add_chart(chart, 'K2')


def sheet_coupons(wb, runtime):
    ws = wb.create_sheet('券种与活动')
    ws.sheet_properties.tabColor = BURGUNDY
    title(ws, '近 30 天券种 / 活动表现', '发放、领取、核销按各自发生时间计数；率值以同期发放群体为分母。')
    m = runtime['metrics']
    header(ws, 4, ['券种', '折扣', '发放', '领取', '核销', '领取率', '核销率'],
           [20, 12, 13, 13, 13, 12, 12])
    rows = []
    for k, v in m['byType'].items():
        if not v['issued']:
            continue
        rows.append([v['name'], v['discount_label'], v['issued'], v['claimed'], v['used'],
                     v['claim_rate'], v['redeem_rate']])
    rows.sort(key=lambda x: -x[4])
    write_rows(ws, rows, start=5, formats={3: FMT_INT, 4: FMT_INT, 5: FMT_INT, 6: FMT_PCT, 7: FMT_PCT})

    start = 5 + len(rows) + 2
    ws.cell(row=start - 1, column=1, value='活动表现').font = Font(bold=True, color=BURGUNDY, size=12)
    header(ws, start, ['活动', '券种', '折扣', '方式', '范围', '发放', '领取', '核销', '实付'],
           [26, 16, 10, 12, 16, 12, 12, 12, 15])
    rows2 = [[c['name'], c['coupon_name'], c['discount_label'],
              '自动规则' if c['mode'] == 'auto' else '人工发放', c['scope_label'],
              c['issued'], c['claimed'], c['used'], c['paid_amount']]
             for c in m['byCampaign'] if c['issued'] > 0]
    rows2.sort(key=lambda x: -x[8])
    write_rows(ws, rows2, start=start + 1,
               formats={6: FMT_INT, 7: FMT_INT, 8: FMT_INT, 9: FMT_MONEY})


def sheet_trend(wb, runtime):
    ws = wb.create_sheet('30日趋势')
    ws.sheet_properties.tabColor = 'CDE3E8'
    title(ws, '近 30 天发放 / 领取 / 核销趋势', '与工作台数据中心默认区间一致。')
    m = runtime['metrics']
    rows = [[t['date'], t['issued'], t['claimed'], t['used']] for t in m['trend']]
    header(ws, 3, ['日期', '发放', '领取', '核销'], [15, 14, 14, 14])
    write_rows(ws, rows, start=4, formats={2: FMT_INT, 3: FMT_INT, 4: FMT_INT})
    chart = LineChart()
    chart.title = '每日发券与核销'
    chart.height, chart.width = 10, 24
    chart.add_data(Reference(ws, min_col=2, max_col=4, min_row=3, max_row=3 + len(rows)), titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=1, min_row=4, max_row=3 + len(rows)))
    ws.add_chart(chart, 'F3')


def sheet_redemptions(wb, runtime):
    ws = wb.create_sheet('核销明细')
    ws.sheet_properties.tabColor = 'A66B2A'
    names = {s['store_id']: s['name'] for s in runtime['stores']}
    rows = [[r['redeemed_at'][:10], r['redeemed_at'][11:16],
             r['store_id'], names.get(r['store_id'], ''),
             r['coupon_type'], r['campaign_id'],
             r['order_amount'], r['paid_amount'], r['discount_applied']]
            for r in runtime['redemptions']]
    rows.sort(key=lambda x: (x[0], x[1]))
    header(ws, 1, ['核销日期', '时间', '门店ID', '门店', '券种', '活动ID',
                   '订单原价', '实付金额', '折扣'],
           [14, 10, 15, 18, 16, 14, 14, 14, 12])
    write_rows(ws, rows, start=2, formats={7: FMT_MONEY, 8: FMT_MONEY})


def sheet_archetypes(wb, assumptions):
    ws = wb.create_sheet('会员原型')
    ws.sheet_properties.tabColor = 'EED5CE'
    title(ws, '会员原型分布', '行为由原型驱动，而非独立随机数；用于解释频次 / 客单 / 时段的差异。')
    dist = assumptions.get('archetype_distribution', {})
    labels = {
        'office_regular': '上班族常客', 'student_casual': '学生族群',
        'weekend_social': '周末社交客', 'high_value_aficionado': '高价值咖啡爱好者',
        'lapsed_dormant': '流失／沉睡会员', 'tourist_transient': '旅客／过客',
    }
    total = sum(dist.values()) or 1
    rows = [[labels.get(k, k), k, v, v / total] for k, v in sorted(dist.items(), key=lambda x: -x[1])]
    header(ws, 4, ['原型', '代码', '会员数', '占比'], [24, 26, 14, 12])
    write_rows(ws, rows, start=5, formats={3: FMT_INT, 4: FMT_PCT})
    chart = BarChart()
    chart.type = 'bar'
    chart.title = '会员原型分布'
    chart.height, chart.width = 9, 18
    chart.add_data(Reference(ws, min_col=3, min_row=4, max_row=4 + len(rows)), titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=1, min_row=5, max_row=4 + len(rows)))
    chart.legend = None
    ws.add_chart(chart, 'F4')


def main():
    assumptions = load('assumptions')
    daily = load('daily_agg')
    runtime = json.loads(RUNTIME.read_text(encoding='utf-8'))
    wb = Workbook()
    sheet_intro(wb, assumptions, runtime)
    sheet_stores(wb, assumptions, daily, runtime)
    sheet_daily(wb, assumptions, daily)
    sheet_coupons(wb, runtime)
    sheet_trend(wb, runtime)
    sheet_redemptions(wb, runtime)
    sheet_archetypes(wb, assumptions)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    print(f'已生成 {OUT}（{OUT.stat().st_size / 1e6:.1f} MB，{len(wb.sheetnames)} 个工作表）')


if __name__ == '__main__':
    main()
