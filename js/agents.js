/* ==========================================================================
   agents.js — appraisal pipeline
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});
  const U = TK.util;
  const C = TK.catalog;

  const KARAT_FACTOR = { 24: 1, 22: 0.916, 21: 0.875, 18: 0.75, 17: 0.708, 16: 0.667 };

  /* ---------- Vivi (visual) ---------- */
  function computeVision(draft) {
    const prod = draft.productId ? (C.byId(draft.productId) || null) : null;
    const photos = draft.photos || [];
    const okPhotos = photos.filter((p) => p.quality && p.quality.ok);
    const warnings = [];

    photos.forEach((p) => {
      if (p.quality && !p.quality.ok) {
        warnings.push({
          photoId: p.id,
          label: p.label,
          verdict: p.quality.verdict,
          text: p.quality.reason
        });
      }
    });

    const avg =
      photos.length && photos.every((p) => p.quality)
        ? photos.reduce((s, p) => s + (p.quality.score || 0), 0) / photos.length
        : 70;

    let confidence = U.clamp(Math.round(58 + avg * 0.4), 55, 97);
    if (okPhotos.length < 2) confidence -= 8;
    if (warnings.length) confidence -= Math.min(12, warnings.length * 4);
    confidence = U.clamp(confidence, 42, 97);

    const signals = (prod ? (C.VISION_SIGNALS[prod.sample] || []) : []).slice();
    if (prod && prod.cat === 'emas') {
      const w = draft.weight || prod.weight || 5;
      const k = draft.karat || prod.karat || 24;
      signals.push('Berat ' + w + ' gram · kadar ' + k + 'K');
    }
    if (prod && prod.cat === 'elektronik') {
      signals.push('Kelengkapan: ' + (C.COMPLETENESS[draft.completeness] || C.COMPLETENESS.fullset).label);
    }

    return {
      confidence,
      signals,
      warnings,
      analyzedAt: Date.now(),
      readable: okPhotos.length > 0,
      photoCount: photos.length,
      clearCount: okPhotos.length
    };
  }

  /* ---------- Raga (market scraping) ---------- */
  async function fetchMarket(draft, hooks) {
    const prod = draft.productId ? (C.byId(draft.productId) || null) : null;
    const isGold = !!(prod && prod.cat === 'emas');
    const grade = C.GRADES[draft.grade] || C.GRADES.B;
    const weight = draft.weight || (prod && prod.weight) || 5;
    const karat = draft.karat || (prod && prod.karat) || 24;

    const q = isGold
      ? 'harga emas ' + karat + 'K ' + weight + ' gram'
      : ((prod ? prod.name : draft.productName) || 'barang elektronik bekas') + ' bekas ' + grade.label;

    const params = {
      q: q,
      product: (prod ? prod.name : draft.productName) || '',
      cat: prod ? prod.cat : 'elektronik',
      ref: String(prod ? prod.base : 0),
      weight: isGold ? String(weight) : '',
      limit: '8',
      fresh: '1'
    };

    const sources = [];
    let summary = null;

    try {
      summary = await TK.api.marketStream(params, {
        onSource: (src) => {
          const meta = C.PLATFORMS[src.id] || { name: src.name || src.id, icon: 'box', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0', host: src.id + '.com' };
          src.items.forEach((it, idx) => {
            const price = it.price || 0;
            const row = {
              id: (src.id || 'src') + '-' + idx + '-' + Math.random().toString(36).slice(2, 6),
              platform: src.id,
              name: meta.name,
              badge: meta.badge || meta.name,
              color: meta.color,
              bg: meta.bg,
              border: meta.border,
              icon: meta.icon,
              host: meta.host,
              price,
              condition: it.condition || (src.id === 'olx' ? 'Bekas' : ''),
              conditionShort: it.condition || '',
              city: it.location || '',
              minutesAgo: 0,
              ts: it.postedAt || Date.now(),
              title: it.title || (prod ? prod.name : draft.productName) || '',
              url: it.url || '#',
              query: q,
              crawledAt: Date.now(),
              relevance: it.relevance || 0.6
            };
            sources.push(row);
            if (hooks && hooks.onSource) hooks.onSource(row, sources.length - 1);
          });
          if (hooks && hooks.onLog) hooks.onLog('system', 'info', src.name + ' → ' + src.count + ' item · ' + src.ms + 'ms');
        }
      });
    } catch (e) {
      if (hooks && hooks.onLog) hooks.onLog('system', 'warn', 'Scraping gagal: ' + (e.message || 'unknown'));
      // fallback to local generation
      return generateMarketLocal(draft);
    }

    // sort by relevance then price, mark median
    sources.sort((a, b) => (b.relevance || 0) - (a.relevance || 0) || (a.price || 0) - (b.price || 0));

    const prices = sources.map((s) => s.price).filter((p) => p > 0);
    const median = prices.length ? U.median(prices) : (prod ? prod.base : 0);

    let closest = null;
    sources.forEach((s) => {
      if (!closest || Math.abs((s.price || 0) - median) < Math.abs((closest.price || 0) - median)) closest = s;
    });
    if (closest) closest.isMedian = true;

    return {
      status: 'ready',
      sources,
      median,
      min: prices.length ? Math.min.apply(null, prices) : 0,
      max: prices.length ? Math.max.apply(null, prices) : 0,
      fetchedAt: Date.now(),
      query: q,
      isGold,
      weight,
      karat,
      sort: 'newest'
    };
  }

  /* Local fallback when server unavailable */
  function generateMarketLocal(draft) {
    const prod = draft.productId ? (C.byId(draft.productId) || null) : null;
    const rng = U.seeded((draft.id || 'tk') + ':' + Date.now());
    const isGold = !!(prod && prod.cat === 'emas');
    const grade = C.GRADES[draft.grade] || C.GRADES.B;
    const weight = draft.weight || (prod && prod.weight) || 5;
    const karat = draft.karat || (prod && prod.karat) || 24;
    const karatF = KARAT_FACTOR[karat] || 1;

    /* Untuk produk kustom (tanpa productId), gunakan estimasi dari input manual
       atau fallback aman agar query pasar tetap bisa dibentuk. */
    const nameForQuery = (prod ? prod.name : draft.productName) || 'barang elektronik bekas';
    const baseAnchor = prod ? prod.base : 0;
    const anchor = isGold
      ? baseAnchor * weight * karatF
      : (baseAnchor || estimateBase(draft)) * (0.96 + grade.priceFactor * 0.03);

    const offsets = [-0.034, -0.019, -0.006, 0.004, 0.017, 0.031];
    const platforms = (prod ? prod.platforms : ['tokopedia', 'shopee', 'olx', 'fbm', 'bukalapak']).slice(0, isGold ? 5 : 6);

    const sources = platforms.map((pid, i) => {
      const meta = C.PLATFORMS[pid];
      const jitter = (rng() - 0.5) * (isGold ? 0.012 : 0.016);
      let price = anchor * (1 + offsets[i % offsets.length] + jitter);
      price = isGold ? Math.round(price / 1000) * 1000 : Math.round(price / 50000) * 50000;
      if (!price) price = 50000 + Math.round(rng() * 50000) * 50000;

      const minutesAgo = Math.round(2 + rng() * 34) + i * 2;
      const cond = isGold
        ? (karat === 24 ? 'Certicard 99,99%' : 'Perhiasan ' + karat + 'K')
        : grade.label + ' ' + ((prod && prod.cat === 'kendaraan') ? (prod.city || 'Jakarta') : 'Fullset');

      const condShort = isGold ? karat + 'K · ' + weight + 'g' : grade.label;

      const query = isGold
        ? 'harga emas ' + karat + 'K ' + weight + ' gram hari ini'
        : nameForQuery + ' bekas ' + grade.label;

      return {
        id: pid + '-' + i,
        platform: pid,
        name: meta.name,
        badge: meta.badge,
        color: meta.color,
        bg: meta.bg,
        border: meta.border,
        icon: meta.icon,
        host: meta.host,
        price,
        condition: cond,
        conditionShort: condShort,
        city: (prod && prod.city) || 'Jakarta',
        minutesAgo,
        ts: Date.now() - minutesAgo * 60000,
        title: isGold ? meta.name + ' — indeks ' + karat + 'K ' + U.rp(price / weight) + '/gram' : nameForQuery + ' — ' + cond,
        url: '#',
        query
      };
    });

    sources.sort((a, b) => a.minutesAgo - b.minutesAgo);
    const prices = sources.map((s) => s.price).filter((p) => p > 0);
    const median = prices.length ? Math.round(U.median(prices) / 1000) * 1000 : (anchor || 0);
    let closest = null;
    sources.forEach((s) => {
      if (!closest || Math.abs(s.price - median) < Math.abs(closest.price - median)) closest = s;
    });
    if (closest) closest.isMedian = true;

    return {
      status: 'ready',
      sources,
      median,
      min: prices.length ? Math.min.apply(null, prices) : 0,
      max: prices.length ? Math.max.apply(null, prices) : 0,
      fetchedAt: Date.now(),
      query: isGold ? 'harga emas ' + karat + 'K ' + weight + 'g' : nameForQuery + ' bekas',
      isGold,
      weight,
      karat,
      sort: 'newest'
    };
  }

  /* Perkiraan harga acuan untuk produk kustom (tidak ada di katalog).
     Dipakai hanya oleh fallback lokal agar query pasar tetap terbentuk. */
  function estimateBase(draft) {
    const name = (draft.productName || '').toLowerCase();
    const w = Number(draft.weight) || 0;
    if (draft.cat === 'emas' || /emas|antam|logam mulia/.test(name)) {
      return 1920000;
    }
    if (/iphone|samsung galaxy|pixel|xiaomi|redmi|oppo|vivo/.test(name)) return 5000000;
    if (/macbook|laptop|asus rog|lenovo|hp pavilion|dell/.test(name)) return 9000000;
    if (/ipad|tablet/.test(name)) return 6000000;
    if (/sony|canon|nikon|fujifilm|kamera|alpha a7|a7iii/.test(name)) return 12000000;
    if (/vario|nmax|beat|vespa|motor|honda|yamaha/.test(name)) return 18000000;
    if (w > 0) return w * 1800000;
    return 3000000;
  }

  /* ---------- Riska (valuation) ---------- */
  function computeValuation(draft) {
    const prod = draft.productId ? (C.byId(draft.productId) || null) : null;
    const catId = prod ? prod.cat : (draft.cat || 'elektronik');
    const cat = C.CATEGORIES[catId] || C.CATEGORIES.elektronik;
    const grade = C.GRADES[draft.grade] || C.GRADES.B;
    const comp = C.COMPLETENESS[draft.completeness] || C.COMPLETENESS.fullset;
    const market = draft.market || {};
    const median = market.median || (prod ? prod.base : 0);

    const compFactor = catId === 'emas' ? 1 : comp.factor;
    const collateral = median * compFactor;

    // Use configurable LTV from settings as base
    const defaultLtv = TK.settings.ltvRatio();
    let ltv = defaultLtv + grade.ltvAdj + (prod ? (prod.volatilityAdj || 0) : 0);
    ltv = U.clamp(ltv, 0.45, 0.95);

    const ceiling = U.roundCeiling(collateral * ltv);
    const displayLtv = median > 0 ? ceiling / median : 0;
    const margin = Math.max(0, collateral - ceiling);

    let risk;
    if (draft.grade === 'D') {
      risk = { label: 'Tinjau Manual', tone: 'c', score: 42 };
    } else if (displayLtv >= defaultLtv - 0.015) {
      risk = { label: 'Moderate', tone: 'c', score: 62 };
    } else if (prod && prod.volatility === 'tinggi') {
      risk = { label: 'Moderate', tone: 'c', score: 66 };
    } else {
      risk = { label: 'Low Risk', tone: 'a', score: 88 };
    }

    return {
      median,
      collateral,
      compFactor,
      ltvRaw: ltv,
      ltv: displayLtv,
      ceiling,
      displayLtv,
      margin,
      marginPct: collateral > 0 ? margin / collateral : 0,
      maxLtv: defaultLtv,
      risk,
      liquidity: cat.liquidity,
      liquidation: cat.liquidation,
      note: cat.note,
      grade: grade.key,
      breakdown: {
        median,
        gradeFactor: grade.priceFactor,
        compFactor,
        collateral,
        ltv,
        maxLtv: defaultLtv,
        gradeAdj: grade.ltvAdj,
        volAdj: prod ? (prod.volatilityAdj || 0) : 0
      }
    };
  }

  /* ---------- Dita (authority) ---------- */
  function authorityCheck(valuation, role) {
    const limit = TK.store.limit();
    const over = valuation.ceiling > limit;
    return {
      limit,
      over,
      requiredRole: over ? 'manager' : 'staff',
      message: over
        ? 'Plafon melebihi limit staff (' + U.rp(limit) + ')'
        : 'Dalam batas otorisasi staff (' + U.rp(limit) + ')'
    };
  }

  /* ---------- orchestrator ---------- */
  async function runPipeline(draft, hooks) {
    const h = hooks || {};
    const call = (fn, ...args) => { if (typeof fn === 'function') fn(...args); };
    const t0 = performance.now();

    const prod = draft.productId ? (C.byId(draft.productId) || null) : null;

    /* ---- vision ---- */
    call(h.onLog, 'system', 'info', 'Menerima ' + draft.photos.length + ' foto agunan');
    await U.sleep(320);
    const vision = computeVision(draft);

    /* AI Vision enhancement (optional) */
    const hasAI = TK.settings && TK.settings.hasVision && TK.settings.hasVision();
    if (hasAI && TK.engine && TK.engine.askVision) {
      call(h.onLog, 'system', 'info', 'Menjalankan AI Vision untuk identifikasi produk…');
      try {
        const aiResult = await TK.engine.askVision(draft);
        if (aiResult && aiResult.data) {
          const d = aiResult.data;
          if (d.product) draft.productName = d.product;
          if (d.brand) draft.brand = d.brand;
          if (d.specs) draft.spec = d.specs;
          if (d.grade && ['A', 'B', 'C', 'D'].includes(d.grade)) draft.grade = d.grade;
          if (typeof d.confidence === 'number') {
            vision.confidence = U.clamp(Math.round(d.confidence), 0, 100);
          }
          if (d.signals && d.signals.length) {
            vision.signals = vision.signals.concat(d.signals);
            vision.signals = Array.from(new Set(vision.signals));
          }
          vision.aiData = d;
          vision.aiNote = d.notes || '';
          vision.source = 'ai';
          call(h.onLog, 'system', 'ok', 'AI Vision: ' + (d.product || 'produk terdeteksi') + ' · grade ' + (d.grade || '?') + ' · confidence ' + (d.confidence || 0) + '%');
        } else if (aiResult && aiResult.error) {
          call(h.onLog, 'system', 'warn', 'AI Vision gagal: ' + aiResult.error + ' — menggunakan heuristik lokal');
        }
      } catch (e) {
        call(h.onLog, 'system', 'warn', 'AI Vision error: ' + (e.message || '') + ' — menggunakan heuristik lokal');
      }
    }

    call(h.onVision, vision);
    await U.sleep(200);

    /* ---- market scraping (real-time) ---- */
    const queryLabel = (prod && prod.cat === 'emas')
      ? 'harga emas ' + (draft.karat || prod.karat) + 'K ' + (draft.weight || prod.weight) + 'g'
      : ((prod ? prod.name : draft.productName) || 'barang elektronik bekas') + ' bekas';
    call(h.onLog, 'system', 'info', 'Menyusun query: "' + queryLabel + '"');
    const market = await fetchMarket(draft, hooks);
    call(h.onMarket, market);
    await U.sleep(180);

    /* ---- valuation ---- */
    call(h.onLog, 'system', 'info', 'Menormalisasi harga pasar terhadap kondisi ' + (C.GRADES[draft.grade] || C.GRADES.B).label);
    await U.sleep(260);

    const valuation = computeValuation({ ...draft, market });

    /* AI Reasoning enhancement (optional) */
    const hasReason = TK.settings && TK.settings.hasReason && TK.settings.hasReason();
    if (hasReason && TK.engine && TK.engine.askReason) {
      call(h.onLog, 'system', 'info', 'Menjalankan AI Reasoning untuk analisis risiko…');
      try {
        const valForAI = {
          median: valuation.median,
          collateral: valuation.collateral,
          ltvPct: Math.round((valuation.displayLtv || valuation.ltvRaw || 0) * 100),
          ceiling: valuation.ceiling,
          margin: valuation.margin,
          sourceCount: (market.sources || []).length
        };
        const reasonResult = await TK.engine.askReason({ ...draft, market }, valForAI);
        if (reasonResult && reasonResult.text) {
          valuation.aiNote = reasonResult.text;
          call(h.onLog, 'system', 'ok', 'AI Reasoning: analisis risiko tersedia');
        } else if (reasonResult && reasonResult.error) {
          call(h.onLog, 'system', 'warn', 'AI Reasoning gagal: ' + reasonResult.error);
        }
      } catch (e) {
        call(h.onLog, 'system', 'warn', 'AI Reasoning error: ' + (e.message || ''));
      }
    }

    call(h.onValuation, valuation);
    await U.sleep(140);

    /* ---- authority ---- */
    const auth = authorityCheck(valuation, 'staff');
    call(h.onLog, 'system', auth.over ? 'warn' : 'ok', auth.message);

    const elapsed = (performance.now() - t0) / 1000;
    call(h.onDone, { vision, market, valuation, auth, elapsed });

    return { vision, market, valuation, auth, elapsed };
  }

  TK.agents = {
    computeVision,
    fetchMarket,
    generateMarketLocal,
    computeValuation,
    authorityCheck,
    runPipeline,
    KARAT_FACTOR
  };
})(window);
