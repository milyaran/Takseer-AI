/* ==========================================================================
   server.js — static host + scraping API + AI proxy
   Run:  node server/server.js     (default http://localhost:8787)
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const browserPool = require('./browser');
const market = require('./market');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function json(res, code, body) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > (limit || 12 * 1024 * 1024)) {
        reject(new Error('Payload terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error('JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

/* ---------- AI proxy ---------- */
function aiEndpoint(baseUrl, suffix) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('Base URL model AI belum diisi — buka Pengaturan (gear) lalu isi Base URL & Model Name');
  if (!/^https?:\/\//i.test(base)) throw new Error('Base URL harus diawali http:// atau https://');
  return base + suffix;
}

async function aiFetch(baseUrl, apiKey, suffix, init) {
  const target = aiEndpoint(baseUrl, suffix);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(target, { ...init, headers: { ...headers, ...(init && init.headers) }, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = { raw: text.slice(0, 800) };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function aiChat(opts) {
  const payload = {
    model: opts.model,
    messages: opts.messages,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
    max_tokens: opts.maxTokens || 900
  };
  const r = await aiFetch(opts.baseUrl, opts.apiKey, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const msg = (r.body && (r.body.error && (r.body.error.message || r.body.error)) || r.body.raw || 'HTTP ' + r.status) + '';
    throw new Error('Model menolak permintaan: ' + String(msg).slice(0, 220));
  }
  const choice = r.body && r.body.choices && r.body.choices[0];
  const content = choice && choice.message && choice.message.content;
  return typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c.text || '').join('') : '';
}

function extractJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

/* ---------- routes ---------- */
async function handleApi(req, res, parsed) {
  const p = parsed.pathname;

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (p === '/api/health') {
    const st = browserPool.status();
    return json(res, 200, {
      ok: true,
      service: 'takseer-scraper',
      version: '1.0.0',
      chromium: st,
      uptime: Math.round(process.uptime()),
      time: Date.now()
    });
  }

  if (p === '/api/market' && req.method === 'GET') {
    const q = parsed.query;
    try {
      const result = await market.crawl({
        q: q.q,
        product: q.product,
        cat: q.cat,
        ref: q.ref,
        weight: q.weight,
        limit: q.limit,
        usedOnly: q.usedOnly !== '0',
        fresh: q.fresh === '1'
      });
      return json(res, 200, { ok: true, ...result });
    } catch (e) {
      return json(res, 502, { ok: false, error: String(e.message || e) });
    }
  }

  if (p === '/api/market/stream') {
    const q = parsed.query;
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');

    let closed = false;
    const send = (event, data) => {
      if (closed) return;
      try {
        res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
      } catch (e) {
        closed = true;
      }
    };
    const ping = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      closed = true;
      clearInterval(ping);
    });

    try {
      const result = await market.crawl(
        {
          q: q.q,
          product: q.product,
          cat: q.cat,
          ref: q.ref,
          weight: q.weight,
          limit: q.limit,
          usedOnly: q.usedOnly !== '0',
          fresh: q.fresh === '1'
        },
        (src) =>
          send('source', {
            id: src.id,
            name: src.name,
            status: src.status,
            ms: src.ms,
            error: src.error || null,
            pageTitle: src.pageTitle || '',
            searchUrl: src.searchUrl || '',
            count: (src.relevant || []).length,
            total: (src.items || []).length,
            items: src.relevant || []
          })
      );
      send('done', { ok: true, ...result });
    } catch (e) {
      send('error', { ok: false, error: String(e.message || e) });
    } finally {
      clearInterval(ping);
      if (!closed) res.end();
    }
    return;
  }

  if (p === '/api/rag') {
    return json(res, 200, { ok: true, caches: market.cacheSnapshot() });
  }

  if (p === '/api/ai/test' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const model = String(b.model || '').trim();
      if (!model) return json(res, 200, { ok: false, error: 'Model Name belum diisi' });

      /* 1. Uji model yang BENAR-BENAR dipakai, bukan sekadar GET /models.
            Kalau nama model salah atau key tidak berlaku, aiChat akan throw. */
      let reply = '';
      try {
        reply = await aiChat({
          baseUrl: b.baseUrl,
          apiKey: b.apiKey,
          model,
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 5
        });
      } catch (e) {
        return json(res, 200, {
          ok: false,
          error: 'Model "' + model + '" tidak merespons: ' + String(e.message || e)
        });
      }

      /* 2. Khusus Vision: pastikan model menerima input gambar.
            GET /models tidak pernah membuktikan kemampuan multimodal. */
      if (b.kind === 'vision') {
        const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
        try {
          await aiChat({
            baseUrl: b.baseUrl,
            apiKey: b.apiKey,
            model,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: 'Reply OK' },
                { type: 'image_url', image_url: { url: px } }
              ]
            }],
            maxTokens: 5
          });
        } catch (e) {
          return json(res, 200, {
            ok: false,
            error: 'Model "' + model + '" menolak input gambar — kemungkinan ini model teks, bukan model Vision: ' + String(e.message || e)
          });
        }
        return json(res, 200, { ok: true, mode: 'vision', model, reply: String(reply).slice(0, 60) });
      }

      return json(res, 200, { ok: true, mode: 'chat', model, reply: String(reply).slice(0, 60) });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  if (p === '/api/ai/vision' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const images = (b.images || []).slice(0, 3);
      const content = [
        {
          type: 'text',
          text:
            (b.prompt ||
              'Kamu adalah penaksir gadai profesional di Indonesia. Analisa foto agunan berikut.') +
            '\n\nJawab HANYA dengan JSON valid tanpa penjelasan lain, dengan skema:\n' +
            '{"product":"nama produk lengkap","brand":"merek","specs":"spesifikasi & kelengkapan singkat","completeness":"fullset|minus_box|unit_only","grade":"A|B|C|D","confidence":0-100,"notes":"kondisi fisik yang terlihat","signals":["ciri yang terbaca"],"readable":true|false}'
        }
      ];
      images.forEach((img) => {
        content.push({ type: 'image_url', image_url: { url: img } });
      });
      const reply = await aiChat({
        baseUrl: b.baseUrl,
        apiKey: b.apiKey,
        model: b.model,
        messages: [{ role: 'user', content }],
        temperature: 0.1,
        maxTokens: 900
      });
      const parsed = extractJson(reply);
      if (!parsed) {
        return json(res, 200, {
          ok: false,
          data: null,
          raw: String(reply || '').slice(0, 500),
          error: 'Model tidak membalas JSON valid — pastikan Model Name di blok AI Model Vision adalah model multimodal, bukan model teks.'
        });
      }
      return json(res, 200, { ok: true, data: parsed });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  if (p === '/api/ai/reason' && req.method === 'POST') {
    try {
      const b = await readBody(req);
      const reply = await aiChat({
        baseUrl: b.baseUrl,
        apiKey: b.apiKey,
        model: b.model,
        messages: b.messages,
        temperature: 0.3,
        maxTokens: 400
      });
      return json(res, 200, { ok: true, text: String(reply).trim().slice(0, 900) });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  return json(res, 404, { ok: false, error: 'Endpoint tidak ditemukan' });
}

function serveStatic(req, res, parsed) {
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const target = path.join(ROOT, pathname);
  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60'
    });
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, parsed);
    } catch (e) {
      if (!res.headersSent) json(res, 500, { ok: false, error: String(e.message || e) });
      else res.end();
    }
    return;
  }
  serveStatic(req, res, parsed);
});

server.listen(PORT, HOST, () => {
  const st = browserPool.status();
  console.log('');
  console.log('  Takseer scraper aktif → http://' + HOST + ':' + PORT);
  console.log('  Chromium : ' + (st.found ? st.executable : 'TIDAK DITEMUKAN (set CHROMIUM_PATH)'));
  console.log('  API      : /api/health · /api/market · /api/market/stream · /api/rag');
  console.log('');

  // warm up DNS/TLS/cache so the first real crawl is fast
  setTimeout(async () => {
    try {
      const h = await browserPool.newPage();
      await h.page.goto('https://www.tokopedia.com/', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await browserPool.closePage(h);
      console.log('  warm-up browser selesai');
    } catch (e) {
      console.log('  warm-up dilewati:', String(e.message || e).split('\n')[0]);
    }
  }, 600);
});

process.on('SIGINT', async () => {
  await browserPool.shutdown();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await browserPool.shutdown();
  process.exit(0);
});
