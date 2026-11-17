#!/bin/bash
# PCC 会员营销工作台 —— macOS 一键启动本地预览
# 双击本文件即可：自动起本地服务 + 打开浏览器。
# 若提示「无法打开，因为它来自身份不明的开发者」，右键点本文件 → 打开 → 打开。
# 首次使用如提示没有执行权限，在终端跑一次：chmod +x 启动预览.command

cd "$(dirname "$0")" || exit 1

PORT=8777
URL="http://127.0.0.1:${PORT}/app/index.html"

echo "=============================================="
echo "  PCC 会员营销工作台 · 本地预览"
echo "=============================================="
echo ""

# ---- 1. 找 Python 3 ----
PYEXE=""
for cand in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if command -v "$cand" >/dev/null 2>&1; then PYEXE="$cand"; break; fi
done

if [ -z "$PYEXE" ]; then
  echo "[错误] 没有找到 Python 3。"
  echo ""
  echo "请任选一种方式安装后重试："
  echo "  1) 打开终端执行： xcode-select --install"
  echo "  2) 或用 Homebrew： brew install python3"
  echo ""
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

# ---- 2. 端口被占用就先清掉（多半是上次的服务没关）----
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 ${PORT} 已被占用，正在关闭旧服务…"
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t | xargs kill 2>/dev/null
  sleep 1
fi

# ---- 3. 起服务（后台，日志写到临时文件）----
LOG="$(mktemp -t pcc-server)"
"$PYEXE" -m http.server "$PORT" --bind 127.0.0.1 >"$LOG" 2>&1 &
SRV_PID=$!

# ---- 4. 等服务就绪 ----
echo "正在启动本地服务…"
READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "$URL"; then READY=1; break; fi
  if ! kill -0 "$SRV_PID" 2>/dev/null; then break; fi
  sleep 0.3
done

if [ "$READY" -ne 1 ]; then
  echo ""
  echo "[错误] 服务启动失败，日志如下："
  echo "----------------------------------------------"
  cat "$LOG"
  echo "----------------------------------------------"
  echo ""
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

echo "服务已就绪，正在打开浏览器…"
open "$URL"

echo ""
echo "----------------------------------------------"
echo " 打开地址： $URL"
echo " 线上演示： https://706617514-blip.github.io/pcc-workbench/"
echo " 验收自测： http://127.0.0.1:${PORT}/app/selftest.html"
echo "----------------------------------------------"
echo ""
echo "首次加载需读取约 15MB 合成数据，请稍候数秒。"
echo ""
echo "【重要】本窗口关闭 = 服务停止 = 网页打不开。"
echo "        演示期间请保持此窗口开着，可最小化。"
echo "        想停止服务：按 Control + C，或直接关掉本窗口。"
echo ""

# ---- 5. 前台常驻，Ctrl+C 或关窗即停 ----
trap 'echo ""; echo "正在停止服务…"; kill "$SRV_PID" 2>/dev/null; rm -f "$LOG"; exit 0' INT TERM EXIT
wait "$SRV_PID"
