const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * 豆瓣数据全量同步脚本
 *
 * 直接调用豆瓣 Frodo API → 合并到 JSON，不经过 CSV。
 * 解决 doumark-action 的所有问题：
 * - 用 total 字段控制分页，确保全量抓取
 * - 直接输出结构化 JSON，无 CSV 解析问题
 * - 正确记录每条数据的真实 status
 * - 增量更新：已有记录保留，只添加新的
 *
 * 用法:
 *   node scripts/sync-douban.js movie    # 同步电影
 *   node scripts/sync-douban.js book     # 同步书籍
 *   node scripts/sync-douban.js all      # 同步全部
 */

const CONFIG = {
  userId: '59715677',
  apiHost: 'frodo.douban.com',
  apiKey: '0ac44ae016490db2204ce0a042db2916',
  pageSize: 50,
  delayMs: 2000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.16(0x18001041) NetType/WIFI Language/zh_CN',
    'Referer': 'https://servicewechat.com/wx2f9b06c1de1ccfca/84/page-frame.html',
  },
};

const PATHS = {
  movie: { json: './data/movies.json', stats: './data/movie-stats.json', images: './images/movies' },
  book: { json: './data/books.json', stats: './data/book-stats.json', images: './images/books' },
};

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2] || 'all';
  const types = arg === 'all' ? ['movie', 'book'] : [arg];

  const syncResults = [];
  for (const type of types) {
    if (!PATHS[type]) {
      console.error(`未知类型: ${type}，支持 movie / book / all`);
      process.exit(1);
    }
    const result = await syncType(type);
    syncResults.push(result);
  }

  // 更新 README
  updateReadme(syncResults);
}

async function syncType(type) {
  const paths = PATHS[type];
  console.log(`\n${'='.repeat(50)}`);
  console.log(`同步豆瓣${type === 'movie' ? '电影' : '书籍'}数据`);
  console.log(`${'='.repeat(50)}\n`);

  // 1. 读取现有数据
  let existing = [];
  if (fs.existsSync(paths.json)) {
    existing = JSON.parse(fs.readFileSync(paths.json, 'utf8'));
    console.log(`📂 已有 ${existing.length} 条本地数据`);
  }
  const existingIds = new Set(existing.map(r => r.id));

  // 2. 从 API 抓取全量数据（三种 status 分别抓取）
  const apiRecords = new Map(); // id → record
  for (const status of ['done', 'doing', 'mark']) {
    const records = await fetchAll(type, status);
    for (const r of records) {
      // 如果同一个 ID 在多个 status 出现，优先级: done > doing > mark
      if (!apiRecords.has(r.id)) {
        apiRecords.set(r.id, r);
      }
    }
  }

  console.log(`\n📡 API 返回 ${apiRecords.size} 条唯一记录`);

  // 3. 找出新增记录
  const newRecords = [];
  for (const [id, record] of apiRecords) {
    if (!existingIds.has(id)) {
      newRecords.push(record);
    }
  }
  console.log(`🆕 新增 ${newRecords.length} 条`);

  // 4. 更新已有记录的 status（API 能返回真实 status）
  let statusUpdated = 0;
  for (const item of existing) {
    const apiRecord = apiRecords.get(item.id);
    if (apiRecord && item.status !== apiRecord.status) {
      item.status = apiRecord.status;
      statusUpdated++;
    }
  }
  if (statusUpdated > 0) {
    console.log(`🔄 更新了 ${statusUpdated} 条记录的 status`);
  }

  // 5. 为五星新记录下载封面
  for (const record of newRecords) {
    if (record.rating === '5' && record.status === 'done' && record.poster_url) {
      const imgDir = paths.images;
      if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
      const imgPath = path.join(imgDir, `${record.id}.jpg`);
      if (!fs.existsSync(imgPath)) {
        const downloaded = await downloadImage(record.poster_url, imgPath);
        if (downloaded) {
          record.poster_url = `https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main/${imgDir}/${record.id}.jpg`;
          console.log(`  📥 ${record.title}`);
        }
        await sleep(1000);
      }
    }
  }

  // 6. 合并并排序（按标记日期倒序）
  const merged = [...newRecords, ...existing]
    .sort((a, b) => new Date(b.mark_date) - new Date(a.mark_date));

  // 7. 写入
  const outDir = path.dirname(paths.json);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(paths.json, JSON.stringify(merged, null, 2));

  // 8. 统计
  const stats = buildStats(merged, newRecords.length);
  fs.writeFileSync(paths.stats, JSON.stringify(stats, null, 2));

  console.log(`\n✅ 完成！总计 ${merged.length} 条`);
  console.log(`📊 状态: done=${stats.status_distribution.done || 0}, doing=${stats.status_distribution.doing || 0}, mark=${stats.status_distribution.mark || 0}`);
  console.log(`📈 评分: ${JSON.stringify(stats.rating_distribution)}`);

  return { type, stats, newCount: newRecords.length };
}

