const fs = require('fs');
const path = require('path');

async function saveAllData() {
  const rawDataPath = './data/raw/movie.json';
  const outputPath = './data/movies.json';
  const statsPath = './data/stats.json';
  
  try {
    // 检查原始数据文件是否存在
    if (!fs.existsSync(rawDataPath)) {
      console.log('原始数据文件不存在，跳过处理');
      return;
    }
    
    // 读取原始数据
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
    console.log(`读取到 ${rawData.length} 部电影数据`);
    
    // 暂时保存所有数据，不做筛选
    const processedData = rawData.map(movie => {
      const subject = movie.subject;
      const movieId = subject.id;
      
      return {
        title: subject.title,
        year: subject.year || '',
        rating: movie.rating ? movie.rating.toString() : 'null',
        directors: subject.directors?.map(d => d.name) || [],
        genres: subject.genres || [],
        poster_url: subject.pic?.normal || subject.pic?.large || '',
        douban_url: subject.url || `https://movie.douban.com/subject/${movieId}/`,
        mark_date: movie.create_time || new Date().toISOString().split('T')[0],
        comment: movie.comment || '',
        id: movieId,
        user_rating: movie.rating, // 保留原始评分用于分析
        status: movie.status
      };
    });
    
    // 按标记日期倒序排列
    processedData.sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
    
    console.log(`处理完成，共 ${processedData.length} 部电影`);
    
    // 分析评分分布
    const ratingStats = {};
    let unratedCount = 0;
    
    processedData.forEach(movie => {
      const rating = movie.user_rating;
      if (rating === null || rating === undefined) {
        unratedCount++;
      } else {
        ratingStats[rating] = (ratingStats[rating] || 0) + 1;
      }
    });
    
    console.log('\n评分分布:');
    Object.keys(ratingStats).sort().forEach(rating => {
      console.log(`  ${rating}星: ${ratingStats[rating]}部`);
    });
    console.log(`  未评分: ${unratedCount}部`);
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 写入处理后的数据
    fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
    
    // 生成统计信息
    const stats = {
      total_movies: processedData.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: ratingStats,
      unrated_count: unratedCount
    };
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    
    console.log('\n数据处理完成！');
    console.log(`- 总电影: ${processedData.length} 部`);
    console.log(`- 最新标记: ${processedData[0]?.mark_date || 'N/A'}`);
    
  } catch (error) {
    console.error('数据处理失败:', error);
    process.exit(1);
  }
}

// 运行处理函数
saveAllData();