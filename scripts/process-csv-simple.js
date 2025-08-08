const fs = require('fs');
const path = require('path');
const https = require('https');

async function processCsvSimple() {
  const csvPath = './data/raw/movie.csv';
  const outputPath = './data/movies.json';
  const statsPath = './data/stats.json';
  const backupDir = './data/backup';
  const allMoviesPath = './data/backup/all-movies.json';
  
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
    
    // 确保海报目录存在
    const posterDir = './images/posters';
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    
    // 处理新增的5星电影（下载图片）
    const newProcessedMovies = [];
    console.log(`\n🎬 处理 ${newFiveStarMovies.length} 部新增5星电影:`);
    
    for (let i = 0; i < newFiveStarMovies.length; i++) {
      const movie = newFiveStarMovies[i];
      console.log(`处理 ${i + 1}/${newFiveStarMovies.length}: ${movie.title}`);
      
      // 提取导演和年份信息
      const directors = extractDirectorsFromCard(movie.card);
      const year = extractYearFromCard(movie.card) || movie.pubdate?.match(/\d{4}/)?.[0] || '';
      
      let posterUrl = movie.poster || '';
      const movieId = movie.id;
      
      // 如果海报已下载，使用CDN URL；否则保持原URL
      if (movieId && fs.existsSync(path.join(posterDir, `${movieId}.jpg`))) {
        posterUrl = generateCDNUrl(movieId);
      }
      
      const processedMovie = {
        title: movie.title,
        year: year,
        rating: '5',
        directors: directors,
        genres: movie.genres ? movie.genres.split(',') : [],
        poster_url: posterUrl,
        douban_url: movie.url,
        mark_date: movie.star_time ? movie.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: movie.comment || '',
        id: movieId
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
    
    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // 写入网站展示数据（最多100部5星电影）
    fs.writeFileSync(outputPath, JSON.stringify(allProcessedMovies, null, 2));
    
    // === 创建完整数据备份 ===
    console.log(`\\n📦 创建完整数据备份...`);
    
    // 读取现有的完整备份数据
    let existingAllMovies = [];
    let existingAllIds = new Set();
    if (fs.existsSync(allMoviesPath)) {
      existingAllMovies = JSON.parse(fs.readFileSync(allMoviesPath, 'utf8'));
      existingAllIds = new Set(existingAllMovies.map(m => m.id));
      console.log(`已有完整备份数据 ${existingAllMovies.length} 部电影`);
    }
    
    // 处理所有电影数据（不仅仅是5星）
    const allNewProcessedMovies = [];
    for (let i = 0; i < allMovies.length; i++) {
      const movie = allMovies[i];
      
      // 如果已存在，跳过处理
      if (existingAllIds.has(movie.id)) {
        continue;
      }
      
      const directors = extractDirectorsFromCard(movie.card);
      const year = extractYearFromCard(movie.card) || movie.pubdate?.match(/\d{4}/)?.[0] || '';
      
      const processedMovie = {
        title: movie.title,
        year: year,
        rating: movie.star || 'unrated',
        directors: directors,
        genres: movie.genres ? movie.genres.split(',') : [],
        poster_url: movie.poster || '',
        douban_url: movie.url,
        mark_date: movie.star_time ? movie.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: movie.comment || '',
        tags: movie.tags || '',
        intro: movie.intro || '',
        pubdate: movie.pubdate || '',
        douban_rating: movie.rating || '',
        id: movie.id
      };
      
      allNewProcessedMovies.push(processedMovie);
    }
    
    // 合并新旧完整数据
    const completeAllMovies = [...allNewProcessedMovies, ...existingAllMovies]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
    
    // 写入完整备份数据
    fs.writeFileSync(allMoviesPath, JSON.stringify(completeAllMovies, null, 2));
    console.log(`完整备份包含 ${completeAllMovies.length} 部电影`);
    console.log(`新增 ${allNewProcessedMovies.length} 部电影到备份`);
    
    // 生成统计信息
    const stats = {
      total_movies: allProcessedMovies.length,
      total_all_movies: allMovies.length,
      new_movies_this_run: newProcessedMovies.length,
      total_backup_movies: completeAllMovies.length,
      new_backup_movies: allNewProcessedMovies.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: ratingStats,
      note: '网站展示数据（5星电影，最多100部）+ 完整备份数据（所有电影）'
    };
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    
    console.log('\n✅ 数据处理完成！');
    console.log(`\n📊 网站展示数据 (data/movies.json):`);
    console.log(`- 新增5星电影: ${newProcessedMovies.length} 部`);
    console.log(`- 总5星电影: ${allProcessedMovies.length} 部`);
    console.log(`\n📦 完整备份数据 (data/backup/all-movies.json):`);
    console.log(`- 新增电影: ${allNewProcessedMovies.length} 部`);
    console.log(`- 备份总计: ${completeAllMovies.length} 部`);
    console.log(`\n🖼️ 图片: 已下载到本地并使用jsDelivr CDN`);
    
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

// 从豆瓣电影页面提取原始图片URL
async function extractOriginalImageUrl(doubanUrl) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3',
        'Cache-Control': 'no-cache'
      }
    };
    
    const req = https.get(doubanUrl, options, (response) => {
      if (response.statusCode === 200) {
        let html = '';
        response.on('data', (chunk) => {
          html += chunk;
        });
        response.on('end', () => {
          // 提取图片URL，支持多种格式
          const patterns = [
            /https:\/\/img\d+\.doubanio\.com\/view\/photo\/s_ratio_poster\/public\/p\d+\.(jpg|webp)/,
            /https:\/\/img\d+\.doubanio\.com\/view\/photo\/l\/public\/p\d+\.(jpg|webp)/,
            /https:\/\/img\d+\.doubanio\.com\/view\/photo\/m\/public\/p\d+\.(jpg|webp)/,
          ];
          
          for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
              resolve(match[0]);
              return;
            }
          }
          resolve(null);
        });
      } else {
        resolve(null);
      }
    });
    
    req.on('error', () => {
      resolve(null);
    });
    
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

// 下载图片函数
async function downloadImage(url, filepath) {
  if (!url || url === '' || fs.existsSync(filepath)) {
    return fs.existsSync(filepath) ? filepath : null;
  }
  
  return new Promise((resolve) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://movie.douban.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    };
    
    https.get(url, options, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filepath);
        });
        file.on('error', (error) => {
          file.close();
          fs.unlink(filepath, () => {});
          resolve(null);
        });
      } else {
        file.close();
        fs.unlink(filepath, () => {});
        resolve(null);
      }
    }).on('error', (error) => {
      file.close();
      fs.unlink(filepath, () => {});
      resolve(null);
    }).setTimeout(20000, function() {
      this.destroy();
      file.close();
      fs.unlink(filepath, () => {});
      resolve(null);
    });
  });
}

// 睡眠函数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 生成 jsDelivr CDN URL
function generateCDNUrl(movieId) {
  return `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/images/posters/${movieId}.jpg`;
}

// 运行处理函数
processCsvSimple();