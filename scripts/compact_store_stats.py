#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 app/data/member_store_stats.json 由「行数组」压成「列式」。

engine.js 读取的是列式结构 { stores: [...], cols: { c, s, v, a, p, l, f } }；
generate_data.py 生成的是行数组（约 5.7MB），因此重新生成数据后需要跑一次本脚本
（压完约 2.25MB）。

用法：
    python3 scripts/compact_store_stats.py
"""
import json
import os
from pathlib import Path

P = Path(__file__).resolve().parent.parent / "app" / "data" / "member_store_stats.json"


def main():
    rows = json.loads(P.read_text(encoding="utf-8"))
    if isinstance(rows, dict) and "cols" in rows:
        print("已是列式结构，无需处理：", P)
        return

    cols = {"c": [], "s": [], "v": [], "a": [], "p": [], "l": [], "f": []}
    sidx, stores = {}, []
    for r in rows:
        if r["store_id"] not in sidx:
            sidx[r["store_id"]] = len(stores)
            stores.append(r["store_id"])
        cols["c"].append(int(r["customer_id"][2:]))
        cols["s"].append(sidx[r["store_id"]])
        cols["v"].append(r["visits"])
        cols["a"].append(r["amount"])
        cols["p"].append(r["cups"])
        cols["l"].append(r["last_ts"])
        cols["f"].append(r["first_ts"])

    out = {"stores": stores, "cols": cols}
    P.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("行数 %d → 门店 %d 家，压缩后 %.2f MB" % (len(rows), len(stores), os.path.getsize(P) / 1e6))


if __name__ == "__main__":
    main()
