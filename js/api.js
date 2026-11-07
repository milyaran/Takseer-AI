/* ==========================================================================
   api.js — client for the Takseer scraping/AI service
   Falls back to same-origin, then to the local service port.
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});

  const CANDIDATES = (function () {
    const list = [];
    if (location.protocol === 'http:' || location.protocol === 'https:') list.push('');
    list.push('http://127.0.0.1:8787', 'http://localhost:8787');
    return list;
  })();

  let base = null;
  let probe = null;

  function timeout(ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(t) };
  }

  async function resolveBase() {
    if (base !== null) return base;
    if (probe) return probe;
    probe = (async () => {
      for (const c of CANDIDATES) {
        try {
          const t = timeout(2500);
          const res = await fetch(c + '/api/health', { signal: t.signal });
          t.done();
          if (res.ok) {
            const body = await res.json();
            if (body && body.ok) {
              base = c;
              return base;
            }
          }
        } catch (e) {
          /* try next */
        }
      }
      base = false;
      return false;
    })();
    return probe;
  }

  async function call(path, opts) {
    const b = await resolveBase();
    if (b === false) throw new Error('Layanan scraping belum aktif');
    const t = timeout((opts && opts.timeout) || 45000);
    try {
      const res = await fetch(b + path, {
        method: (opts && opts.method) || 'GET',
        headers: opts && opts.body ? { 'Content-Type': 'application/json' } : undefined,
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
        signal: t.signal
      });
      const data = await res.json();
      return data;
    } finally {
      t.done();
    }
  }

  /** SSE crawl with per-source streaming. Returns a promise resolving to the summary. */
  function marketStream(params, handlers) {
    const h = handlers || {};
    return new Promise(async (resolve, reject) => {
      const b = await resolveBase();
      if (b === false) {
        reject(new Error('Layanan scraping belum aktif. Jalankan "npm start" lalu buka http://localhost:8787'));
        return;
      }
      const qs = new URLSearchParams(params).toString();
      let settled = false;
      let es;
      try {
        es = new EventSource(b + '/api/market/stream?' + qs);
      } catch (e) {
        reject(e);
        return;
      }

      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        try {
          es.close();
        } catch (e) {
          /* ignore */
        }
        fn(arg);
      };

      es.addEventListener('source', (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (h.onSource) h.onSource(d);
        } catch (e) {
          /* ignore malformed frame */
        }
      });
      es.addEventListener('done', (ev) => {
        try {
          finish(resolve, JSON.parse(ev.data));
        } catch (e) {
          finish(reject, e);
        }
      });
      es.addEventListener('error', (ev) => {
        if (ev && ev.data) {
          try {
            finish(reject, new Error(JSON.parse(ev.data).error || 'Gagal mengambil data'));
            return;
          } catch (e) {
            /* fall through */
          }
        }
        // connection dropped before "done" → fall back to the JSON endpoint
        if (!settled) {
          settled = true;
          try {
            es.close();
          } catch (e) {
            /* ignore */
          }
          call('/api/market?' + qs, { timeout: 60000 })
            .then((r) => (r && r.ok ? resolve(r) : reject(new Error((r && r.error) || 'Gagal mengambil data'))))
            .catch(reject);
        }
      });
    });
  }

  TK.api = {
    resolveBase,
    health: () => call('/api/health', { timeout: 4000 }),
    market: (params) => call('/api/market?' + new URLSearchParams(params).toString(), { timeout: 60000 }),
    marketStream,
    rag: () => call('/api/rag', { timeout: 8000 }),
    testModel: (cfg) => call('/api/ai/test', { method: 'POST', body: cfg, timeout: 25000 }),
    vision: (body) => call('/api/ai/vision', { method: 'POST', body, timeout: 60000 }),
    reason: (body) => call('/api/ai/reason', { method: 'POST', body, timeout: 45000 }),
    get base() {
      return base;
    }
  };
})(window);