// ─── API ─────────────────────────────────────────────────────

async function fetchAll(type, status) {
  console.log(`\n  [${status}] 开始抓取...`);
  const records = [];
  let offset = 0;
  let total = null;
  let retries = 0;
  let emptyPages = 0;       // 连续空页计数
  const MAX_EMPTY = 3;      // 连续空页超过此数则认为 API 到达上限
  const startTime = Date.now();
  const TIMEOUT = 5 * 60 * 1000;  // 5 分钟超时

  while (true) {
    // 超时保护
    if (Date.now() - startTime > TIMEOUT) {
      console.log(`  [${status}] ⏰ 超时 (5min)，已获取 ${records.length} 条，停止`);
      break;
    }

    const data = await fetchPage(type, status, offset);

    if (!data) {
      retries++;
      if (retries >= 3) {
        console.log(`  [${status}] 连续失败 ${retries} 次，已获取 ${records.length} 条，停止`);
        break;
      }
      console.log(`  [${status}] 重试 (${retries}/3)...`);
      await sleep(CONFIG.delayMs * 2);
      continue;
    }
    retries = 0;

    if (total === null) {
      total = data.total || 0;
      console.log(`  [${status}] 共 ${total} 条`);
      if (total === 0) break;
    }

    const interests = data.interests || [];
    if (interests.length === 0) {
      emptyPages++;
      console.log(`  [${status}] 空页 (${emptyPages}/${MAX_EMPTY}) at offset ${offset}`);
      if (emptyPages >= MAX_EMPTY) {
        console.log(`  [${status}] 连续 ${MAX_EMPTY} 个空页，API 可能到达上限，已获取 ${records.length} 条`);
        break;
      }
      offset += CONFIG.pageSize;
      await sleep(CONFIG.delayMs);
      continue;
    }
    emptyPages = 0;  // 有数据，重置空页计数

    for (const interest of interests) {
      const record = parseRecord(interest, type, status);
      if (record) records.push(record);
    }

    offset += interests.length;
    if (offset >= total) break;

    process.stdout.write(`  [${status}] ${offset}/${total}\r`);
    await sleep(CONFIG.delayMs);
  }

  console.log(`  [${status}] 完成: ${records.length} 条 (耗时 ${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
  return records;
}

function fetchPage(type, status, start) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      type, status,
      start: String(start),
      count: String(CONFIG.pageSize),
      apiKey: CONFIG.apiKey,
    });

    const options = {
      hostname: CONFIG.apiHost,
      path: `/api/v2/user/${CONFIG.userId}/interests?${params}`,
      method: 'GET',
      headers: CONFIG.headers,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(body)); }
          catch { resolve(null); }
        } else {
          console.error(`  ❌ HTTP ${res.statusCode}: ${body.substring(0, 100)}`);
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ─── Record Parsing ──────────────────────────────────────────

function parseRecord(interest, type, status) {
  const s = interest.subject;
  if (!s) return null;

  const base = {
    title: s.title || '',
    id: String(s.id),
    status: status,
    rating: interest.rating?.value ? String(interest.rating.value) : 'unrated',
    poster_url: s.pic?.large || s.pic?.normal || s.cover_url || '',
    douban_url: s.url || `https://${type}.douban.com/subject/${s.id}/`,
    mark_date: interest.create_time ? interest.create_time.split(' ')[0] : '',
    comment: interest.comment || '',
    tags: (interest.tags || []).join(','),
    genres: (s.genres || []),
  };

  if (type === 'movie') {
    return {
      ...base,
      year: s.year || '',
      directors: (s.directors || []).map(d => d.name),
    };
  } else {
    return {
      ...base,
      year: s.year || (s.pubdate?.[0]?.match(/\d{4}/)?.[0]) || '',
      author: (s.author || []),
      publisher: s.press?.[0] || '',
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function downloadImage(url, filepath) {
  if (!url || fs.existsSync(filepath)) return Promise.resolve(fs.existsSync(filepath));

  return new Promise((resolve) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, {
      headers: { 'User-Agent': CONFIG.headers['User-Agent'], 'Referer': `https://movie.douban.com/` }
    }, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
      } else {
        file.close(); fs.unlink(filepath, () => {}); resolve(false);
      }
    }).on('error', () => { file.close(); fs.unlink(filepath, () => {}); resolve(false); })
      .setTimeout(15000, function() { this.destroy(); file.close(); fs.unlink(filepath, () => {}); resolve(false); });
  });
}

