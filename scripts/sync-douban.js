const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

/**
 * 豆瓣数据同步脚本（登录态网页列表 → JSON + 本地海报）
 *
 * 为什么不用 App 接口（Frodo）：它会漏掉一部分条目（情色/同性题材、部分老片），
 * 而且不反映标记后的修改。网页列表才是完整的。
 *
 * 原则：
 *  - 数据源是你自己的「看过/在看/想看」列表页，需要登录 cookie
 *  - 完整性校验：解析出的条数必须等于页面标题里的总数，否则整个同步失败、不写文件
 *  - 永不删除本地「已看/已读」记录（豆瓣会下架条目，但标记过就是标记过）
 *  - 想看/在看的记录如果网页上已经没有标记，从本地移除（这是你取消了标记）
 *  - 3-5 星条目的海报保存到 images/，缩成统一宽度，poster_url 指向 jsDelivr
 *  - 失败原因写入 .sync-error（workflow 用它发 Bark）
 *
 * Cookie：环境变量 DOUBAN_COOKIE，或文件 ~/.config/douban/cookie（形如 `dbcl2="..."; bid=...`）
 *
 * 用法:
 *   node scripts/sync-douban.js movie|book|all
 *   DRY_RUN=1 node scripts/sync-douban.js all        # 只报告差异，不写文件、不下载图片
 *   POSTERS_ONLY=1 node scripts/sync-douban.js all   # 不访问列表，只给本地记录补海报
 *   FORCE=1 ...                                      # 跳过「变化过多」的异常保护
 */

const CONFIG = {
  userId: '59715677',
  pageSize: 30,
  delayMs: 1500,
  imageDelayMs: 300,
  posterMinRating: 3,   // 评分 >= 此值才保存海报
  posterWidth: 220,
  posterQuality: 76,
  cdnBase: 'https://cdn.jsdelivr.net/gh/luli-lula/douban-data@main',
  // 已有记录里被改动的比例超过此值，视为解析异常，拒绝写入
  maxChangeRatio: 0.05,
  dryRun: !!process.env.DRY_RUN,
  postersOnly: !!process.env.POSTERS_ONLY,
  force: !!process.env.FORCE,
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const TYPES = {
  movie: {
    host: 'movie.douban.com',
    json: './data/movies.json',
    stats: './data/movie-stats.json',
    images: 'images/movies',
    // 列表页路径 → 本地 status；标题里的文字用来确认拿到的是正确的页面
    lists: { collect: 'done', do: 'doing', wish: 'mark' },
    titleRe: /我(?:看过|在看|想看)的影视\((\d+)\)/,
  },
  book: {
    host: 'book.douban.com',
    json: './data/books.json',
    stats: './data/book-stats.json',
    images: 'images/books',
    lists: { collect: 'done', do: 'doing', wish: 'mark' },
    titleRe: /我(?:读过|在读|想读)的书\((\d+)\)/,
  },
};

/** 带类别的错误：auth = cookie 失效/被拦截，需要人处理 */
class SyncError extends Error {
  constructor(message, kind = 'error') { super(message); this.kind = kind; }
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2] || 'all';
  const types = arg === 'all' ? ['movie', 'book'] : [arg];
  for (const type of types) {
    if (!TYPES[type]) {
      console.error(`未知类型: ${type}，支持 movie / book / all`);
      process.exit(1);
    }
  }
  if (!CONFIG.dryRun) fs.rmSync('.sync-error', { force: true });

  const results = [];
  const failures = [];
  for (const type of types) {
    try {
      const r = await syncType(type);
      results.push(r);
      r.problems.forEach(p => failures.push(`[${type}] ${p}`));
    } catch (e) {
      const prefix = e.kind === 'auth' ? '🔑 ' : '';
      failures.push(`[${type}] ${prefix}${e.message}`);
      console.error(`❌ [${type}] ${e.message}`);
    }
  }

  if (!CONFIG.dryRun && !CONFIG.postersOnly && results.length) updateReadme(results);
  if (failures.length) {
    if (!CONFIG.dryRun) fs.writeFileSync('.sync-error', failures.join('\n') + '\n');
    failures.forEach(f => console.error(`❌ ${f}`));
    process.exit(1);
  }
}

