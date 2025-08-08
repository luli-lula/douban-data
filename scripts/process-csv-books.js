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
    
    // 先找到所有5星书籍行
    const fiveStarLines = [];
    const allRatedLines = []; // 用于备份的所有评分书籍
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(',5,')) {
        fiveStarLines.push({ index: i, line: line });
      }
      // 收集所有有评分的书籍用于备份（1-5星）
      if (line.includes(',1,') || line.includes(',2,') || line.includes(',3,') || 
          line.includes(',4,') || line.includes(',5,')) {
        allRatedLines.push({ index: i, line: line });
      }
    }
    
    console.log(`发现 ${fiveStarLines.length} 本5星书籍，${allRatedLines.length} 本评分书籍`);
    
    // 解析5星书籍
    for (const { index, line } of fiveStarLines) {
      const book = parseBookFromLine(line);
      if (book) {
        allBooks.push(book);
      }
    }
    
    // 所有解析的书籍都是5星书籍
    const fiveStarBooks = allBooks;
    
    // 找出新增的5星书籍
    const newFiveStarBooks = fiveStarBooks.filter(book => 
      !existingIds.has(book.id)
    );
    
    console.log(`总计 ${fiveStarBooks.length} 本5星书籍，新增 ${newFiveStarBooks.length} 本`);
    
    // 分析评分分布（先用5星书籍，后面会更新）
    const ratingStats = {};
    fiveStarBooks.forEach(book => {
      const star = book.star || 'unrated';
      ratingStats[star] = (ratingStats[star] || 0) + 1;
    });
    
    // 确保书籍封面目录存在
    const coverDir = './images/books';
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
      
      // 下载封面图片（跳过已存在的）
      if (bookId && coverUrl && coverUrl !== '') {
        const coverPath = path.join(coverDir, `${bookId}.jpg`);
        
        if (fs.existsSync(coverPath)) {
          coverUrl = generateCoverCDNUrl(bookId);
          console.log(`  ⏭️ 封面已存在: ${bookId}.jpg`);
        } else {
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
          await sleep(1000);
        }
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
    
    // === 处理所有评分书籍用于备份 ===
    console.log(`\n📦 处理所有评分书籍用于备份...`);
    
    // 解析所有评分书籍（包括1-5星）
    const allRatedBooks = [];
    for (const { index, line } of allRatedLines) {
      const book = parseBookFromLine(line);
      if (book) {
        allRatedBooks.push(book);
      }
    }
    
    // 创建所有评分书籍的备份数据
    const allNewProcessedBooks = [];
    for (let i = 0; i < allRatedBooks.length; i++) {
      const book = allRatedBooks[i];
      
      // 如果已存在，跳过处理
      if (existingAllIds.has(book.id)) {
        continue;
      }
      
      const authors = extractAuthorsFromCard(book.card);
      const year = extractYearFromCard(book.card) || book.pubdate?.match(/\d{4}/)?.[0] || '';
      const publisher = extractPublisherFromCard(book.card);
      
      const processedBook = {
        title: book.title,
        year: year,
        rating: book.star || 'unrated',
        authors: authors,
        publisher: publisher,
        genres: book.genres ? book.genres.split(',') : [],
        cover_url: book.poster || '',
        douban_url: book.url,
        mark_date: book.star_time ? book.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: book.comment || '',
        tags: book.tags || '',
        intro: '', // 跳过intro字段
        pubdate: book.pubdate || '',
        douban_rating: book.rating || '',
        id: book.id
      };
      
      allNewProcessedBooks.push(processedBook);
    }
    
    // 更新评分分布统计（使用所有评分书籍）
    const allRatingStats = {};
    allRatedBooks.forEach(book => {
      const star = book.star || 'unrated';
      allRatingStats[star] = (allRatingStats[star] || 0) + 1;
    });
    
    // 合并新旧完整数据
    const completeAllBooks = [...allNewProcessedBooks, ...existingAllBooks]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
    
    // 写入完整备份数据
    fs.writeFileSync(allBooksPath, JSON.stringify(completeAllBooks, null, 2));
    console.log(`完整备份包含 ${completeAllBooks.length} 本书籍`);
    console.log(`新增 ${allNewProcessedBooks.length} 本书籍到备份`);
    
    // 生成统计信息
    const stats = {
      total_books: allProcessedBooks.length, // 5星书籍数量
      total_all_books: lines.length - 1, // CSV书籍总数（已清理intro字段）
      total_rated_books: allRatedBooks.length, // 所有评分书籍数量
      new_books_this_run: newProcessedBooks.length,
      total_backup_books: completeAllBooks.length,
      new_backup_books: allNewProcessedBooks.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: allRatingStats,
      note: '网站展示数据（5星书籍）+ 完整备份数据（所有评分书籍）'
    };
    
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    
    console.log('\n✅ 书籍数据处理完成！');
    console.log(`\n📊 网站展示数据 (data/books.json):`);
    console.log(`- 新增5星书籍: ${newProcessedBooks.length} 本`);
    console.log(`- 总5星书籍: ${allProcessedBooks.length} 本`);
    console.log(`\n📦 完整备份数据 (data/backup/books-backup.json):`);
    console.log(`- 新增书籍: ${allNewProcessedBooks.length} 本`);
    console.log(`- 备份总计: ${completeAllBooks.length} 本`);
    console.log(`\n📈 统计信息:`);
    console.log(`- 豆瓣总书籍: 999 本`);
    console.log(`- 所有评分书籍: ${allRatedBooks.length} 本`);
    console.log(`- 5星书籍: ${fiveStarBooks.length} 本`);
    console.log(`\n🖼️ 封面: 已下载到本地并使用jsDelivr CDN`);
    
  } catch (error) {
    console.error('❌ 书籍数据处理失败:', error);
    process.exit(1);
  }
}

