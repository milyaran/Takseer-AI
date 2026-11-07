/* ==========================================================================
   market.js — crawl orchestration, relevance filtering, median
   ========================================================================== */
'use strict';

const browserPool = require('./browser');
const scrapers = require('./scrapers');

const CACHE_TTL = 3 * 60 * 1000;
const SOURCE_TIMEOUT = 32000;
const cache = new Map();

function withTimeout(promise, ms, onTimeout) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/* ---------- text helpers ---------- */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ACCESSORY = /(dus|box|kotak|casing|case|tempered|anti gores|charger|kabel|headset|softcase|hardcase|lcd|sparepart|spare part|servis|kunci|manual book|stiker|hanya|only)/;
const WANTED = /(dicari|cari hp|we buy|buyy|wtb|wanted|butuh|open order|dibli|dibeli|mau jual|jual beli|tukar tambah)/;
const BROKEN = /(rusak|mati total|bekas mati|no signal|min minus|cacat berat|water damage)/;

/** Relevance score for a listing against the requested product. */
function relevance(item, product, refPrice) {
  const t = norm(item.title);
  if (!t) return 0;
  const p = norm(product);
  const tokens = p.split(' ').filter((w) => w.length > 1);
  if (!tokens.length) return 0;

  let hit = 0;
  let numericHit = 0;
  tokens.forEach((w) => {
    if (t.includes(w)) {
      hit++;
      if (/\d/.test(w)) numericHit++;
    }
  });
  let score = hit / tokens.length;
  if (numericHit) score += 0.08;

  if (ACCESSORY.test(t) && !/(fullset|full set)/.test(t)) score -= 0.5;
  if (WANTED.test(t)) score -= 0.7;
  if (BROKEN.test(t)) score -= 0.25;

  if (refPrice && item.price) {
    const r = item.price / refPrice;
    if (r < 0.28 || r > 2.4) score -= 0.55;
    else if (r < 0.5 || r > 1.7) score -= 0.22;
  }
  return Math.round(score * 100) / 100;
}

function normalizeItem(raw, src, pageTitle, ctx) {
  const meta = scrapers.SOURCES[src] || { name: src, host: '' };
  const ref = ctx.cat === 'emas' && ctx.weight ? ctx.ref * ctx.weight : ctx.ref;
  const item = {
    id: src + '-' + Buffer.from(String(raw.url)).toString('base64').slice(-10),
    source: src,
    sourceName: meta.name,
    host: meta.host,
    pageTitle: pageTitle || '',
    title: raw.title,
    product: ctx.product || raw.title,
    price: raw.price,
    priceText: raw.priceText || 'Rp ' + new Intl.NumberFormat('id-ID').format(raw.price),
    url: raw.url,
    shop: raw.shop || '',
    location: raw.location || '',
    condition: raw.condition || (src === 'olx' ? 'Bekas' : ''),
    postedAt: raw.postedAt || null,
    postedLabel: raw.postedLabel || '',
    crawledAt: Date.now(),
    pricePerGram: raw.pricePerGram || null
  };
  item.relevance = relevance(item, ctx.product, ref || 0);
  return item;
}

