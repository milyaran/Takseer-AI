/* ==========================================================================
   engine.js — appraisal engine
   vision heuristics · real market crawl · valuation · authority check
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});
  const U = TK.util;
  const C = TK.catalog;

  /* ---------- vision (local quality gate + catalog matching) ---------- */
  function computeVision(draft) {
    const prod = C.byId(draft.productId) || C.PRODUCTS[0];
    const photos = draft.photos || [];
    const okPhotos = photos.filter((p) => p.quality && p.quality.ok);
    const warnings = [];

    photos.forEach((p) => {
      if (p.quality && !p.quality.ok) {
        warnings.push({ photoId: p.id, label: p.label, verdict: p.quality.verdict, text: p.quality.reason });
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

    const signals = (C.VISION_SIGNALS[prod.sample] || []).slice();
    if (prod.cat === 'emas') {
      signals.push('Berat ' + (draft.weight || prod.weight || 5) + ' gram · kadar ' + (draft.karat || prod.karat || 24) + 'K');
    }
    if (prod.cat !== 'emas') {
      signals.push('Kelengkapan: ' + (C.COMPLETENESS[draft.completeness] || C.COMPLETENESS.fullset).label);
    }

    return {
      confidence,
      signals,
      warnings,
      source: 'lokal',
      analyzedAt: Date.now(),
      readable: okPhotos.length > 0,
      photoCount: photos.length,
      clearCount: okPhotos.length
    };
  }

  /* ---------- query building ---------- */
  function buildQuery(draft) {
    const prod = C.byId(draft.productId);
    if (!prod) return (draft.productName || '').trim();
    if (prod.cat === 'emas') {
      const w = draft.weight || prod.weight || 5;
      return 'emas antam ' + w + ' gram';
    }
    if (prod.cat === 'kendaraan') return prod.name + ' bekas';
    return prod.name;
  }

  function buildParams(draft) {
    const prod = C.byId(draft.productId);
    return {
      q: buildQuery(draft),
      product: draft.productName || (prod && prod.name) || '',
      cat: draft.cat || (prod && prod.cat) || 'elektronik',
      ref: prod ? prod.base : 0,
      weight: draft.weight || (prod && prod.weight) || '',
      usedOnly: (draft.cat || (prod && prod.cat)) !== 'emas' ? '1' : '0',
      limit: '8'
    };
  }

  /* ---------- valuation ---------- */
  function valuate(draft) {
    const prod = C.byId(draft.productId) || C.PRODUCTS[0];
    const cat = C.CATEGORIES[prod.cat] || C.CATEGORIES.elektronik;
    const grade = C.GRADES[draft.grade] || C.GRADES.B;
    const comp = C.COMPLETENESS[draft.completeness] || C.COMPLETENESS.fullset;
    const median = (draft.market && draft.market.median) || 0;

    const compFactor = prod.cat === 'emas' ? 1 : comp.factor;
    const collateral = median * grade.priceFactor * compFactor;

    const ltvSetting = TK.settings.load().ltv;
    const ltv = U.clamp(ltvSetting / 100, 0, 1);

    const rawCeiling = collateral * ltv;
    const ceiling = U.roundCeiling(rawCeiling);
    const margin = Math.max(0, collateral - ceiling);

    let risk;
    if (ltv >= 0.85) risk = { label: 'Agresif', tone: 'c', note: 'LTV tinggi — rentan saat harga pasar turun.' };
    else if (ltv >= 0.7) risk = { label: 'Wajar', tone: 'a', note: 'LTV dalam rentang praktik gadai umum.' };
    else if (ltv > 0) risk = { label: 'Konservatif', tone: 'b', note: 'LTV rendah — margin pengaman besar.' };
    else risk = { label: 'Tanpa plafon', tone: 'c', note: 'LTV 0% — tidak ada pinjaman yang direkomendasikan.' };

    return {
      median,
      collateral,
      compFactor,
      gradeFactor: grade.priceFactor,
      ltv,
      ltvPct: Math.round(ltv * 100),
      ceiling,
      margin,
      marginPct: collateral > 0 ? margin / collateral : 0,
      risk,
      liquidity: cat.liquidity,
      liquidation: cat.liquidation,
      note: cat.note,
      sourceCount: (draft.market && draft.market.items ? draft.market.items.length : 0),
      settingLtv: ltvSetting,
      aiNote: (draft.valuation && draft.valuation.aiNote) || ''
    };
  }

  /* ---------- authority ---------- */
  function authorityCheck(valuation) {
    const limit = TK.store.limit();
    const over = valuation.ceiling > limit;
    return {
      limit,
      over,
      message: over
        ? 'Plafon melebihi limit staff (' + U.rp(limit) + ')'
        : 'Dalam batas otorisasi staff (' + U.rp(limit) + ')'
    };
  }

  /* ---------- AI models (optional) ---------- */
  async function askVision(draft) {
    const cfg = TK.settings.load().vision;
    if (!cfg.baseUrl || !cfg.model) return { skipped: true };
    const images = (draft.photos || []).slice(0, 3).map((p) => p.dataUrl).filter(Boolean);
    if (!images.length) return { skipped: true };

    const hint = draft.productName ? 'Produk yang diduga: ' + draft.productName + '.' : '';
    const prompt =
      'Kamu adalah penaksir gadai profesional di Indonesia. Analisa foto agunan berikut dan tentukan produk, merek, spesifikasi, serta grade kondisi fisik (A=mulus, B=baret halus, C=cacat terlihat, D=rusak fungsi). ' +
      hint +
      ' Jika foto tidak cukup jelas untuk membaca merek atau nomor seri, set readable=false dan jangan menebak.';

    try {
      const res = await TK.api.vision({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        images,
        prompt
      });
      if (!res) {
        return { error: 'Server tidak merespons (cek apakah backend Takseer berjalan)' };
      }
      if (!res.ok || !res.data) {
        return {
          error: res.error || 'Model tidak mengembalikan data yang bisa dibaca',
          raw: res.raw || '',
          hint: 'Penyebab umum: model bukan multimodal, jawaban bukan JSON, jawaban kosong, atau pengaturan belum disimpan.'
        };
      }
      return { data: res.data };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  async function askReason(draft, valuation) {
    const cfg = TK.settings.load().reason;
    if (!cfg.baseUrl || !cfg.model) return { skipped: true };

    const facts = [
      'Produk: ' + draft.productName,
      'Grade kondisi: ' + (C.GRADES[draft.grade] || C.GRADES.B).label,
      'Kelengkapan: ' + (C.COMPLETENESS[draft.completeness] || C.COMPLETENESS.fullset).long,
      'Median harga pasar: ' + U.rp(valuation.median) + ' dari ' + valuation.sourceCount + ' listing',
      'Nilai agunan tertimbang: ' + U.rp(valuation.collateral),
      'LTV diterapkan: ' + valuation.ltvPct + '%',
      'Plafon rekomendasi: ' + U.rp(valuation.ceiling),
      'Safety margin: ' + U.rp(valuation.margin)
    ].join('\n');

    try {
      const res = await TK.api.reason({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: [
          {
            role: 'system',
            content:
              'Kamu analis risiko gadai. Beri 2-3 kalimat padat dalam Bahasa Indonesia tentang kelayakan agunan ini, sebutkan satu risiko utama dan satu syarat yang sebaiknya diminta petugas. Jangan mengarang angka baru.'
          },
          { role: 'user', content: facts }
        ]
      });
      if (!res || !res.ok) return { error: (res && res.error) || 'Model tidak merespons' };
      return { text: res.text };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  /* Catatan kondisi fisik via AI Reasoning (dipakai tombol Inspeksi) */
  async function askCondition(draft, vision) {
    const cfg = TK.settings.load().reason;
    if (!cfg.baseUrl || !cfg.model) return { skipped: true };
    const v = vision || {};
    const facts = [
      'Produk terdeteksi: ' + (v.product || draft.productName || 'tidak pasti'),
      'Merek: ' + (v.brand || draft.brand || '-'),
      'Spesifikasi: ' + (v.specs || '-'),
      'Grade kondisi: ' + (v.grade || draft.grade || '-'),
      'Catatan visual: ' + (v.notes || '-')
    ].join('\n');
    try {
      const res = await TK.api.reason({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: cfg.model,
        messages: [
          {
            role: 'system',
            content:
              'Kamu penaksir gadai berpengalaman. Tulis 1-2 kalimat padat Bahasa Indonesia untuk kolom catatan kondisi fisik agunan: cacat yang terlihat, kelengkapan, dan hal yang wajib diverifikasi petugas. Jangan mengarang spesifikasi atau angka baru.'
          },
          { role: 'user', content: facts }
        ]
      });
      if (!res || !res.ok) return { error: (res && res.error) || 'Model tidak merespons' };
      return { text: String(res.text || '').trim() };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  TK.engine = { computeVision, buildQuery, buildParams, valuate, authorityCheck, askVision, askReason, askCondition };
})(window);
