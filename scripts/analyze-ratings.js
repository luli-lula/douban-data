const fs = require('fs');

// 分析豆瓣数据中的评分分布
async function analyzeRatings() {
  const rawDataPath = './data/raw/movie.json';
  
  if (!fs.existsSync(rawDataPath)) {
    console.log('❌ 原始数据文件不存在，请先运行数据同步');
    return;
  }
  
  console.log('=== 豆瓣数据评分分析 ===');
  
  try {
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
    console.log(`📊 总电影数: ${rawData.length}`);
    
    // 分析评分分布
    const ratingStats = {};
    let fiveStarMovies = [];
    let unratedCount = 0;
    
    rawData.forEach((movie, index) => {
      const rating = movie.rating;
      
      if (rating === null || rating === undefined) {
        unratedCount++;
      } else {
        ratingStats[rating] = (ratingStats[rating] || 0) + 1;
        
        // 收集5星电影
        if (rating === 5 || rating === '5') {
          fiveStarMovies.push({
            title: movie.subject.title,
            year: movie.subject.year,
            rating: rating,
            create_time: movie.create_time,
            index: index
          });
        }
      }
    });
    
    console.log('\n📈 评分分布:');
    Object.keys(ratingStats).sort().forEach(rating => {
      console.log(`  ${rating}星: ${ratingStats[rating]}部`);
    });
    console.log(`  未评分: ${unratedCount}部`);
    
    console.log(`\n⭐ 5星电影: ${fiveStarMovies.length}部`);
    
    if (fiveStarMovies.length > 0) {
      console.log('\n🎬 5星电影列表 (前10部):');
      fiveStarMovies.slice(0, 10).forEach((movie, i) => {
        console.log(`  ${i+1}. ${movie.title} (${movie.year}) - 标记于 ${movie.create_time}`);
      });
    } else {
      console.log('\n⚠️ 没有找到5星电影！');
      console.log('建议检查:');
      console.log('1. 用户是否真的给电影评了5星？');
      console.log('2. 评分字段是否使用了其他格式？');
      console.log('3. 可能需要调整筛选条件');
    }
    
    // 显示一些样本数据
    console.log('\n📝 数据样本 (前3部电影的评分情况):');
    rawData.slice(0, 3).forEach((movie, i) => {
      console.log(`${i+1}. "${movie.subject.title}" - 评分: ${movie.rating}, 状态: ${movie.status}`);
    });
    
  } catch (error) {
    console.error('❌ 数据分析失败:', error.message);
  }
}

analyzeRatings();