# Douban Data Sync

自动同步豆瓣电影与书籍标记数据。

## 数据总览

<!-- STATS:START -->
| 类型 | 总数 | 已看/已读 | 在看/在读 | 想看/想读 | ⭐5 | ⭐4 | ⭐3 | ⭐2 | ⭐1 | 未评分 | 最后同步 |
|------|------|----------|----------|----------|-----|-----|-----|-----|-----|--------|---------|
| 🎬 电影 | 2608 | 2599 | 0 | 9 | 301 | 527 | 753 | 225 | 33 | 769 | 2026-04-05 |
| 📚 书籍 | 1051 | 1026 | 2 | 23 | 90 | 148 | 267 | 64 | 10 | 472 | 2026-04-05 |
<!-- STATS:END -->

## 同步日志

<!-- SYNC_LOG:START -->
| 日期 | 类型 | 新增 | 总数 | 状态 |
|------|------|------|------|------|
| 2026-04-05 | 🎬 电影 | +3 | 2608 | ✅ +3 新增 |
| 2026-03-29 | 📚 书籍 | +3 | 1051 | ✅ +3 新增 |
| 2026-03-29 | 🎬 电影 | +4 | 2605 | ✅ +4 新增 |
| 2026-03-22 | 📚 书籍 | +0 | 1048 | ✅ 无新增 |
| 2026-03-22 | 📚 书籍 | +823 | 1048 | ✅ 首次全量同步（替换 doumark-action） |
| 2026-03-22 | 🎬 电影 | +10 | 2601 | ✅ 全量同步 + 去重修复 |
<!-- SYNC_LOG:END -->

## 架构

```
Douban Frodo API → sync-douban.js → movies.json / books.json
                                   → images/ (5星封面)
                                   → stats.json (统计)
```

- **同步脚本**: `scripts/sync-douban.js`，直接调用豆瓣 Frodo API
- **分页策略**: 使用 API 返回的 `total` 字段，确保全量抓取
- **增量更新**: 只添加新记录，已有记录保留，status 字段实时更新
- **同步频率**: 每周日北京时间 0:00（电影）/ 1:00（书籍）

## 数据引用

```
https://raw.githubusercontent.com/luli-lula/douban-data/main/data/movies.json
https://raw.githubusercontent.com/luli-lula/douban-data/main/data/books.json
```

## 手动触发

Actions → "Sync Douban Movies" 或 "Sync Douban Books" → Run workflow

## 数据结构

**Movies** (`data/movies.json`):
`title`, `year`, `rating`(1-5/unrated), `status`(done/doing/mark), `directors`[], `genres`[], `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`

**Books** (`data/books.json`):
`title`, `year`, `rating`, `status`, `author`[], `publisher`, `genres`[], `poster_url`, `douban_url`, `mark_date`, `comment`, `tags`, `id`

## 数据源

- 豆瓣用户: [59715677](https://www.douban.com/people/59715677/)
