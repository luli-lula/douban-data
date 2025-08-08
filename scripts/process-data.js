const fs = require('fs');
const path = require('path');
const https = require('https');
const { promisify } = require('util');

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
    
    // 筛选5星电影 - 适配doumark-action数据结构
    const filteredMovies = rawData
      .filter(movie => {
        // doumark-action中，rating字段是用户评分（1-5）
        const userRating = movie.rating;
        // 只保留用户评了5星的电影
        return userRating === 5 || userRating === '5';
      })
      .slice(0, 100); // 先限制数量再下载图片
    
    console.log(`筛选得到 ${filteredMovies.length} 部5星电影`);
    
    // 确保海报目录存在
    const posterDir = './images/posters';
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    
    // 下载海报图片并处理数据
    const processedData = [];
    for (let i = 0; i < filteredMovies.length; i++) {
      const movie = filteredMovies[i];
      console.log(`处理电影 ${i + 1}/${filteredMovies.length}: ${movie.subject.title}`);
      
      // 适配doumark-action的数据结构
      const subject = movie.subject;
      const movieId = subject.id;
      
      let posterUrl = '';
      const originalPosterUrl = subject.pic?.normal || subject.pic?.large || '';
      
      if (originalPosterUrl && movieId) {
        const posterPath = path.join(posterDir, `${movieId}.jpg`);
        const downloadResult = await downloadImage(originalPosterUrl, posterPath);
        
        if (downloadResult) {
          // 如果下载成功，使用 CDN URL
          posterUrl = generateCDNUrl(movieId);
        } else {
          // 如果下载失败，保留原URL
          posterUrl = originalPosterUrl;
        }
      }
      
      const processedMovie = {
        title: subject.title,
        year: subject.year || extractYearFromTitle(subject.title),
        rating: movie.rating ? movie.rating.toString() : '5', // 用户评分
        directors: subject.directors?.map(d => d.name) || [],
        genres: subject.genres || [],
        poster_url: posterUrl,
        douban_url: subject.url || `https://movie.douban.com/subject/${movieId}/`,
        mark_date: movie.create_time || new Date().toISOString().split('T')[0],
        comment: movie.comment || '',
        id: movieId
      };
      
      processedData.push(processedMovie);
    }
    
    // 按标记日期倒序排列
    processedData.sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
    
    console.log(`处理完成，共 ${processedData.length} 部5星电影`);
    
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

// 下载图片函数
async function downloadImage(url, filepath) {
  if (!url || url === '') {
    console.log('跳过空URL');
    return null;
  }
  
  // 检查文件是否已存在
  if (fs.existsSync(filepath)) {
    console.log(`图片已存在: ${filepath}`);
    return filepath;
  }
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    
    // 添加User-Agent来避免防盗链
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://movie.douban.com/'
      }
    };
    
    const request = https.get(url, options, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`图片下载成功: ${filepath}`);
          resolve(filepath);
        });
      } else {
        file.close();
        fs.unlink(filepath, () => {}); // 删除部分下载的文件
        console.log(`图片下载失败 (${response.statusCode}): ${url}`);
        resolve(null);
      }
    });
    
    request.on('error', (error) => {
      file.close();
      fs.unlink(filepath, () => {}); // 删除部分下载的文件
      console.log(`图片下载错误: ${error.message}`);
      resolve(null);
    });
    
    request.setTimeout(10000, () => {
      request.destroy();
      file.close();
      fs.unlink(filepath, () => {});
      console.log(`图片下载超时: ${url}`);
      resolve(null);
    });
  });
}

// 生成 jsDelivr CDN URL
function generateCDNUrl(movieId) {
  return `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/images/posters/${movieId}.jpg`;
}

// 运行处理函数
processMovieData();