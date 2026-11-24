#!/bin/bash
# Weekly Douban backup, run by launchd (top.ailula.douban-sync, Thursday 20:00).
# 1. take the login cookie from Chrome  2. sync all lists  3. commit and push.
# Any failure sends an urgent Bark push. Log: ~/Library/Logs/douban-sync.log (last run only).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export LANG=en_US.UTF-8
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NOTIFY="$HOME/ai-context/skills/notify/notify.sh"
cd "$REPO" || exit 1
: > "$HOME/Library/Logs/douban-sync.log" 2>/dev/null  # keep only the last run
echo "run $(date '+%F %T')"

fail() { "$NOTIFY" -u "豆瓣同步失败" "$1" douban-data; echo "FAIL: $1"; exit 1; }

[ -z "$(git status --porcelain)" ] || fail "douban-data 有未提交的改动，本周跳过"
git pull -q --rebase origin main || fail "git pull 失败"
pnpm install -s --frozen-lockfile || fail "pnpm install 失败"

uv run -q --with browser-cookie3 python scripts/cookie-from-chrome.py
case $? in
  0) ;;
  2) fail "Chrome 里的豆瓣登录过期了：在 Chrome 打开 douban.com 登录一下，下周会自动恢复" ;;
  *) fail "读不到 Chrome 的 cookie（钥匙串权限？）" ;;
esac

node scripts/sync-douban.js all || fail "$(head -c 200 .sync-error 2>/dev/null || echo 'sync-douban.js 出错')"

git add data/ images/ README.md
if git diff --cached --quiet; then echo "no changes"; exit 0; fi
git commit -q -m "🔄 同步豆瓣数据 $(date +%F)" || fail "git commit 失败"
git push -q origin main || fail "git push 失败"
echo "pushed"
