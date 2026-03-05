const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * 豆瓣电影数据处理脚本
 * - 读取三种状态的CSV（done/doing/mark）
 * - 增量更新：跳过已处理的记录
 * - 输出完整的 movies.json（所有状态、所有评分）
 * - 为5星电影下载海报到本地
 */
async function processMovies() {
  const outputPath = './data/movies.json';
  const statsPath = './data/movie-stats.json';
  const posterDir = './images/movies';

  // 三种状态的CSV文件路径
  const csvFiles = {
    done: './data/raw/movie-done.csv',
    doing: './data/raw/movie-doing.csv',
    mark: './data/raw/movie-mark.csv',
  };

  // 兼容旧格式：如果新格式不存在，尝试读取旧的 movie.csv
  if (!fs.existsSync(csvFiles.done) && fs.existsSync('./data/raw/movie.csv')) {
    csvFiles.done = './data/raw/movie.csv';
    console.log('⚠️ 使用旧格式 movie.csv 作为 done 数据源');
  }

  try {
    console.log('=== 处理豆瓣电影数据 ===\n');

    // 读取现有数据（增量更新）
    let existingMovies = [];
    let existingIds = new Set();
    if (fs.existsSync(outputPath)) {
      existingMovies = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      // 迁移旧数据：添加 status 字段
      existingMovies = existingMovies.map(m => {
        if (!m.status) m.status = 'done';
        return m;
      });
      existingIds = new Set(existingMovies.map(m => m.id));
      console.log(`已有 ${existingMovies.length} 条电影数据（已迁移旧字段）`);
    }

    // 确保目录存在
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 读取并解析所有CSV文件
    const allParsedMovies = [];
    for (const [status, csvPath] of Object.entries(csvFiles)) {
      if (!fs.existsSync(csvPath)) {
        console.log(`⏭️ ${csvPath} 不存在，跳过`);
        continue;
      }

      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));

      console.log(`📂 ${csvPath}: ${lines.length - 1} 条记录`);

      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvRow(lines[i]);
        const movie = {};
        headers.forEach((header, j) => {
          movie[header] = row[j] ? row[j].replace(/"/g, '') : '';
        });
        movie._status = status;
        allParsedMovies.push(movie);
      }
    }

    console.log(`\n📊 总计从CSV读取 ${allParsedMovies.length} 条电影记录`);

    // 找出新增的电影
    const newMovies = allParsedMovies.filter(m => !existingIds.has(m.id));
    console.log(`🆕 新增 ${newMovies.length} 条电影记录`);

    // 统计评分分布
    const ratingStats = {};
    allParsedMovies.forEach(movie => {
      const star = movie.star || 'unrated';
      ratingStats[star] = (ratingStats[star] || 0) + 1;
    });

    // 统计状态分布
    const statusStats = {};
    allParsedMovies.forEach(movie => {
      statusStats[movie._status] = (statusStats[movie._status] || 0) + 1;
    });

    // 处理新增电影
    const newProcessedMovies = [];
    console.log(`\n🎬 处理 ${newMovies.length} 条新增电影:`);

    for (let i = 0; i < newMovies.length; i++) {
      const movie = newMovies[i];
      const isFiveStar = parseInt(movie.star) === 5 && movie._status === 'done';

      // 提取导演和年份信息
      const directors = extractDirectorsFromCard(movie.card);
      const year = extractYearFromCard(movie.card) || movie.pubdate?.match(/\d{4}/)?.[0] || '';

      let posterUrl = movie.poster || '';
      const movieId = movie.id;

      // 仅5星已看电影下载海报到本地
      if (isFiveStar && movieId) {
        const posterPath = path.join(posterDir, `${movieId}.jpg`);
        if (fs.existsSync(posterPath)) {
          posterUrl = generateCDNUrl(movieId);
        }
        // 注意: 实际海报下载在GitHub Actions环境中更可靠
        // 本地运行时跳过下载，保留原始URL
      }

      const processedMovie = {
        title: movie.title,
        year: year,
        rating: movie.star || 'unrated',
        status: movie._status,
        directors: directors,
        genres: movie.genres ? movie.genres.split(',') : [],
        poster_url: posterUrl,
        douban_url: movie.url,
        mark_date: movie.star_time ? movie.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: movie.comment || '',
        tags: movie.tags || '',
        id: movieId,
      };

      newProcessedMovies.push(processedMovie);

      if ((i + 1) % 100 === 0) {
        console.log(`  已处理 ${i + 1}/${newMovies.length}`);
      }
    }

    // 合并新旧数据，按标记日期倒序排列
    const allProcessedMovies = [...newProcessedMovies, ...existingMovies]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));

    // 写入完整数据
    fs.writeFileSync(outputPath, JSON.stringify(allProcessedMovies, null, 2));

    // 生成统计信息
    const stats = {
      total_movies: allProcessedMovies.length,
      total_csv_records: allParsedMovies.length,
      new_movies_this_run: newProcessedMovies.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: ratingStats,
      status_distribution: statusStats,
    };

    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    console.log('\n✅ 电影数据处理完成！');
    console.log(`📊 总数据: ${allProcessedMovies.length} 条`);
    console.log(`🆕 新增: ${newProcessedMovies.length} 条`);
    console.log(`📈 评分分布:`, ratingStats);
    console.log(`📋 状态分布:`, statusStats);

  } catch (error) {
    console.error('❌ 数据处理失败:', error);
    process.exit(1);
  }
}

// CSV行解析（处理引号内的逗号）
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

  // card格式: "年份 / 国家 / 类型 / 导演 / 演员"
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

// 生成 jsDelivr CDN URL
function generateCDNUrl(movieId) {
  return `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/images/movies/${movieId}.jpg`;
}

// 运行处理函数
processMovies();