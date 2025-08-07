const fs = require('fs');
const path = require('path');

async function processMovieData() {
  const rawDataPath = './data/raw/movie.json';
  const outputPath = './data/movies.json';
  
  try {
    // 检查原始数据文件是否存在
    if (!fs.existsSync(rawDataPath)) {
      console.log('原始数据文件不存在，跳过处理');
      return;
    }
    
    // 读取原始数据
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
    console.log(`读取到 ${rawData.length} 部电影数据`);
    
    // 筛选和处理数据
    const processedData = rawData
      .filter(movie => {
        // 筛选5星电影
        return movie.rating === '5' || movie.rating === 5;
      })
      .map(movie => ({
        title: movie.title,
        year: movie.year || extractYearFromTitle(movie.title),
        rating: movie.rating.toString(),
        directors: movie.directors || [],
        genres: movie.genres || [],
        poster_url: movie.pic || movie.image || '',
        douban_url: movie.url || `https://movie.douban.com/subject/${movie.id}/`,
        mark_date: movie.create_time || movie.date || new Date().toISOString().split('T')[0],
        comment: movie.comment || movie.review || '',
        id: movie.id
      }))
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date)) // 按标记日期倒序
      .slice(0, 100); // 取最新100部
    
    console.log(`处理后得到 ${processedData.length} 部5星电影`);
    
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
      user_id: '59715677'
    };
    
    fs.writeFileSync('./data/stats.json', JSON.stringify(stats, null, 2));
    
    console.log('数据处理完成！');
    console.log(`- 5星电影: ${processedData.length} 部`);
    console.log(`- 最新标记: ${processedData[0]?.mark_date || 'N/A'}`);
    
  } catch (error) {
    console.error('数据处理失败:', error);
    process.exit(1);
  }
}

// 从电影标题中提取年份
function extractYearFromTitle(title) {
  const yearMatch = title.match(/\((\d{4})\)/);
  return yearMatch ? yearMatch[1] : '';
}

// 运行处理函数
processMovieData();