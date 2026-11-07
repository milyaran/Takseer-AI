/* ==========================================================================
   scrapers.js — real-time extraction from Indonesian marketplaces
   Each scraper returns raw listings (title, price, direct product URL).
   Nothing is generated: if a site blocks us, we report the failure.
   ========================================================================== */
'use strict';

const UA_TIMEOUT = 22000;

const SOURCES = {
  tokopedia: { id: 'tokopedia', name: 'Tokopedia', host: 'tokopedia.com', color: '#0D8A48' },
  olx: { id: 'olx', name: 'OLX Indonesia', host: 'olx.co.id', color: '#2563EB' },
  antam: { id: 'antam', name: 'Logam Mulia Antam', host: 'logammulia.com', color: '#B45309' }
};

function parsePrice(str) {
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

/* ---------- Tokopedia ---------- */
async function tokopedia(page, opts) {
  const q = opts.q;
  const used = opts.usedOnly ? '&condition=2' : '';
  const url = 'https://www.tokopedia.com/search?st=product&q=' + encodeURIComponent(q) + used;

  const extract = async () => {
    const data = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      const anchors = Array.from(document.querySelectorAll('a[href^="https://www.tokopedia.com/"]'));
      for (const a of anchors) {
        const href = a.href.split('?')[0];
        if (!/^https:\/\/www\.tokopedia\.com\/[^/]+\/[^/]+$/.test(href)) continue;
        if (seen.has(href)) continue;
        const text = a.innerText || '';
        const priceMatch = text.match(/Rp\s?[\d.]{4,}/);
        if (!priceMatch) continue;
        const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
        if (!lines.length) continue;
        seen.add(href);
        out.push({ title: lines[0], priceText: priceMatch[0], lines: lines.slice(1, 6), url: href });
        if (out.length >= 24) break;
      }
      return { pageTitle: document.title, items: out };
    });
    return {
      source: 'tokopedia',
      pageTitle: data.pageTitle,
      searchUrl: page.url(),
      items: data.items.map((it) => {
        const meta = it.lines.filter((l) => !/^Rp/.test(l) && !/^Hemat|^Bisa COD|^Cashback|^Gratis/i.test(l));
        const sold = meta.find((l) => /terjual/i.test(l)) || '';
        const rating = meta.find((l) => /^\d\.\d$/.test(l)) || '';
        const rest = meta.filter((l) => l !== sold && l !== rating);
        return {
          title: it.title,
          price: parsePrice(it.priceText),
          priceText: it.priceText,
          url: it.url,
          shop: rest.length > 1 ? rest[rest.length - 2] : '',
          location: rest.length ? rest[rest.length - 1] : '',
          sold,
          rating,
          condition: opts.usedOnly ? 'Bekas' : ''
        };
      })
    };
  };

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: UA_TIMEOUT });
  await page
    .waitForFunction(() => document.querySelectorAll('a[href^="https://www.tokopedia.com/"]').length > 4, { timeout: 11000 })
    .catch(() => {});
  await page.waitForTimeout(700);

  let res = await extract();

  // no used listings → retry without the condition filter
  if (opts.usedOnly && res.items.length < 3) {
    const url2 = 'https://www.tokopedia.com/search?st=product&q=' + encodeURIComponent(q);
    await page.goto(url2, { waitUntil: 'domcontentloaded', timeout: UA_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(2200);
    const res2 = await extract();
    if (res2.items.length > res.items.length) res = res2;
  }

  return res;
}

/* ---------- OLX ---------- */
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MEI: 4, MAY: 4, JUN: 5, JUL: 6, AGU: 7, AUG: 7, SEP: 8, OKT: 9, OCT: 9, NOV: 10, DES: 11, DEC: 11 };

