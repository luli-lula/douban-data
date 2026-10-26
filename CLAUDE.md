# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Douban data synchronization repository that automatically fetches movie/book marking records from Douban (all statuses: done/doing/mark) and stores them as JSON for use in a Hugo static site via GitHub Pages.

## Commands

- `node scripts/sync-douban.js movie|book|all` - 同步（需要 cookie，见下）
- `DRY_RUN=1 node scripts/sync-douban.js all` - 只报告差异，不写文件
- `POSTERS_ONLY=1 node scripts/sync-douban.js all` - 不访问列表，只给本地记录补海报
- `FORCE=1 ...` - 跳过「已有记录变化超过 5%」的异常保护（首次对账或确认无误时用）
- Actions → "Sync Douban" → "Run workflow" 手动触发

## Architecture

- 数据源是登录态的网页列表（`/people/59715677/{collect,do,wish}?mode=list`），**不用** Frodo App 接口——它会漏掉情色/同性题材、部分老片，且不反映标记后的修改
- Cookie: 环境变量 `DOUBAN_COOKIE` 或 `~/.config/douban/cookie`；GitHub secret `DOUBAN_COOKIE`。不要把 cookie 写进仓库或日志
- 完整性: 每个列表解析出的条数必须等于页面 `<title>` 里的总数，否则抛错、不写文件
- 合并规则: 已看/已读的本地记录**永不删除**；想看/在看在网页上没有 = 取消标记 → 移除；评分/短评/标签/日期以网页为准；新条目才读条目页（导演、类型、出版社、海报）
- 海报: 评分 ≥ 3 保存到 `images/{movies,books}/{id}.jpg`（220px 宽 JPEG，sharp 缩放），`poster_url` 指向 jsDelivr。jsDelivr 对 GitHub 仓库有约 50MB 限制，images 目前约 33MB，加图前先看体积
- 失败: 原因写入 `.sync-error`（gitignored），workflow 用它发 Bark（secret `BARK_KEY`）
- 手工补过的标题/字段会保留：只有标题为「未知…」时才会被网页标题覆盖

## Key Files

- `scripts/sync-douban.js` - 唯一的同步脚本
- `data/movies.json` / `data/books.json` - 全部数据（所有状态、所有评分）
- `data/movie-stats.json` / `data/book-stats.json` - 统计
- `images/movies/` / `images/books/` - 海报
- `.github/workflows/sync-douban.yml` - 每周日 UTC 16:00

## Data Structure

**Movies**: `title`, `year`, `rating`(1-5/unrated), `status`(done/doing/mark), `directors`[], `genres`[], `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`(逗号分隔), `id`

**Books**: `title`, `year`, `rating`, `status`, `author`[], `publisher`, `genres`[], `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`

字段名要和 Hugo 模板一致（`author` 不是 `authors`，`poster_url` 不是 `cover_url`）。

## External

- Douban user id: 59715677
- Hugo 站点读取: `https://raw.githubusercontent.com/luli-lula/douban-data/main/data/{movies,books}.json`，模板在 luli-lula.github.io 仓库的 `douban-movies.html` / `douban-books.html`
- 依赖: 仅 `sharp`（pnpm）

## 每月浏览器对账（当前的主要同步方式）

没有配置 `DOUBAN_COOKIE` 时，数据靠 Claude 的定时任务 `douban-monthly-reconcile`（每月 1 日 9:00）维护，借内置浏览器里已登录的豆瓣会话，不需要 cookie 文件：

1. 在 movie.douban.com / book.douban.com 页面里运行 `scripts/browser-reconcile.js`（对比 GitHub main 上的 data/*.json，输出一份很小的差异 JSON）
2. `node scripts/apply-reconcile.js <movie|book> diff.json` 应用差异、补海报、更新统计和 README
3. 提交并推送

规则和 `sync-douban.js` 一致：已看/已读永不删除，想看/在看被取消标记才移除，标题为「未知…」（豆瓣已删除）的条目不用空值覆盖。每次运行结束会推送通知；浏览器里的豆瓣登录失效时也会通知，需要重新登录/导入 cookie。
