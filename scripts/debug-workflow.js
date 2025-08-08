const fs = require('fs');
const path = require('path');

// 调试工作流程的脚本
console.log('=== Douban Data Sync Debug ===');

// 检查目录结构
console.log('\n1. 检查目录结构:');
const dirs = ['./data', './data/raw', './images', './images/posters'];
dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`✅ ${dir} 存在`);
    const files = fs.readdirSync(dir);
    if (files.length > 0) {
      console.log(`   文件: ${files.join(', ')}`);
    } else {
      console.log(`   (空目录)`);
    }
  } else {
    console.log(`❌ ${dir} 不存在`);
  }
});

// 检查数据文件
console.log('\n2. 检查数据文件:');
const rawDataPath = './data/raw/movie.json';
if (fs.existsSync(rawDataPath)) {
  try {
    const rawData = fs.readFileSync(rawDataPath, 'utf8');
    if (rawData.trim()) {
      const data = JSON.parse(rawData);
      console.log(`✅ ${rawDataPath} 存在且有效`);
      console.log(`   包含 ${data.length} 部电影`);
      if (data.length > 0) {
        console.log(`   示例电影: ${data[0].title || 'N/A'}`);
      }
    } else {
      console.log(`⚠️ ${rawDataPath} 存在但为空`);
    }
  } catch (error) {
    console.log(`❌ ${rawDataPath} 存在但格式无效: ${error.message}`);
  }
} else {
  console.log(`❌ ${rawDataPath} 不存在`);
  console.log('   这表明 doumark-action 可能没有成功运行');
}

// 检查环境变量和配置
console.log('\n3. 建议的调试步骤:');
console.log('   - 检查 GitHub Actions 运行日志');
console.log('   - 验证豆瓣用户ID 59715677 是否公开可访问');
console.log('   - 确认 doumark-action 是否支持当前豆瓣API');
console.log('   - 检查网络连接和权限设置');

// 测试豆瓣用户页面访问
console.log('\n4. 豆瓣用户页面:');
console.log('   用户主页: https://movie.douban.com/people/59715677/');
console.log('   观影记录: https://movie.douban.com/people/59715677/collect');

console.log('\n=== 调试完成 ===');