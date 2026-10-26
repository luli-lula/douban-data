#!/usr/bin/env bash
# 一次性配置豆瓣 cookie：校验 → 写入 ~/.config/douban/cookie → 设置 GitHub secret DOUBAN_COOKIE
# 输入不回显，值不会出现在命令行参数或 shell 历史里。
set -euo pipefail

REPO="luli-lula/douban-data"
FILE="$HOME/.config/douban/cookie"

echo "在 Chrome 打开 douban.com → 开发者工具(Cmd+Option+I) → Application → Cookies → https://www.douban.com"
echo "找到 dbcl2 和 bid 两行，双击 Value 列复制。"
echo
read -r -s -p "dbcl2 的值: " DBCL2; echo
read -r -s -p "bid 的值:   " BID; echo

# 去掉可能带的引号和空白，再统一加引号
DBCL2="${DBCL2//\"/}"; DBCL2="$(echo -n "$DBCL2" | tr -d '[:space:]')"
BID="${BID//\"/}";     BID="$(echo -n "$BID" | tr -d '[:space:]')"
[ -n "$DBCL2" ] && [ -n "$BID" ] || { echo "❌ 有一项是空的"; exit 1; }
COOKIE="dbcl2=\"$DBCL2\"; bid=$BID"

echo "校验 cookie..."
TITLE=$(curl -s -m 20 -H "Cookie: $COOKIE" \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' \
  "https://movie.douban.com/people/59715677/collect?mode=list" | grep -o '<title>[^<]*</title>' || true)
if ! echo "$TITLE" | grep -q '我看过的影视'; then
  echo "❌ 校验失败（拿到的页面标题: ${TITLE:-空}）。cookie 可能复制错了，或被豆瓣拦截。"
  exit 1
fi
echo "✅ 有效：$TITLE"

mkdir -p "$(dirname "$FILE")"
umask 077
printf '%s' "$COOKIE" > "$FILE"
chmod 600 "$FILE"
echo "✅ 已写入 $FILE"

printf '%s' "$COOKIE" | gh secret set DOUBAN_COOKIE --repo "$REPO"
echo "✅ 已设置 GitHub secret DOUBAN_COOKIE"
