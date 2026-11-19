#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PCC 会员营销工作台 —— 合成数据生成器
=====================================
对应 PRD 3.2.1「生成方法与假设」与表 4「主要实体与读写边界」。

设计原则
--------
1. 固定随机种子（SEED=7085），输出 assumptions.json 假设清单，保证可复现。
2. 交易时段、客单价、频次、生日月份、门店类型均为**非均匀分布**，
   模拟香港工作日早高峰、周末、节假日与季风季节。
3. 行为由「会员原型」(archetype) 驱动，而非独立随机数 —— 同一会员的
   频次、客单、时段、偏好商品、流失风险相互一致。
4. 不包含任何真实 Pacific Coffee 会员资料。全部本地生成。

输出（data/*.json，供前端工作台直接读取）
---------------------------------------
customers, transactions, events, consent, student_eligibility,
coupon_instance, redemption, campaigns, messages, send_job, send_attempt
"""

import json
import math
import random
from datetime import datetime, timedelta, date
from pathlib import Path

import numpy as np

SEED = 7085
random.seed(SEED)
np.random.seed(SEED)

OUT = Path(__file__).resolve().parent.parent / "app" / "data"
OUT.mkdir(parents=True, exist_ok=True)

# 数据生成「今天」—— 看板默认展示区间以此为终点
TODAY = date(2026, 10, 29)
START = TODAY - timedelta(days=364)          # 覆盖 12 个月
HK_HOLIDAYS = {
    # 以「月-日」表示，覆盖 2025-11 ~ 2026-10 的主要香港公众假期
    "01-01": "元旦", "02-17": "农历年初一", "02-18": "农历年初二",
    "02-19": "农历年初三", "04-03": "耶稣受难节", "04-04": "耶稣受难节翌日",
    "04-06": "清明节翌日", "04-07": "复活节星期一", "05-01": "劳动节",
    "05-19": "佛诞", "06-19": "端午节", "07-01": "香港特别行政区成立纪念日",
    "09-26": "中秋节翌日", "10-01": "国庆日", "10-07": "重阳节",
    "10-31": "万圣节",
}

# ----------------------------------------------------------------------
# 门店（PCC 香港真实商圈命名）—— 含门店「类型」以产生不同客流曲线
# ----------------------------------------------------------------------
STORES = [
    {"store_id": "PCC-CEN01", "name": "中环店",     "district": "中西区", "type": "office",   "weight": 1.35},
    {"store_id": "PCC-QBY02", "name": "鰂鱼涌店",   "district": "东区",   "type": "office",   "weight": 1.15},
    {"store_id": "PCC-TKO03", "name": "太古城店",   "district": "东区",   "type": "mall",     "weight": 1.20},
    {"store_id": "PCC-TST04", "name": "尖沙咀店",   "district": "油尖旺", "type": "tourist",  "weight": 1.30},
    {"store_id": "PCC-MK05",  "name": "旺角店",     "district": "油尖旺", "type": "retail",   "weight": 1.10},
    {"store_id": "PCC-SWH06", "name": "西湾河店",   "district": "东区",   "type": "residential", "weight": 0.75},
    {"store_id": "PCC-CWB07", "name": "铜锣湾店",   "district": "湾仔",   "type": "retail",   "weight": 1.05},
    {"store_id": "PCC-SSP08", "name": "深水埗店",   "district": "深水埗", "type": "residential", "weight": 0.70},
    {"store_id": "PCC-STN09", "name": "沙田店",     "district": "沙田",   "type": "mall",     "weight": 0.95},
    {"store_id": "PCC-TSW10", "name": "天水围店",   "district": "元朗",   "type": "residential", "weight": 0.60},
    {"store_id": "PCC-HFC11", "name": "鲗鱼涌太古坊店", "district": "东区", "type": "office",  "weight": 0.90},
    {"store_id": "PCC-KEL12", "name": "九龙塘店",   "district": "九龙城", "type": "campus",   "weight": 0.85},
    {"store_id": "PCC-ADM13", "name": "金钟店",       "district": "中西区", "type": "office",   "weight": 1.10},
    {"store_id": "PCC-SHW14", "name": "上环店",       "district": "中西区", "type": "office",   "weight": 0.92},
    {"store_id": "PCC-WCH15", "name": "西营盘店",     "district": "中西区", "type": "residential", "weight": 0.68},
    {"store_id": "PCC-HPW16", "name": "跑马地道店",   "district": "湾仔",   "type": "office",     "weight": 0.80},
    {"store_id": "PCC-NPT17", "name": "北角店",       "district": "东区",   "type": "residential", "weight": 0.78},
    {"store_id": "PCC-TSK18", "name": "将军澳店",     "district": "西贡区", "type": "mall",       "weight": 0.92},
    {"store_id": "PCC-KWC19", "name": "葵涌店",       "district": "葵青区", "type": "residential", "weight": 0.66},
    {"store_id": "PCC-TWW20", "name": "荃湾店",       "district": "荃湾区", "type": "retail",      "weight": 0.88},
    {"store_id": "PCC-TYI21", "name": "青衣店",       "district": "葵青区", "type": "residential", "weight": 0.64},
    {"store_id": "PCC-TMN22", "name": "屯门店",       "district": "屯门区", "type": "mall",       "weight": 0.72},
    {"store_id": "PCC-TPO23", "name": "大埔店",       "district": "大埔区", "type": "residential", "weight": 0.62},
    {"store_id": "PCC-FLN24", "name": "粉岭店",       "district": "北区",   "type": "residential", "weight": 0.58},
    {"store_id": "PCC-KBW25", "name": "九龙湾店",     "district": "观塘区", "type": "office",     "weight": 0.96},
    {"store_id": "PCC-KTW26", "name": "观塘店",       "district": "观塘区", "type": "office",     "weight": 0.86},
    {"store_id": "PCC-WTS27", "name": "黄大仙店",     "district": "黄大仙区", "type": "residential", "weight": 0.70},
    {"store_id": "PCC-LCK28", "name": "荔枝角店",     "district": "深水埗区", "type": "retail",    "weight": 0.84},
    {"store_id": "PCC-HHM29", "name": "红磡店",       "district": "九龙城区", "type": "campus",   "weight": 0.76},
    {"store_id": "PCC-JDN30", "name": "佐敦店",       "district": "油尖旺", "type": "tourist",   "weight": 1.00},
]
STORE_BY_ID = {s["store_id"]: s for s in STORES}

# 非会员散客客流基准（人次/日），参考香港区域型咖啡店公开报道：
# T97 中环店约 100+ 杯/日、日营业额约 HK$4,000–5,000；社区咖啡馆约 80–120 客/日、客单约 HK$45。
# 按门店类型给出不同基准，再乘门店权重与季节/周末因子；仅用于演示，不代表真实品牌经营数据。
WALKIN_BASE = {
    "office": 26, "mall": 38, "tourist": 32,
    "retail": 28, "residential": 18, "campus": 22,
}
BENCHMARKS = [
    {
        "title": "T97 香港中环店：每天约 100+ 杯咖啡，客单约 HK$30，日营业额约 HK$4,000–5,000",
        "source": "第一财经商业数据中心 CBNData / 电商在线",
        "url": "https://m.cbndata.com/information/292099",
    },
    {
        "title": "香港社区咖啡馆：日均客流约 80–120 人，客单价约 HK$45，月营收约 HK$108,000–162,000",
        "source": "大数跨境行业访谈",
        "url": "https://m.10100.com/article/54164702",
    },
    {
        "title": "香港咖啡店盈亏平衡：日销约 200–400 杯（视定价与租金而定）",
        "source": "36氪 / 联商网（库迪香港首店测算）",
        "url": "https://m.36kr.com/p/2500926493468932",
    },
]

# ----------------------------------------------------------------------
# 会员原型：编码可辩护的行为假设
# ----------------------------------------------------------------------
ARCHETYPES = {
    "office_regular": {
        "share": 0.24, "label": "上班族常客",
        "visits_per_month": (13, 21), "avg_ticket": (44, 66),
        "weekday_bias": 0.93, "hour_peak": (8, 10), "hour_spread": 2.4,
        "item_bias": ["americano", "latte", "flat_white", "breakfast_set", "espresso"],
        "churn_risk": 0.07, "store_pref": ["office", "mall"],
        "tier_bias": {"Green": .18, "Gold": .44, "Platinum": .38},
    },
    "student_casual": {
        "share": 0.21, "label": "学生族群",
        "visits_per_month": (3, 8), "avg_ticket": (32, 48),
        "weekday_bias": 0.58, "hour_peak": (15, 18), "hour_spread": 3.0,
        "item_bias": ["frappuccino", "iced_latte", "matcha_latte", "pastry", "iced_americano"],
        "churn_risk": 0.30, "store_pref": ["campus", "retail"],
        "tier_bias": {"Green": .72, "Gold": .25, "Platinum": .03},
    },
    "weekend_social": {
        "share": 0.19, "label": "周末社交客",
        "visits_per_month": (4, 10), "avg_ticket": (62, 118),
        "weekday_bias": 0.24, "hour_peak": (14, 17), "hour_spread": 3.2,
        "item_bias": ["latte", "cake", "sandwich", "frappuccino", "cold_brew"],
        "churn_risk": 0.16, "store_pref": ["mall", "tourist"],
        "tier_bias": {"Green": .30, "Gold": .48, "Platinum": .22},
    },
    "high_value_aficionado": {
        "share": 0.09, "label": "高价值咖啡爱好者",
        "visits_per_month": (16, 26), "avg_ticket": (58, 92),
        "weekday_bias": 0.72, "hour_peak": (9, 12), "hour_spread": 3.6,
        "item_bias": ["single_origin", "cold_brew", "flat_white", "beans_250g", "latte"],
        "churn_risk": 0.05, "store_pref": ["office", "mall", "tourist"],
        "tier_bias": {"Green": .05, "Gold": .27, "Platinum": .68},
    },
    "lapsed_dormant": {
        "share": 0.17, "label": "流失／沉睡会员",
        "visits_per_month": (0.3, 2.2), "avg_ticket": (35, 62),
        "weekday_bias": 0.55, "hour_peak": (11, 16), "hour_spread": 3.4,
        "item_bias": ["americano", "latte", "tea", "pastry"],
        "churn_risk": 0.78, "store_pref": ["residential", "retail"],
        "tier_bias": {"Green": .62, "Gold": .31, "Platinum": .07},
    },
    "tourist_transient": {
        "share": 0.10, "label": "旅客／过客",
        "visits_per_month": (0.4, 1.8), "avg_ticket": (48, 96),
        "weekday_bias": 0.48, "hour_peak": (13, 18), "hour_spread": 3.8,
        "item_bias": ["latte", "cake", "frappuccino", "sandwich"],
        "churn_risk": 0.62, "store_pref": ["tourist", "retail"],
        "tier_bias": {"Green": .80, "Gold": .18, "Platinum": .02},
    },
}

ITEMS = {
    "americano":       {"name": "美式咖啡",     "price": 32, "cup": True},
    "iced_americano":  {"name": "冰美式",       "price": 34, "cup": True},
    "latte":           {"name": "拿铁",         "price": 38, "cup": True},
    "iced_latte":      {"name": "冰拿铁",       "price": 40, "cup": True},
    "flat_white":      {"name": "馥芮白",       "price": 42, "cup": True},
    "espresso":        {"name": "浓缩咖啡",     "price": 28, "cup": True},
    "cold_brew":       {"name": "冷萃咖啡",     "price": 46, "cup": True},
    "single_origin":   {"name": "单品手冲",     "price": 52, "cup": True},
    "matcha_latte":    {"name": "抹茶拿铁",     "price": 44, "cup": True},
    "frappuccino":     {"name": "星冰乐式冰沙", "price": 48, "cup": True},
    "tea":             {"name": "茶饮",         "price": 26, "cup": True},
    "breakfast_set":   {"name": "早餐套餐",     "price": 58, "cup": True},
    "sandwich":        {"name": "三文治",       "price": 42, "cup": False},
    "pastry":          {"name": "酥点",         "price": 28, "cup": False},
    "cake":            {"name": "蛋糕",         "price": 45, "cup": False},
    "beans_250g":      {"name": "咖啡豆 250g",  "price": 138, "cup": False},
}

SIGNUP_CHANNELS = ["app_store", "wechat_oa", "instagram", "facebook", "store_pos", "h5_landing"]
SIGNUP_CHANNEL_W = [0.31, 0.16, 0.18, 0.13, 0.14, 0.08]
ORDER_CHANNELS = ["app", "scan_to_order", "counter_pos", "h5"]
ORDER_CHANNEL_W = [0.34, 0.33, 0.26, 0.07]


def seasonal_multiplier(d: date) -> float:
    """季节与假期对客流的影响。假设：冬季热饮上升、夏季冰饮上升、假期商圈上升。"""
    m = d.month
    # 香港：11-1 月偏凉（热饮/常客稳定），6-8 月炎热多雨（冰饮、商场客流）
    season = {1: 1.02, 2: 0.94, 3: 1.00, 4: 0.99, 5: 1.01, 6: 1.03,
              7: 1.06, 8: 1.05, 9: 1.00, 10: 1.04, 11: 1.03, 12: 1.06}[m]
    key = f"{m:02d}-{d.day:02d}"
    if key in HK_HOLIDAYS:
        season *= 1.34 if HK_HOLIDAYS[key] not in ("万圣节",) else 1.18
    return season


def weekday_multiplier(d: date, archetype: str) -> float:
    wd = d.weekday()
    bias = ARCHETYPES[archetype]["weekday_bias"]
    if wd >= 5:                      # 周末
        return 1.0 + (1.0 - bias) * 0.85
    if wd == 4:                      # 周五
        return 1.0 + (1.0 - bias) * 0.22
    return 1.0 + (bias - 0.5) * 0.55


def pick_hour(archetype: str, d: date) -> int:
    """早高峰 / 午市 / 下午茶三峰分布，周末整体后移。"""
    a = ARCHETYPES[archetype]
    lo, hi = a["hour_peak"]
    peak = random.uniform(lo, hi)
    if d.weekday() >= 5:
        peak += 1.8
    h = np.random.normal(peak, a["hour_spread"])
    h = int(np.clip(round(h), 7, 21))
    # 叠加午市次峰
    if random.random() < 0.26:
        h = int(np.clip(round(np.random.normal(13, 1.3)), 7, 21))
    return h


def weighted_store(archetype: str, home_district: str) -> str:
    prefs = ARCHETYPES[archetype]["store_pref"]
    pool, weights = [], []
    for s in STORES:
        w = s["weight"]
        if s["type"] in prefs:
            w *= 3.1
        if s["district"] == home_district:
            w *= 2.4
        pool.append(s["store_id"])
        weights.append(w)
    tot = sum(weights)
    r = random.random() * tot
    acc = 0.0
    for sid, w in zip(pool, weights):
        acc += w
        if r <= acc:
            return sid
    return pool[-1]


def main():
    assumptions = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "seed": SEED,
        "reference_date": TODAY.isoformat(),
        "coverage": f"{START.isoformat()} ~ {TODAY.isoformat()} (12 个月)",
        "scale": "10,000 名会员 / 30 家门店 / 目标 ≥ 500,000 笔交易（12 个月）",
        "note": "全部为合成数据，不含任何真实 Pacific Coffee 会员资料。",
        "benchmarks": BENCHMARKS,
        "assumptions": [
            "会员行为由 6 种原型驱动，频次/客单/时段/偏好商品/流失风险相互一致，而非独立随机数。",
            "交易时段叠加早高峰(8-10)、午市(13)、下午茶(15-18) 三个非均匀峰值；周末整体后移约 1.8 小时。",
            "季节因子按香港气候假设：7-8 月与 12 月客流最高（夏季冰饮、年末假期）。",
            "公众假期客流上浮 18%–34%（商圈与旅游店更明显）。",
            "生日月份按香港出生人口分布加权，非均匀。",
            "电话为 8 位模拟号码，非真实号码段；生日仅保留月日。",
            "同意(consent)按渠道分别生成，直銷同意率约 71%，与 PCC 现有会员结构无关联，仅为测试假设。",
            "日销售额 = 会员交易 + 按门店类型模拟的非会员散客客流；散客流基准参考香港咖啡店公开报道，并非真实品牌数据。",
            "这些是测试假设，不能视为 PCC 真实客流规律；接入授权样本前须重新校准。",
        ],
        "archetype_distribution": {},
        "stores": STORES,
    }

    # ---------------- 会员 ----------------
    # 10,000 名会员 × 约 60 笔/年 ≈ 60 万笔交易：30 家门店每店日均有足够样本，
    # 同时保持浏览器可加载的体量（明细仅保留近 14 天）。
    n_customers = 10000
    arch_names = list(ARCHETYPES.keys())
    arch_share = np.array([ARCHETYPES[a]["share"] for a in arch_names], dtype=float)
    arch_share = arch_share / arch_share.sum()
    assigned = np.random.choice(arch_names, size=n_customers, p=arch_share)

    districts = list({s["district"] for s in STORES})
    district_w = np.array([sum(s["weight"] for s in STORES if s["district"] == d) for d in districts], dtype=float)
    district_w = district_w / district_w.sum()

    # 生日月份加权分布（香港出生人口：年初与秋季偏高）
    month_w = np.array([9.2, 8.4, 8.9, 8.1, 8.0, 7.6, 7.9, 8.6, 9.4, 8.9, 7.9, 7.1])
    month_w = month_w / month_w.sum()

    customers = []
    for i in range(n_customers):
        cid = f"M-{1001 + i}"
        arch = assigned[i]
        a = ARCHETYPES[arch]
        # 注册日期：越早注册的会员越多（成长曲线），并在近期加入新人
        if random.random() < 0.14:                    # 14% 为近 90 天新人
            signup = TODAY - timedelta(days=random.randint(0, 89))
        else:
            back = int(365 * (random.random() ** 0.72))
            signup = TODAY - timedelta(days=min(back, 1500))
        tier_pool = list(a["tier_bias"].keys())
        tier_w = np.array([a["tier_bias"][t] for t in tier_pool], dtype=float)
        tier_w = tier_w / tier_w.sum()
        tier = np.random.choice(tier_pool, p=tier_w)
        bmonth = int(np.random.choice(range(1, 13), p=month_w))
        bday = random.randint(1, 28)
        # 5% 生日缺失（PRD 3.2.3: 生日月日缺失则不触发生日券）
        birthday_mmdd = None if random.random() < 0.05 else f"{bmonth:02d}-{bday:02d}"
        # 6% 注册日期缺失或不可靠
        signup_out = None if random.random() < 0.06 else signup.isoformat()
        phone = "5" + "".join(str(random.randint(0, 9)) for _ in range(7))
        # 学生资格：仅 student_casual 与部分其他原型持有，且会有过期
        is_student = arch == "student_casual" or (arch == "weekend_social" and random.random() < 0.12)
        if is_student:
            verified = TODAY - timedelta(days=random.randint(10, 500))
            valid = verified + timedelta(days=365)
            student = {"eligible": valid >= TODAY, "verified_at": verified.isoformat(),
                       "valid_until": valid.isoformat()}
        else:
            student = None
        customers.append({
            "customer_id": cid,
            "phone": phone,
            "signup_date": signup_out,
            "signup_channel": random.choices(SIGNUP_CHANNELS, weights=SIGNUP_CHANNEL_W)[0],
            "home_district": str(np.random.choice(districts, p=district_w)),
            "member_tier": tier,
            "birthday_mmdd": birthday_mmdd,
            "archetype": arch,
            "student_eligibility": student,
        })
        assumptions["archetype_distribution"][arch] = assumptions["archetype_distribution"].get(arch, 0) + 1

    # ---------------- 交易 ----------------
    transactions, events, consent_rows = [], [], []
    txn_seq = 1
    ev_seq = 1

    for c in customers:
        arch = c["archetype"]
        a = ARCHETYPES[arch]
        signup = date.fromisoformat(c["signup_date"]) if c["signup_date"] else START
        active_from = max(signup, START)
        if active_from > TODAY:
            active_from = TODAY - timedelta(days=random.randint(5, 60))

        vpm = random.uniform(*a["visits_per_month"])
        # 流失原型：近期活跃度断崖下降
        churn_risk = a["churn_risk"] * random.uniform(0.7, 1.35)

        d = active_from
        last_visit = None
        visit_dates = []
        while d <= TODAY:
            if random.random() < churn_risk and d > TODAY - timedelta(days=200):
                d += timedelta(days=1)      # 进入沉默期
                continue
            p_day = (vpm / 30.4) * seasonal_multiplier(d) * weekday_multiplier(d, arch)
            p_day = min(p_day, 0.96)
            if random.random() < p_day:
                visit_dates.append(d)
            d += timedelta(days=1)

        # 保证大部分会员至少有一笔交易（活跃原型）
        if not visit_dates and churn_risk < 0.5:
            visit_dates.append(TODAY - timedelta(days=random.randint(1, 120)))

        for vd in visit_dates:
            hour = pick_hour(arch, vd)
            minute = random.randint(0, 59)
            ts = datetime(vd.year, vd.month, vd.day, hour, minute)
            store_id = weighted_store(arch, c["home_district"])
            stype = STORE_BY_ID[store_id]["type"]

            # 组合商品
            items = []
            n_items = 1 + (1 if random.random() < 0.42 else 0) + (1 if random.random() < 0.14 else 0)
            bias = list(a["item_bias"])
            for _ in range(n_items):
                key = random.choice(bias) if random.random() < 0.78 else random.choice(list(ITEMS.keys()))
                items.append(key)
            # 早餐时段偏好套餐
            if 7 <= hour <= 10 and random.random() < 0.34:
                items = ["breakfast_set"] + [it for it in items if ITEMS[it]["cup"]][:1]
            target = random.uniform(*a["avg_ticket"])
            if stype == "tourist":
                target *= 1.12
            if stype == "campus":
                target *= 0.88

            base = sum(ITEMS[k]["price"] for k in items)
            # 微调至目标客单
            if base < target:
                add = 0
                while base + add < target * 0.95 and add < 6:
                    k = random.choice(["cake", "pastry", "sandwich", "beans_250g", "cold_brew"])
                    items.append(k); add += 1
                    base = sum(ITEMS[k2]["price"] for k2 in items)
            amount = round(sum(ITEMS[k]["price"] for k in items) * random.uniform(0.97, 1.03), 1)

            order_channel = random.choices(ORDER_CHANNELS, weights=ORDER_CHANNEL_W)[0]
            transactions.append({
                "transaction_id": f"T-{txn_seq:06d}",
                "customer_id": c["customer_id"],
                "store_id": store_id,
                "timestamp": ts.isoformat(timespec="minutes"),
                "items": items,
                "amount": amount,
                "order_channel": order_channel,
                "cups": sum(1 for k in items if ITEMS[k]["cup"]),
            })
            txn_seq += 1
            last_visit = vd

            # 行为事件（与交易关联）
            if random.random() < 0.30:
                events.append({"event_id": f"E-{ev_seq:06d}", "customer_id": c["customer_id"],
                               "event_type": "app_open", "timestamp": ts.isoformat(timespec="minutes"),
                               "source_platform": "app"})
                ev_seq += 1
            if random.random() < 0.08:
                events.append({"event_id": f"E-{ev_seq:06d}", "customer_id": c["customer_id"],
                               "event_type": "share", "timestamp": ts.isoformat(timespec="minutes"),
                               "source_platform": random.choice(["instagram", "facebook", "whatsapp"])})
                ev_seq += 1
            if random.random() < 0.015 and amount > 60:
                events.append({"event_id": f"E-{ev_seq:06d}", "customer_id": c["customer_id"],
                               "event_type": "review_post", "timestamp": ts.isoformat(timespec="minutes"),
                               "source_platform": "app"})
                ev_seq += 1

        c["_last_visit"] = last_visit.isoformat() if last_visit else None
        c["_first_visit"] = visit_dates[0].isoformat() if visit_dates else None
        c["_visits"] = len(visit_dates)

        # ---------------- 同意记录 ----------------
        base_dm = random.random() < 0.71
        for ch, rate in [("whatsapp", 0.68), ("app_push", 0.83), ("instagram", 0.61), ("sms", 0.44)]:
            ok = base_dm and random.random() < rate
            if random.random() < 0.07:
                ok = False   # 显式退订
            consent_rows.append({
                "customer_id": c["customer_id"],
                "channel": ch,
                "purpose": "direct_marketing",
                "status": "granted" if ok else "withdrawn",
                "basis": random.choice(["opt_in_at_signup", "in_app_settings", "campaign_optin", "pos_verbal"])
                         if ok else "opt_out_request",
                "updated_at": (TODAY - timedelta(days=random.randint(1, 400))).isoformat(),
                "source": random.choice(["app", "store_pos", "h5_landing", "instagram"]),
            })
        # 部分会员数据缺失（PRD 3.2.3 缺失值处理）
        if random.random() < 0.04:
            consent_rows = [r for r in consent_rows if r["customer_id"] != c["customer_id"]]

    # 事件：coupon_view / follow 补充
    for c in random.sample(customers, 3000):
        if c["_last_visit"] is None:
            continue
        base = date.fromisoformat(c["_last_visit"])
        for _ in range(random.randint(1, 4)):
            d2 = base + timedelta(days=random.randint(0, 45))
            if d2 > TODAY:
                continue
            et = random.choice(["coupon_view", "follow", "app_open", "coupon_view"])
            events.append({"event_id": f"E-{ev_seq:06d}", "customer_id": c["customer_id"],
                           "event_type": et,
                           "timestamp": datetime(d2.year, d2.month, d2.day,
                                                 random.randint(7, 22), random.randint(0, 59)).isoformat(timespec="minutes"),
                           "source_platform": random.choice(["app", "instagram", "facebook", "whatsapp", "h5"])})
            ev_seq += 1

    # 清理内部字段
    for c in customers:
        c["last_visit_date"] = c.pop("_last_visit")
        c["first_visit_date"] = c.pop("_first_visit")
        c["visit_count"] = c.pop("_visits")

    # ---------------- 落盘 ----------------
    # 前端只需「近期明细 + 全量聚合」。为保持浏览器可加载体量，
    # 全量交易压缩为按会员/按门店/按日的聚合视图，明细仅保留近 60 天
    # （发券、回流券、看板趋势都在该窗口内），并在 assumptions 中声明。
    DETAIL_DAYS = 14
    detail_cut = (TODAY - timedelta(days=DETAIL_DAYS)).isoformat()

    recent_tx = [t for t in transactions if t["timestamp"][:10] >= detail_cut]
    recent_events = [e for e in events if e["timestamp"][:10] >= detail_cut]

    # 会员级累计（门店范围过滤时按 store 再聚合）
    by_cust_store = {}
    for t in transactions:
        k = (t["customer_id"], t["store_id"])
        a = by_cust_store.setdefault(k, {"customer_id": t["customer_id"], "store_id": t["store_id"],
                                         "visits": 0, "amount": 0.0, "cups": 0,
                                         "last_ts": "", "first_ts": t["timestamp"]})
        a["visits"] += 1
        a["amount"] = round(a["amount"] + t["amount"], 1)
        a["cups"] += t["cups"]
        if t["timestamp"] > a["last_ts"]:
            a["last_ts"] = t["timestamp"]
    member_store_stats = list(by_cust_store.values())

    # 日级聚合（看板趋势的原始事实，覆盖全 12 个月）
    daily = {}
    for t in transactions:
        d = t["timestamp"][:10]
        k = (d, t["store_id"])
        a = daily.setdefault(k, {"date": d, "store_id": t["store_id"], "txns": 0, "amount": 0.0, "cups": 0})
        a["txns"] += 1
        a["amount"] = round(a["amount"] + t["amount"], 1)
        a["cups"] += t["cups"]
    daily_agg = sorted(daily.values(), key=lambda x: (x["date"], x["store_id"]))

    # 非会员散客客流：补齐「真实日营业额」量级，避免日销售只剩会员交易。
    # 独立固定种子，保证整份数据可复现；周末、假期与季节沿用同一组因子。
    wrng = random.Random(SEED + 17)
    for one_day in (START + timedelta(days=i) for i in range((TODAY - START).days + 1)):
        wd_factor = 1.16 if one_day.weekday() >= 5 else (1.06 if one_day.weekday() == 4 else 1.0)
        for store in STORES:
            base = WALKIN_BASE[store["type"]] * store["weight"] * seasonal_multiplier(one_day) * wd_factor
            n = max(0, int(round(wrng.gauss(base, max(1.0, base * 0.18)))))
            if not n:
                continue
            ticket = wrng.uniform(42, 68) * (1.08 if store["type"] == "tourist" else 1.0)
            amount = round(n * ticket, 1)
            cups = int(round(n * wrng.uniform(0.9, 1.2)))
            key = (one_day.isoformat(), store["store_id"])
            a = daily.get(key)
            if a is None:
                a = {"date": key[0], "store_id": key[1], "txns": 0, "amount": 0.0, "cups": 0,
                     "member_txns": 0, "member_amount": 0.0, "walkin_txns": 0, "walkin_amount": 0.0}
                daily[key] = a
            a["member_txns"] = a["txns"]
            a["member_amount"] = a["amount"]
            a["walkin_txns"] = n
            a["walkin_amount"] = amount
            a["txns"] += n
            a["amount"] = round(a["amount"] + amount, 1)
            a["cups"] += cups
    daily_agg = sorted(daily.values(), key=lambda x: (x["date"], x["store_id"]))

    def dump(name, obj):
        p = OUT / name
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        return p.stat().st_size

    sizes = {}
    sizes["customers"] = dump("customers.json", customers)
    sizes["transactions_recent"] = dump("transactions.json", recent_tx)
    sizes["events"] = dump("events.json", recent_events)
    sizes["consent"] = dump("consent.json", consent_rows)
    sizes["stores"] = dump("stores.json", STORES)
    sizes["member_store_stats"] = dump("member_store_stats.json", member_store_stats)
    sizes["daily_agg"] = dump("daily_agg.json", daily_agg)

    assumptions["counts"] = {
        "customers": len(customers),
        "transactions_total_12m": len(transactions),
        "transactions_detail_window": len(recent_tx),
        "events_total": len(events),
        "events_detail_window": len(recent_events),
        "consent": len(consent_rows),
        "member_store_stats": len(member_store_stats),
        "daily_agg_rows": len(daily_agg),
    }
    assumptions["detail_window_days"] = DETAIL_DAYS
    assumptions["bytes"] = sizes
    with open(OUT / "assumptions.json", "w", encoding="utf-8") as f:
        json.dump(assumptions, f, ensure_ascii=False, indent=2)

    print(json.dumps(assumptions["counts"], ensure_ascii=False, indent=2))
    print("已生成假设清单: app/data/assumptions.json")


if __name__ == "__main__":
    main()
