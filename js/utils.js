/* ==========================================================================
   utils.js — formatting, timing, small DOM helpers
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** 8500000 -> "Rp 8.500.000" */
  function rp(n) {
    const v = Math.round(Number(n) || 0);
    return 'Rp ' + v.toLocaleString('id-ID');
  }

  /** 8500000 -> "8.500.000" (no prefix) */
  function num(n) {
    return Math.round(Number(n) || 0).toLocaleString('id-ID');
  }

  /** 8500000 -> "8,5 jt" */
  function rpShort(n) {
    const v = Number(n) || 0;
    if (v >= 1e9) return 'Rp ' + (v / 1e9).toFixed(1).replace('.', ',') + ' M';
    if (v >= 1e6) {
      const m = v / 1e6;
      return 'Rp ' + (m >= 10 ? Math.round(m) : m.toFixed(1).replace('.', ',')).toString().replace('.', ',') + ' jt';
    }
    if (v >= 1e3) return 'Rp ' + Math.round(v / 1e3) + ' rb';
    return 'Rp ' + v;
  }

  function pct(n, digits) {
    const v = Number(n) || 0;
    return v.toFixed(digits == null ? 0 : digits).replace('.', ',') + '%';
  }

  function uid(prefix) {
    const s = Math.random().toString(36).slice(2, 8).toUpperCase();
    return (prefix || 'TKS') + '-' + s;
  }

  /** Audit-grade reference id: TKS-261028-4F2A */
  function refId(date) {
    const d = date ? new Date(date) : new Date();
    const stamp =
      String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
    const rand = Math.random().toString(16).slice(2, 6).toUpperCase();
    return 'TKS-' + stamp + '-' + rand;
  }

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'baru saja';
    if (m < 60) return m + ' mnt lalu';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' jam lalu';
    const d = Math.floor(h / 24);
    if (d < 7) return d + ' hari lalu';
    return fmtDate(ts);
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDateTime(ts) {
    return fmtDate(ts) + ' · ' + fmtTime(ts);
  }

  function fmtDayLabel(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) return 'Hari ini · ' + fmtTime(ts);
    const y = new Date(now.getTime() - 86400000);
    if (
      d.getDate() === y.getDate() &&
      d.getMonth() === y.getMonth() &&
      d.getFullYear() === y.getFullYear()
    )
      return 'Kemarin · ' + fmtTime(ts);
    return fmtDateTime(ts);
  }

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function median(arr) {
    const a = arr.filter((n) => typeof n === 'number' && isFinite(n)).slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  /** Round a loan ceiling to a "teller friendly" figure. */
  function roundCeiling(v) {
    if (v >= 5000000) return Math.floor(v / 100000) * 100000;
    if (v >= 1000000) return Math.floor(v / 50000) * 50000;
    if (v >= 100000) return Math.floor(v / 10000) * 10000;
    return Math.floor(v / 1000) * 1000;
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  /** Deterministic PRNG so a given appraisal always reproduces the same market data. */
  function seeded(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function svg(id, cls) {
    return '<svg class="' + (cls || '') + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  TK.util = {
    rp,
    num,
    rpShort,
    pct,
    uid,
    refId,
    timeAgo,
    fmtTime,
    fmtDate,
    fmtDateTime,
    fmtDayLabel,
    sleep,
    clamp,
    median,
    roundCeiling,
    esc,
    debounce,
    seeded,
    svg,
    download,
    pad
  };
})(window);
