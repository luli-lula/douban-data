const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * 豆瓣书籍数据处理脚本
 * - 读取三种状态的CSV（done/doing/mark）
 * - 使用标准CSV解析（修复旧版手动拆字符串的bug）
 * - 增量更新：跳过已处理的记录
 * - 输出完整的 books.json（所有状态、所有评分）
 * - 为5星书籍下载封面到本地
 */
async function processBooks() {
  const outputPath = './data/books.json';
  const statsPath = './data/book-stats.json';
  const coverDir = './images/books';

  // 三种状态的CSV文件路径
  const csvFiles = {
    done: './data/raw/book-done.csv',
    doing: './data/raw/book-doing.csv',
    mark: './data/raw/book-mark.csv',
  };

  // 兼容旧格式：如果新格式不存在，尝试读取旧的 book.csv
  if (!fs.existsSync(csvFiles.done) && fs.existsSync('./data/raw/book.csv')) {
    csvFiles.done = './data/raw/book.csv';
    console.log('⚠️ 使用旧格式 book.csv 作为 done 数据源');
  }

  try {
    console.log('=== 处理豆瓣书籍数据 ===\n');

    // 读取现有数据（增量更新）
    let existingBooks = [];
    let existingIds = new Set();
    if (fs.existsSync(outputPath)) {
      existingBooks = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      // 迁移旧字段名: authors→author, cover_url→poster_url, 添加 status
      existingBooks = existingBooks.map(b => {
        if (b.authors && !b.author) {
          b.author = b.authors;
          delete b.authors;
        }
        if (b.cover_url && !b.poster_url) {
          b.poster_url = b.cover_url;
          delete b.cover_url;
        }
        if (!b.status) {
          b.status = 'done';
        }
        return b;
      });
      existingIds = new Set(existingBooks.map(b => b.id));
      console.log(`已有 ${existingBooks.length} 条书籍数据（已迁移旧字段）`);
    }

    // 确保目录存在
    if (!fs.existsSync(coverDir)) {
      fs.mkdirSync(coverDir, { recursive: true });
    }
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 读取并解析所有CSV文件
    const allParsedBooks = [];
    for (const [status, csvPath] of Object.entries(csvFiles)) {
      if (!fs.existsSync(csvPath)) {
        console.log(`⏭️ ${csvPath} 不存在，跳过`);
        continue;
      }

      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const lines = csvContent.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));

      console.log(`📂 ${csvPath}: ${lines.length - 1} 条记录`);
      console.log(`   CSV头: ${headers.join(', ')}`);

      for (let i = 1; i < lines.length; i++) {
        const row = parseCsvRow(lines[i]);
        const book = {};
        headers.forEach((header, j) => {
          book[header] = row[j] ? row[j].replace(/"/g, '') : '';
        });
        book._status = status;
        allParsedBooks.push(book);
      }
    }

    console.log(`\n📊 总计从CSV读取 ${allParsedBooks.length} 条书籍记录`);

    // 找出新增的书籍
    const newBooks = allParsedBooks.filter(b => !existingIds.has(b.id));
    console.log(`🆕 新增 ${newBooks.length} 条书籍记录`);

    // 统计评分分布
    const ratingStats = {};
    allParsedBooks.forEach(book => {
      const star = book.star || 'unrated';
      ratingStats[star] = (ratingStats[star] || 0) + 1;
    });

    // 统计状态分布
    const statusStats = {};
    allParsedBooks.forEach(book => {
      statusStats[book._status] = (statusStats[book._status] || 0) + 1;
    });

    // 处理新增书籍
    const newProcessedBooks = [];
    console.log(`\n📚 处理 ${newBooks.length} 条新增书籍:`);

    for (let i = 0; i < newBooks.length; i++) {
      const book = newBooks[i];
      const isFiveStar = parseInt(book.star) === 5 && book._status === 'done';

      // 提取作者、出版社、年份信息
      const authors = extractAuthorsFromCard(book.card);
      const year = extractYearFromCard(book.card) || book.pubdate?.match(/\d{4}/)?.[0] || '';
      const publisher = extractPublisherFromCard(book.card);

      let coverUrl = book.poster || '';
      const bookId = book.id;

      // 仅5星已读书籍下载封面到本地
      if (isFiveStar && bookId) {
        const coverPath = path.join(coverDir, `${bookId}.jpg`);
        if (fs.existsSync(coverPath)) {
          coverUrl = generateCoverCDNUrl(bookId);
        } else if (coverUrl && coverUrl !== '') {
          // 尝试下载封面
          console.log(`  📥 下载封面: ${book.title || bookId}`);

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
            console.log(`  ❌ 封面下载失败: ${book.title || bookId}`);
          }

          // 添加延迟避免请求过于频繁
          await sleep(1000);
        }
      }

      // 提取标题 - 优先使用CSV的title字段，如果有问题则从card中提取
      let title = book.title || '';
      if (!title || title.includes('http') || title.trim() === '') {
        const cardParts = (book.card || '').split(' / ');
        if (cardParts.length >= 1) {
          title = cardParts[0].replace(/^\[.*?\]\s*/, '').trim();
        }
        if (!title || title.includes('http')) {
          title = `Book_${bookId}`;
        }
      }

      const processedBook = {
        title: title,
        year: year,
        rating: book.star || 'unrated',
        status: book._status,
        author: authors,
        publisher: publisher,
        genres: book.genres ? book.genres.split(',').filter(g => g.trim()) : [],
        poster_url: coverUrl,
        douban_url: book.url,
        mark_date: book.star_time ? book.star_time.split(' ')[0] : new Date().toISOString().split('T')[0],
        comment: book.comment || '',
        tags: book.tags || '',
        id: bookId,
      };

      newProcessedBooks.push(processedBook);

      if ((i + 1) % 100 === 0) {
        console.log(`  已处理 ${i + 1}/${newBooks.length}`);
      }
    }

    // 合并新旧数据，按标记日期倒序排列
    const allProcessedBooks = [...newProcessedBooks, ...existingBooks]
      .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));

    // 写入完整数据
    fs.writeFileSync(outputPath, JSON.stringify(allProcessedBooks, null, 2));

    // 生成统计信息
    const stats = {
      total_books: allProcessedBooks.length,
      total_csv_records: allParsedBooks.length,
      new_books_this_run: newProcessedBooks.length,
      last_update: new Date().toISOString(),
      data_source: 'douban',
      user_id: '59715677',
      rating_distribution: ratingStats,
      status_distribution: statusStats,
    };

    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));

    console.log('\n✅ 书籍数据处理完成！');
    console.log(`📊 总数据: ${allProcessedBooks.length} 条`);
    console.log(`🆕 新增: ${newProcessedBooks.length} 条`);
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

// 从card字段提取作者信息
function extractAuthorsFromCard(card) {
  if (!card) return [];

  // card格式: "作者 / 出版年份 / 出版社"
  const parts = card.split(' / ');
  if (parts.length >= 1) {
    const authorPart = parts[0];
    if (authorPart) {
      // 清理国籍标记如[法]、[美]等
      const cleanAuthor = authorPart.replace(/^\[.*?\]\s*/, '').trim();
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
    const yearPart = parts[1];
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
        file.on('error', () => {
          file.close();
          fs.unlink(filepath, () => { });
          resolve(null);
        });
      } else {
        file.close();
        fs.unlink(filepath, () => { });
        resolve(null);
      }
    }).on('error', () => {
      file.close();
      fs.unlink(filepath, () => { });
      resolve(null);
    }).setTimeout(20000, function () {
      this.destroy();
      file.close();
      fs.unlink(filepath, () => { });
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
processBooks();