// 解析单个书籍行
function parseBookFromLine(line) {
  try {
    // 提取ID（第一个逗号前的内容）
    const firstComma = line.indexOf(',');
    const rawId = line.substring(0, firstComma);
    
    // 验证ID是否为数字，如果不是则从douban URL中提取
    let id = rawId;
    if (!/^\d+$/.test(rawId)) {
      const doubanMatch = line.match(/https:\/\/book\.douban\.com\/subject\/(\d+)\//);
      id = doubanMatch ? doubanMatch[1] : rawId;
    }
    
    // 提取标题（第二个字段）
    const afterId = line.substring(firstComma + 1);
    const secondComma = afterId.indexOf(',');
    let title = afterId.substring(0, secondComma);
    
    // 从后往前提取固定字段
    const lastComma = line.lastIndexOf(',');
    const card = line.substring(lastComma + 1);
    
    // 如果标题是URL或有问题，从card中提取书名
    if (!title || title.includes('http') || title.trim() === '') {
      const cardParts = card.split(' / ');
      if (cardParts.length >= 1) {
        title = cardParts[0].replace(/^\[.*?\]\s*/, '').trim();
      }
      if (!title || title.includes('http')) {
        title = `Book_${id}`;
      }
    }
    
    // 清理标题中的引号和特殊字符
    title = title.replace(/"/g, '').trim();
    
    const beforeCard = line.substring(0, lastComma);
    const secondLastComma = beforeCard.lastIndexOf(',');
    const star_time = beforeCard.substring(secondLastComma + 1);
    
    const beforeStarTime = beforeCard.substring(0, secondLastComma);
    const thirdLastComma = beforeStarTime.lastIndexOf(',');
    const tags = beforeStarTime.substring(thirdLastComma + 1);
    
    const beforeTags = beforeStarTime.substring(0, thirdLastComma);
    const fourthLastComma = beforeTags.lastIndexOf(',');
    const comment = beforeTags.substring(fourthLastComma + 1);
    
    // 提取star评分
    const starMatch = line.match(/,(\d),/);
    const star = starMatch ? starMatch[1] : '';
    
    // 寻找douban URL
    const doubanMatch = line.match(/https:\/\/book\.douban\.com\/subject\/(\d+)\//);
    const url = doubanMatch ? doubanMatch[0] : '';
    
    // 寻找封面URL
    const posterMatch = line.match(/https:\/\/dou\.img\.lithub\.cc\/book\/[^,]+\.jpg/);
    const poster = posterMatch ? posterMatch[0] : '';
    
    return {
      id: id,
      title: title,
      intro: '', // 跳过intro字段
      poster: poster,
      pubdate: '',
      url: url,
      rating: '',
      genres: '',
      star: star,
      comment: comment,
      tags: tags,
      star_time: star_time,
      card: card
    };
  } catch (error) {
    console.log(`解析书籍行失败: ${error.message}`);
    return null;
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
  if (parts.length >= 1) {
    const authorPart = parts[0]; // 作者在第0个位置
    if (authorPart) {
      // 清理国籍标记如[法]、[美]等
      const cleanAuthor = authorPart.replace(/^\\[.*?\\]\\s*/, '').trim();
      // 处理多个作者的情况，用斜杠或逗号分隔
      const authors = cleanAuthor.split(/[,，]/).map(a => a.trim()).filter(a => a);
      return authors.length > 0 ? authors : [cleanAuthor];
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
  
  const parts = card.split(' / ');
  if (parts.length >= 2) {
    const yearPart = parts[1]; // 年份在第1个位置
    const yearMatch = yearPart.match(/(\d{4})/);
    return yearMatch ? yearMatch[1] : '';
  }
  return '';
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
  return `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/images/books/${bookId}.jpg`;
}

// 运行处理函数
processCsvBooks();