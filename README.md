# Douban Data Sync

这个仓库用于自动同步和处理我的豆瓣电影数据。

## 功能

- 🎬 每日自动从豆瓣同步电影观看记录
- ⭐ 筛选出5星好评电影
- 📊 生成结构化的JSON数据
- 🖼️ 保留电影海报图片链接

## 数据结构

### data/movies.json
```json
[
  {
    "title": "电影标题",
    "year": "2024",
    "rating": "5",
    "directors": ["导演名"],
    "genres": ["剧情", "科幻"],
    "poster_url": "海报图片URL",
    "douban_url": "豆瓣页面链接",
    "mark_date": "2024-01-01",
    "comment": "我的评价",
    "id": "豆瓣ID"
  }
]
```

### data/stats.json
```json
{
  "total_movies": 50,
  "last_update": "2024-01-01T00:00:00.000Z",
  "data_source": "douban",
  "user_id": "59715677"
}
```

## 使用方法

### 主站引用数据
在Hugo站点中通过以下URL获取数据：
```
https://raw.githubusercontent.com/luli-lula/douban-data/main/data/movies.json
```

### 手动触发同步
1. 进入Actions页面
2. 选择"Sync Douban Data"工作流
3. 点击"Run workflow"

## 自动化

- **同步频率**: 每天北京时间0点自动同步
- **数据筛选**: 仅保留5星评分电影
- **数据排序**: 按标记时间倒序排列
- **数量限制**: 最多保留100部电影

## 数据源

- 豆瓣用户ID: 59715677
- 数据来源: https://movie.douban.com/people/59715677/