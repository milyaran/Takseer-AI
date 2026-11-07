/* ==========================================================================
   vision.js — on-device image intake + quality gate (Vivi's eyes)
   Real sharpness / exposure analysis so the app can "admit its limits"
   instead of guessing when a photo is unusable.
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});
  const U = TK.util;

  const MAX_EDGE = 900;
  const QUALITY = 0.78;

  function loadImageEl(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /** Downscale + recompress an uploaded photo so localStorage stays light. */
  async function intake(file) {
    const raw = await readFile(file);
    const img = await loadImageEl(raw);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
    const quality = await analyze(dataUrl);
    return { dataUrl, quality, width: w, height: h };
  }

  /** Laplacian-variance focus metric + mean luminance exposure check. */
  async function analyze(dataUrl) {
    try {
      const img = await loadImageEl(dataUrl);
      const W = 200;
      const H = Math.max(1, Math.round((img.height / img.width) * W));
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;

      const gray = new Float32Array(W * H);
      let sum = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        gray[p] = g;
        sum += g;
      }
      const mean = sum / (W * H);

      // 3x3 Laplacian kernel, variance = focus energy
      let lapSum = 0;
      let lapSq = 0;
      let n = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const v =
            4 * gray[i] -
            gray[i - 1] -
            gray[i + 1] -
            gray[i - W] -
            gray[i + W];
          lapSum += v;
          lapSq += v * v;
          n++;
        }
      }
      const lapMean = lapSum / n;
      const variance = Math.max(0, lapSq / n - lapMean * lapMean);
      const sharpness = Math.round(variance);

      let verdict = 'ok';
      let reason = '';
      if (sharpness < 30) {
        verdict = 'blur';
        reason = 'Kontras tepi terlalu rendah — kemungkinan foto goyang atau tidak fokus.';
      } else if (sharpness < 65) {
        verdict = 'soft';
        reason = 'Fokus lembut. Nomor seri & mikro-goresan mungkin tidak terbaca.';
      } else if (mean < 48) {
        verdict = 'dark';
        reason = 'Pencahayaan minim — detail kondisi tidak dapat dinilai.';
      } else if (mean > 238) {
        verdict = 'blown';
        reason = 'Overexposure — permukaan & label terbakar cahaya.';
      }

      const ok = verdict === 'ok';
      const score = U.clamp(Math.round((Math.min(sharpness, 240) / 240) * 70 + (ok ? 28 : 6)), 18, 99);

      return {
        sharpness,
        brightness: Math.round(mean),
        verdict,
        reason,
        ok,
        score
      };
    } catch (e) {
      return { sharpness: 0, brightness: 0, verdict: 'blur', reason: 'Gambar tidak dapat dibaca.', ok: false, score: 20 };
    }
  }

  /* ---------- Synthetic sample photos (demo mode) ---------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function backdrop(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#f2f5f8');
    g.addColorStop(0.55, '#e4eaf1');
    g.addColorStop(1, '#d3dce6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const r = ctx.createRadialGradient(W * 0.32, H * 0.18, 10, W * 0.32, H * 0.18, W * 0.75);
    r.addColorStop(0, 'rgba(255,255,255,0.85)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);

    // table horizon
    ctx.fillStyle = 'rgba(148,163,184,0.16)';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
  }

  function shadow(ctx, cx, cy, rx, ry) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, 'rgba(15,23,42,0.26)');
    g.addColorStop(1, 'rgba(15,23,42,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPhone(ctx, W, H, tint) {
    const w = 210;
    const h = 430;
    const x = (W - w) / 2;
    const y = (H - h) / 2 - 18;
    shadow(ctx, W / 2, y + h + 12, 190, 30);

    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.35)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 16;
    const body = ctx.createLinearGradient(x, y, x + w, y + h);
    body.addColorStop(0, tint[0]);
    body.addColorStop(0.5, tint[1]);
    body.addColorStop(1, tint[0]);
    ctx.fillStyle = body;
    roundRect(ctx, x, y, w, h, 34);
    ctx.fill();
    ctx.restore();

    // screen
    const sx = x + 7;
    const sy = y + 7;
    const sw = w - 14;
    const sh = h - 14;
    const sc = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    sc.addColorStop(0, '#1c2c46');
    sc.addColorStop(0.45, '#2c4a74');
    sc.addColorStop(1, '#101c30');
    ctx.fillStyle = sc;
    roundRect(ctx, sx, sy, sw, sh, 28);
    ctx.fill();

    // screen glow
    const gl = ctx.createLinearGradient(sx, sy, sx + sw * 0.7, sy + sh * 0.55);
    gl.addColorStop(0, 'rgba(120,180,255,0.30)');
    gl.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = gl;
    roundRect(ctx, sx, sy, sw, sh, 28);
    ctx.fill();

    // notch
    ctx.fillStyle = 'rgba(8,14,24,0.9)';
    roundRect(ctx, W / 2 - 38, sy + 8, 76, 20, 10);
    ctx.fill();

    // camera module
    const cx = x + 20;
    const cy = y + 20;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(ctx, cx, cy, 88, 88, 20);
    ctx.fill();
    const lenses = [
      [cx + 24, cy + 24],
      [cx + 62, cy + 24],
      [cx + 24, cy + 62]
    ];
    lenses.forEach(([lx, ly]) => {
      const lg = ctx.createRadialGradient(lx - 4, ly - 4, 1, lx, ly, 14);
      lg.addColorStop(0, '#5b6f8c');
      lg.addColorStop(0.55, '#1b2433');
      lg.addColorStop(1, '#05080d');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(lx, ly, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // side buttons
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, x - 2, y + 96, 4, 40, 2);
    ctx.fill();
    roundRect(ctx, x + w - 2, y + 110, 4, 62, 2);
    ctx.fill();
  }

  function drawTablet(ctx, W, H) {
    const w = 330;
    const h = 430;
    const x = (W - w) / 2;
    const y = (H - h) / 2 - 14;
    shadow(ctx, W / 2, y + h + 10, 200, 26);
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#c9d3df';
    roundRect(ctx, x, y, w, h, 24);
    ctx.fill();
    ctx.restore();
    const sc = ctx.createLinearGradient(x, y, x + w, y + h);
    sc.addColorStop(0, '#20304a');
    sc.addColorStop(0.5, '#3a5b86');
    sc.addColorStop(1, '#16233a');
    ctx.fillStyle = sc;
    roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    roundRect(ctx, x + 30, y + 40, w - 60, 8, 4);
    ctx.fill();
  }

  function drawLaptop(ctx, W, H) {
    const w = 400;
    const h = 250;
    const x = (W - w) / 2;
    const y = H / 2 - 150;
    shadow(ctx, W / 2, y + h + 96, 230, 26);
    // lid
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#38465c');
    g.addColorStop(0.5, '#222d3d');
    g.addColorStop(1, '#151d29');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    // screen
    const sg = ctx.createLinearGradient(x, y, x + w, y + h);
    sg.addColorStop(0, '#2b4f7d');
    sg.addColorStop(0.6, '#173049');
    sg.addColorStop(1, '#0d1a29');
    ctx.fillStyle = sg;
    roundRect(ctx, x + 14, y + 14, w - 28, h - 34, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.16)';
    ctx.fillRect(x + 34, y + 40, w - 68, 5);
    ctx.fillRect(x + 34, y + 58, w - 120, 5);
    // base
    const bg = ctx.createLinearGradient(x - 40, 0, x + w + 40, 0);
    bg.addColorStop(0, '#9aa7b8');
    bg.addColorStop(0.5, '#d7dfe8');
    bg.addColorStop(1, '#8f9cae');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(x - 34, y + h);
    ctx.lineTo(x + w + 34, y + h);
    ctx.lineTo(x + w + 14, y + h + 22);
    ctx.lineTo(x - 14, y + h + 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 120, y + h + 4, w - 240, 3);
  }

  function drawCamera(ctx, W, H) {
    const w = 330;
    const h = 210;
    const x = (W - w) / 2;
    const y = H / 2 - 120;
    shadow(ctx, W / 2, y + h + 16, 180, 24);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#3a3f47');
    g.addColorStop(0.5, '#22262c');
    g.addColorStop(1, '#101317');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 16);
    ctx.fill();
    // grip
    ctx.fillStyle = '#181c21';
    roundRect(ctx, x + w - 92, y + 4, 88, h - 8, 12);
    ctx.fill();
    // lens
    const lx = x + 118;
    const ly = y + h / 2;
    const lg = ctx.createRadialGradient(lx - 18, ly - 18, 6, lx, ly, 92);
    lg.addColorStop(0, '#4d5a6b');
    lg.addColorStop(0.45, '#1b222b');
    lg.addColorStop(0.8, '#0a0d11');
    lg.addColorStop(1, '#2a333d');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(lx, ly, 88, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const ig = ctx.createRadialGradient(lx - 10, ly - 14, 2, lx, ly, 46);
    ig.addColorStop(0, '#5f7fa8');
    ig.addColorStop(0.6, '#16283c');
    ig.addColorStop(1, '#060a0e');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(lx, ly, 44, 0, Math.PI * 2);
    ctx.fill();
    // hotshoe + dials
    ctx.fillStyle = '#2b323a';
    roundRect(ctx, x + 60, y - 12, 60, 14, 4);
    ctx.fill();
    ctx.fillStyle = '#cfd6de';
    roundRect(ctx, x + w - 60, y - 8, 34, 10, 4);
    ctx.fill();
  }

  function drawGold(ctx, W, H) {
    const w = 340;
    const h = 150;
    const x = (W - w) / 2;
    const y = H / 2 - 70;
    shadow(ctx, W / 2, y + h + 18, 200, 26);

    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#e8c45c');
    g.addColorStop(0.22, '#d9ab34');
    g.addColorStop(0.45, '#f3dd8e');
    g.addColorStop(0.7, '#cfa02a');
    g.addColorStop(1, '#a97c10');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();

    // crisp rim — reads as a hard edge for the focus metric
    ctx.strokeStyle = 'rgba(90,60,0,0.75)';
    ctx.lineWidth = 3;
    roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 8);
    ctx.stroke();

    // engraved inner frame
    ctx.strokeStyle = 'rgba(105,70,0,0.5)';
    ctx.lineWidth = 1.4;
    roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 4);
    ctx.stroke();

    // top bevel highlight
    ctx.fillStyle = 'rgba(255,250,220,0.55)';
    ctx.fillRect(x + 14, y + 14, w - 28, 4);
    ctx.fillStyle = 'rgba(90,60,0,0.18)';
    ctx.fillRect(x + 14, y + h - 20, w - 28, 3);

    // engraving
    ctx.fillStyle = 'rgba(72,46,0,0.92)';
    ctx.font = '800 26px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('ANTAM', x + 28, y + 62);

    ctx.font = '700 13px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('999.9  FINE GOLD', x + 28, y + 84);

    ctx.font = '800 20px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('5 g', x + 28, y + 116);

    // serial number block (adds fine detail like a real certificate stamp)
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(72,46,0,0.8)';
    ctx.fillText('LM 05 26', x + w - 150, y + 62);
    ctx.fillText('SERI 118472', x + w - 150, y + 78);
    ctx.fillText('CERTICARD', x + w - 150, y + 94);

    // barcode strip
    ctx.fillStyle = 'rgba(72,46,0,0.55)';
    let bx = x + w - 152;
    const bars = [3, 1, 2, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 2];
    bars.forEach((bw, i) => {
      ctx.fillRect(bx, y + 104, bw, 22);
      bx += bw + 3;
      if (i % 4 === 3) bx += 2;
    });

    // hallmark
    ctx.beginPath();
    ctx.arc(x + w - 46, y + 40, 13, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(72,46,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w - 46, y + 40, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(72,46,0,0.45)';
    ctx.fill();

    // specular streaks
    const sh = ctx.createLinearGradient(x, y, x + 140, y + h);
    sh.addColorStop(0, 'rgba(255,255,255,0.5)');
    sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh;
    roundRect(ctx, x + 4, y + 4, 120, h - 8, 6);
    ctx.fill();
  }

  function drawBike(ctx, W, H) {
    const cx = W / 2;
    const cy = H / 2 + 40;
    shadow(ctx, cx, cy + 88, 220, 26);
    // wheels
    [cx - 130, cx + 130].forEach((wx) => {
      ctx.strokeStyle = '#1b2430';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.arc(wx, cy + 40, 58, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#8b98a8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(wx, cy + 40, 40, 0, Math.PI * 2);
      ctx.stroke();
    });
    // body
    const g = ctx.createLinearGradient(cx - 160, cy - 90, cx + 160, cy + 60);
    g.addColorStop(0, '#cf3540');
    g.addColorStop(0.5, '#a51f2b');
    g.addColorStop(1, '#7a121c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 120, cy - 10);
    ctx.quadraticCurveTo(cx - 60, cy - 96, cx + 26, cy - 78);
    ctx.quadraticCurveTo(cx + 96, cy - 62, cx + 108, cy - 4);
    ctx.lineTo(cx + 62, cy + 20);
    ctx.lineTo(cx - 76, cy + 24);
    ctx.closePath();
    ctx.fill();
    // seat
    ctx.fillStyle = '#1a1f27';
    roundRect(ctx, cx - 96, cy - 92, 92, 18, 9);
    ctx.fill();
    // handlebar
    ctx.strokeStyle = '#2a323c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(cx + 96, cy - 66);
    ctx.lineTo(cx + 116, cy - 104);
    ctx.stroke();
    // headlight
    ctx.fillStyle = '#e8eef6';
    roundRect(ctx, cx + 96, cy - 44, 30, 22, 8);
    ctx.fill();
  }

  const DRAWERS = {
    phone: (ctx, W, H) => drawPhone(ctx, W, H, ['#4d6f96', '#2b4b6f']),
    tablet: drawTablet,
    laptop: drawLaptop,
    camera: drawCamera,
    gold: drawGold,
    bike: drawBike
  };

  /** Generate a plausible studio-style product photo for demo mode. */
  function samplePhoto(kind, label) {
    const W = 900;
    const H = 675;

    // 1. render the base composition offscreen
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    const bctx = base.getContext('2d');
    backdrop(bctx, W, H);
    (DRAWERS[kind] || drawPhone)(bctx, W, H);

    const v = bctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(15,23,42,0.18)');
    bctx.fillStyle = v;
    bctx.fillRect(0, 0, W, H);

    // 2. each frame gets a slightly different camera angle / framing
    const seed = (String(label || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 17) - 8;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(W / 2 + seed * 2.4, H / 2 + seed * 1.6);
    ctx.rotate(seed * 0.0022);
    ctx.scale(1.06 + Math.abs(seed) * 0.004, 1.06 + Math.abs(seed) * 0.004);
    ctx.drawImage(base, -W / 2, -H / 2);
    ctx.restore();

    // 3. sample watermark
    ctx.fillStyle = 'rgba(15,23,42,0.28)';
    roundRect(ctx, W - 118, H - 40, 100, 22, 11);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 11px "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText('SAMPEL DEMO', W - 106, H - 25);

    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /** Make a deliberately blurry variant so the quality gate can be demonstrated. */
  function blurredPhoto(dataUrl) {
    return new Promise(async (resolve) => {
      const img = await loadImageEl(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'blur(7px) brightness(0.82)';
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    });
  }

  TK.vision = { intake, analyze, samplePhoto, blurredPhoto };
})(window);