function parseOlxDate(str) {
  if (!str) return null;
  const s = String(str).trim().toUpperCase();
  const now = Date.now();

  if (/^BARU SAJA$/.test(s)) return now;
  if (/HARI INI/.test(s)) return now;
  if (/^KEMARIN$/.test(s)) return now - 86400000;

  let m = s.match(/^(\d+)\s*MENIT/);
  if (m) return now - parseInt(m[1], 10) * 60000;
  m = s.match(/^(\d+)\s*JAM/);
  if (m) return now - parseInt(m[1], 10) * 3600000;
  m = s.match(/^(\d+)\s*HARI/);
  if (m) return now - parseInt(m[1], 10) * 86400000;

  m = s.match(/^(\d{1,2})\s+([A-Z]{3})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2]];
    if (mon == null) return null;
    const guess = new Date(new Date().getFullYear(), mon, day);
    if (guess.getTime() > now + 86400000) guess.setFullYear(guess.getFullYear() - 1);
    return guess.getTime();
  }
  return null;
}

async function olx(page, opts) {
  const slug = opts.q.trim().replace(/\s+/g, '-').toLowerCase();
  const url = 'https://www.olx.co.id/items/q-' + encodeURIComponent(slug);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: UA_TIMEOUT });
  await page
    .waitForFunction(() => document.querySelectorAll('a[href*="/item/"]').length > 2, { timeout: 11000 })
    .catch(() => {});
  await page.waitForTimeout(700);

  const data = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll('a[href*="/item/"]'));
    for (const a of anchors) {
      const href = a.href.split('?')[0];
      if (seen.has(href)) continue;
      const lines = (a.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const priceLine = lines.find((l) => /^Rp/.test(l));
      if (!priceLine) continue;
      seen.add(href);
      out.push({ lines, url: href });
      if (out.length >= 24) break;
    }
    return { pageTitle: document.title, items: out };
  });

  return {
    source: 'olx',
    pageTitle: data.pageTitle,
    searchUrl: url,
    items: data.items.map((it) => {
      const priceIdx = it.lines.findIndex((l) => /^Rp/.test(l));
      const title = it.lines[priceIdx + 1] || '';
      const location = it.lines[priceIdx + 2] || '';
      const dateStr = it.lines[priceIdx + 3] || '';
      return {
        title,
        price: parsePrice(it.lines[priceIdx]),
        priceText: it.lines[priceIdx],
        url: it.url,
        shop: '',
        location,
        postedAt: parseOlxDate(dateStr),
        postedLabel: dateStr,
        condition: 'Bekas'
      };
    })
  };
}

/* ---------- Logam Mulia (official gold index) ---------- */
async function antam(page, opts) {
  const url = 'https://www.logammulia.com/id/harga-emas-hari-ini';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: UA_TIMEOUT });
  await page.waitForTimeout(2600);

  const data = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, ' ');
    const grab = (label) => {
      const re = new RegExp(label + '\\s*Rp\\s*([\\d.,]+)\\s*/gr', 'i');
      const m = t.match(re);
      return m ? m[1] : null;
    };
    const upd = t.match(/Terakhir diperbarui:\s*([^|]{0,60})/i);
    return {
      pageTitle: document.title,
      buyback: grab('Harga Beli Emas'),
      sell: grab('Harga Jual Emas'),
      updated: upd ? upd[1].trim() : ''
    };
  });

  const perGram = parsePrice(data.buyback);
  if (!perGram) throw new Error('Harga emas tidak ditemukan pada halaman Logam Mulia');

  const weight = opts.weight || 1;
  const total = perGram * weight;

  return {
    source: 'antam',
    pageTitle: data.pageTitle + (data.updated ? ' · ' + data.updated : ''),
    searchUrl: url,
    items: [
      {
        title:
          'Harga buyback Logam Mulia ' +
          new Intl.NumberFormat('id-ID').format(perGram) +
          '/gram · ' +
          weight +
          ' gram',
        price: total,
        priceText: 'Rp ' + new Intl.NumberFormat('id-ID').format(total),
        url,
        shop: 'PT Aneka Tambang (Persero) Tbk',
        location: 'Nasional',
        condition: 'Indeks resmi',
        pricePerGram: perGram
      }
    ]
  };
}

module.exports = { SOURCES, tokopedia, olx, antam, parsePrice };