async function syncType(type) {
  const cfg = TYPES[type];
  console.log(`\n${'='.repeat(50)}\n同步豆瓣${type === 'movie' ? '电影' : '书籍'}${CONFIG.dryRun ? '（DRY RUN）' : ''}\n${'='.repeat(50)}`);
  const problems = [];

  let records = fs.existsSync(cfg.json) ? JSON.parse(fs.readFileSync(cfg.json, 'utf8')) : [];
  console.log(`📂 本地 ${records.length} 条`);

  let added = 0;
  if (CONFIG.postersOnly) {
    console.log('🖼️ POSTERS_ONLY：跳过列表，只处理本地记录的海报');
  } else {
    // 1. 抓取全部列表（任一列表不完整就抛错，不写任何文件）
    const web = new Map(); // id → 列表里的记录
    for (const [list, status] of Object.entries(cfg.lists)) {
      for (const item of await fetchList(type, list)) web.set(item.id, { ...item, status });
    }
    console.log(`🌐 网页共 ${web.size} 条`);

    // 2. 合并
    const result = await merge(type, records, web);
    records = result.records;
    added = result.added;
    console.log(`🆕 新增 ${result.added}；✏️ 更新 ${result.updated}；🗑️ 取消标记 ${result.removed}；📌 仅本地保留（豆瓣已无） ${result.localOnly}`);
    if (result.failedDetails.length) {
      problems.push(`新条目详情读取失败: ${result.failedDetails.join(',')}`);
    }

    // 3. 异常保护：已有记录变化太多，多半是解析出了问题
    const existingCount = records.length - result.added;
    if (!CONFIG.force && existingCount > 0 && result.updated / existingCount > CONFIG.maxChangeRatio) {
      throw new SyncError(`已有记录变化 ${result.updated}/${existingCount}，超过 ${CONFIG.maxChangeRatio * 100}%，疑似解析异常，未写入（确认无误可用 FORCE=1）`);
    }
  }

  // 4. 海报
  const imageResult = await syncPosters(records, cfg.images);
  console.log(`🖼️ 海报: 已有 ${imageResult.have}，新下载 ${imageResult.downloaded}，失败 ${imageResult.failed.length}`);
  if (imageResult.failed.length) {
    console.log(`   失败示例: ${imageResult.failed.slice(0, 5).map(r => `${r.title}(${r.id})`).join('、')}`);
  }
  // 失败超过 10% 视为异常（单张失败下次会重试）
  if (imageResult.attempted >= 10 && imageResult.failed.length / imageResult.attempted > 0.1) {
    problems.push(`海报下载失败 ${imageResult.failed.length}/${imageResult.attempted}`);
  }

  // 5. 写入
  records.sort((a, b) => String(b.mark_date).localeCompare(String(a.mark_date)));
  const stats = buildStats(records, added);
  if (!CONFIG.dryRun) {
    fs.mkdirSync(path.dirname(cfg.json), { recursive: true });
    fs.writeFileSync(cfg.json, JSON.stringify(records, null, 2));
    fs.writeFileSync(cfg.stats, JSON.stringify(stats, null, 2));
  }

  console.log(`✅ 总计 ${records.length} 条 状态=${JSON.stringify(stats.status_distribution)}`);
  return { type, stats, newCount: added, problems };
}

// ─── HTTP ────────────────────────────────────────────────────

function loadCookie() {
  const cookie = process.env.DOUBAN_COOKIE
    || (() => {
      const f = path.join(os.homedir(), '.config/douban/cookie');
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
    })();
  const trimmed = cookie.trim();
  if (!trimmed) throw new SyncError('没有找到豆瓣 cookie（DOUBAN_COOKIE 或 ~/.config/douban/cookie）', 'auth');
  return trimmed;
}

function httpGet(url, headers = {}) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const req = https.get(url, { headers: { 'User-Agent': CONFIG.userAgent, ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => finish({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', () => finish(null));
    });
    req.on('error', () => finish(null));
    req.setTimeout(20000, () => { req.destroy(); finish(null); });
  });
}

