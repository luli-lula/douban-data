# Douban Data Sync

自动同步和处理豆瓣电影与书籍标记数据。

## 功能

- 🎬 每周自动从豆瓣同步电影记录（已看/在看/想看）
- 📚 每周自动从豆瓣同步书籍记录（已读/在读/想读）
- 📊 生成结构化的JSON数据，供Hugo博客使用
- 🖼️ 为5星电影/书籍下载封面图片，通过jsDelivr CDN提供

## 数据结构

### data/movies.json
```json
{
  "title": "电影标题",
  "year": "2024",
  "rating": "5",
  "status": "done",
  "directors": ["导演名"],
  "genres": ["剧情", "科幻"],
  "poster_url": "海报图片URL",
  "douban_url": "豆瓣页面链接",
  "mark_date": "2024-01-01",
  "comment": "我的评价",
  "tags": "标签",
  "id": "豆瓣ID"
}
```

### data/books.json
```json
{
  "title": "书籍标题",
  "year": "2024",
  "rating": "5",
  "status": "done",
  "author": ["作者名"],
  "publisher": "出版社",
  "genres": [],
  "poster_url": "封面图片URL",
  "douban_url": "豆瓣页面链接",
  "mark_date": "2024-01-01",
  "comment": "我的评价",
  "tags": "标签",
  "id": "豆瓣ID"
}
```

`status` 字段值: `done`(已看/已读) | `doing`(在看/在读) | `mark`(想看/想读)

`rating` 字段值: `1`-`5` 星或 `unrated`

## 使用方法

### 主站引用数据
```
https://raw.githubusercontent.com/luli-lula/douban-data/main/data/movies.json
https://raw.githubusercontent.com/luli-lula/douban-data/main/data/books.json
```

### 手动触发同步
1. 进入Actions页面
2. 选择"Sync Douban Movies Data"或"Sync Douban Books Data"
3. 点击"Run workflow"

## 自动化

- **同步频率**: 每周日北京时间0点（电影）/1点（书籍）
- **数据范围**: 所有历史标记数据（已看/在看/想看 × 所有评分）
- **增量更新**: 仅处理新增记录，跳过已有数据

## 数据源

- 豆瓣用户ID: 59715677
- 电影: https://movie.douban.com/people/59715677/
- 书籍: https://book.douban.com/people/59715677/