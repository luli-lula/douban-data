const fs = require('fs');
const path = require('path');
const https = require('https');

// 测试图片下载功能
async function testImageDownload() {
  console.log('开始测试图片下载功能...');
  
  // 确保目录存在
  const posterDir = './images/posters';
  if (!fs.existsSync(posterDir)) {
    fs.mkdirSync(posterDir, { recursive: true });
  }
  
  // 测试用的豆瓣电影海报URL（肖申克的救赎）
  const testUrl = 'https://img2.doubanio.com/view/photo/s_ratio_poster/public/p480747492.jpg';
  const testFilePath = path.join(posterDir, 'test-1292052.jpg');
  
  try {
    const result = await downloadImage(testUrl, testFilePath);
    if (result) {
      console.log('✅ 图片下载测试成功！');
      console.log(`文件保存至: ${result}`);
      
      // 检查文件大小
      const stats = fs.statSync(result);
      console.log(`文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      
      // 生成CDN URL测试
      const cdnUrl = generateCDNUrl('1292052');
      console.log(`CDN URL: ${cdnUrl}`);
      
    } else {
      console.log('❌ 图片下载失败');
    }
  } catch (error) {
    console.error('测试过程中出现错误:', error);
  }
}

// 下载图片函数 (复制自 process-data.js)
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

// 运行测试
testImageDownload();