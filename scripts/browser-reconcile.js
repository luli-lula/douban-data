/**
 * 页面端对账脚本：在「已登录豆瓣」的浏览器页面里运行（不需要 cookie 文件）。
 *
 * 用法：先打开 https://movie.douban.com/ 或 https://book.douban.com/（已登录），
 * 在页面里执行本文件的全部内容。脚本在后台跑，用 window.__reconcile 查看：
 *   { done, progress, error, result }
 * result 是一份很小的差异 JSON，交给 `node scripts/apply-reconcile.js <movie|book> diff.json` 应用。
 *
 * 对比对象是 GitHub main 上的 data/*.json（所以先把本地改动推上去再跑）。
 * 规则和 sync-douban.js 一致：已看/已读记录永不删除，想看/在看在网页上没有 = 取消标记。
 */
(() => {
  const USER = '59715677';
  const state = (window.__reconcile = { done: false, progress: '启动', error: null, result: null });
  const type = location.host.startsWith('movie.') ? 'movie' : location.host.startsWith('book.') ? 'book' : null;
  if (!type) { state.error = '请在 movie.douban.com 或 book.douban.com 页面运行'; state.done = true; return; }

  const LISTS = { collect: 'done', do: 'doing', wish: 'mark' };
  const TITLE_RE = type === 'movie' ? /我(?:看过|在看|想看)的影视\((\d+)\)/ : /我(?:读过|在读|想读)的书\((\d+)\)/;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  // 列表页短评末尾会带点赞数，例如「(57 有用)」
  const stripVotes = s => s.replace(/\s*\(\d+\s*有用\)\s*$/, '');

  const getHtml = async url => {
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) return res.text();
      await sleep(2000 * i);
    }
    throw new Error('请求失败: ' + url);
  };

  async function fetchList(list) {
    const items = [];
    let total = null;
    for (let start = 0; total === null || start < total; start += 30) {
      const html = await getHtml(`/people/${USER}/${list}?start=${start}&sort=time&rating=all&filter=all&mode=list`);
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const m = TITLE_RE.exec(doc.title);
      if (!m) throw new Error(`列表页不是预期页面（cookie 可能失效，需要重新登录）: ${list} start=${start}`);
      if (total === null) total = +m[1];
      for (const li of doc.querySelectorAll('li.item')) {
        const a = li.querySelector('.title a[href*="/subject/"]');
        if (!a) continue;
        const dateBlock = li.querySelector('.date');
        items.push({
          id: (a.href.match(/subject\/(\d+)/) || [])[1],
          title: clean(a.textContent).split(' / ')[0],
          rating: ((dateBlock?.innerHTML || '').match(/rating(\d)-t/) || [])[1] || 'unrated',
          mark_date: ((dateBlock?.textContent || '').match(/\d{4}-\d{2}-\d{2}/) || [])[0] || '',
          tags: clean(li.querySelector('.tags')?.textContent).replace(/^标签:\s*/, '').split(' ').filter(Boolean).join(','),
          comment: stripVotes(clean(li.querySelector('.comment')?.textContent)),
          status: LISTS[list],
        });
      }
      state.progress = `${list} ${Math.min(start + 30, total)}/${total}`;
      await sleep(1000);
    }
    const unique = new Map(items.map(i => [i.id, i]));
    if (unique.size !== total) throw new Error(`[${list}] 数量不完整: 解析 ${unique.size}，页面标题 ${total}`);
    return [...unique.values()];
  }

  async function fetchDetail(id) {
    const html = await getHtml(`/subject/${id}/`);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (/页面不存在|条目不存在/.test(doc.title)) return null;
    const pic = doc.querySelector('#mainpic img')?.src || '';
    if (type === 'movie') {
      return {
        year: clean(doc.querySelector('h1 .year')?.textContent).replace(/[()]/g, ''),
        directors: [...doc.querySelectorAll('a[rel="v:directedBy"]')].map(a => clean(a.textContent)).slice(0, 5),
        genres: [...doc.querySelectorAll('span[property="v:genre"]')].map(a => clean(a.textContent)),
        pic: pic.replace('s_ratio_poster', 'm_ratio_poster'),
      };
    }
    const info = clean(doc.querySelector('#info')?.textContent);
    const field = (name, next) => (info.match(new RegExp(`${name}:\\s*(.+?)\\s+(?:${next}):`)) || [])[1] || '';
    const NEXT = '出版社|出品方|副标题|原作名|译者|出版年|页数';
    const author = field('作者', NEXT);
    return {
      year: (info.match(/出版年:\s*(\d{4})/) || [])[1] || '',
      author: author ? [author] : [],
      publisher: field('出版社', '出品方|副标题|原作名|译者|出版年|页数'),
      pic: pic.replace('/s/public/', '/l/public/').replace('/m/public/', '/l/public/'),
    };
  }

  (async () => {
    try {
      const file = type === 'movie' ? 'movies' : 'books';
      state.progress = '读取 GitHub 上的当前数据';
      const local = await (await fetch(`https://raw.githubusercontent.com/luli-lula/douban-data/main/data/${file}.json`, { cache: 'no-store' })).json();
      const localById = new Map(local.map(r => [r.id, r]));

      const web = new Map();
      for (const list of Object.keys(LISTS)) for (const it of await fetchList(list)) web.set(it.id, it);

      const changed = [];
      for (const w of web.values()) {
        const r = localById.get(w.id);
        if (!r) continue;
        // 豆瓣已删除的条目（标题「未知…」）列表里不显示内容，不能用空值覆盖本地
        if (/^未知/.test(w.title)) continue;
        const diff = {};
        for (const k of ['status', 'rating', 'comment', 'tags']) if (r[k] !== w[k]) diff[k] = w[k];
        if (w.mark_date && r.mark_date !== w.mark_date) diff.mark_date = w.mark_date;
        if (Object.keys(diff).length) changed.push({ id: w.id, title: r.title, diff });
      }

      const added = [];
      const failed = [];
      const fresh = [...web.values()].filter(w => !localById.has(w.id));
      for (const w of fresh) {
        state.progress = `读取新条目详情 ${added.length + failed.length + 1}/${fresh.length}`;
        let d = null;
        try { d = await fetchDetail(w.id); } catch (e) { failed.push(w.id); }
        added.push({ ...w, detail: d });
        await sleep(1000);
      }

      const removed = local.filter(r => !web.has(r.id) && r.status !== 'done').map(r => ({ id: r.id, title: r.title, status: r.status }));
      state.result = {
        type,
        generated: new Date().toISOString(),
        counts: { web: web.size, local: local.length, added: added.length, changed: changed.length, removed: removed.length, failedDetails: failed.length },
        added, changed, removed,
      };
      state.progress = '完成';
    } catch (e) {
      state.error = String(e && e.message || e);
    }
    state.done = true;
  })();
})();
