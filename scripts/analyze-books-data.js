// 分析当前书籍数据，帮助理解数据结构和来源
const fs = require('fs');

function analyzeBookData() {
  const booksJsonPath = './data/books.json';
  const booksBackupPath = './data/backup/books-backup.json';
  const bookStatsPath = './data/book-stats.json';
  
  console.log('=== 豆瓣书籍数据分析 ===\n');
  
  // 分析展示数据
  if (fs.existsSync(booksJsonPath)) {
    const displayBooks = JSON.parse(fs.readFileSync(booksJsonPath, 'utf8'));
    console.log('📊 展示数据 (data/books.json):');
    console.log(`- 总计: ${displayBooks.length} 本`);
    
    if (displayBooks.length > 0) {
      console.log(`- 第一本书示例:`);
      console.log(`  标题: ${displayBooks[0].title}`);
      console.log(`  作者: ${JSON.stringify(displayBooks[0].authors)}`);
      console.log(`  评分: ${displayBooks[0].rating}`);
      console.log(`  标记日期: ${displayBooks[0].mark_date}`);
      console.log(`  评论: ${displayBooks[0].comment}`);
    }
  }
  
  // 分析备份数据
  if (fs.existsSync(booksBackupPath)) {
    const backupBooks = JSON.parse(fs.readFileSync(booksBackupPath, 'utf8'));
    console.log(`\n📦 备份数据 (data/backup/books-backup.json):`);
    console.log(`- 总计: ${backupBooks.length} 本`);
    
    // 统计评分分布
    const ratingCount = {};
    backupBooks.forEach(book => {
      const rating = book.rating || 'unrated';
      ratingCount[rating] = (ratingCount[rating] || 0) + 1;
    });
    
    console.log(`- 评分分布:`);
    Object.entries(ratingCount).forEach(([rating, count]) => {
      console.log(`  ${rating}: ${count} 本`);
    });
    
    // 分析无评分但有评论的书籍（可能是真正读过的）
    const noRatingButComment = backupBooks.filter(book => 
      (!book.rating || book.rating === 'unrated' || book.rating === 'read_no_rating') && 
      book.comment && book.comment.trim().length > 0
    );
    console.log(`- 无评分但有评论: ${noRatingButComment.length} 本`);
    
    // 分析既无评分也无评论的书籍（可能是想读状态）
    const noRatingNoComment = backupBooks.filter(book => 
      (!book.rating || book.rating === 'unrated' || book.rating === 'read_no_rating') && 
      (!book.comment || book.comment.trim().length === 0)
    );
    console.log(`- 无评分无评论: ${noRatingNoComment.length} 本`);
  }
  
  // 分析统计数据
  if (fs.existsSync(bookStatsPath)) {
    const stats = JSON.parse(fs.readFileSync(bookStatsPath, 'utf8'));
    console.log(`\n📈 统计数据 (data/book-stats.json):`);
    console.log(`- 数据源: ${stats.data_source}`);
    console.log(`- 最后更新: ${stats.last_update}`);
    console.log(`- 原始数据总量: ${stats.total_all_books} 本`);
    console.log(`- 已评分书籍: ${stats.total_rated_books || 'N/A'} 本`);
  }
  
  console.log('\n💡 建议:');
  console.log('1. 检查 data/raw/ 目录是否有 book.csv 文件');
  console.log('2. 如果数据量异常，可能需要重新运行 GitHub Actions workflow');
  console.log('3. 如果想读状态的书籍太多，考虑修改 doumark-action 的 status 参数');
}

analyzeBookData();