/** 取一个页面的 HTML；失败重试 3 次，登录失效/被拦截抛 auth 错误 */
async function fetchHtml(url) {
  const cookie = loadCookie();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await httpGet(url, { Cookie: cookie, Referer: 'https://www.douban.com/' });
    if (res) {
      const loc = String(res.headers.location || '');
      if (res.status >= 300 && res.status < 400) {
        if (/accounts\.douban\.com|passport|login/.test(loc)) throw new SyncError('cookie 已失效，被重定向到登录页', 'auth');
        if (/sec\.douban\.com/.test(loc)) throw new SyncError('被豆瓣风控拦截（sec.douban.com 验证页）', 'auth');
      }
      if (res.status === 403 || res.status === 418) throw new SyncError(`被豆瓣拦截（HTTP ${res.status}）`, 'auth');
      if (res.status === 200) {
        const html = res.body.toString('utf8');
        if (/sec\.douban\.com|检测到有异常请求/.test(html) && !/subject-num|v:itemreviewed/.test(html)) {
          throw new SyncError('被豆瓣风控拦截（验证页）', 'auth');
        }
        return html;
      }
      console.error(`  ⚠️ HTTP ${res.status}: ${url}`);
    }
    await sleep(CONFIG.delayMs * 2 * attempt);
  }
  throw new SyncError(`请求失败: ${url}`);
}

// ─── 列表页 ──────────────────────────────────────────────────

const decode = s => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, '&');
const text = s => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

async function fetchList(type, list) {
  const cfg = TYPES[type];
  const base = `https://${cfg.host}/people/${CONFIG.userId}/${list}?sort=time&rating=all&filter=all&mode=list`;
  const items = [];
  let total = null;

  for (let start = 0; total === null || start < total; start += CONFIG.pageSize) {
    const html = await fetchHtml(`${base}&start=${start}`);
    const m = html.match(/<title>([^<]*)<\/title>/);
    const t = m && cfg.titleRe.exec(m[1]);
    if (!t) throw new SyncError(`列表页不是预期的页面（可能 cookie 失效）: ${list} start=${start}`, 'auth');
    if (total === null) {
      total = +t[1];
      console.log(`  [${type}/${list}] 共 ${total} 条`);
    }
    const pageItems = parseList(html);
    if (total > 0 && pageItems.length === 0) throw new SyncError(`${list} start=${start} 解析出 0 条`);
    items.push(...pageItems);
    if (total > 0) process.stdout.write(`  [${type}/${list}] ${Math.min(start + CONFIG.pageSize, total)}/${total}\r`);
    await sleep(CONFIG.delayMs);
  }

  const unique = new Map(items.map(i => [i.id, i]));
  if (unique.size !== total) {
    throw new SyncError(`[${type}/${list}] 数量不完整: 解析 ${unique.size}，页面标题 ${total}`);
  }
  console.log(`  [${type}/${list}] 完成: ${unique.size} 条`);
  return [...unique.values()];
}

