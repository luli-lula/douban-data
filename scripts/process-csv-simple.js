const fs = require('fs');
const path = require('path');

async function processCsvSimple() {
  const csvPath = './data/raw/movie.csv';
  const outputPath = './data/movies.json';
  const statsPath = './data/stats.json';
  
  try {
    if (!fs.existsSync(csvPath)) {
      console.log('原始CSV文件不存在，跳过处理');
      return;
    }
    
    console.log('=== 简化处理CSV豆瓣数据 ===');
    
    // 读取现有的处理数据（如果存在）
    let existingMovies = [];
    let existingIds = new Set();
    if (fs.existsSync(outputPath)) {
      existingMovies = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      existingIds = new Set(existingMovies.map(m => m.id));
      console.log(`已有 ${existingMovies.length} 部电影数据`);
    }
    
    // 读取和解析CSV
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    
    console.log(`读取到 ${lines.length - 1} 部电影数据`);
    
    // 解析所有电影数据
    const allMovies = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvRow(lines[i]);
      const movie = {};
      
      headers.forEach((header, j) => {
        movie[header] = row[j] ? row[j].replace(/"/g, '') : '';
      });
      
      allMovies.push(movie);
    }
    
    // 筛选5星电影
    const fiveStarMovies = allMovies.filter(movie => {
      const userRating = parseInt(movie.star);
      return userRating === 5;
    });
    
    // 找出新增的5星电影
    const newFiveStarMovies = fiveStarMovies.filter(movie => 
      !existingIds.has(movie.id)
    );
    
    console.log(`总计 ${fiveStarMovies.length} 部5星电影，新增 ${newFiveStarMovies.length} 部`);
    
    // 分析评分分布
    const ratingStats = {};
    allMovies.forEach(movie => {
      const star = movie.star || 'unrated';
      ratingStats[star] = (ratingStats[star] || 0) + 1;
    });
    
    // 处理新增的5星电影（暂不下载图片）
    const newProcessedMovies = [];
    console.log(`\n🎬 处理 ${newFiveStarMovies.length} 部新增5星电影:`);
    
    for (let i = 0; i < newFiveStarMovies.length; i++) {
      const movie = newFiveStarMovies[i];
      console.log(`处理 ${i + 1}/${newFiveStarMovies.length}: ${movie.title}`);
      
      // 提取导演和年份信息
      const directors = extractDirectorsFromCard(movie.card);
      const year = extractYearFromCard(movie.card) || movie.pubdate?.match(/\d{4}/)?.[0] || '';
      
      // 直接使用豆瓣CDN URL，不下载到本地
      const posterUrl = movie.poster || '';
      
      const processedMovie = {
        title: movie.title,
        year: year,
        rating: '5',
        directors: directors,
        genres: movie.genres ? movie.genres.split(',') : [],
        poster_url: posterUrl, // 使用原始豆瓣CDN URL
        douban_url: movie.url,
        mark_date: movie.star_time ? movie.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: movie.comment || '',
        id: movie.id
      };
      
      newProcessedMovies.push(processedMovie);
    }
    
    // 合并新旧数据，按标记日期倒序排列
    const allProcessedMovies = [...newProcessedMovies, ...existingMovies]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date))
      .slice(0, 100); // 保持最多100部
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 写入处理后的数据
    fs.writeFileSync(outputPath, JSON.stringify(allProcessedMovies, null, 2));
    
    // 生成统计信息
    const stats = {
      total_movies: allProcessedMovies.length,
      total_all_movies: allMovies.length,
      new_movies_this_run: newProcessedMovies.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: ratingStats,
      note: '使用豆瓣原始CDN URL，未下载到本地'
    };
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    
    console.log('\n✅ 数据处理完成！');
    console.log(`- 新增5星电影: ${newProcessedMovies.length} 部`);
    console.log(`- 总5星电影: ${allProcessedMovies.length} 部`);
    console.log(`- 总电影: ${allMovies.length} 部`);
    console.log(`- 图片: 使用豆瓣CDN，未下载到本地`);
    
  } catch (error) {
    console.error('❌ 数据处理失败:', error);
    process.exit(1);
  }
}

// 简单的CSV行解析
function parseCsvRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

// 从card字段提取导演信息
function extractDirectorsFromCard(card) {
  if (!card) return [];
  
  const parts = card.split(' / ');
  if (parts.length >= 4) {
    const directorPart = parts[3];
    return directorPart ? [directorPart] : [];
  }
  return [];
}

// 从card字段提取年份
function extractYearFromCard(card) {
  if (!card) return '';
  
  const yearMatch = card.match(/^(\d{4})/);
  return yearMatch ? yearMatch[1] : '';
}

// 运行处理函数
processCsvSimple();