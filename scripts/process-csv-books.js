const fs = require('fs');
const path = require('path');
const https = require('https');

async function processCsvBooks() {
  const csvPath = './data/raw/book.csv';
  const outputPath = './data/books.json';
  const statsPath = './data/book-stats.json';
  const backupDir = './data/backup';
  const allBooksPath = './data/backup/books-backup.json';
  
  try {
    if (!fs.existsSync(csvPath)) {
      console.log('原始书籍CSV文件不存在，跳过处理');
      return;
    }
    
    console.log('=== 简化处理CSV豆瓣书籍数据 ===');
    
    // 读取现有的处理数据（如果存在）
    let existingBooks = [];
    let existingIds = new Set();
    if (fs.existsSync(outputPath)) {
      existingBooks = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      existingIds = new Set(existingBooks.map(b => b.id));
      console.log(`已有 ${existingBooks.length} 本书籍数据`);
    }
    
    // 读取和解析CSV
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    
    console.log(`读取到 ${lines.length - 1} 本书籍数据`);
    console.log(`CSV头部字段: ${headers.join(', ')}`);
    
    // 解析所有书籍数据
    const allBooks = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvRow(lines[i]);
      const book = {};
      
      headers.forEach((header, j) => {
        book[header] = row[j] ? row[j].replace(/"/g, '') : '';
      });
      
      allBooks.push(book);
    }
    
    // 筛选已读且为5星评分的书籍（支持无评分的情况）
    const fiveStarBooks = allBooks.filter(book => {
      const userRating = parseInt(book.star);
      // 只包含5星评分的书籍，如果没有评分则跳过
      return userRating === 5;
    });
    
    // 找出新增的5星书籍
    const newFiveStarBooks = fiveStarBooks.filter(book => 
      !existingIds.has(book.id)
    );
    
    console.log(`总计 ${fiveStarBooks.length} 本5星书籍，新增 ${newFiveStarBooks.length} 本`);
    
    // 分析评分分布
    const ratingStats = {};
    allBooks.forEach(book => {
      const star = book.star || 'unrated';
      ratingStats[star] = (ratingStats[star] || 0) + 1;
    });
    
    // 确保封面目录存在
    const coverDir = './images/covers';
    if (!fs.existsSync(coverDir)) {
      fs.mkdirSync(coverDir, { recursive: true });
    }
    
    // 处理新增的5星书籍（下载封面）
    const newProcessedBooks = [];
    console.log(`\n📚 处理 ${newFiveStarBooks.length} 本新增5星书籍:`);
    
    for (let i = 0; i < newFiveStarBooks.length; i++) {
      const book = newFiveStarBooks[i];
      console.log(`处理 ${i + 1}/${newFiveStarBooks.length}: ${book.title}`);
      
      // 提取作者和出版年份信息
      const authors = extractAuthorsFromCard(book.card);
      const year = extractYearFromCard(book.card) || book.pubdate?.match(/\d{4}/)?.[0] || '';
      const publisher = extractPublisherFromCard(book.card);
      
      let coverUrl = book.poster || '';
      const bookId = book.id;
      
      // 下载封面图片
      if (bookId && coverUrl && coverUrl !== '') {
        const coverPath = path.join(coverDir, `${bookId}.jpg`);
        console.log(`  下载封面: ${book.title}`);
        
        // 尝试从豆瓣页面获取更好的图片URL
        let imageUrl = coverUrl;
        if (book.url) {
          const betterImageUrl = await extractOriginalBookCoverUrl(book.url);
          if (betterImageUrl) {
            imageUrl = betterImageUrl;
          }
        }
        
        const downloadedPath = await downloadImage(imageUrl, coverPath);
        if (downloadedPath) {
          coverUrl = generateCoverCDNUrl(bookId);
          console.log(`  ✅ 封面已下载: ${bookId}.jpg`);
        } else {
          console.log(`  ❌ 封面下载失败: ${book.title}`);
        }
        
        // 添加延迟避免请求过于频繁
        await sleep(2000);
      }
      
      const processedBook = {
        title: book.title,
        year: year,
        rating: '5',
        authors: authors,
        publisher: publisher,
        genres: book.genres ? book.genres.split(',') : [],
        cover_url: coverUrl,
        douban_url: book.url,
        mark_date: book.star_time ? book.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: book.comment || '',
        id: bookId
      };
      
      newProcessedBooks.push(processedBook);
    }
    
    // 合并新旧数据，按标记日期倒序排列
    const allProcessedBooks = [...newProcessedBooks, ...existingBooks]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date)); // 保留所有5星书籍，不限制数量
    
    // 确保输出目录存在
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 确保备份目录存在
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // 写入网站展示数据（最多100本5星书籍）
    fs.writeFileSync(outputPath, JSON.stringify(allProcessedBooks, null, 2));
    
    // === 创建完整数据备份 ===
    console.log(`\n📦 创建完整数据备份...`);
    
    // 读取现有的完整备份数据
    let existingAllBooks = [];
    let existingAllIds = new Set();
    if (fs.existsSync(allBooksPath)) {
      existingAllBooks = JSON.parse(fs.readFileSync(allBooksPath, 'utf8'));
      existingAllIds = new Set(existingAllBooks.map(b => b.id));
      console.log(`已有完整备份数据 ${existingAllBooks.length} 本书籍`);
    }
    
    // 处理所有书籍数据（不仅仅是5星），但只处理有评分的书籍
    const allNewProcessedBooks = [];
    for (let i = 0; i < allBooks.length; i++) {
      const book = allBooks[i];
      
      // 如果已存在，跳过处理
      if (existingAllIds.has(book.id)) {
        continue;
      }
      
      // 处理所有已读的书籍，包括有评分和无评分的
      // 过滤掉明显为“想读”状态的书籍（通常无评分且无评论）
      const starRating = parseInt(book.star);
      const hasComment = book.comment && book.comment.trim().length > 0;
      const hasRating = starRating >= 1 && starRating <= 5;
      
      // 如果既没有评分也没有评论，可能是想读状态，跳过
      if (!hasRating && !hasComment) {
        continue;
      }
      
      const authors = extractAuthorsFromCard(book.card);
      const year = extractYearFromCard(book.card) || book.pubdate?.match(/\d{4}/)?.[0] || '';
      const publisher = extractPublisherFromCard(book.card);
      
      const processedBook = {
        title: book.title,
        year: year,
        rating: book.star || 'read_no_rating',
        authors: authors,
        publisher: publisher,
        genres: book.genres ? book.genres.split(',') : [],
        cover_url: book.poster || '',
        douban_url: book.url,
        mark_date: book.star_time ? book.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: book.comment || '',
        tags: book.tags || '',
        intro: book.intro || '',
        pubdate: book.pubdate || '',
        douban_rating: book.rating || '',
        id: book.id
      };
      
      allNewProcessedBooks.push(processedBook);
    }
    
    // 合并新旧完整数据
    const completeAllBooks = [...allNewProcessedBooks, ...existingAllBooks]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
    
    // 写入完整备份数据
    fs.writeFileSync(allBooksPath, JSON.stringify(completeAllBooks, null, 2));
    console.log(`完整备份包含 ${completeAllBooks.length} 本书籍`);
    console.log(`新增 ${allNewProcessedBooks.length} 本书籍到备份`);
    
    // 生成统计信息
    const stats = {
      total_books: allProcessedBooks.length,
      total_all_books: allBooks.length,
      total_rated_books: allBooks.filter(b => parseInt(b.star) >= 1 && parseInt(b.star) <= 5).length,
      new_books_this_run: newProcessedBooks.length,
      total_backup_books: completeAllBooks.length,
      new_backup_books: allNewProcessedBooks.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: ratingStats,
      note: '网站展示数据（所有5星书籍）+ 完整备份数据（已评分书籍）'
    };
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    
    console.log('\n✅ 书籍数据处理完成！');
    console.log(`\n📊 网站展示数据 (data/books.json):`);
    console.log(`- 新增5星书籍: ${newProcessedBooks.length} 本`);
    console.log(`- 总5星书籍: ${allProcessedBooks.length} 本`);
    console.log(`\n📦 完整备份数据 (data/backup/all-books.json):`);
    console.log(`- 新增书籍: ${allNewProcessedBooks.length} 本`);
    console.log(`- 备份总计: ${completeAllBooks.length} 本`);
    console.log(`\n📈 统计信息:`);
    console.log(`- 总数据: ${allBooks.length} 本`);
    console.log(`- 已评分: ${allBooks.filter(b => parseInt(b.star) >= 1 && parseInt(b.star) <= 5).length} 本`);
    console.log(`\n🖼️ 封面: 已下载到本地并使用jsDelivr CDN`);
    
  } catch (error) {
    console.error('❌ 书籍数据处理失败:', error);
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

// 从card字段提取作者信息
function extractAuthorsFromCard(card) {
  if (!card) return [];
  
  const parts = card.split(' / ');
  if (parts.length >= 2) {
    const authorPart = parts[1];
    // 处理多个作者的情况，用斜杠或逗号分隔
    if (authorPart) {
      const authors = authorPart.split(/[,，]/).map(a => a.trim()).filter(a => a);
      return authors.length > 0 ? authors : [authorPart];
    }
  }
  return [];
}

// 从card字段提取出版社信息
function extractPublisherFromCard(card) {
  if (!card) return '';
  
  const parts = card.split(' / ');
  if (parts.length >= 3) {
    return parts[2] || '';
  }
  return '';
}

// 从card字段提取年份
function extractYearFromCard(card) {
  if (!card) return '';
  
  const yearMatch = card.match(/(\d{4})/);
  return yearMatch ? yearMatch[1] : '';
}

// 从豆瓣书籍页面提取原始图片URL
async function extractOriginalBookCoverUrl(doubanUrl) {
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
            /https:\/\/img\d+\.doubanio\.com\/view\/subject\/s\/public\/s\d+\.(jpg|webp)/,
            /https:\/\/img\d+\.doubanio\.com\/view\/subject\/l\/public\/s\d+\.(jpg|webp)/,
            /https:\/\/img\d+\.doubanio\.com\/view\/subject\/m\/public\/s\d+\.(jpg|webp)/,
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
        'Referer': 'https://book.douban.com/',
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

// 生成 jsDelivr CDN URL for book covers
function generateCoverCDNUrl(bookId) {
  return `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/images/covers/${bookId}.jpg`;
}

// 运行处理函数
processCsvBooks();