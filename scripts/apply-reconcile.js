const fs = require('fs');
const path = require('path');
const { buildRecord, syncPosters, buildStats, updateReadme, TYPES, CONFIG } = require('./sync-douban.js');

/**
 * 应用 browser-reconcile.js 产出的差异。
 *   node scripts/apply-reconcile.js <movie|book> <diff.json>
 * 规则：已看/已读永不删除；只有想看/在看被取消标记才移除；变化超过 5% 视为异常（FORCE=1 跳过）。
 */
async function main() {
  const [type, diffFile] = process.argv.slice(2);
  const cfg = TYPES[type];
  if (!cfg || !diffFile) { console.error('用法: node scripts/apply-reconcile.js <movie|book> <diff.json>'); process.exit(1); }

  const diff = JSON.parse(fs.readFileSync(diffFile, 'utf8'));
  if (diff.type !== type) throw new Error(`diff 的类型是 ${diff.type}，与参数 ${type} 不符`);
  let records = JSON.parse(fs.readFileSync(cfg.json, 'utf8'));
  const byId = new Map(records.map(r => [r.id, r]));
  console.log(`📂 本地 ${records.length} 条；差异: +${diff.added.length} ✏️${diff.changed.length} 🗑️${diff.removed.length}`);

  if (!process.env.FORCE && diff.changed.length / Math.max(records.length, 1) > 0.05) {
    throw new Error(`变化 ${diff.changed.length} 条超过 5%，疑似异常，未写入（确认无误可用 FORCE=1）`);
  }

  for (const c of diff.changed) {
    const r = byId.get(c.id);
    if (!r) continue;
    Object.assign(r, c.diff);
    console.log(`  ✏️ ${r.title}: ${Object.entries(c.diff).map(([k, v]) => `${k}=${String(v).slice(0, 20)}`).join(' ')}`);
  }

  const removeIds = new Set(diff.removed.filter(r => r.status !== 'done').map(r => r.id));
  for (const id of removeIds) console.log(`  🗑️ 取消标记: ${byId.get(id)?.title}`);
  records = records.filter(r => !removeIds.has(r.id));

  for (const a of diff.added) {
    if (byId.has(a.id)) continue;
    const { detail, ...w } = a;
    records.push(buildRecord(type, w, detail));
    console.log(`  🆕 ${a.title} (${a.rating}★ ${a.status})${detail ? '' : ' ⚠️ 无详情'}`);
  }

  const images = await syncPosters(records, cfg.images);
  console.log(`🖼️ 海报: 已有 ${images.have}，新下载 ${images.downloaded}，失败 ${images.failed.length}`);

  records.sort((a, b) => String(b.mark_date).localeCompare(String(a.mark_date)));
  const stats = buildStats(records, diff.added.length);
  fs.mkdirSync(path.dirname(cfg.json), { recursive: true });
  fs.writeFileSync(cfg.json, JSON.stringify(records, null, 2));
  fs.writeFileSync(cfg.stats, JSON.stringify(stats, null, 2));
  updateReadme([{ type, stats, newCount: diff.added.length }]);
  console.log(`✅ 总计 ${records.length} 条 ${JSON.stringify(stats.status_distribution)}`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
