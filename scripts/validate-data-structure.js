// 验证数据处理脚本的测试数据
const testData = [
  {
    "comment": "",
    "rating": null,
    "sharing_text": "https://www.douban.com/doubanapp/dispatch/movie/36996737 来自@豆瓣App",
    "sharing_url": "https://www.douban.com/doubanapp/dispatch?uri=/subject/36996737/interest/4605888510",
    "tags": [],
    "charts": [],
    "platforms": [],
    "vote_count": 0,
    "create_time": "2025-08-05 10:14:19",
    "status": "done",
    "id": 4605888510,
    "is_private": false,
    "subject": {
      "rating": {
        "count": 1681,
        "max": 10,
        "star_count": 3.5,
        "value": 6.7
      },
      "controversy_reason": "",
      "pubdate": [
        "2024-09-06(多伦多电影节)"
      ],
      "pic": {
        "large": "https://img9.doubanio.com/view/photo/m_ratio_poster/public/p2916101775.jpg",
        "normal": "https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2916101775.jpg"
      },
      "honor_infos": [],
      "is_show": false,
      "vendor_icons": [],
      "year": "2024",
      "card_subtitle": "2024 / 法国 / 喜剧 爱情 / 劳拉·皮亚尼 / 卡米莉·拉瑟福德 巴勃罗·保利",
      "id": "36996737",
      "genres": [
        "喜剧",
        "爱情"
      ],
      "title": "简·奥斯汀毁了我的生活",
      "is_released": true,
      "actors": [
        {
          "name": "卡米莉·拉瑟福德"
        },
        {
          "name": "巴勃罗·保利"
        }
      ],
      "color_scheme": {
        "is_dark": true,
        "primary_color_light": "72706b",
        "_base_color": [
          0.11111111111111123,
          0.06521739130434775,
          0.1803921568627451
        ],
        "secondary_color": "f9f8f4",
        "_avg_color": [
          0.07692307692307686,
          0.11607142857142853,
          0.4392156862745098
        ],
        "primary_color_dark": "4c4a47"
      },
      "type": "movie",
      "has_linewatch": false,
      "vendor_desc": "",
      "cover_url": "https://dou.img.lithub.cc/movie/36996737.jpg",
      "sharing_url": "https://www.douban.com/doubanapp/dispatch/movie/36996737",
      "url": "https://movie.douban.com/subject/36996737/",
      "release_date": null,
      "uri": "douban://douban.com/movie/36996737",
      "subtype": "movie",
      "directors": [
        {
          "name": "劳拉·皮亚尼"
        }
      ],
      "album_no_interact": false,
      "article_intros": [],
      "null_rating_reason": ""
    }
  }
];

console.log('=== 数据结构验证 ===');

// 测试当前的筛选逻辑
console.log('\n1. 筛选逻辑测试:');
const movie = testData[0];
console.log(`电影: ${movie.subject.title}`);
console.log(`用户评分: ${movie.rating} (null表示未评分)`);
console.log(`是否通过5星筛选: ${movie.rating === 5 || movie.rating === '5'}`);

// 测试数据提取
console.log('\n2. 数据提取测试:');
const subject = movie.subject;
const movieId = subject.id;

console.log(`标题: ${subject.title}`);
console.log(`年份: ${subject.year}`);
console.log(`导演: ${subject.directors?.map(d => d.name).join(', ')}`);
console.log(`类型: ${subject.genres?.join(', ')}`);
console.log(`海报URL: ${subject.pic?.normal}`);
console.log(`豆瓣URL: ${subject.url}`);
console.log(`标记时间: ${movie.create_time}`);
console.log(`用户评价: ${movie.comment}`);
console.log(`电影ID: ${movieId}`);

// 问题分析
console.log('\n3. 问题分析:');
console.log('⚠️ 发现问题: rating = null，这个电影不会被筛选为5星电影');
console.log('💡 可能的解决方案:');
console.log('   1. 检查是否有其他表示评分的字段');
console.log('   2. 可能需要查看更多数据样本');
console.log('   3. 或者用户确实没有给这部电影评5星');

console.log('\n=== 验证完成 ===');