function buildStats(records, newCount) {
  const ratingDist = {};
  const statusDist = {};
  for (const r of records) {
    const rating = r.rating || 'unrated';
    ratingDist[rating] = (ratingDist[rating] || 0) + 1;
    statusDist[r.status] = (statusDist[r.status] || 0) + 1;
  }
  return {
    total: records.length,
    new_this_run: newCount,
    last_update: new Date().toISOString(),
    user_id: CONFIG.userId,
    rating_distribution: ratingDist,
    status_distribution: statusDist,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── README Update ───────────────────────────────────────────

function updateReadme(syncResults) {
  const readmePath = './README.md';
  if (!fs.existsSync(readmePath)) return;

  let readme = fs.readFileSync(readmePath, 'utf8');
  const today = new Date().toISOString().split('T')[0];

  // 读取所有 stats 文件来构建总览表
  const allStats = {};
  for (const [type, paths] of Object.entries(PATHS)) {
    if (fs.existsSync(paths.stats)) {
      allStats[type] = JSON.parse(fs.readFileSync(paths.stats, 'utf8'));
    }
  }

  // 更新数据总览表 (STATS:START ... STATS:END)
  const statsRows = [];
  for (const [type, stats] of Object.entries(allStats)) {
    const icon = type === 'movie' ? '🎬 电影' : '📚 书籍';
    const rd = stats.rating_distribution || {};
    const sd = stats.status_distribution || {};
    statsRows.push(
      `| ${icon} | ${stats.total} | ${sd.done || 0} | ${sd.doing || 0} | ${sd.mark || 0} | ${rd['5'] || 0} | ${rd['4'] || 0} | ${rd['3'] || 0} | ${rd['2'] || 0} | ${rd['1'] || 0} | ${rd['unrated'] || 0} | ${today} |`
    );
  }

  const statsTable = `<!-- STATS:START -->
| 类型 | 总数 | 已看/已读 | 在看/在读 | 想看/想读 | ⭐5 | ⭐4 | ⭐3 | ⭐2 | ⭐1 | 未评分 | 最后同步 |
|------|------|----------|----------|----------|-----|-----|-----|-----|-----|--------|---------|
${statsRows.join('\n')}
<!-- STATS:END -->`;

  readme = readme.replace(
    /<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/,
    statsTable
  );

  // 追加同步日志 (在 SYNC_LOG:START 后面插入新行)
  for (const result of syncResults) {
    const icon = result.type === 'movie' ? '🎬 电影' : '📚 书籍';
    const status = result.newCount > 0 ? `✅ +${result.newCount} 新增` : '✅ 无新增';
    const logLine = `| ${today} | ${icon} | +${result.newCount} | ${result.stats.total} | ${status} |`;

    // 插入到表头之后
    readme = readme.replace(
      /(<!-- SYNC_LOG:START -->\n\|[^\n]+\n\|[^\n]+\n)/,
      `$1${logLine}\n`
    );
  }

  // 限制同步日志最多保留 50 行
  const logMatch = readme.match(/(<!-- SYNC_LOG:START -->[\s\S]*?)(<!-- SYNC_LOG:END -->)/);
  if (logMatch) {
    const lines = logMatch[1].split('\n');
    // header = 3 lines (marker + table header + separator), data = rest
    if (lines.length > 53) { // 3 header + 50 data
      const trimmed = lines.slice(0, 53).join('\n') + '\n';
      readme = readme.replace(
        /<!-- SYNC_LOG:START -->[\s\S]*?<!-- SYNC_LOG:END -->/,
        trimmed + '<!-- SYNC_LOG:END -->'
      );
    }
  }

  fs.writeFileSync(readmePath, readme);
  console.log('\n📝 README.md 已更新');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
