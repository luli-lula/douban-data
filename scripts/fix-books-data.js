// 修复现有书籍数据，只保留真正已读的书籍
const fs = require('fs');

function fixBookData() {
  const booksBackupPath = './data/backup/books-backup.json';
  const booksJsonPath = './data/books.json';
  const statsPath = './data/book-stats.json';
  
  if (!fs.existsSync(booksBackupPath)) {
    console.log('备份数据文件不存在');
    return;
  }
  
  console.log('=== 修复书籍数据 ===\n');
  
  const allBooks = JSON.parse(fs.readFileSync(booksBackupPath, 'utf8'));
  console.log(`原始数据: ${allBooks.length} 本`);
  
  // 筛选真正已读的书籍：有评分或有评论
  const readBooks = allBooks.filter(book => {
    const hasRating = book.rating && book.rating !== 'unrated' && parseInt(book.rating) >= 1 && parseInt(book.rating) <= 5;
    const hasComment = book.comment && book.comment.trim().length > 0;
    return hasRating || hasComment;
  });
  
  console.log(`筛选后的已读书籍: ${readBooks.length} 本`);
  
  // 筛选5星书籍用于展示
  const fiveStarBooks = readBooks.filter(book => parseInt(book.rating) === 5);
  console.log(`5星书籍: ${fiveStarBooks.length} 本`);
  
  // 生成评分统计
  const ratingStats = {};
  readBooks.forEach(book => {
    const rating = book.rating || 'read_no_rating';
    ratingStats[rating] = (ratingStats[rating] || 0) + 1;
  });
  
  // 更新展示数据（5星书籍）
  const sortedFiveStarBooks = fiveStarBooks.sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
  fs.writeFileSync(booksJsonPath, JSON.stringify(sortedFiveStarBooks, null, 2));
  
  // 更新备份数据（所有已读书籍）
  const sortedReadBooks = readBooks.sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));
  fs.writeFileSync(booksBackupPath, JSON.stringify(sortedReadBooks, null, 2));
  
  // 更新统计数据
  const stats = {
    total_books: fiveStarBooks.length,
    total_all_books: allBooks.length,
    total_read_books: readBooks.length,
    new_books_this_run: 0,
    total_backup_books: readBooks.length,
    new_backup_books: 0,
    last_update: new Date().toISOString(),
    data_source: 'douban',
    user_id: '59715677',
    rating_distribution: ratingStats,
    note: '网站展示数据（5星书籍）+ 完整备份数据（已读书籍，有评分或评论）'
  };
  
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  
  console.log('\n✅ 数据修复完成！');
  console.log(`📊 展示数据: ${fiveStarBooks.length} 本5星书籍`);
  console.log(`📦 备份数据: ${readBooks.length} 本已读书籍`);
  console.log(`🗑️  已过滤: ${allBooks.length - readBooks.length} 本想读状态书籍`);
  
  // 显示评分分布
  console.log('\n📈 评分分布:');
  Object.entries(ratingStats).forEach(([rating, count]) => {
    console.log(`  ${rating}: ${count} 本`);
  });
}

fixBookData();