function parseList(html) {
  const items = [];
  const chunks = html.split(/<li id="list(?=\d+" class="item")/).slice(1);
  for (const chunk of chunks) {
    const id = (chunk.match(/^(\d+)"/) || [])[1];
    const titleMatch = chunk.match(/<div class="title">\s*<a [^>]*>([\s\S]*?)<\/a>/);
    if (!id || !titleMatch) continue;
    const dateBlock = (chunk.match(/<div class="date">([\s\S]*?)<\/div>/) || [])[1] || '';
    const tags = text((chunk.match(/<span class="tags">([\s\S]*?)<\/span>/) || [])[1] || '').replace(/^标签:\s*/, '');
    // 列表页短评末尾会带点赞数，例如「(57 有用)」
    const comment = text((chunk.match(/<div class="comment">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/\s*\(\d+\s*有用\)\s*$/, '');
    items.push({
      id,
      title: text(titleMatch[1]).split(' / ')[0].trim(),
      rating: (dateBlock.match(/rating(\d)-t/) || [])[1] || 'unrated',
      mark_date: (dateBlock.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '',
      tags: tags.split(/\s+/).filter(Boolean).join(','),
      comment,
    });
  }
  return items;
}

// ─── 条目页（仅新增条目需要：导演/类型/出版社/海报）────────────

async function fetchSubject(type, id) {
  const cfg = TYPES[type];
  const html = await fetchHtml(`https://${cfg.host}/subject/${id}/`);
  if (/页面不存在|条目不存在/.test((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '')) return null;
  const all = (re) => [...html.matchAll(re)].map(m => decode(m[1]).trim());
  const pic = (html.match(/id="mainpic"[\s\S]*?<img[^>]+src="([^"]+)"/) || [])[1] || '';

  if (type === 'movie') {
    return {
      year: (html.match(/<span class="year">\((\d{4})\)/) || [])[1] || '',
      directors: all(/rel="v:directedBy">([^<]+)</g).slice(0, 5),
      genres: all(/property="v:genre">([^<]+)</g),
      pic: pic.replace('s_ratio_poster', 'm_ratio_poster'),
    };
  }
  const info = text((html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
  const field = (name, next) => (info.match(new RegExp(`${name}:\\s*(.+?)\\s+(?:${next}):`)) || [])[1] || '';
  return {
    year: (info.match(/出版年:\s*(\d{4})/) || [])[1] || '',
    author: field('作者', '出版社|出品方|副标题|原作名|译者|出版年|页数') ? [field('作者', '出版社|出品方|副标题|原作名|译者|出版年|页数')] : [],
    publisher: field('出版社', '出品方|副标题|原作名|译者|出版年|页数'),
    genres: [],
    pic: pic.replace('/s/public/', '/l/public/').replace('/m/public/', '/l/public/'),
  };
}

// ─── Merge ───────────────────────────────────────────────────

const isUnknownTitle = t => !t || /^未知(图书|电影|电视剧)$/.test(t);
const isEmpty = v => v === '' || v == null || (Array.isArray(v) && v.length === 0);

async function merge(type, existing, web) {
  const byId = new Map(existing.map(r => [r.id, r]));
  let updated = 0;
  let removed = 0;
  const kept = [];

  for (const rec of existing) {
    const w = web.get(rec.id);
    if (!w) {
      // 网页上没有这条：已看/已读保留（豆瓣可能下架了条目）；想看/在看说明被取消标记，移除
      if (rec.status === 'done') kept.push(rec);
      else removed++;
      continue;
    }
    // 豆瓣已删除的条目（标题「未知…」）列表里不显示内容，不能用空值覆盖本地
    if (isUnknownTitle(w.title)) { kept.push(rec); continue; }
    let changed = false;
    const set = (k, v) => {
      if (JSON.stringify(rec[k]) !== JSON.stringify(v)) { rec[k] = v; changed = true; }
    };
    // 这些是你自己的标记，以网页为准
    set('status', w.status);
    set('rating', w.rating);
    set('comment', w.comment);
    set('tags', w.tags);
    if (w.mark_date) set('mark_date', w.mark_date);
    if (isUnknownTitle(rec.title) && !isUnknownTitle(w.title)) set('title', w.title);
    if (changed) updated++;
    kept.push(rec);
  }

  const failedDetails = [];
  const fresh = [...web.values()].filter(w => !byId.has(w.id));
  for (const w of fresh) {
    if (CONFIG.dryRun) { kept.push(buildRecord(type, w, null)); continue; }
    const detail = await fetchSubject(type, w.id).catch(() => undefined);
    if (detail === undefined) failedDetails.push(w.id);
    kept.push(buildRecord(type, w, detail));
    await sleep(CONFIG.delayMs);
  }

  const localOnly = existing.filter(r => !web.has(r.id) && r.status === 'done').length;
  return { records: kept, added: fresh.length, updated, removed, localOnly, failedDetails };
}

function buildRecord(type, w, d) {
  const base = {
    title: w.title,
    year: d?.year || '',
  };
  const tail = {
    rating: w.rating,
    status: w.status,
  };
  const common = {
    poster_url: d?.pic || '',
    douban_url: `https://${TYPES[type].host}/subject/${w.id}/`,
    mark_date: w.mark_date,
    comment: w.comment,
    tags: w.tags,
    id: w.id,
  };
  if (type === 'movie') {
    return { ...base, ...tail, directors: d?.directors || [], genres: d?.genres || [], ...common };
  }
  return { ...base, ...tail, author: d?.author || [], publisher: d?.publisher || '', genres: [], ...common };
}

// ─── Posters ─────────────────────────────────────────────────

async function syncPosters(records, imageDir) {
  const result = { have: 0, downloaded: 0, attempted: 0, failed: [] };
  if (!CONFIG.dryRun) fs.mkdirSync(imageDir, { recursive: true });

  for (const rec of records) {
    const wanted = parseInt(rec.rating, 10) >= CONFIG.posterMinRating;
    const file = path.join(imageDir, `${rec.id}.jpg`);
    const cdnUrl = `${CONFIG.cdnBase}/${imageDir}/${rec.id}.jpg`;

    if (fs.existsSync(file)) {
      result.have++;
      if (wanted) rec.poster_url = cdnUrl;
      continue;
    }
    if (!wanted) continue;

    const url = rec.poster_url;
    result.attempted++;
    if (CONFIG.dryRun) continue;
    if (url && !url.includes('cdn.jsdelivr.net') && await downloadPoster(url, file)) {
      rec.poster_url = cdnUrl;
      result.downloaded++;
      process.stdout.write(`  📥 ${result.downloaded} ${rec.title}\r`);
    } else {
      result.failed.push(rec);
    }
    await sleep(CONFIG.imageDelayMs);
  }
  if (CONFIG.dryRun) console.log(`   （dry run：需要下载 ${result.attempted} 张）`);
  return result;
}

async function downloadPoster(url, filepath) {
  const res = await httpGet(url, { Referer: 'https://movie.douban.com/' });
  if (!res || res.status !== 200 || res.body.length < 500) return false;
  try {
    const out = await sharp(res.body)
      .resize({ width: CONFIG.posterWidth, withoutEnlargement: true })
      .jpeg({ quality: CONFIG.posterQuality, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(filepath, out);
    return true;
  } catch {
    return false; // 不是合法图片（例如错误页）
  }
}

// ─── Stats & README ──────────────────────────────────────────

function buildStats(records, newCount) {
  const ratingDist = {};
  const statusDist = {};
  for (const r of records) {
    ratingDist[r.rating || 'unrated'] = (ratingDist[r.rating || 'unrated'] || 0) + 1;
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

function updateReadme(syncResults) {
  const readmePath = './README.md';
  if (!fs.existsSync(readmePath)) return;

  let readme = fs.readFileSync(readmePath, 'utf8');
  const today = new Date().toISOString().split('T')[0];

  const allStats = {};
  for (const [type, cfg] of Object.entries(TYPES)) {
    if (fs.existsSync(cfg.stats)) allStats[type] = JSON.parse(fs.readFileSync(cfg.stats, 'utf8'));
  }

  const statsRows = Object.entries(allStats).map(([type, stats]) => {
    const icon = type === 'movie' ? '🎬 电影' : '📚 书籍';
    const rd = stats.rating_distribution || {};
    const sd = stats.status_distribution || {};
    return `| ${icon} | ${stats.total} | ${sd.done || 0} | ${sd.doing || 0} | ${sd.mark || 0} | ${rd['5'] || 0} | ${rd['4'] || 0} | ${rd['3'] || 0} | ${rd['2'] || 0} | ${rd['1'] || 0} | ${rd['unrated'] || 0} | ${today} |`;
  });

  const statsTable = `<!-- STATS:START -->
| 类型 | 总数 | 已看/已读 | 在看/在读 | 想看/想读 | ⭐5 | ⭐4 | ⭐3 | ⭐2 | ⭐1 | 未评分 | 最后同步 |
|------|------|----------|----------|----------|-----|-----|-----|-----|-----|--------|---------|
${statsRows.join('\n')}
<!-- STATS:END -->`;
  readme = readme.replace(/<!-- STATS:START -->[\s\S]*?<!-- STATS:END -->/, statsTable);

  for (const result of syncResults) {
    const icon = result.type === 'movie' ? '🎬 电影' : '📚 书籍';
    const status = result.newCount > 0 ? `✅ +${result.newCount} 新增` : '✅ 无新增';
    const logLine = `| ${today} | ${icon} | +${result.newCount} | ${result.stats.total} | ${status} |`;
    readme = readme.replace(
      /(<!-- SYNC_LOG:START -->\n\|[^\n]+\n\|[^\n]+\n)/,
      `$1${logLine}\n`
    );
  }

  // 同步日志最多保留 50 行
  const logMatch = readme.match(/(<!-- SYNC_LOG:START -->[\s\S]*?)(<!-- SYNC_LOG:END -->)/);
  if (logMatch) {
    const lines = logMatch[1].split('\n');
    if (lines.length > 53) {
      readme = readme.replace(
        /<!-- SYNC_LOG:START -->[\s\S]*?<!-- SYNC_LOG:END -->/,
        lines.slice(0, 53).join('\n') + '\n<!-- SYNC_LOG:END -->'
      );
    }
  }

  fs.writeFileSync(readmePath, readme);
  console.log('\n📝 README.md 已更新');
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e); process.exit(1); });
}

module.exports = { parseList, buildRecord, syncPosters, buildStats, updateReadme, TYPES, CONFIG };
