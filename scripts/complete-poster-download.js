const fs = require('fs');
const path = require('path');
const https = require('https');

async function completePosterDownload() {
  const moviesPath = './data/movies.json';
  const posterDir = './images/posters';
  
  try {
    if (!fs.existsSync(posterDir)) {
      fs.mkdirSync(posterDir, { recursive: true });
    }
    
    const movies = JSON.parse(fs.readFileSync(moviesPath, 'utf8'));
    console.log(`开始完成剩余电影海报下载 (总共 ${movies.length} 部)`);
    
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;
    let processedCount = 0;
    
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      const movieId = movie.id;
      const posterPath = path.join(posterDir, `${movieId}.jpg`);
      
      console.log(`\\n[${i + 1}/${movies.length}] ${movie.title} (${movie.year})`);
      
      // 如果文件已存在，跳过
      if (fs.existsSync(posterPath)) {
        console.log(`  ✓ 跳过（已存在）`);
        movie.poster_url = generateCDNUrl(movieId); // 确保URL是CDN格式
        skipCount++;
        continue;
      }
      
      processedCount++;
      
      // 从豆瓣电影页面提取原始图片URL
      console.log(`  🔍 提取图片URL...`);
      const originalImageUrl = await extractOriginalImageUrl(movie.douban_url);
      
      if (!originalImageUrl) {
        console.log(`  ❌ 无法提取图片URL`);
        failCount++;
        continue;
      }
      
      console.log(`  📥 下载海报...`);
      const downloadResult = await downloadImage(originalImageUrl, posterPath);
      
      if (downloadResult) {
        const fileSize = fs.statSync(posterPath).size;
        console.log(`  ✅ 成功 (${Math.round(fileSize/1024)}KB)`);
        
        // 更新JSON中的poster_url为CDN URL
        movie.poster_url = generateCDNUrl(movieId);
        successCount++;
      } else {
        console.log(`  ❌ 下载失败`);
        failCount++;
      }
      
      // 每5个请求后长暂停，其他短暂停
      if (processedCount % 5 === 0) {
        const longDelay = 8000 + Math.random() * 4000; // 8-12秒
        console.log(`  ⏸️  长暂停 ${Math.round(longDelay/1000)}秒...`);
        await sleep(longDelay);
      } else {
        const shortDelay = 3000 + Math.random() * 2000; // 3-5秒
        console.log(`  ⏸️  短暂停 ${Math.round(shortDelay/1000)}秒...`);
        await sleep(shortDelay);
      }
    }
    
    // 更新movies.json文件
    fs.writeFileSync(moviesPath, JSON.stringify(movies, null, 2));
    
    console.log(`\\n🎉 海报下载完成！`);
    console.log(`- 成功: ${successCount} 个`);
    console.log(`- 跳过: ${skipCount} 个（已存在）`);
    console.log(`- 失败: ${failCount} 个`);
    console.log(`- 总处理: ${processedCount} 个新下载`);
    
    // 显示目录信息
    const files = fs.readdirSync(posterDir);
    console.log(`\\n📁 海报目录状态:`);
    console.log(`- 文件总数: ${files.length}`);
    
    if (successCount > 0) {
      console.log(`\\n💡 记得提交更改到Git，包括:`);
      console.log(`- images/posters/ 目录下的新图片`);
      console.log(`- 更新的 data/movies.json 文件`);
    }
    
  } catch (error) {
    console.error('❌ 海报下载失败:', error);
    process.exit(1);
  }
}

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
      } else if (response.statusCode === 302 || response.statusCode === 301) {
        resolve(null);
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

async function downloadImage(url, filepath) {
  return new Promise((resolve) => {
    const file = fs.createWriteStream(filepath);
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://movie.douban.com/',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    };
    
    const req = https.get(url, options, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(true);
        });
        file.on('error', () => {
          file.close();
          fs.unlink(filepath, () => {});
          resolve(false);
        });
      } else {
        file.close();
        fs.unlink(filepath, () => {});
        resolve(false);
      }
    });
    
    req.on('error', () => {
      file.close();
      fs.unlink(filepath, () => {});
      resolve(false);
    });
    
    req.setTimeout(25000, () => {
      req.destroy();
      file.close();
      fs.unlink(filepath, () => {});
      resolve(false);
    });
  });
}

function generateCDNUrl(movieId) {
  return `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/images/posters/${movieId}.jpg`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 运行完整海报下载
completePosterDownload();