async function runSource(srcId, ctx) {
  const t0 = Date.now();
  let handle = null;
  try {
    handle = await browserPool.newPage();
    let res;
    if (srcId === 'tokopedia') res = await scrapers.tokopedia(handle.page, ctx);
    else if (srcId === 'olx') res = await scrapers.olx(handle.page, ctx);
    else if (srcId === 'antam') res = await scrapers.antam(handle.page, ctx);
    else throw new Error('Sumber tidak dikenal');

    const items = res.items
      .map((raw) => normalizeItem(raw, srcId, res.pageTitle, ctx))
      .filter((it) => it.price > 0 && it.title);

    const relevant = items
      .filter((it) => it.relevance >= 0.45)
      .sort((a, b) => b.relevance - a.relevance || a.price - b.price)
      .slice(0, 8);

    return {
      id: srcId,
      name: (scrapers.SOURCES[srcId] || {}).name || srcId,
      status: relevant.length ? 'ok' : items.length ? 'empty' : 'empty',
      pageTitle: res.pageTitle,
      searchUrl: res.searchUrl,
      items,
      relevant,
      count: relevant.length,
      total: items.length,
      ms: Date.now() - t0
    };
  } catch (e) {
    return {
      id: srcId,
      name: (scrapers.SOURCES[srcId] || {}).name || srcId,
      status: 'error',
      error: String(e.message || e).split('\n')[0].slice(0, 160),
      items: [],
      relevant: [],
      count: 0,
      total: 0,
      ms: Date.now() - t0
    };
  } finally {
    if (handle) await browserPool.closePage(handle);
  }
}

/**
 * Crawl every source for a query.
 * onSource(result) fires as soon as one marketplace answers, so the UI can stream rows.
 */
async function crawl(params, onSource) {
  const ctx = {
    q: String(params.q || '').trim(),
    product: String(params.product || params.q || '').trim(),
    cat: params.cat || 'elektronik',
    ref: Number(params.ref) || 0,
    weight: Number(params.weight) || 0,
    usedOnly: params.usedOnly !== false,
    limit: Math.min(12, Math.max(3, Number(params.limit) || 8))
  };
  if (!ctx.q) throw new Error('Query kosong');

  const key = [ctx.q.toLowerCase(), ctx.cat, ctx.ref, ctx.weight, ctx.usedOnly].join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL && !params.fresh) {
    if (onSource) hit.results.forEach((r) => onSource(r));
    return { cached: true, results: hit.results, ...summarize(hit.results, ctx) };
  }

  const sourceIds = ctx.cat === 'emas' ? ['antam', 'tokopedia', 'olx'] : ['tokopedia', 'olx'];
  const results = [];

  await Promise.all(
    sourceIds.map(async (id) => {
      const res = await runSource(id, ctx);
      results.push(res);
      if (onSource) onSource(res);
    })
  );

  cache.set(key, { at: Date.now(), results });
  if (cache.size > 40) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }

  return { cached: false, results, ...summarize(results, ctx) };
}

function summarize(results) {
  const order = { antam: 0, tokopedia: 1, olx: 2 };
  const sorted = results.slice().sort((a, b) => (order[a.id] || 9) - (order[b.id] || 9));

  let pool = [];
  sorted.forEach((r) => {
    pool = pool.concat((r.relevant || []).slice(0, 5));
  });

  if (pool.length < 3) {
    sorted.forEach((r) => {
      (r.items || []).forEach((it) => {
        if (it.relevance >= 0.3 && !pool.find((p) => p.url === it.url)) pool.push(it);
      });
    });
  }

  pool.sort((a, b) => a.price - b.price);
  const prices = pool.map((i) => i.price).filter((p) => p > 0);
  const median = prices.length
    ? prices.length % 2
      ? prices[(prices.length - 1) / 2]
      : Math.round((prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2)
    : 0;

  const sources = sorted.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    count: (r.relevant || []).length,
    total: (r.items || []).length,
    ms: r.ms,
    error: r.error || null,
    pageTitle: r.pageTitle || '',
    searchUrl: r.searchUrl || ''
  }));

  return {
    items: pool,
    sources,
    median,
    min: prices.length ? Math.min.apply(null, prices) : 0,
    max: prices.length ? Math.max.apply(null, prices) : 0,
    count: pool.length,
    fetchedAt: Date.now()
  };
}

function cacheSnapshot() {
  const out = [];
  cache.forEach((v, k) => {
    out.push({ key: k, at: v.at, results: v.results });
  });
  return out.sort((a, b) => b.at - a.at);
}

module.exports = { crawl, cacheSnapshot, relevance };
