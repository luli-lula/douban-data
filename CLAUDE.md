# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Douban data synchronization repository that automatically fetches movie/book marking records from Douban (all statuses: done/doing/mark) and stores them as JSON for use in a Hugo static site via GitHub Pages.

## Commands

- `node scripts/sync-douban.js movie|book|all` - 同步（需要 cookie，见下）
- `DRY_RUN=1 node scripts/sync-douban.js all` - 只报告差异，不写文件
- `POSTERS_ONLY=1 node scripts/sync-douban.js all` - 不访问列表，只给本地记录补海报
- `FORCE=1 ...` - 跳过「已有记录变化超过 5%」的异常保护（首次对账或确认无误时用）
- `launchctl kickstart gui/$(id -u)/top.ailula.douban-sync` 手动跑一次每周流程

## Architecture

- 数据源是登录态的网页列表（`/people/59715677/{collect,do,wish}?mode=list`），**不用** Frodo App 接口——它会漏掉情色/同性题材、部分老片，且不反映标记后的修改
- Cookie: 环境变量 `DOUBAN_COOKIE` 或 `~/.config/douban/cookie`（由 cookie-from-chrome.py 每周刷新）。不要把 cookie 写进仓库或日志
- 完整性: 每个列表解析出的条数必须等于页面 `<title>` 里的总数，否则抛错、不写文件
- 合并规则: 已看/已读的本地记录**永不删除**；想看/在看在网页上没有 = 取消标记 → 移除；评分/短评/标签/日期以网页为准；新条目才读条目页（导演、类型、出版社、海报）
- 海报: 评分 ≥ 3 保存到 `images/{movies,books}/{id}.jpg`（220px 宽 JPEG，sharp 缩放），`poster_url` 指向 jsDelivr。jsDelivr 对 GitHub 仓库有约 50MB 限制，images 目前约 33MB，加图前先看体积
- 失败: 原因写入 `.sync-error`（gitignored），weekly-sync.sh 用它发 Bark
- 手工补过的标题/字段会保留：只有标题为「未知…」时才会被网页标题覆盖

## Key Files

- `scripts/sync-douban.js` - 唯一的同步脚本
- `data/movies.json` / `data/books.json` - 全部数据（所有状态、所有评分）
- `data/movie-stats.json` / `data/book-stats.json` - 统计
- `images/movies/` / `images/books/` - 海报
- `scripts/weekly-sync.sh` - 每周流程（launchd 调用）

## Data Structure

**Movies**: `title`, `year`, `rating`(1-5/unrated), `status`(done/doing/mark), `directors`[], `genres`[], `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`(逗号分隔), `id`

**Books**: `title`, `year`, `rating`, `status`, `author`[], `publisher`, `genres`[], `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`

字段名要和 Hugo 模板一致（`author` 不是 `authors`，`poster_url` 不是 `cover_url`）。

## External

- Douban user id: 59715677
- Hugo 站点读取: `https://raw.githubusercontent.com/luli-lula/douban-data/main/data/{movies,books}.json`，模板在 luli-lula.github.io 仓库的 `douban-movies.html` / `douban-books.html`
- 依赖: 仅 `sharp`（pnpm）

## 每周同步（唯一的同步方式）

`scripts/weekly-sync.sh` 由 launchd `top.ailula.douban-sync`（`~/Library/LaunchAgents/top.ailula.douban-sync.plist`）每周四 20:00 在本机运行：
1. `scripts/cookie-from-chrome.py` 从 Chrome Default 资料读豆瓣 cookie → `~/.config/douban/cookie`（不打印值）
2. `node scripts/sync-douban.js all`
3. 有变化就 commit + push
任何一步失败都用 `~/ai-context/skills/notify/notify.sh -u` 响铃通知。本仓库就是豆瓣数据的备份。
