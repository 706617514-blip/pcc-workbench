#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""判定 app/selftest.html 的验收输出。

用法：python3 tools/check_acceptance.py dom.html

退出码 0 = 全部通过；1 = 有失败或数量不足。
"""
import re
import sys
import pathlib

EXPECTED = 21


def main() -> int:
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "dom.html")
    if not path.exists():
        print("找不到文件：%s" % path)
        return 1

    html = path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'<pre id="selftest-out">(.*?)</pre>', html, re.S)
    if not m:
        print("页面上没有 #selftest-out —— 验收没跑起来（数据没加载完？看 job 里的服务日志）")
        return 1

    out = m.group(1)
    out = out.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")

    head = re.search(r"RESULT\s+(\d+)/(\d+)", out)
    if not head:
        print("没找到 RESULT 行，实际输出：\n%s" % out[:2000])
        return 1

    passed, total = int(head.group(1)), int(head.group(2))
    fails = [ln for ln in out.splitlines() if ln.startswith("FAIL")]

    print("验收结果：%d/%d" % (passed, total))
    for ln in out.splitlines():
        if ln.startswith("PASS") or ln.startswith("FAIL"):
            print("  " + ln)

    problems = []
    if fails:
        problems.append("有 %d 条失败" % len(fails))
    if total != EXPECTED:
        problems.append("用例数量应为 %d，实际 %d" % (EXPECTED, total))
    if passed != total:
        problems.append("通过数 %d 少于总数 %d" % (passed, total))

    if problems:
        print("\n不合格：" + "；".join(problems))
        return 1

    print("\n全部通过：%d/%d" % (passed, total))
    return 0


if __name__ == "__main__":
    sys.exit(main())
