/* ==========================================================================
   screens.js — view layer
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});
  const U = TK.util;
  const C = TK.catalog;
  const S = (TK.screens = {});

  const PHOTO_LABELS = [
    'Tampak Depan',
    'Tampak Belakang',
    'Sisi Samping',
    'Detail Cacat',
    'Kelengkapan / Dus',
    'Label Seri / IMEI'
  ];

  const STATUS = {
    draft: { label: 'DRAFT', short: 'DRAFT', tone: 'neutral' },
    ready: { label: 'SIAP DIPUTUSKAN', short: 'SIAP', tone: 'gold' },
    valid: { label: 'VALID', short: 'VALID', tone: 'a', icon: 'check', title: 'Taksiran Disetujui', desc: 'Rekomendasi AI diterima. Surat gadai dapat diterbitkan oleh teller.' },
    adjust: { label: 'ADJUST', short: 'ADJUST', tone: 'c', icon: 'edit', title: 'Taksiran Disesuaikan', desc: 'Plafon diubah manual oleh penaksir dengan catatan wajib tersimpan.' },
    reject: { label: 'DITOLAK', short: 'TOLAK', tone: 'd', icon: 'x', title: 'Pengajuan Ditolak', desc: 'Agunan tidak memenuhi standar. Transaksi dihentikan & tercatat.' },
    escalated: { label: 'ESKALASI', short: 'ESKALASI', tone: 'gold', icon: 'send', title: 'Menunggu Otorisasi', desc: 'Plafon melebihi limit staff. Menunggu persetujuan Kepala Cabang.' },
    approved: { label: 'DISETUJUI MANAGER', short: 'DISETUJUI', tone: 'a', icon: 'check', title: 'Disetujui Kepala Cabang', desc: 'Otorisasi diberikan. Surat gadai dapat diterbitkan.' },
    declined: { label: 'DIBATALKAN MANAGER', short: 'DIBATALKAN', tone: 'd', icon: 'x', title: 'Ditolak Kepala Cabang', desc: 'Eskalasi tidak disetujui. Transaksi dibatalkan.' }
  };

  const STATUS_TONE_CLASS = {
    a: 'chip--a',
    c: 'chip--c',
    d: 'chip--d',
    gold: 'chip--gold',
    neutral: 'chip--neutral'
  };

  function ic(name, cls) {
    return U.svg(name, cls);
  }

  function statusChip(status, short) {
    const s = STATUS[status] || STATUS.draft;
    return '<span class="chip ' + (STATUS_TONE_CLASS[s.tone] || 'chip--neutral') + '">' + U.esc(short ? s.short || s.label : s.label) + '</span>';
  }

  function gradeChip(grade) {
    const g = C.GRADES[grade] || C.GRADES.B;
    return '<span class="chip chip--' + g.tone + '">' + g.label.toUpperCase() + ' · ' + U.esc(g.short.toUpperCase()) + '</span>';
  }

  /* ====================================================================== */
  function photoSlot(p) {
    const bad = p.quality && !p.quality.ok;
    return (
      '<div class="photo-slot' + (bad ? ' is-blur' : '') + '" data-action="view-photo" data-id="' + p.id + '">' +
      '<img src="' + p.dataUrl + '" alt="' + U.esc(p.label) + '" loading="lazy">' +
      '<button class="ps-remove" data-action="remove-photo" data-id="' + p.id + '" aria-label="Hapus foto">' + ic('x') + '</button>' +
      '<div class="ps-caption"><span>' + U.esc(p.label) + '</span>' +
      ic(bad ? 'alert' : 'check-circle', bad ? 'warn' : '') +
      '</div></div>'
    );
  }

  function emptyCapture(d) {
    const samples = ['ip13pm256', 'antam5', 'mba-m2', 'redmi12', 'vario160']
      .map((id) => {
        const p = C.byId(id);
        return (
          '<button class="sample-chip" data-action="sample" data-id="' + id + '">' +
          ic(p.sample === 'gold' ? 'gem' : p.sample === 'bike' ? 'car' : p.sample === 'laptop' ? 'laptop' : 'phone') +
          U.esc(p.name.replace(/ (256GB|128GB|8\/256|5 gram|CBS 2023)$/, '')) +
          '<span class="sc-tag">DEMO</span></button>'
        );
      })
      .join('') +
      '<button class="sample-chip" data-action="sample-blur">' + ic('alert') + 'Simulasi foto buram</button>';

    const cats = Object.values(C.CATEGORIES)
      .map(
        (c) =>
          '<button class="sample-chip' + (d.cat === c.id ? ' is-active' : '') + '" data-action="pick-cat" data-cat="' + c.id + '">' +
          ic(c.icon) + c.short + '</button>'
      )
      .join('');

    return (
      '<div class="photo-empty">' +
      '<div class="pe-icon">' + ic('camera') + '</div>' +
      '<h4>Foto agunan belum ada</h4>' +
      '<p>Ambil 1–6 foto: tampak depan, belakang, detail cacat, dan label seri. Sistem akan mengekstrak produk & grade kondisi.</p>' +
      '<div class="pe-actions">' +
      '<button class="btn btn--primary btn--sm" data-action="add-photo-camera">' + ic('camera') + 'Kamera</button>' +
      '<button class="btn btn--ghost btn--sm" data-action="add-photo-gallery">' + ic('image') + 'Galeri</button>' +
      '</div></div>' +
      '<div class="mt-10"><span class="section-label">Kategori agunan</span>' +
      '<div class="sample-row mt-8">' + cats + '</div></div>' +
      '<div class="mt-8"><span class="section-label">Atau coba contoh instan</span>' +
      '<div class="sample-row mt-8">' + samples + '</div></div>'
    );
  }

  function visionPanel(d) {
    const v = d.vision || { confidence: 0, signals: [], warnings: [] };
    const prod = C.byId(d.productId);
    const cat = prod ? C.categoryOf(prod) : (C.CATEGORIES[d.cat] || C.CATEGORIES.elektronik);
    const isGold = cat.id === 'emas';

    const grades = Object.values(C.GRADES)
      .map(
        (g) =>
          '<button class="grade-opt' + (d.grade === g.key ? ' is-active' : '') + '" data-action="set-grade" data-grade="' + g.key + '">' +
          '<span>' + g.key + '</span><small>' + g.short + '</small></button>'
      )
      .join('');

    const warn = (v.warnings || []).length
      ? '<div class="alert alert--warn mt-8">' + ic('alert') +
        '<div><b>Foto tidak jelas (' + v.warnings.length + ' frame)</b>' +
        U.esc(v.warnings[0].text) + ' Harap ambil ulang foto fokus pada area nomor seri / logo.' +
        '<div class="mt-8"><button class="btn btn--ghost btn--sm" data-action="add-photo-camera">' + ic('camera') + 'Ambil ulang</button></div>' +
        '</div></div>'
      : '';

    const conf = v.confidence || 0;
    const goldDesc = {
      A: 'Mulus, certicard utuh',
      B: 'Lecet halus pada permukaan',
      C: 'Penyok / goresan dalam',
      D: 'Kadar diragukan / rusak'
    };
    const gradeDesc = isGold ? goldDesc[d.grade] || '' : (C.GRADES[d.grade] || C.GRADES.B).desc;

    return (
      '<div class="vision-block">' +
      '<div class="vision-head">' +
      '<div><span class="vision-tag">' + ic('check-circle') + 'Hasil deteksi perangkat</span>' +
      '<div class="tiny muted" style="margin-top:2px">' + (d.photos || []).length + ' frame dianalisis</div></div>' +
      '<div class="confidence"><span class="bar"><i style="width:' + conf + '%"></i></span>' + conf + '%</div>' +
      '</div>' +

      '<div class="field"><label class="field-label">Nama &amp; tipe produk</label>' +
      '<input class="input" data-field="productName" value="' + U.esc(d.productName) + '" placeholder="Contoh: iPhone 13 Pro Max 256GB"></div>' +

      '<div class="input-group mt-8">' +
      '<div class="field"><label class="field-label">Merk</label>' +
      '<input class="input" data-field="brand" value="' + U.esc(d.brand) + '" placeholder="Apple Inc."></div>' +
      (isGold
        ? '<div class="field"><label class="field-label">Kadar</label>' +
          '<select class="select" data-field="karat">' +
          [24, 22, 21, 18]
            .map((k) => '<option value="' + k + '"' + (Number(d.karat) === k ? ' selected' : '') + '>' + k + 'K</option>')
            .join('') +
          '</select></div>'
        : '<div class="field"><label class="field-label">Kelengkapan</label>' +
          '<select class="select" data-field="completeness">' +
          Object.values(C.COMPLETENESS)
            .map((c) => '<option value="' + c.key + '"' + (d.completeness === c.key ? ' selected' : '') + '>' + U.esc(c.label) + '</option>')
            .join('') +
          '</select></div>') +
      '</div>' +

      (isGold
        ? '<div class="field mt-8"><label class="field-label">Berat (gram)</label>' +
          '<input class="input num" type="number" step="0.1" min="0.1" data-field="weight" value="' + (d.weight || '') + '"></div>'
        : '') +

      '<div class="field mt-8"><label class="field-label">Grade fisik <span class="muted" style="font-weight:600;text-transform:none;letter-spacing:0">' +
      U.esc(gradeDesc) + '</span></label>' +
      '<div class="grade-seg">' + grades + '</div></div>' +

      '<div class="field mt-8"><label class="field-label">Catatan kondisi fisik</label>' +
      '<textarea class="textarea" rows="2" data-field="spec" placeholder="Detail goresan, fungsi, kelengkapan...">' + U.esc(d.spec) + '</textarea></div>' +

      (v.signals && v.signals.length
        ? '<div class="detected-tags">' +
          v.signals.map((s) => '<span class="tag">' + ic('check') + U.esc(s) + '</span>').join('') +
          '</div>'
        : '') +
      (v.aiNote
        ? '<div class="alert alert--info mt-8">' + ic('sparkles') +
          '<div><b>Catatan AI Vision</b>' + U.esc(v.aiNote) + '</div></div>'
        : '') +
      warn +
      '</div>'
    );
  }

  function stepOneCard(d) {
    const hasPhotos = (d.photos || []).length > 0;
    const prod = C.byId(d.productId);
    const aiVisionReady = !!(TK.settings && TK.settings.hasVision && TK.settings.hasVision());

    return (
      '<section class="card" id="cardVision">' +
      '<div class="card-head">' +
      '<div class="card-head-l"><span class="step-badge">1</span>' +
      '<div><div class="card-title">Inspeksi Visual</div></div></div>' +
      '<button class="btn btn--soft btn--sm" data-action="add-photo-camera">' + ic('camera') +
      (hasPhotos ? 'Tambah' : 'Ambil Foto') + '</button>' +
      '</div>' +

      (hasPhotos
        ? '<div class="photo-grid">' +
          d.photos.map(photoSlot).join('') +
          (d.photos.length < 6
            ? '<button class="photo-add" data-action="add-photo-camera">' + ic('plus') +
              '<b>Tambah foto</b><small>' + d.photos.length + '/6</small></button>'
            : '') +
          '</div>' +
          '<div class="row-between mt-8">' +
          '<button class="btn btn--ghost btn--sm" data-action="open-product-picker">' + ic('search') +
          (prod ? U.esc(prod.name) : 'Pilih produk referensi') + '</button>' +
          '<span class="tiny muted">' + d.photos.length + '/6 foto</span>' +
          '</div>' +
          '<div class="mt-8"><button class="btn btn--soft btn--sm" id="btnInspect" data-action="inspect-condition">' + ic('sparkles') + '<span data-label>Inspeksi Kondisi Agunan</span></button>' +
          '<p class="tiny muted" style="margin-top:4px">' +
          (aiVisionReady
            ? 'AI Vision aktif — isi kolom hasil deteksi otomatis dari foto. Isi manual tetap tersedia.'
            : 'AI Vision belum aktif — hanya inspeksi lokal. Aktifkan lewat ikon ⚙️ untuk auto-fill.') +
          '</p></div>' +
          '<div class="mt-10">' + visionPanel(d) + '</div>'
        : emptyCapture(d)) +
      '</section>'
    );
  }

  /* ====================================================================== */
  function marketRow(src) {
    const cond = src.conditionShort || String(src.condition || '').split(' ').slice(0, 2).join(' ');
    const ago = U.timeAgo(src.ts).replace(' lalu', '');
    const url = src.url || src.href || '#';
    return (
      '<a class="market-row' + (src.isMedian ? ' is-median' : '') + '" href="' + U.esc(url) + '" target="_blank" rel="noopener" title="Buka halaman produk">' +
      '<div class="mr-icon" style="background:' + src.bg + ';border-color:' + src.border + ';color:' + src.color + '">' + ic(src.icon) + '</div>' +
      '<div class="mr-body">' +
      '<div class="mr-top"><span class="mr-name">' + U.esc(src.name) + '</span></div>' +
      '<div class="mr-meta">' +
      '<span class="mr-badge" style="background:' + src.bg + ';color:' + src.color + '">' + U.esc(src.badge) + '</span>' +
      '<span>' + U.esc(cond) + '</span><span class="sep">•</span><span>' + ago + '</span></div>' +
      '</div>' +
      '<div class="mr-right"><span class="mr-price num">' + U.rp(src.price) + '</span>' +
      '<span class="mr-link">Lihat sumber ' + ic('arrow-up-right') + '</span></div>' +
      '</a>'
    );
  }

  function marketSkeletons(n) {
    let out = '';
    for (let i = 0; i < n; i++) out += '<div class="skeleton-row" data-skel="' + i + '"></div>';
    return out;
  }

  function marketCard(d) {
    const m = d.market || { status: 'idle' };
    const prod = C.byId(d.productId);
    const expected = prod ? Math.min(prod.platforms.length, 6) : 5;

    let body = '';
    if (m.status === 'ready' && m.sources && m.sources.length) {
      body =
        '<div class="stat-bar">' +
        '<div class="stat-cell"><span class="k">Median pasar sekunder</span><span class="v num">' + U.rp(m.median) + '</span></div>' +
        '<div class="stat-cell"><span class="k">Rentang harga serupa</span><span class="v green num">' + U.rpShort(m.min) + ' – ' + U.rpShort(m.max) + '</span></div>' +
        '</div>' +
        '<div class="market-filter-bar mt-10">' +
        '<span class="section-label">' + m.sources.length + ' sumber referensi</span>' +
        '<span class="chip chip--live"><span class="dot"></span>LIVE</span>' +
        '<div class="filter-dropdown">' +
        '<select data-action="market-sort">' +
        '<option value="newest"' + ((m.sort || 'newest') === 'newest' ? ' selected' : '') + '>Terbaru</option>' +
        '<option value="oldest"' + ((m.sort || '') === 'oldest' ? ' selected' : '') + '>Terlama</option>' +
        '<option value="price-high"' + ((m.sort || '') === 'price-high' ? ' selected' : '') + '>Harga Tertinggi</option>' +
        '<option value="price-low"' + ((m.sort || '') === 'price-low' ? ' selected' : '') + '>Harga Terendah</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="market-list" id="marketRows">' + m.sources.map(marketRow).join('') + '</div>' +
        '<div class="row-between mt-8">' +
        '<span class="tiny muted">Ditarik ' + U.timeAgo(m.fetchedAt) + ' · query "' + U.esc(m.query) + '"</span>' +
        '<button class="btn btn--ghost btn--sm" data-action="refresh-market">' + ic('refresh') + 'Perbarui</button>' +
        '</div>';
    } else if (m.status === 'loading') {
      body =
        '<div class="alert alert--info">' + ic('search') +
        '<div><b>Menelusuri pasar…</b>Menarik harga dari marketplace & indeks emas secara real-time.</div></div>' +
        '<div class="market-list mt-8" id="marketRows">' + marketSkeletons(expected) + '</div>';
    } else {
      body =
        '<div class="alert alert--info">' + ic('info') +
        '<div><b>Harga pasar belum ditarik</b>Tekan <b>Analisa Harga Pasar</b> untuk menjalankan pencarian live dengan link & timestamp.</div></div>' +
        '<div class="market-list mt-8">' + marketSkeletons(3) + '</div>';
    }

    return (
      '<section class="card" id="cardMarket">' +
      '<div class="card-head">' +
      '<div class="card-head-l"><span class="step-badge">2</span>' +
      '<div><div class="card-title">Harga Pasar</div></div></div>' +
      (m.status === 'ready'
        ? '<span class="chip chip--neutral">' + ic('layers') + m.sources.length + ' sumber</span>'
        : m.status === 'loading'
          ? '<span class="chip chip--a"><span class="dot"></span>menarik</span>'
          : '<span class="chip chip--neutral">' + ic('clock') + 'menunggu</span>') +
      '</div>' +
      body +
      '</section>'
    );
  }

  /* ====================================================================== */
  function valuationCard(d) {
    const v = d.valuation;
    if (!v) {
      return (
        '<section class="card" id="cardValuation">' +
        '<div class="card-head"><div class="card-head-l"><span class="step-badge gold">3</span>' +
        '<div><div class="card-title">Rekomendasi Plafon</div></div></div></div>' +
        '<div class="empty" style="padding:18px 8px">' +
        '<div class="e-icon">' + ic('scale') + '</div>' +
        '<h4>Belum ada valuasi</h4>' +
        '<p>Plafon pinjaman dihitung setelah harga pasar terkumpul dan grade fisik terverifikasi.</p>' +
        '</div></section>'
      );
    }

    const ltvPct = Math.round(v.displayLtv * 100);
    const maxPct = Math.round(v.maxLtv * 100);
    const warn = v.displayLtv >= v.maxLtv - 0.015;
    const riskTone = v.risk.tone === 'a' ? 'chip--a' : 'chip--c';

    const rows = [
      ['Median pasar (' + (d.market.sources || []).length + ' sumber)', U.rp(v.breakdown.median), ''],
      ['Faktor kondisi ' + (C.GRADES[d.grade] || C.GRADES.B).label, '× ' + v.breakdown.gradeFactor.toFixed(2).replace('.', ','), ''],
      ['Faktor kelengkapan', '× ' + v.breakdown.compFactor.toFixed(2).replace('.', ','), ''],
      ['Nilai agunan tertimbang', U.rp(v.collateral), ''],
      ['LTV dasar kategori', Math.round(v.maxLtv * 100) + '%', ''],
      ['Penyesuaian grade', (v.breakdown.gradeAdj * 100).toFixed(0) + '%', ''],
      ['Penyesuaian volatilitas', (v.breakdown.volAdj * 100).toFixed(0) + '%', '']
    ]
      .map((r) => '<div class="calc-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>')
      .join('');

    return (
      '<section class="valuation-card" id="cardValuation">' +
      '<div class="card-head">' +
      '<div class="card-head-l"><span class="step-badge gold">3</span>' +
      '<div><div class="card-title">Rekomendasi Plafon</div></div></div>' +
      '<span class="chip ' + riskTone + '">' + ic('shield') + U.esc(v.risk.label) + '</span>' +
      '</div>' +

      '<div class="hero-valuation">' +
      '<span class="hv-label">Rekomendasi plafon pinjaman (maksimal)</span>' +
      '<div class="hero-row"><span class="hero-amount num">' + U.rp(v.ceiling) + '</span>' +
      '<span class="ltv-chip">LTV ' + ltvPct + '%</span></div>' +
      '<div class="hero-split">' +
      '<div><span class="k">Nilai agunan pasar</span><span class="v num">' + U.rp(v.collateral) + '</span></div>' +
      '<div><span class="k">Safety margin buffer</span><span class="v green num">' + U.rp(v.margin) + ' (' + Math.round(v.marginPct * 100) + '%)</span></div>' +
      '</div></div>' +

      '<div class="ltv-meter">' +
      '<div class="lm-head"><span>Batas aman LTV kategori (maks ' + maxPct + '%)</span>' +
      '<b>' + ltvPct + '% / ' + maxPct + '%</b></div>' +
      '<div class="meter' + (warn ? ' is-warn' : '') + '"><i style="width:' + Math.min(100, (v.displayLtv / v.maxLtv) * 100) + '%"></i></div>' +
      '<p class="meter-note">' + U.esc(v.note) + '</p>' +
      '</div>' +

      '<div class="risk-factors">' +
      '<div class="risk-item">' + ic('eye') + '<span class="ri-k">Kondisi</span> ' + (C.GRADES[d.grade] || C.GRADES.B).label + '</div>' +
      '<div class="risk-item">' + ic('bolt') + '<span class="ri-k">Likuiditas</span> ' + U.esc(v.liquidity) + '</div>' +
      '<div class="risk-item">' + ic('chart') + '<span class="ri-k">Volatilitas</span> ' + U.esc((C.byId(d.productId) || {}).volatility || 'sedang') + '</div>' +
      '<div class="risk-item">' + ic('clock') + '<span class="ri-k">Lelang</span> ' + U.esc(v.liquidation) + '</div>' +
      '</div>' +

      (v.aiNote
        ? '<div class="alert alert--info mt-10">' + ic('sparkles') +
          '<div><b>Catatan AI Reasoning</b>' + U.esc(v.aiNote) + '</div></div>'
        : '') +

      '<div class="accordion">' +
      '<button class="acc-toggle" data-action="toggle-acc">' + ic('layers') + '<span style="flex:1;text-align:left;margin-left:6px">Rincian perhitungan</span>' + ic('chevron-down') + '</button>' +
      '<div class="acc-body">' + rows +
      '<div class="calc-row total"><span>Plafon final (dibulatkan ke bawah)</span><b>' + U.rp(v.ceiling) + '</b></div>' +
      '<p class="tiny muted mt-8">Pembulatan dilakukan ke bawah untuk menjaga margin keamanan lembaga. Angka final harus dikonfirmasi penaksir sebelum surat gadai diterbitkan.</p>' +
      '</div></div>' +
      '</section>'
    );
  }

  /* ====================================================================== */
  function notesCard(d) {
    return (
      '<section class="card">' +
      '<div class="row-between" style="margin-bottom:6px">' +
      '<span class="card-title" style="font-size:12.5px">Catatan penaksir (opsional)</span>' +
      '<span class="tiny muted">' + (d.staffNotes ? d.staffNotes.length + ' karakter' : 'draft') + '</span>' +
      '</div>' +
      '<textarea class="textarea" rows="2" data-field="staffNotes" placeholder="Riwayat nasabah, kondisi tambahan, atau hasil verifikasi fisik…">' + U.esc(d.staffNotes || '') + '</textarea>' +
      '<p class="tiny muted mt-8">Semua catatan, foto, dan sumber harga tersimpan permanen di audit log.</p>' +
      '</section>'
    );
  }

  function ctaBlock(d) {
    const ready = canAnalyze(d);
    const busy = d.market && d.market.status === 'loading';
    return (
      '<div>' +
      '<button class="cta-main' + (busy ? ' is-busy' : '') + '" data-action="analyze"' + (ready ? '' : ' disabled') + '>' +
      (busy ? '<span class="btn-spinner"></span>' : ic('sparkles')) +
      '<span>' + (busy ? 'Menganalisa…' : d.valuation ? 'Analisa Ulang' : 'Analisa Harga Pasar') + '</span>' +
      '</button>' +
      '<p class="cta-hint">' + (ready ? 'Estimasi 5–10 detik' : 'Lengkapi minimal 1 foto jelas') + '</p>' +
      '</div>'
    );
  }

  function canAnalyze(d) {
    if (!d) return false;
    if (!d.photos || !d.photos.length) return false;
    /* Produk referensi opsional: boleh pilih dari katalog atau isi sendiri.
       Yang wajib ada adalah minimal 1 foto yang jelas. Catatan kondisi fisik
       tidak wajib — tombol tetap aktif agar user bisa memulai pencarian harga. */
    const clear = d.photos.filter((p) => p.quality && p.quality.ok).length;
    return clear > 0;
  }

  S.penaksiran = function () {
    const st = TK.store.get();
    const d = st.draft;
    if (!d) return '<div class="empty">' + ic('scan') + '<h4>Tidak ada draft</h4><p>Tekan Mulai untuk memulai penaksiran baru.</p></div>';

    return (
      '<div class="screen">' +
      '<div class="appraisal-grid">' +
      '<div class="appraisal-col">' +
      stepOneCard(d) +
      ctaBlock(d) +
      '</div>' +
      '<div class="appraisal-col">' +
      marketCard(d) +
      valuationCard(d) +
      notesCard(d) +
      '</div>' +
      '</div>' +
      '</div>'
    );
  };

  /* ====================================================================== */
  S.decisionBar = function () {
    const st = TK.store.get();
    const d = st.draft;
    if (!d || !d.valuation) return '';

    const v = d.valuation;
    const auth = TK.agents.authorityCheck(v, 'staff');
    const over = auth.over;

    const banner = over
      ? '<div class="escalation-banner">' +
        '<div class="eb-left">' + ic('lock') +
        '<span>Taksiran <b>' + U.rp(v.ceiling) + '</b> &gt; limit staff (' + U.rp(auth.limit) + ')</span></div>' +
        '<span class="eb-tag">BUTUH OTORISASI</span></div>'
      : '';

    const primary = over
      ? '<button class="dbtn dbtn--valid is-gold" data-action="escalate">' + ic('send') +
        '<span class="dbtn-txt"><b>ESKALASI MANAGER</b><small>Kirim rekomendasi</small></span></button>'
      : '<button class="dbtn dbtn--valid" data-action="valid">' + ic('check') +
        '<span class="dbtn-txt"><b>VALID</b><small>Setujui ' + U.rp(v.ceiling) + '</small></span></button>';

    return (
      '<div class="decision-bar">' +
      banner +
      '<div class="decision-grid">' +
      '<button class="dbtn dbtn--adjust" data-action="adjust">' + ic('edit') + '<span>ADJUST</span></button>' +
      '<button class="dbtn dbtn--reject" data-action="reject">' + ic('x-circle') + '<span>TOLAK</span></button>' +
      primary +
      '</div></div>'
    );
  };

  /* ====================================================================== */
  function pendingCard(rec) {
    return (
      '<div class="card" style="padding:11px">' +
      '<div class="row-between" style="align-items:flex-start">' +
      '<div style="min-width:0"><div class="hc-title">' + U.esc(rec.productName) + '</div>' +
      '<div class="hc-meta">' + rec.id + ' · ' + U.timeAgo(rec.createdAt) + '</div></div>' +
      statusChip(rec.status) +
      '</div>' +
      '<div class="row-between mt-8">' +
      '<div><span class="tiny muted">Plafon diajukan</span>' +
      '<div style="font-size:15px;font-weight:800;letter-spacing:-0.02em" class="num">' + U.rp(rec.valuation.ceiling) + '</div></div>' +
      '<div style="text-align:right"><span class="tiny muted">LTV</span>' +
      '<div style="font-size:13px;font-weight:800" class="num">' + Math.round(rec.valuation.ltv * 100) + '%</div></div>' +
      '</div>' +
      '<div class="row mt-8" style="gap:6px">' +
      '<button class="btn btn--danger btn--sm" style="flex:1" data-action="decline" data-id="' + rec.id + '">' + ic('x') + 'Tolak</button>' +
      '<button class="btn btn--primary btn--sm" style="flex:1.6" data-action="approve" data-id="' + rec.id + '">' + ic('check') + 'Setujui &amp; Terbitkan</button>' +
      '</div>' +
      '</div>'
    );
  }

  S.dataRag = function () {
    const st = TK.store.get();
    const draft = st.draft;
    const allItems = [];

    // collect from draft + history
    if (draft && draft.market && draft.market.sources) {
      draft.market.sources.forEach((s) => allItems.push({ ...s, from: 'draft', draftId: draft.id }));
    }
    st.history.forEach((h) => {
      if (h.market && h.market.sources) {
        h.market.sources.forEach((s) => allItems.push({ ...s, from: 'history', recId: h.id, productName: h.productName }));
      }
    });

    const sort = st.ui.ragSort || 'newest';
    const sourceFilter = st.ui.ragSource || 'all';

    let items = allItems.slice();
    if (sourceFilter !== 'all') {
      items = items.filter((it) => (it.source || it.platform || '') === sourceFilter);
    }

    items.sort((a, b) => {
      if (sort === 'price-high') return (b.price || 0) - (a.price || 0);
      if (sort === 'price-low') return (a.price || 0) - (b.price || 0);
      if (sort === 'oldest') return (a.ts || 0) - (b.ts || 0);
      return (b.ts || 0) - (a.ts || 0);
    });

    const sourceOptions = [['all', 'Semua Sumber']];
    const seen = new Set();
    allItems.forEach((it) => {
      const sid = it.source || it.platform || 'unknown';
      if (!seen.has(sid)) {
        seen.add(sid);
        const meta = C.PLATFORMS[sid] || { name: sid };
        sourceOptions.push([sid, meta.name || sid]);
      }
    });

    const sortSelect =
      '<div class="filter-dropdown">' +
      '<select data-action="rag-sort">' +
      [
        ['newest', 'Terbaru'],
        ['oldest', 'Terlama'],
        ['price-high', 'Harga Tertinggi'],
        ['price-low', 'Harga Terendah']
      ]
        .map((o) => '<option value="' + o[0] + '"' + (sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>')
        .join('') +
      '</select></div>';

    const sourceSelect =
      '<div class="filter-dropdown">' +
      '<select data-action="rag-source">' +
      sourceOptions.map((o) => '<option value="' + o[0] + '"' + (sourceFilter === o[0] ? ' selected' : '') + '>' + U.esc(o[1]) + '</option>').join('') +
      '</select></div>';

    return (
      '<div class="screen rag-screen">' +
      '<div class="rag-header">' +
      '<div class="card-title" style="font-size:13px">Data RAG</div>' +
      '<div style="display:flex;gap:6px">' + sourceSelect + sortSelect + '</div>' +
      '</div>' +
      '<p class="rag-meta mt-8">' + items.length + ' referensi tercatat dari ' + allItems.length + ' total</p>' +
      (items.length
        ? '<div class="stack-8 mt-10">' + items.map(ragItem).join('') + '</div>'
        : '<div class="card"><div class="empty"><div class="e-icon">' + ic('database') + '</div>' +
          '<h4>Belum ada data RAG</h4><p>Jalankan Analisa Harga Pasar untuk mengumpulkan referensi harga pasar real-time.</p></div></div>') +
      '</div>'
    );
  };

  function ragItem(it) {
    const meta = C.PLATFORMS[it.source || it.platform || ''] || { name: it.sourceName || it.name || 'Sumber', icon: 'box', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
    const url = it.url || it.href || '#';
    return (
      '<div class="rag-item">' +
      '<div class="mr-icon" style="background:' + (it.bg || meta.bg) + ';border-color:' + (it.border || meta.border) + ';color:' + (it.color || meta.color) + '">' + ic(it.icon || meta.icon) + '</div>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="rag-source">' + U.esc(it.sourceName || meta.name) + (it.from === 'draft' ? ' · Draft aktif' : ' · ' + U.esc(it.productName || '')) + '</div>' +
      '<div class="rag-title">' + U.esc(it.title || it.name || '') + '</div>' +
      '<div class="rag-price num">' + U.rp(it.price || 0) + '</div>' +
      '<a class="rag-link" href="' + U.esc(url) + '" target="_blank" rel="noopener">Buka halaman produk ' + ic('arrow-up-right') + '</a>' +
      '</div>' +
      '<div style="text-align:right;flex:none">' +
      '<span class="tiny muted">' + U.timeAgo(it.ts || it.crawledAt || Date.now()) + '</span>' +
      '</div>' +
      '</div>'
    );
  }

  /* ====================================================================== */
  function histCard(rec) {
    const prod = C.byId(rec.productId);
    const cat = prod ? C.CATEGORIES[prod.cat] : C.CATEGORIES.elektronik;
    const amount =
      rec.status === 'adjust' && rec.decision ? rec.decision.amount : rec.valuation ? rec.valuation.ceiling : 0;
    return (
      '<button class="hist-card" data-action="open-detail" data-id="' + rec.id + '">' +
      '<div class="hc-icon">' + ic(cat.icon) + '</div>' +
      '<div class="hc-body">' +
      '<div class="hc-title">' + U.esc(rec.productName) + '</div>' +
      '<div class="hc-meta">' + rec.id + ' · ' + U.fmtDayLabel(rec.createdAt) + '</div>' +
      '<div class="hc-tags">' + gradeChip(rec.grade) + statusChip(rec.status, true) + '</div>' +
      '</div>' +
      '<div class="hc-right"><span class="hc-amount num">' + U.rpShort(amount) + '</span></div>' +
      ic('chevron-right', 'hc-chev') +
      '</button>'
    );
  }

  S.riwayat = function () {
    const st = TK.store.get();
    const filter = st.ui.filter || 'all';
    const counts = {
      all: st.history.length,
      valid: st.history.filter((h) => h.status === 'valid' || h.status === 'approved').length,
      adjust: st.history.filter((h) => h.status === 'adjust').length,
      reject: st.history.filter((h) => h.status === 'reject' || h.status === 'declined').length,
      escalated: st.history.filter((h) => h.status === 'escalated').length
    };

    const map = {
      all: () => true,
      valid: (h) => h.status === 'valid' || h.status === 'approved',
      adjust: (h) => h.status === 'adjust',
      reject: (h) => h.status === 'reject' || h.status === 'declined',
      escalated: (h) => h.status === 'escalated'
    };

    const items = st.history.filter(map[filter] || map.all);
    const totalValue = st.history
      .filter((h) => h.status === 'valid' || h.status === 'approved')
      .reduce((s, h) => s + (h.decision ? h.decision.amount : h.valuation ? h.valuation.ceiling : 0), 0);

    const chips = [
      ['all', 'Semua'],
      ['valid', 'Valid'],
      ['adjust', 'Adjust'],
      ['escalated', 'Eskalasi'],
      ['reject', 'Tolak']
    ]
      .map(
        (c) =>
          '<button class="filter-chip' + (filter === c[0] ? ' is-active' : '') + '" data-action="filter" data-filter="' + c[0] + '">' +
          c[1] + '<span class="cnt">' + counts[c[0]] + '</span></button>'
      )
      .join('');

    return (
      '<div class="screen">' +
      '<div class="summary-grid">' +
      '<div class="summary-cell"><span class="k">Total penaksiran</span><span class="v num">' + st.history.length + '</span></div>' +
      '<div class="summary-cell"><span class="k">Nilai disetujui</span><span class="v sm num">' + U.rpShort(totalValue) + '</span></div>' +
      '<div class="summary-cell"><span class="k">Tingkat setuju</span><span class="v num">' +
      (st.history.length ? Math.round((counts.valid / st.history.length) * 100) : 0) + '%</span></div>' +
      '</div>' +

      '<div class="filter-row">' + chips + '</div>' +

      (items.length
        ? '<div class="history-grid stack-8">' + items.map(histCard).join('') + '</div>'
        : '<div class="card"><div class="empty"><div class="e-icon">' + ic('history') + '</div>' +
          '<h4>Belum ada riwayat</h4><p>Penaksiran yang sudah diputuskan akan muncul di sini lengkap dengan audit trail.</p></div></div>') +

      '<div class="card">' +
      '<div class="row-between"><div><div class="card-title" style="font-size:12.5px">Ekspor audit log</div>' +
      '<p class="tiny muted" style="margin-top:2px">CSV untuk audit internal · JSON untuk arsip lengkap.</p></div></div>' +
      '<div class="row mt-8" style="gap:6px">' +
      '<button class="btn btn--ghost btn--sm" style="flex:1" data-action="export-csv">' + ic('download') + 'CSV</button>' +
      '<button class="btn btn--ghost btn--sm" style="flex:1" data-action="export-json">' + ic('download') + 'JSON</button>' +
      '</div></div>' +
      '</div>'
    );
  };

  /* ====================================================================== */
  S.detail = function (id) {
    const st = TK.store.get();
    const rec = st.history.find((h) => h.id === id);
    if (!rec) return '<div class="empty">' + ic('info') + '<h4>Data tidak ditemukan</h4></div>';

    const s = STATUS[rec.status] || STATUS.draft;
    const prod = C.byId(rec.productId);
    const cat = prod ? C.CATEGORIES[prod.cat] : C.CATEGORIES.elektronik;
    const amount = rec.decision ? rec.decision.amount : rec.valuation ? rec.valuation.ceiling : 0;
    const canAct = rec.status === 'escalated';

    const audit = (rec.audit || [])
      .slice()
      .reverse()
      .map(
        (a) =>
          '<div class="tl-item ' + (a.level === 'warn' ? 'is-warn' : a.level === 'err' ? 'is-err' : 'is-done') + '">' +
          '<div class="tl-title">' + U.esc(a.action) +
          '<span class="chip chip--neutral" style="height:15px;font-size:8px">' + U.esc(a.actor) + '</span></div>' +
          '<div class="tl-meta">' + U.fmtDateTime(a.at) + (a.detail ? ' · ' + U.esc(a.detail) : '') + '</div>' +
          '</div>'
      )
      .join('');

    const toneClass = rec.status === 'valid' || rec.status === 'approved' ? 'valid' : rec.status === 'reject' || rec.status === 'declined' ? 'reject' : rec.status === 'adjust' ? 'adjust' : 'escalate';

    return (
      '<div class="screen">' +
      '<button class="btn btn--ghost btn--sm" data-action="back" style="align-self:flex-start">' + ic('chevron-left') + 'Kembali</button>' +

      '<div class="receipt">' +
      '<div class="receipt-head">' +
      '<div class="status-orb ' + toneClass + '">' + ic(s.icon || 'clock') + '</div>' +
      '<h2>' + U.esc(s.title || 'Status taksiran') + '</h2>' +
      '<p>' + U.esc(s.desc || '') + '</p>' +
      '<div class="receipt-amount num">' + U.rp(amount) + '</div>' +
      '</div>' +
      '<div class="receipt-body">' +
      '<div class="rrow"><span class="k">No. referensi</span><span class="v">' + rec.id + '</span></div>' +
      '<div class="rrow"><span class="k">Produk</span><span class="v">' + U.esc(rec.productName) + '</span></div>' +
      '<div class="rrow"><span class="k">Kategori</span><span class="v">' + cat.label + '</span></div>' +
      '<div class="rrow"><span class="k">Grade kondisi</span><span class="v">' + (C.GRADES[rec.grade] || C.GRADES.B).label + ' — ' + U.esc((C.GRADES[rec.grade] || C.GRADES.B).short) + '</span></div>' +
      (rec.valuation
        ? '<div class="rrow"><span class="k">Nilai pasar median</span><span class="v num">' + U.rp(rec.valuation.median) + '</span></div>' +
          '<div class="rrow"><span class="k">LTV</span><span class="v num">' + Math.round(rec.valuation.ltv * 100) + '% · maks ' + Math.round((rec.valuation.maxLtv || 0.8) * 100) + '%</span></div>' +
          '<div class="rrow"><span class="k">Referensi pasar</span><span class="v">' + ((rec.market && rec.market.sources && rec.market.sources.length) || 0) + ' sumber terverifikasi</span></div>'
        : '') +
      '<div class="rrow"><span class="k">' + (rec.status === 'escalated' ? 'Menunggu otorisasi' : 'Diputuskan oleh') + '</span><span class="v">' +
      (rec.status === 'escalated'
        ? 'Kepala Cabang'
        : rec.decision
          ? U.esc(rec.decision.by) + ' · ' + (rec.decision.role === 'manager' ? 'Kepala Cabang' : 'Staff')
          : '—') +
      '</span></div>' +
      '<div class="rrow"><span class="k">Waktu</span><span class="v">' + U.fmtDateTime(rec.decision ? rec.decision.at : rec.createdAt) + '</span></div>' +
      (rec.decision && rec.decision.note
        ? '<div class="rrow"><span class="k">Catatan</span><span class="v" style="font-weight:600">' + U.esc(rec.decision.note) + '</span></div>'
        : '') +
      '</div></div>' +

      (canAct
        ? '<div class="card"><div class="row-between"><div><div class="card-title" style="font-size:12.5px">Otorisasi Kepala Cabang</div>' +
          '<p class="tiny muted" style="margin-top:2px">Plafon ' + U.rp(amount) + ' melebihi limit staff.</p></div></div>' +
          '<div class="row mt-8" style="gap:6px">' +
          '<button class="btn btn--danger btn--sm" style="flex:1" data-action="decline" data-id="' + rec.id + '">' + ic('x') + 'Tolak</button>' +
          '<button class="btn btn--primary btn--sm" style="flex:1.6" data-action="approve" data-id="' + rec.id + '">' + ic('check') + 'Setujui &amp; Terbitkan</button>' +
          '</div></div>'
        : '') +

      '<section class="card">' +
      '<div class="card-head"><div class="card-head-l"><span class="step-badge">' + ic('history') + '</span>' +
      '<div><div class="card-title">Audit Trail<span class="sub">' + (rec.audit || []).length + ' peristiwa tercatat</span></div></div></div>' +
      '<span class="chip chip--neutral">' + ic('lock') + 'IMMUTABLE</span></div>' +
      '<div class="timeline">' + audit + '</div>' +
      '</section>' +

      '<div class="row" style="gap:6px">' +
      '<button class="btn btn--ghost btn--sm" style="flex:1" data-action="copy-ref" data-id="' + rec.id + '">' + ic('copy') + 'Salin No. Ref</button>' +
      '<button class="btn btn--ghost btn--sm" style="flex:1" data-action="export-record" data-id="' + rec.id + '">' + ic('download') + 'Unduh JSON</button>' +
      '</div>' +
      '</div>'
    );
  };

  /* ====================================================================== */
  S.akun = function () {
    const st = TK.store.get();
    const me = TK.store.me();
    const s = stats();

    return (
      '<div class="screen">' +
      '<div class="profile-card">' +
      '<div class="pc-top">' +
      '<div class="pc-avatar">' + me.name.split(' ').map((x) => x[0]).slice(0, 2).join('') + '</div>' +
      '<div style="flex:1;min-width:0"><div class="pc-name">' + U.esc(me.name) + '</div>' +
      '<div class="pc-sub">' + ic('badge') + U.esc(me.roleLabel) + ' · ' + U.esc(me.nip) + '</div>' +
      '<div class="pc-sub">' + ic('storefront') + U.esc(me.branch) + '</div></div>' +
      '</div>' +
      '<div class="pc-stats">' +
      '<div class="pc-stat"><div class="k">Limit otorisasi</div><div class="v num">' + U.rp(TK.store.limit()) + '</div></div>' +
      '<div class="pc-stat"><div class="k">Penaksiran selesai</div><div class="v num">' + s.total + '</div></div>' +
      '</div></div>' +

      '<div class="account-grid">' +
      '<div>' +
      '<section class="card">' +
      '<div class="card-head"><div class="card-head-l"><span class="step-badge">' + ic('settings') + '</span>' +
      '<div><div class="card-title">Pengaturan</div></div></div></div>' +
      '<div class="list-group" style="border:none;box-shadow:none">' +
      '<div class="list-row" data-action="open-settings"><div class="lr-icon">' + ic('settings') + '</div>' +
      '<div class="lr-body"><div class="lr-title">Model AI &amp; LTV</div><div class="lr-sub">Konfigurasi endpoint, API key, dan default LTV</div></div>' +
      ic('chevron-right') + '</div>' +
      '<div class="list-row" data-action="export-json"><div class="lr-icon">' + ic('download') + '</div>' +
      '<div class="lr-body"><div class="lr-title">Ekspor seluruh audit log</div><div class="lr-sub">JSON lengkap untuk arsip kepatuhan</div></div>' +
      ic('chevron-right') + '</div>' +
      '<div class="list-row" data-action="clear-data"><div class="lr-icon" style="color:var(--reject);background:var(--reject-bg);border-color:var(--reject-border)">' + ic('trash') + '</div>' +
      '<div class="lr-body"><div class="lr-title" style="color:var(--reject)">Hapus data demo</div><div class="lr-sub">Reset draft, riwayat, dan log</div></div>' +
      ic('chevron-right') + '</div>' +
      '</div></section>' +
      '</div>' +

      '<div>' +
      '<section class="card">' +
      '<div class="card-head"><div class="card-head-l"><span class="step-badge">' + ic('info') + '</span>' +
      '<div><div class="card-title">Tentang Takseer</div></div></div></div>' +
      '<p class="tiny muted" style="line-height:16px">Takseer AI v0.2.2 — Penaksir harga gadai berbasis AI.<br>' +
      'Data pasar ditarik real-time dari Tokopedia, OLX, dan Logam Mulia.<br>' +
      'Scraping dilakukan via browser headless, bukan simulasi.</p>' +
      '</section>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  };

  function stats() {
    const hist = TK.store.get().history;
    return {
      total: hist.length
    };
  }

  /* ====================================================================== */
  S.settingsBody = function () {
    const cfg = TK.settings.load();
    return (
      '<div class="settings-group">' +
      '<h4>' + ic('eye') + ' AI Model Vision</h4>' +
      '<div class="field"><label class="field-label">Base URL</label>' +
      '<input class="input" data-setting="vision-baseUrl" value="' + U.esc(cfg.vision.baseUrl) + '" placeholder="https://api.openai.com/v1"></div>' +
      '<div class="field"><label class="field-label">API Key</label>' +
      '<input class="input" type="password" data-setting="vision-apiKey" value="' + U.esc(cfg.vision.apiKey) + '" placeholder="sk-..."></div>' +
      '<div class="field"><label class="field-label">Model Name</label>' +
      '<input class="input" data-setting="vision-model" value="' + U.esc(cfg.vision.model) + '" placeholder="gpt-4o"></div>' +
      '</div>' +

      '<div class="settings-group">' +
      '<h4>' + ic('sparkles') + ' AI Model Penalaran</h4>' +
      '<div class="field"><label class="field-label">Base URL</label>' +
      '<input class="input" data-setting="reason-baseUrl" value="' + U.esc(cfg.reason.baseUrl) + '" placeholder="https://api.openai.com/v1"></div>' +
      '<div class="field"><label class="field-label">API Key</label>' +
      '<input class="input" type="password" data-setting="reason-apiKey" value="' + U.esc(cfg.reason.apiKey) + '" placeholder="sk-..."></div>' +
      '<div class="field"><label class="field-label">Model Name</label>' +
      '<input class="input" data-setting="reason-model" value="' + U.esc(cfg.reason.model) + '" placeholder="gpt-4o-mini"></div>' +
      '</div>' +

      '<div class="settings-group">' +
      '<h4>' + ic('chart') + ' Default LTV</h4>' +
      '<div class="ltv-display">' +
      '<span class="ltv-label">Loan-to-Value default</span>' +
      '<span class="ltv-value" id="ltvDisplay">' + cfg.ltv + '%</span></div>' +
      '<input type="range" class="range-slider" id="ltvSlider" min="0" max="100" step="1" value="' + cfg.ltv + '" data-setting="ltv">' +
      '<p class="tiny muted">LTV dasar yang digunakan sebelum penyesuaian grade dan volatilitas. Rekomendasi industri: 70–85%.</p>' +
      '</div>' +

      '<div class="settings-group">' +
      '<button class="btn btn--primary btn--block" data-action="save-settings">Simpan Pengaturan</button>' +
      '<button class="btn btn--ghost btn--block mt-8" data-action="test-ai">Tes Koneksi AI</button>' +
      '<p class="tiny muted mt-8">Menguji nilai yang sedang diketik: nama model dihubungi langsung, dan untuk Vision dikirim pula 1 gambar uji. Bila lolos, pengaturan tersimpan otomatis. Butuh server Takseer aktif.</p>' +
      '</div>'
    );
  };

  /* ====================================================================== */
  S.PHOTO_LABELS = PHOTO_LABELS;
  S.STATUS = STATUS;
  S.canAnalyze = canAnalyze;
  S.marketRow = marketRow;
  S.stats = stats;
  S.statusChip = statusChip;
  S.gradeChip = gradeChip;
})(window);
