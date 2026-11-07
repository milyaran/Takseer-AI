/* ==========================================================================
   settings.js — AI model endpoints + default LTV
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});
  const KEY = 'takseer.settings.v1';

  const DEFAULTS = {
    vision: { baseUrl: '', apiKey: '', model: '' },
    reason: { baseUrl: '', apiKey: '', model: '' },
    ltv: 80
  };

  let cache = null;

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function load() {
    if (cache) return cache;
    let saved = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) {
      saved = null;
    }
    cache = {
      vision: Object.assign({}, DEFAULTS.vision, (saved && saved.vision) || {}),
      reason: Object.assign({}, DEFAULTS.reason, (saved && saved.reason) || {}),
      ltv: typeof (saved && saved.ltv) === 'number' ? saved.ltv : DEFAULTS.ltv
    };
    return cache;
  }

  function save(patch) {
    const cur = load();
    const next = {
      vision: Object.assign({}, cur.vision, (patch && patch.vision) || {}),
      reason: Object.assign({}, cur.reason, (patch && patch.reason) || {}),
      ltv: patch && typeof patch.ltv === 'number' ? patch.ltv : cur.ltv
    };
    next.ltv = Math.max(0, Math.min(100, Math.round(next.ltv)));
    cache = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {
      /* storage full — keep in memory */
    }
    return next;
  }

  function ltvRatio() {
    return load().ltv / 100;
  }

  function hasVision() {
    const v = load().vision;
    return !!(v.baseUrl && v.model);
  }

  function hasReason() {
    const r = load().reason;
    return !!(r.baseUrl && r.model);
  }

  function reset() {
    cache = clone(DEFAULTS);
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
  }

  TK.settings = { load, save, reset, ltvRatio, hasVision, hasReason, DEFAULTS, KEY };
})(window);
