/* ==========================================================================
   app.js — controller: routing, events, pipeline orchestration, sheets
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = global.TK;
  const U = TK.util;
  const C = TK.catalog;
  const store = TK.store;
  const S = TK.screens;

  const ui = (TK.ui = { view: 'main', detailId: null, justDecided: false });

  let els = {};
  let installPrompt = null;
  let running = false;

  /* ====================================================================== */
  function boot() {
    store.init();
    const st = store.get();
    if (!st.draft) st.draft = null;
    if (st.ui.tab === 'penaksiran' && !st.draft) store.ensureDraft('elektronik');

    els.main = document.getElementById('main');
    els.decisionBar = document.getElementById('decisionBarRoot');
    els.branch = document.getElementById('branchLabel');
    els.roleLabel = document.getElementById('roleLabel');
    els.limitLabel = document.getElementById('limitLabel');
    els.nav = document.getElementById('nav');
    els.aiStatus = document.getElementById('aiStatus');
    els.aiStatusDot = document.getElementById('aiStatusDot');
    els.aiStatusLabel = document.getElementById('aiStatusLabel');

    buildInputs();
    bindEvents();
    store.subscribe(render);
    render();
    registerSW();
    watchInstall();

    if (!st.ui.introSeen) {
      setTimeout(() => {
        st.ui.introSeen = true;
        store.persist();
        showIntro();
      }, 700);
    }
  }

  function buildInputs() {
    const mk = (id, capture) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.id = id;
      if (capture) input.setAttribute('capture', 'environment');
      input.style.display = 'none';
      input.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length) await ingestFiles(files);
      });
      document.body.appendChild(input);
      return input;
    };
    els.cameraInput = mk('camInput', true);
    els.galleryInput = mk('galInput', false);
  }

  /* ====================================================================== */
  function updateAIStatus() {
    if (!els.aiStatus) return;
    const hasV = TK.settings.hasVision();
    const hasR = TK.settings.hasReason();
    const both = hasV && hasR;
    const either = hasV || hasR;

    els.aiStatus.classList.toggle('is-on', both);
    els.aiStatus.classList.toggle('is-partial', either && !both);

    if (both) {
      els.aiStatusLabel.textContent = 'AI: Vision + Reason';
      els.aiStatus.title = 'AI Vision & Reasoning aktif — klik untuk pengaturan';
    } else if (hasV) {
      els.aiStatusLabel.textContent = 'AI: Vision';
      els.aiStatus.title = 'AI Vision aktif, Reasoning belum dikonfigurasi — klik untuk pengaturan';
    } else if (hasR) {
      els.aiStatusLabel.textContent = 'AI: Reason';
      els.aiStatus.title = 'AI Reasoning aktif, Vision belum dikonfigurasi — klik untuk pengaturan';
    } else {
      els.aiStatusLabel.textContent = 'AI: off';
      els.aiStatus.title = 'AI tidak aktif — klik untuk mengaktifkan';
    }
  }

  /* ====================================================================== */
  function render() {
    const st = store.get();
    const me = store.me();

    els.branch.textContent = 'Cabang: ' + me.branch;
    els.roleLabel.textContent = me.roleLabel;
    els.limitLabel.textContent = U.rp(store.limit());

    let html;
    if (ui.view === 'detail' && ui.detailId) {
      html = S.detail(ui.detailId);
    } else if (st.ui.tab === 'riwayat') {
      html = S.riwayat();
    } else if (st.ui.tab === 'datarag') {
      html = S.dataRag();
    } else if (st.ui.tab === 'akun') {
      html = S.akun();
    } else if (st.ui.tab === 'mulai') {
      html = '<div class="empty">' + ic('scan') + '<h4>Siap memulai</h4><p>Pilih kategori dan ambil foto agunan untuk memulai penaksiran baru.</p></div>';
    } else {
      if (!st.draft) store.ensureDraft('elektronik');
      html = S.penaksiran();
    }
    els.main.innerHTML = html;

    updateAIStatus();

    const showBar = ui.view === 'main' && st.ui.tab === 'penaksiran' && st.draft && st.draft.valuation;
    els.decisionBar.innerHTML = showBar ? S.decisionBar() : '';
    els.main.classList.toggle('has-decision-bar', !!showBar);
    document.body.classList.toggle('has-decision-bar', !!showBar);

    Array.from(els.nav.querySelectorAll('.nav-item')).forEach((n) => {
      n.classList.toggle('is-active', ui.view === 'main' && n.dataset.tab === st.ui.tab);
    });
  }

  /* ====================================================================== */
  function toast(msg, type) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' is-' + type : '');
    el.innerHTML = U.svg(type === 'warn' ? 'alert' : type === 'error' ? 'x-circle' : 'check-circle') + '<span>' + U.esc(msg) + '</span>';
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 260);
    }, 2600);
  }

  function openSheet(opts) {
    closeSheet();
    const root = document.getElementById('overlayRoot');
    root.innerHTML =
      '<div class="backdrop" data-action="close-sheet"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="sheet-grip"></div>' +
      '<div class="sheet-head"><div><h3>' + opts.title + '</h3>' + (opts.sub ? '<p>' + opts.sub + '</p>' : '') + '</div>' +
      '<button class="icon-btn is-plain" data-action="close-sheet" aria-label="Tutup">' + U.svg('x') + '</button></div>' +
      '<div class="sheet-body">' + opts.body + '</div>' +
      (opts.footer ? '<div class="sheet-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    document.body.style.overflow = 'hidden';
    if (opts.onMount) opts.onMount();
  }

  function closeSheet() {
    document.getElementById('overlayRoot').innerHTML = '';
    document.body.style.overflow = '';
  }

  function openLightbox(photo) {
    const root = document.getElementById('overlayRoot');
    const q = photo.quality || {};
    root.innerHTML =
      '<div class="lightbox">' +
      '<div class="lb-head"><div><div class="lb-title">' + U.esc(photo.label) + '</div>' +
      '<div class="lb-meta">Ketajaman ' + (q.sharpness || 0) + ' · cahaya ' + (q.brightness || 0) +
      ' · ' + (q.ok ? 'layak analisa' : 'di bawah ambang') + '</div></div>' +
      '<button class="lb-close" data-action="close-sheet">' + U.svg('x') + '</button></div>' +
      '<div class="lb-stage"><img src="' + photo.dataUrl + '" alt=""></div>' +
      '</div>';
    document.body.style.overflow = 'hidden';
  }

  function ic(name, cls) { return U.svg(name, cls); }

  /* ====================================================================== */
  function nextLabel(d) {
    const used = new Set((d.photos || []).map((p) => p.label));
    return S.PHOTO_LABELS.find((l) => !used.has(l)) || 'Foto ' + ((d.photos || []).length + 1);
  }

  async function ingestFiles(files) {
    const d = store.ensureDraft();
    if (d.photos.length >= 6) {
      toast('Maksimal 6 foto per agunan', 'warn');
      return;
    }
    toast('Memproses ' + files.length + ' foto…');

    for (const f of files) {
      if (d.photos.length >= 6) break;
      try {
        const res = await TK.vision.intake(f);
        d.photos.push({
          id: U.uid('PH'),
          dataUrl: res.dataUrl,
          label: nextLabel(d),
          quality: res.quality,
          ts: Date.now()
        });
      } catch (e) {
        toast('Satu foto gagal dibaca', 'error');
      }
    }

    const patch = { photos: d.photos };
    if (d.productId) patch.vision = TK.agents.computeVision(d);
    store.patchDraft(patch);

    const bad = d.photos.filter((p) => p.quality && !p.quality.ok).length;
    if (bad) toast(bad + ' foto di bawah ambang kualitas — periksa peringatan', 'warn');

    /* Tampilkan pemilih produk referensi hanya sekali, saat foto pertama dimasukkan. */
    if (!d.productId && d.photos.length === 1) setTimeout(openProductPicker, 260);
  }

  async function addSample(productId) {
    const p = C.byId(productId);
    if (!p) return;
    const d = store.ensureDraft();
    const labels = ['Tampak Depan', 'Tampak Belakang', 'Detail Cacat', 'Label Seri / IMEI'];

    d.cat = p.cat;
    d.productId = p.id;
    d.productName = p.name;
    d.brand = p.brand;
    d.model = p.model;
    d.spec = p.spec;
    d.grade = 'B';
    d.completeness = 'fullset';
    if (p.cat === 'emas') {
      d.weight = p.weight;
      d.karat = p.karat;
    }
    d.photos = [];

    for (const label of labels) {
      const dataUrl = TK.vision.samplePhoto(p.sample, label);
      const quality = await TK.vision.analyze(dataUrl);
      d.photos.push({ id: U.uid('PH'), dataUrl, label, quality, ts: Date.now() });
    }

    d.vision = TK.agents.computeVision(d);
    d.market = { status: 'idle', sources: [], median: 0, min: 0, max: 0, fetchedAt: null };
    d.valuation = null;
    d.status = 'draft';
    d.audit = [];
    store.patchDraft({});
    toast('Contoh "' + p.name + '" dimuat');
    setTimeout(() => {
      const el = document.getElementById('cardMarket');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  }

  async function addBlurSample() {
    const d = store.ensureDraft();
    if (!d.productId) {
      await addSample('ip13pm256');
    }
    const p = C.byId(store.get().draft.productId) || C.PRODUCTS[0];
    const sharp = TK.vision.samplePhoto(p.sample, 'Label Seri / IMEI');
    const blurry = await TK.vision.blurredPhoto(sharp);
    const quality = await TK.vision.analyze(blurry);
    const dd = store.get().draft;
    dd.photos.push({
      id: U.uid('PH'),
      dataUrl: blurry,
      label: 'Label Seri / IMEI',
      quality,
      ts: Date.now()
    });
    dd.vision = TK.agents.computeVision(dd);
    store.patchDraft({});
    toast('Foto buram ditambahkan — sistem menolak menebak', 'warn');
  }

  /* ====================================================================== */
  function updateAgentPill(key, status) {
    // no-op: pills removed
  }

  function appendSource(src, i) {
    const rows = document.getElementById('marketRows');
    if (!rows) return;
    const skel = rows.querySelector('[data-skel="' + i + '"]');
    if (skel) {
      const tmp = document.createElement('div');
      tmp.innerHTML = S.marketRow(src);
      skel.replaceWith(tmp.firstElementChild);
    } else {
      rows.insertAdjacentHTML('beforeend', S.marketRow(src));
    }
  }

  /* ---------- Inspeksi Kondisi Agunan (AI Vision + Reasoning) ---------- */
  function setInspectBusy(on) {
    const btn = document.getElementById('btnInspect');
    if (!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle('is-busy', !!on);
    const label = btn.querySelector('[data-label]');
    if (label) label.textContent = on ? 'Menginspeksi…' : 'Inspeksi Kondisi Agunan';
  }

  function inspectNeedsAI() {
    openSheet({
      title: 'AI Vision belum aktif',
      sub: 'Inspeksi otomatis butuh model AI Vision',
      body:
        '<div class="alert alert--info">' + ic('info') +
        '<div><b>Tanpa AI, kolom tidak bisa diisi otomatis</b>' +
        'Inspeksi lokal hanya mengukur ketajaman & pencahayaan foto — tidak membaca merek, tipe, atau kelengkapan. ' +
        'Isi <b>Base URL</b> dan <b>Model Name</b> di Pengaturan untuk mengaktifkan pembacaan otomatis.</div></div>' +
        '<p class="tiny muted mt-10">Sementara itu, kolom di bawah tetap bisa diisi manual — valuasi berjalan normal.</p>',
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Nanti saja</button>' +
        '<button class="btn btn--primary" data-action="open-settings">Buka Pengaturan</button>'
    });
  }

  function inspectFailed(info) {
    const o = typeof info === 'string' ? { message: info } : (info || {});
    openSheet({
      title: 'Inspeksi AI gagal',
      sub: 'Model Vision tidak mengembalikan hasil yang bisa dibaca',
      body:
        '<div class="alert alert--warn">' + ic('alert') +
        '<div><b>Model tidak merespons dengan benar</b>' + U.esc(o.message || 'tidak diketahui') + '</div></div>' +
        (o.raw
          ? '<div class="field mt-10"><label class="field-label">Balasan mentah model</label>' +
            '<pre style="white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.5;background:var(--subtle);border:1px solid var(--line);border-radius:8px;padding:8px;margin:0">' +
            U.esc(String(o.raw).slice(0, 400)) + '</pre></div>'
          : '') +
        '<div class="alert alert--info mt-10">' + ic('info') +
        '<div><b>Periksa 3 hal berikut</b>' +
        '1. <b>Model Name</b> di blok <b>AI Model Vision</b> harus model multimodal — mis. <code>qwen/qwen2.5-vl-72b-instruct</code>, <code>gpt-4o</code>, <code>gemini-2.0-flash</code>. Model teks tidak bisa membaca foto.<br>' +
        '2. Klik <b>Simpan Pengaturan</b> setelah mengubah nilai — inspeksi memakai pengaturan yang tersimpan, bukan yang sedang diketik.<br>' +
        '3. Pastikan <b>Base URL</b> sesuai provider dan API key masih berlaku.</div></div>' +
        (o.hint ? '<p class="tiny muted mt-8">' + U.esc(o.hint) + '</p>' : ''),
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Tutup</button>' +
        '<button class="btn btn--primary" data-action="open-settings">Buka Pengaturan</button>'
    });
  }

  async function runInspection() {
    if (running) return;
    const d = store.get().draft;
    if (!d || !d.photos || !d.photos.length) {
      toast('Ambil minimal 1 foto sebelum inspeksi', 'warn');
      return;
    }
    if (!(TK.settings.hasVision() && TK.engine && TK.engine.askVision)) {
      inspectNeedsAI();
      return;
    }

    running = true;
    setInspectBusy(true);
    try {
      const vision = TK.agents.computeVision(d);
      const res = await TK.engine.askVision(d);
      const r = res && res.data;
      if (!r) {
        inspectFailed({
          message: (res && res.error) || 'Model tidak mengembalikan data yang bisa dibaca',
          raw: (res && res.raw) || '',
          hint: (res && res.hint) || ''
        });
        return;
      }

      const filled = [];
      if (r.product) { d.productName = r.product; filled.push('nama & tipe'); }
      if (r.brand) { d.brand = r.brand; filled.push('merk'); }
      if (r.grade && C.GRADES[r.grade]) { d.grade = r.grade; filled.push('grade'); }
      if (r.completeness && C.COMPLETENESS[r.completeness]) {
        d.completeness = r.completeness;
        filled.push('kelengkapan');
      }

      /* Catatan kondisi: gabungan spesifikasi + catatan visual + AI Reasoning */
      const parts = [];
      if (r.specs) parts.push(r.specs);
      if (r.notes) parts.push(r.notes);
      if (TK.settings.hasReason() && TK.engine.askCondition) {
        const cond = await TK.engine.askCondition(d, r);
        if (cond && cond.text) {
          parts.push(cond.text);
          vision.aiReason = cond.text;
          filled.push('catatan kondisi');
        }
      }
      if (parts.length) d.spec = parts.join(' — ');

      if (r.signals && r.signals.length) {
        vision.signals = Array.from(new Set((vision.signals || []).concat(r.signals)));
      }
      if (typeof r.confidence === 'number') {
        vision.confidence = U.clamp(Math.round(r.confidence), 0, 100);
      }
      if (r.notes) vision.aiNote = r.notes;
      vision.aiData = r;
      vision.source = 'ai';
      d.vision = vision;

      store.patchDraft({
        vision,
        productName: d.productName,
        brand: d.brand,
        grade: d.grade,
        completeness: d.completeness,
        spec: d.spec
      });

      toast('Terisi otomatis: ' + (filled.length ? filled.join(', ') : 'hasil deteksi'), '');
      setTimeout(() => {
        const el = document.getElementById('cardVision');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 140);
    } catch (e) {
      console.error(e);
      inspectFailed(e.message || 'kesalahan tak terduga');
    } finally {
      running = false;
      setInspectBusy(false);
    }
  }

  async function runAnalysis() {
    if (running) return;
    const d = store.get().draft;
    if (!S.canAnalyze(d)) {
      toast('Butuh minimal 1 foto jelas untuk memulai analisa', 'warn');
      return;
    }
    running = true;

    store.patchDraft(
      {
        market: { status: 'loading', sources: [], median: 0, min: 0, max: 0, fetchedAt: null },
        valuation: null,
        status: 'draft'
      },
      { silent: true }
    );
    store.log('system', 'Sesi penaksiran dimulai · ' + d.photos.length + ' foto', 'info');
    render();

    const target = document.getElementById('cardMarket');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const startedAt = Date.now();
    let result = null;

    try {
      result = await TK.agents.runPipeline(d, {
        onLog: (a, level, msg) => store.log(a, msg, level),
        onSource: appendSource,
        onVision: (v) => store.patchDraft({ vision: v }, { silent: true }),
        onMarket: (m) => store.patchDraft({ market: m }, { silent: true }),
        onValuation: (v) => store.patchDraft({ valuation: v }, { silent: true })
      });
    } catch (err) {
      running = false;
      console.error(err);
      toast('Agen gagal menyelesaikan analisa: ' + (err.message || ''), 'error');
      store.patchDraft({ market: { status: 'idle', sources: [], median: 0, min: 0, max: 0, fetchedAt: null } }, { silent: true });
      render();
      return;
    }

    const { vision, market, valuation, auth } = result;
    const g = C.GRADES[store.get().draft.grade] || C.GRADES.B;

    store.audit({ actor: 'Sistem', role: 'agent', action: 'Ekstraksi visual', detail: d.photos.length + ' foto · ' + g.label + ' · confidence ' + vision.confidence + '%', level: 'ok' });
    store.audit({ actor: 'Sistem', role: 'agent', action: 'Scraping pasar', detail: market.sources.length + ' sumber · median ' + U.rp(market.median), level: 'ok' });
    store.audit({ actor: 'Sistem', role: 'agent', action: 'Valuasi', detail: 'Plafon ' + U.rp(valuation.ceiling) + ' · LTV ' + Math.round(valuation.displayLtv * 100) + '%', level: 'ok' });
    store.audit({ actor: 'Sistem', role: 'agent', action: 'Pemeriksaan otorisasi', detail: auth.message, level: auth.over ? 'warn' : 'ok' });

    store.patchDraft({
      vision,
      market,
      valuation,
      status: 'ready',
      agentTrace: { total: (Date.now() - startedAt) / 1000 }
    });

    running = false;
    toast('Analisa selesai dalam ' + ((Date.now() - startedAt) / 1000).toFixed(1) + 's');
    setTimeout(() => {
      const el = document.getElementById('cardValuation');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 220);
  }

  /* ====================================================================== */
  function decide(kind, payload) {
    const st = store.get();
    const me = store.me();
    const d = st.draft;
    if (!d || !d.valuation) return;

    const v = d.valuation;
    const amount = payload && payload.amount != null ? payload.amount : v.ceiling;

    let detail = '';
    if (kind === 'valid') detail = 'Disetujui sesuai rekomendasi ' + U.rp(v.ceiling);
    else if (kind === 'adjust') detail = 'Plafon diubah ke ' + U.rp(amount) + ' — ' + payload.note;
    else if (kind === 'reject') detail = payload.note;
    else if (kind === 'escalated') detail = 'Melebihi limit staff — dikirim ke Kepala Cabang';

    store.audit({
      actor: me.name,
      role: 'staff',
      action: kind === 'valid' ? 'Validasi' : kind === 'adjust' ? 'Penyesuaian manual' : kind === 'reject' ? 'Penolakan' : 'Eskalasi',
      detail,
      level: kind === 'valid' ? 'ok' : kind === 'reject' ? 'err' : 'warn'
    });

    const rec = store.commitDraft(kind, {
      by: me.name,
      role: 'staff',
      at: Date.now(),
      amount,
      note: (payload && payload.note) || ''
    });

    closeSheet();
    ui.view = 'detail';
    ui.detailId = rec.id;
    ui.justDecided = true;
    store.emit();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    const msgs = {
      valid: 'Taksiran disetujui · surat gadai siap',
      adjust: 'Penyesuaian tersimpan di audit trail',
      reject: 'Transaksi ditolak & tercatat',
      escalated: 'Eskalasi terkirim ke Kepala Cabang'
    };
    toast(msgs[kind] || 'Tersimpan', kind === 'reject' ? 'warn' : '');
  }

  /* ---------- sheets ---------- */
  function sheetValid() {
    const d = store.get().draft;
    const v = d.valuation;
    const auth = TK.agents.authorityCheck(v, 'staff');
    if (auth.over) return sheetEscalate();

    openSheet({
      title: 'Setujui taksiran?',
      sub: 'Keputusan menghentikan pipeline dan menerbitkan surat gadai.',
      body:
        '<div class="hero-valuation" style="margin-top:0">' +
        '<span class="hv-label">Plafon pinjaman</span>' +
        '<div class="hero-row"><span class="hero-amount num">' + U.rp(v.ceiling) + '</span>' +
        '<span class="ltv-chip">LTV ' + Math.round(v.displayLtv * 100) + '%</span></div>' +
        '</div>' +
        '<div class="rrow"><span class="k">Produk</span><span class="v">' + U.esc(d.productName) + '</span></div>' +
        '<div class="rrow"><span class="k">Grade kondisi</span><span class="v">' + (C.GRADES[d.grade] || C.GRADES.B).label + '</span></div>' +
        '<div class="rrow"><span class="k">Nilai pasar median</span><span class="v num">' + U.rp(v.median) + '</span></div>' +
        '<div class="rrow"><span class="k">Otorisasi</span><span class="v">' + U.esc(store.me().roleLabel) + '</span></div>' +
        '<div class="alert alert--valid mt-10">' + U.svg('lock') +
        '<div><b>Terkunci setelah disetujui</b>Foto, sumber harga, dan timestamp akan dibekukan pada audit log dan tidak dapat diubah.</div></div>',
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Batal</button>' +
        '<button class="btn btn--primary" data-action="confirm-valid">' + U.svg('check') + 'Setujui ' + U.rp(v.ceiling) + '</button>'
    });
  }

  function sheetAdjust() {
    const d = store.get().draft;
    const v = d.valuation;
    const min = Math.round((v.ceiling * 0.4) / 50000) * 50000;
    const max = v.ceiling;
    const start = max;

    openSheet({
      title: 'Sesuaikan plafon',
      sub: 'Penyesuaian manual wajib disertai alasan tertulis.',
      body:
        '<div class="amount-display">' +
        '<div class="ad-label">Plafon baru</div>' +
        '<div class="ad-value num" id="adjValue">' + U.rp(start) + '</div>' +
        '<div class="ad-hint" id="adjHint">Rekomendasi sistem ' + U.rp(v.ceiling) + '</div>' +
        '</div>' +
        '<input type="range" class="range-slider" id="adjRange" min="' + min + '" max="' + max + '" step="50000" value="' + start + '">' +
        '<div class="quick-chips mt-8">' +
        '<button class="quick-chip" data-action="adj-preset" data-pct="100">Rekomendasi</button>' +
        '<button class="quick-chip" data-action="adj-preset" data-pct="95">−5%</button>' +
        '<button class="quick-chip" data-action="adj-preset" data-pct="90">−10%</button>' +
        '<button class="quick-chip" data-action="adj-preset" data-pct="80">−20%</button>' +
        '</div>' +
        '<div class="field mt-10"><label class="field-label">Alasan penyesuaian (wajib)</label>' +
        '<textarea class="textarea" id="adjNote" rows="3" placeholder="Contoh: layar ada shadow ringan yang tidak tertangkap kamera…"></textarea>' +
        '<div class="tiny muted mt-8" id="adjCount">Minimal 15 karakter</div></div>' +
        '<div class="alert alert--gold mt-8">' + U.svg('alert') +
        '<div>Plafon tidak boleh melebihi rekomendasi sistem. Untuk nilai lebih tinggi, gunakan <b>Eskalasi Manager</b>.</div></div>',
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Batal</button>' +
        '<button class="btn btn--gold" data-action="confirm-adjust">' + U.svg('edit') + 'Simpan</button>',
      onMount: () => {
        const range = document.getElementById('adjRange');
        const val = document.getElementById('adjValue');
        const hint = document.getElementById('adjHint');
        const note = document.getElementById('adjNote');
        const count = document.getElementById('adjCount');

        const sync = () => {
          const n = Number(range.value);
          val.textContent = U.rp(n);
          val.className = 'ad-value num' + (n < v.ceiling ? ' is-under' : '');
          const delta = n - v.ceiling;
          hint.textContent = delta === 0 ? 'Sama dengan rekomendasi sistem' : (delta < 0 ? '−' : '+') + U.rp(Math.abs(delta)) + ' dari rekomendasi';
          const pct = ((n - Number(range.min)) / (Number(range.max) - Number(range.min))) * 100;
          range.style.setProperty('--fill', pct.toFixed(1) + '%');
        };
        range.addEventListener('input', sync);
        sync();

        note.addEventListener('input', () => {
          const len = note.value.trim().length;
          count.textContent = len + '/15 karakter minimum';
          count.style.color = len >= 15 ? 'var(--valid)' : 'var(--muted)';
        });
      }
    });
  }

  function sheetReject() {
    const reasons = [
      ['Indikasi barang palsu / tiruan', 'Merek atau nomor seri tidak cocok dengan basis data produsen.', true],
      ['Kerusakan permanen', 'Komponen inti tidak berfungsi dan tidak ekonomis diperbaiki.', true],
      ['Indikasi barang curian', 'Dokumen kepemilikan tidak dapat diverifikasi.', true],
      ['Dokumen tidak lengkap', 'STNK/BPKB/sertifikat tidak tersedia atau tidak sesuai.', false],
      ['Lainnya', 'Jelaskan pada catatan di bawah.', false]
    ];

    openSheet({
      title: 'Tolak pengajuan',
      sub: 'Penolakan menghentikan transaksi dan tercatat permanen.',
      body:
        reasons
          .map(
            (r, i) =>
              '<button class="opt-row' + (i === 0 ? ' is-selected is-danger' : ' is-danger') + '" data-action="pick-reason" data-reason="' + U.esc(r[0]) + '">' +
              '<span class="radio"><i></i></span><span class="opt-body"><span class="opt-title">' + r[0] + '</span>' +
              '<span class="opt-desc">' + r[1] + '</span></span></button>'
          )
          .join('') +
        '<div class="field mt-8"><label class="field-label">Catatan penolakan (wajib)</label>' +
        '<textarea class="textarea" id="rejNote" rows="3" placeholder="Uraikan temuan fisik / dokumen yang menjadi dasar penolakan…"></textarea></div>',
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Batal</button>' +
        '<button class="btn btn--danger" data-action="confirm-reject">' + U.svg('x') + 'Tolak gadai</button>'
    });
  }

  function sheetEscalate() {
    const v = store.get().draft.valuation;

    openSheet({
      title: 'Eskalasi ke Kepala Cabang',
      sub: 'Plafon melampaui limit otorisasi staff.',
      body:
        '<div class="hero-valuation" style="margin-top:0">' +
        '<span class="hv-label">Plafon yang diajukan</span>' +
        '<div class="hero-row"><span class="hero-amount num">' + U.rp(v.ceiling) + '</span></div>' +
        '</div>' +
        '<div class="rrow"><span class="k">Limit staff</span><span class="v num">' + U.rp(store.limit()) + '</span></div>' +
        '<div class="rrow"><span class="k">Selisih</span><span class="v num">' + U.rp(v.ceiling - store.limit()) + '</span></div>' +
        '<div class="alert alert--gold mt-10">' + U.svg('lock') +
        '<div><b>Menunggu persetujuan manusia</b>Surat gadai belum dapat diterbitkan hingga Kepala Cabang menyetujui.</div></div>',
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Batal</button>' +
        '<button class="btn btn--primary" data-action="confirm-escalate">' + U.svg('send') + 'Kirim eskalasi</button>'
    });
  }

  function openProductPicker() {
    const d = store.get().draft;
    const cats = Object.values(C.CATEGORIES)
      .map(
        (c) =>
          '<button class="filter-chip' + (d.cat === c.id ? ' is-active' : '') + '" data-action="picker-cat" data-cat="' + c.id + '">' +
          c.short + '</button>'
      )
      .join('');

    const items = C.byCat(d.cat || 'elektronik')
      .map(
        (p) =>
          '<button class="opt-row' + (d.productId === p.id ? ' is-selected' : '') + '" data-action="pick-product" data-id="' + p.id + '">' +
          '<span class="radio"><i></i></span>' +
          '<span class="opt-body"><span class="opt-title">' + U.esc(p.name) + '</span>' +
          '<span class="opt-desc">' + U.esc(p.brand) + ' · acuan ' + U.rpShort(p.base * (p.weight || 1)) + '</span></span>' +
          '</button>'
      )
      .join('');

    openSheet({
      title: 'Pilih produk referensi',
      sub: 'Katalog acuan untuk pencocokan harga pasar.',
      body: '<div class="filter-row" style="margin-bottom:8px">' + cats + '</div>' +
        (items || '<p class="tiny muted mt-8">Belum ada produk di kategori ini.</p>') +
        '<p class="tiny muted mt-8">Sistem mencocokkan foto dengan katalog ini. Jika produk tidak terdaftar, tekan tombol di bawah.</p>',
      footer:
        '<button class="btn btn--primary btn--block" data-action="pick-custom">' + ic('edit') + 'Isi sendiri</button>'
    });
  }

  function sheetPhotoLabel(photoId) {
    const d = store.get().draft;
    const photo = d.photos.find((p) => p.id === photoId);
    if (!photo) return;
    openSheet({
      title: 'Label foto',
      sub: 'Menentukan area yang diverifikasi.',
      body: S.PHOTO_LABELS.map(
        (l) =>
          '<button class="opt-row' + (photo.label === l ? ' is-selected' : '') + '" data-action="set-photo-label" data-id="' + photoId + '" data-label="' + U.esc(l) + '">' +
          '<span class="radio"><i></i></span><span class="opt-body"><span class="opt-title">' + l + '</span></span></button>'
      ).join('')
    });
  }

  function sheetClear() {
    openSheet({
      title: 'Hapus data demo?',
      sub: 'Draft, riwayat, dan log akan dihapus dari perangkat ini.',
      body: '<div class="alert alert--warn">' + U.svg('alert') +
        '<div><b>Tidak dapat dibatalkan</b>Audit log lokal akan hilang. Ekspor terlebih dahulu jika diperlukan.</div></div>',
      footer:
        '<button class="btn btn--ghost" data-action="close-sheet">Batal</button>' +
        '<button class="btn btn--danger" data-action="confirm-clear">' + U.svg('trash') + 'Hapus</button>'
    });
  }

  function showIntro() {
    openSheet({
      title: 'Selamat datang di Takseer',
      sub: 'Penaksir harga gadai berbasis AI dengan data pasar real-time.',
      body:
        '<div class="alert alert--valid mt-8">' + U.svg('shield') +
        '<div><b>Sistem tidak pernah memutuskan sendiri</b>Setiap taksiran berhenti dan menunggu persetujuan penaksir.</div></div>' +
        '<p class="tiny muted mt-10">Mulai cepat: pilih salah satu contoh di kartu Inspeksi Visual, lalu tekan <b>Analisa Harga Pasar</b>.</p>',
      footer: '<button class="btn btn--primary btn--block" data-action="close-sheet">Mulai penaksiran</button>'
    });
  }

  function openSettings() {
    openSheet({
      title: 'Pengaturan',
      sub: 'Konfigurasi model AI dan parameter LTV',
      body: S.settingsBody(),
      footer: '<button class="btn btn--ghost" data-action="close-sheet">Tutup</button>',
      onMount: () => {
        const slider = document.getElementById('ltvSlider');
        const display = document.getElementById('ltvDisplay');
        if (slider && display) {
          slider.addEventListener('input', () => {
            display.textContent = slider.value + '%';
            const pct = (slider.value / 100) * 100;
            slider.style.setProperty('--fill', pct + '%');
          });
          slider.style.setProperty('--fill', (slider.value / 100) * 100 + '%');
        }
      }
    });
  }

  /* ====================================================================== */
  function exportCSV() {
    const rows = [
      ['ID', 'Tanggal', 'Produk', 'Kategori', 'Grade', 'Median Pasar', 'Plafon', 'LTV', 'Status', 'Keputusan Oleh', 'Catatan']
    ];
    store.get().history.forEach((h) => {
      rows.push([
        h.id,
        U.fmtDateTime(h.createdAt),
        h.productName,
        (C.CATEGORIES[h.cat] || {}).label || h.cat,
        h.grade,
        h.valuation ? h.valuation.median : '',
        h.decision ? h.decision.amount : h.valuation ? h.valuation.ceiling : '',
        h.valuation ? Math.round(h.valuation.ltv * 100) + '%' : '',
        h.status,
        h.decision ? h.decision.by : '',
        h.decision ? h.decision.note : ''
      ]);
    });
    const csv = rows
      .map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(','))
      .join('\n');
    U.download('takseer-audit-' + new Date().toISOString().slice(0, 10) + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
    toast('Audit log CSV diunduh');
  }

  function exportJSON(rec) {
    const payload = rec || { exportedAt: Date.now(), branch: store.me().branch, records: store.get().history };
    U.download(
      'takseer-' + (rec ? rec.id : 'audit-' + new Date().toISOString().slice(0, 10)) + '.json',
      JSON.stringify(payload, null, 2)
    );
    toast('Arsip JSON diunduh');
  }

  /* ====================================================================== */
  /* Baca nilai yang SEDANG diketik di sheet Pengaturan.
     JANGAN pakai TK.settings.load() untuk "Tes Koneksi AI": nilai itu baru
     berubah setelah tombol "Simpan Pengaturan" ditekan. */
  function readSettingsForm() {
    const saved = TK.settings.load();
    const val = (name, fallback) => {
      const node = document.querySelector('[data-setting="' + name + '"]');
      return node ? String(node.value || '').trim() : fallback;
    };
    const ltvNode = document.querySelector('[data-setting="ltv"]');
    return {
      vision: {
        baseUrl: val('vision-baseUrl', saved.vision.baseUrl),
        apiKey: val('vision-apiKey', saved.vision.apiKey),
        model: val('vision-model', saved.vision.model)
      },
      reason: {
        baseUrl: val('reason-baseUrl', saved.reason.baseUrl),
        apiKey: val('reason-apiKey', saved.reason.apiKey),
        model: val('reason-model', saved.reason.model)
      },
      ltv: ltvNode ? Number(ltvNode.value) : saved.ltv
    };
  }

  /* ====================================================================== */
  function bindEvents() {
    document.addEventListener('click', async (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;

      /* navigation */
      if (a === 'go') {
        ui.view = 'main';
        ui.detailId = null;
        const tab = el.dataset.tab;
        if (tab === 'penaksiran' && !store.get().draft) store.ensureDraft('elektronik');
        if (tab === 'mulai') {
          store.startDraft('elektronik');
          store.setTab('penaksiran');
          toast('Draft baru dimulai');
        } else {
          store.setTab(tab);
        }
        window.scrollTo({ top: 0 });
        return;
      }
      if (a === 'back') {
        ui.view = 'main';
        ui.detailId = null;
        store.emit();
        window.scrollTo({ top: 0 });
        return;
      }
      if (a === 'open-detail') {
        ui.view = 'detail';
        ui.detailId = el.dataset.id;
        store.emit();
        window.scrollTo({ top: 0 });
        return;
      }

      /* capture */
      if (a === 'add-photo-camera') { els.cameraInput.click(); return; }
      if (a === 'add-photo-gallery') { els.galleryInput.click(); return; }
      if (a === 'sample') { addSample(el.dataset.id); return; }
      if (a === 'sample-blur') { addBlurSample(); return; }
      if (a === 'pick-cat') {
        const d = store.ensureDraft();
        d.cat = el.dataset.cat;
        d.productId = null;
        d.productName = '';
        d.brand = '';
        d.spec = '';
        store.patchDraft({});
        return;
      }
      if (a === 'remove-photo') {
        e.stopPropagation();
        const d = store.get().draft;
        d.photos = d.photos.filter((p) => p.id !== el.dataset.id);
        if (d.productId) d.vision = TK.agents.computeVision(d);
        store.patchDraft({});
        return;
      }
      if (a === 'view-photo') {
        const d = store.get().draft;
        const p = d.photos.find((x) => x.id === el.dataset.id);
        if (p) openLightbox(p);
        return;
      }
      if (a === 'set-photo-label') {
        const d = store.get().draft;
        const p = d.photos.find((x) => x.id === el.dataset.id);
        if (p) p.label = el.dataset.label;
        closeSheet();
        store.patchDraft({});
        return;
      }
      if (a === 'open-product-picker') { openProductPicker(); return; }
      if (a === 'pick-custom') {
        const d = store.get().draft;
        if (!d) return;
        d.productId = null;
        d.productName = '';
        d.brand = '';
        d.model = '';
        d.spec = '';
        d.market = { status: 'idle', sources: [], median: 0, min: 0, max: 0, fetchedAt: null };
        d.valuation = null;
        closeSheet();
        store.patchDraft({});
        toast('Isi produk & kondisi secara manual', '');
        return;
      }
      if (a === 'picker-cat') {
        const d = store.get().draft;
        d.cat = el.dataset.cat;
        closeSheet();
        setTimeout(openProductPicker, 60);
        return;
      }
      if (a === 'pick-product') {
        const p = C.byId(el.dataset.id);
        const d = store.get().draft;
        if (p) {
          d.cat = p.cat;
          d.productId = p.id;
          d.productName = p.name;
          d.brand = p.brand;
          d.model = p.model;
          d.spec = p.spec;
          if (p.cat === 'emas') {
            d.weight = p.weight;
            d.karat = p.karat;
          }
          d.market = { status: 'idle', sources: [], median: 0, min: 0, max: 0, fetchedAt: null };
          d.valuation = null;
          if (d.photos.length) d.vision = TK.agents.computeVision(d);
        }
        closeSheet();
        store.patchDraft({});
        return;
      }
      if (a === 'set-grade') {
        const d = store.get().draft;
        d.grade = el.dataset.grade;
        store.patchDraft({});
        recompute();
        return;
      }

      /* analysis */
      if (a === 'analyze') { runAnalysis(); return; }
      if (a === 'inspect-condition') { runInspection(); return; }
      if (a === 'refresh-market') {
        const d = store.get().draft;
        if (d && d.productId) runAnalysis();
        return;
      }
      if (a === 'toggle-acc') {
        const body = el.parentElement.querySelector('.acc-body');
        if (body) {
          body.classList.toggle('is-open');
          el.classList.toggle('is-open');
        }
        return;
      }

      /* market sorting */
      if (a === 'market-sort') {
        const d = store.get().draft;
        if (!d || !d.market || !d.market.sources) return;
        const sort = el.value;
        const srcs = d.market.sources.slice();
        if (sort === 'price-high') srcs.sort((a, b) => (b.price || 0) - (a.price || 0));
        else if (sort === 'price-low') srcs.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (sort === 'oldest') srcs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
        else srcs.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        d.market.sources = srcs;
        d.market.sort = sort;
        store.patchDraft({ market: d.market });
        return;
      }

      /* RAG filters */
      if (a === 'rag-sort') {
        store.get().ui.ragSort = el.value;
        store.emit();
        return;
      }
      if (a === 'rag-source') {
        store.get().ui.ragSource = el.value;
        store.emit();
        return;
      }

      /* decisions */
      if (a === 'valid') { sheetValid(); return; }
      if (a === 'adjust') { sheetAdjust(); return; }
      if (a === 'reject') { sheetReject(); return; }
      if (a === 'escalate') { sheetEscalate(); return; }

      if (a === 'adj-preset') {
        const d = store.get().draft;
        const range = document.getElementById('adjRange');
        const pct = Number(el.dataset.pct) / 100;
        if (range) {
          range.value = Math.round((d.valuation.ceiling * pct) / 50000) * 50000;
          range.dispatchEvent(new Event('input'));
        }
        return;
      }
      if (a === 'pick-reason') {
        document.querySelectorAll('[data-action="pick-reason"]').forEach((n) => n.classList.remove('is-selected'));
        el.classList.add('is-selected');
        el.dataset.picked = '1';
        return;
      }
      if (a === 'confirm-valid') { decide('valid', {}); return; }
      if (a === 'confirm-adjust') {
        const range = document.getElementById('adjRange');
        const note = document.getElementById('adjNote');
        const amount = Number(range.value);
        if (note.value.trim().length < 15) {
          toast('Alasan penyesuaian minimal 15 karakter', 'warn');
          note.focus();
          return;
        }
        decide('adjust', { amount, note: note.value.trim() });
        return;
      }
      if (a === 'confirm-reject') {
        const picked = document.querySelector('[data-action="pick-reason"].is-selected');
        const note = document.getElementById('rejNote');
        if (!note.value.trim() || note.value.trim().length < 8) {
          toast('Catatan penolakan wajib diisi (min 8 karakter)', 'warn');
          note.focus();
          return;
        }
        decide('reject', { note: (picked ? picked.dataset.reason + ' — ' : '') + note.value.trim(), amount: 0 });
        return;
      }
      if (a === 'confirm-escalate') { decide('escalated', {}); return; }

      if (a === 'approve') {
        const rec = store.get().history.find((h) => h.id === el.dataset.id);
        if (!rec) return;
        store.decideOn(rec.id, 'approved', { by: store.me().name, role: 'manager', at: Date.now(), amount: rec.valuation.ceiling, note: '' }, {
          actor: store.me().name,
          role: 'manager',
          action: 'Otorisasi Kepala Cabang',
          detail: 'Eskalasi disetujui · ' + U.rp(rec.valuation.ceiling),
          level: 'ok'
        });
        store.log('system', 'Eskalasi ' + rec.id + ' disetujui Kepala Cabang', 'ok');
        toast('Eskalasi disetujui · surat gadai dapat diterbitkan');
        return;
      }
      if (a === 'decline') {
        const rec = store.get().history.find((h) => h.id === el.dataset.id);
        if (!rec) return;
        store.decideOn(rec.id, 'declined', { by: store.me().name, role: 'manager', at: Date.now(), amount: 0, note: 'Ditolak pada tingkat otorisasi' }, {
          actor: store.me().name,
          role: 'manager',
          action: 'Otorisasi ditolak',
          detail: 'Eskalasi dibatalkan Kepala Cabang',
          level: 'err'
        });
        toast('Eskalasi ditolak', 'warn');
        return;
      }

      /* settings */
      if (a === 'open-settings') { openSettings(); return; }
      if (a === 'save-settings') {
        TK.settings.save(readSettingsForm());
        toast('Pengaturan disimpan');
        closeSheet();
        updateAIStatus();
        render();
        return;
      }
      if (a === 'test-ai') {
        /* Uji nilai yang sedang diketik, BUKAN nilai yang sudah tersimpan. */
        const form = readSettingsForm();
        const candidates = [
          { label: 'Vision', cfg: form.vision },
          { label: 'Reasoning', cfg: form.reason }
        ].filter((x) => x.cfg.baseUrl || x.cfg.model || x.cfg.apiKey);

        if (!candidates.length) {
          toast('Isi Base URL & Model Name (Vision atau Penalaran) terlebih dahulu', 'warn');
          return;
        }

        /* Validasi lokal agar pesan lebih jelas daripada error generik server */
        let invalid = '';
        for (const c of candidates) {
          if (!c.cfg.baseUrl) { invalid = 'Base URL ' + c.label + ' masih kosong'; break; }
          if (!/^https?:\/\//i.test(c.cfg.baseUrl)) { invalid = 'Base URL ' + c.label + ' harus diawali http:// atau https://'; break; }
          if (!c.cfg.model) { invalid = 'Model Name ' + c.label + ' masih kosong'; break; }
        }
        if (invalid) { toast(invalid, 'warn'); return; }

        const btn = el;
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menguji…';
        toast('Menguji koneksi AI (' + candidates.map((c) => c.label).join(' & ') + ')…');

        try {
          const results = await Promise.all(
            candidates.map(async (c) => {
              try {
                const cfg = Object.assign({}, c.cfg, { kind: c.label === 'Vision' ? 'vision' : 'reason' });
                const r = await TK.api.testModel(cfg);
                if (r && r.ok) {
                  return {
                    label: c.label,
                    ok: true,
                    msg: r.mode === 'vision' ? 'model & input gambar OK' : 'model OK'
                  };
                }
                return { label: c.label, ok: false, msg: (r && r.error) || 'tidak ada respons' };
              } catch (err) {
                const raw = String((err && err.message) || err || 'gagal');
                const msg = /Layanan scraping belum aktif/i.test(raw)
                  ? 'Server Takseer belum jalan — jalankan "npm start"'
                  : raw;
                return { label: c.label, ok: false, msg };
              }
            })
          );
          const allOk = results.every((r) => r.ok);
          const summary = results
            .map((r) => r.label + ': ' + (r.ok ? 'OK (' + r.msg + ')' : 'GAGAL (' + r.msg + ')'))
            .join(' · ');

          /* Sinkronkan ke localStorage supaya askVision()/askReason() memakai
             konfigurasi yang BARU saja lolos uji — bukan nilai lama. */
          if (allOk) {
            TK.settings.save(form);
            updateAIStatus();
            render();
          }
          toast(summary + (allOk ? ' — pengaturan tersimpan otomatis' : ''), allOk ? '' : 'warn');
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
        return;
      }

      /* misc */
      if (a === 'filter') {
        store.get().ui.filter = el.dataset.filter;
        store.emit();
        return;
      }
      if (a === 'close-sheet') { closeSheet(); return; }
      if (a === 'export-csv') { exportCSV(); return; }
      if (a === 'export-json') { exportJSON(); return; }
      if (a === 'export-record') {
        const rec = store.get().history.find((h) => h.id === el.dataset.id);
        exportJSON(rec);
        return;
      }
      if (a === 'copy-ref') {
        try {
          await navigator.clipboard.writeText(el.dataset.id);
          toast('Nomor referensi disalin');
        } catch (err) {
          toast('Salin manual: ' + el.dataset.id, 'warn');
        }
        return;
      }
      if (a === 'clear-data') { sheetClear(); return; }
      if (a === 'confirm-clear') {
        store.clearAll();
        closeSheet();
        store.ensureDraft('elektronik');
        ui.view = 'main';
        store.setTab('penaksiran');
        toast('Data demo dihapus');
        return;
      }
      if (a === 'install') {
        if (installPrompt) {
          installPrompt.prompt();
          installPrompt = null;
        } else {
          toast('Gunakan menu browser → "Tambahkan ke layar utama"', 'warn');
        }
        return;
      }
    });

    /* typing — no re-render, keeps focus */
    document.addEventListener('input', (e) => {
      const el = e.target.closest('[data-field]');
      if (!el) return;
      const d = store.get().draft;
      if (!d) return;
      const f = el.dataset.field;
      if (f === 'weight') d.weight = el.value ? Number(el.value) : null;
      else d[f] = el.value;
      store.patchDraft({}, { silent: true });
      store.persist();
    });

    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-field]');
      if (!el) return;
      const d = store.get().draft;
      if (!d) return;
      const f = el.dataset.field;
      if (f === 'completeness') {
        d.completeness = el.value;
        store.patchDraft({});
        recompute();
      } else if (f === 'karat') {
        d.karat = Number(el.value);
        d.market = { status: 'idle', sources: [], median: 0, min: 0, max: 0, fetchedAt: null };
        d.valuation = null;
        store.patchDraft({});
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSheet();
    });
  }

  function recompute() {
    const d = store.get().draft;
    if (!d) return;
    if (d.market && d.market.status === 'ready' && d.productId) {
      const v = TK.agents.computeValuation(d);
      store.patchDraft({ valuation: v, vision: TK.agents.computeVision(d) });
    } else {
      store.patchDraft({ vision: d.productId ? TK.agents.computeVision(d) : d.vision });
    }
  }

  /* ====================================================================== */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    // Bump on every release. The query string busts any HTTP-level cache on
    // sw.js so the browser always re-fetches the latest worker (and therefore
    // the latest app shell) instead of serving a stale "Takseer v0.2.1" cache.
    const VERSION = '0.2.2';
    navigator.serviceWorker
      .register('sw.js?v=' + VERSION)
      .then((reg) => {
        // Explicitly ask for an update check on each load.
        reg.update().catch(() => {});
        let swapped = false;
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // A newer shell finished installing while the old one still controls
            // the page → swap in immediately and reload so the user sees it.
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller &&
              !swapped
            ) {
              swapped = true;
              location.reload();
            }
          });
        });
      })
      .catch(() => {});
  }

  function watchInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      const btn = document.getElementById('installBtn');
      if (btn) btn.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
