// 测试脚本：分析book.csv的实际数据结构，特别是card字段
const fs = require('fs');

function analyzeBookCSV() {
  const csvPath = './data/raw/book.csv';
  
  if (!fs.existsSync(csvPath)) {
    console.log('book.csv 文件不存在。请先运行 GitHub Actions workflow。');
    return;
  }
  
  console.log('=== 分析 book.csv 数据结构 ===\n');
  
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
  
  console.log(`CSV头部字段: ${headers.join(', ')}\n`);
  
  // 分析前5行数据
  for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
    console.log(`=== 第 ${i} 行数据示例 ===`);
    const row = parseCsvRow(lines[i]);
    const book = {};
    
    headers.forEach((header, j) => {
      book[header] = row[j] ? row[j].replace(/"/g, '') : '';
    });
    
    console.log(`标题: ${book.title}`);
    console.log(`Card字段: ${book.card}`);
    console.log(`Poster: ${book.poster}`);
    console.log(`评分: ${book.star}`);
    console.log(`评论: ${book.comment}`);
    
    // 分析card字段的结构
    if (book.card) {
      const parts = book.card.split(' / ');
      console.log(`Card字段分解:`);
      parts.forEach((part, index) => {
        console.log(`  [${index}]: ${part}`);
      });
    }
    console.log('');
  }
  
  // 统计评分分布
  console.log('=== 评分统计 ===');
  const ratingStats = {};
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const book = {};
    headers.forEach((header, j) => {
      book[header] = row[j] ? row[j].replace(/"/g, '') : '';
    });
    
    const rating = book.star || 'unrated';
    ratingStats[rating] = (ratingStats[rating] || 0) + 1;
  }
  
  Object.entries(ratingStats).forEach(([rating, count]) => {
    console.log(`${rating}: ${count} 本`);
  });
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

analyzeBookCSV();