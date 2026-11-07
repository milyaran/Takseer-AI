/* ==========================================================================
   store.js — single source of truth, persistence, audit trail
   ========================================================================== */
(function (global) {
  'use strict';

  const TK = (global.TK = global.TK || {});
  const U = TK.util;
  const KEY = 'takseer.state.v3';

  const LIMIT = 1000000;

  const PROFILE = {
    name: 'Rangga Prasetya',
    roleLabel: 'Staff Penaksir',
    nip: 'PNK-104-0287',
    branch: 'Jakarta Pusat — #104'
  };

  let state = null;
  const listeners = new Set();
  let saveTimer = null;

  /* ---------- persistence ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.profile) return parsed;
      }
    } catch (e) {
      /* corrupted store — start clean */
    }
    return null;
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        try {
          state.history.forEach((h) => {
            if (h.photos) h.photos = h.photos.map((p) => Object.assign({}, p, { dataUrl: null }));
          });
          localStorage.setItem(KEY, JSON.stringify(state));
        } catch (e2) {
          /* in-memory only */
        }
      }
    }, 220);
  }

  function emit() {
    persist();
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function init() {
    state = load();
    if (!state) {
      state = {
        version: 3,
        profile: PROFILE,
        draft: null,
        history: [],
        ui: { tab: 'penaksiran', filter: 'all', detailId: null, introSeen: false, ragSort: 'newest', ragSource: 'all' },
        meta: { createdAt: Date.now(), runs: 0 }
      };
      persist();
    }
    if (!state.ui) state.ui = { tab: 'penaksiran', filter: 'all', detailId: null, introSeen: false };
    if (state.ui.ragSort == null) state.ui.ragSort = 'newest';
    if (state.ui.ragSource == null) state.ui.ragSource = 'all';
    return state;
  }

  /* ---------- getters ---------- */
  function get() {
    return state;
  }
  function me() {
    return state.profile;
  }
  function limit() {
    return LIMIT;
  }

  /* ---------- draft ---------- */
  function newDraft(cat) {
    const now = Date.now();
    return {
      id: U.refId(now),
      createdAt: now,
      updatedAt: now,
      cat: cat || 'elektronik',
      productId: null,
      productName: '',
      brand: '',
      model: '',
      spec: '',
      grade: 'B',
      completeness: 'fullset',
      weight: null,
      karat: null,
      photos: [],
      staffNotes: '',
      vision: { confidence: 0, signals: [], warnings: [], source: 'lokal', analyzedAt: null },
      market: { status: 'idle', items: [], sources: [], median: 0, min: 0, max: 0, fetchedAt: null, query: '', sort: 'newest', error: null },
      valuation: null,
      status: 'draft',
      decision: null,
      audit: []
    };
  }

  function startDraft(cat) {
    state.draft = newDraft(cat);
    state.ui.detailId = null;
    emit();
    return state.draft;
  }

  function ensureDraft() {
    if (!state.draft) state.draft = newDraft('elektronik');
    return state.draft;
  }

  function patchDraft(patch, opts) {
    if (!state.draft) return;
    Object.assign(state.draft, patch);
    state.draft.updatedAt = Date.now();
    if (!opts || !opts.silent) emit();
  }

  function audit(entry) {
    if (!state.draft) return;
    state.draft.audit.push({
      at: Date.now(),
      actor: entry.actor || 'Sistem',
      action: entry.action,
      detail: entry.detail || '',
      level: entry.level || 'ok'
    });
  }

  function commitDraft(status, decision) {
    const d = state.draft;
    if (!d) return null;
    d.status = status;
    d.decision = decision || null;
    d.updatedAt = Date.now();
    const record = JSON.parse(JSON.stringify(d));
    state.history.unshift(record);
    if (state.history.length > 60) state.history.length = 60;
    state.draft = null;
    state.meta.runs = (state.meta.runs || 0) + 1;
    emit();
    return record;
  }

  function decideOn(id, status, decision, auditEntry) {
    const rec = state.history.find((h) => h.id === id);
    if (!rec) return null;
    rec.status = status;
    rec.updatedAt = Date.now();
    if (decision) rec.decision = decision;
    if (auditEntry) {
      rec.audit = rec.audit || [];
      rec.audit.push(Object.assign({ at: Date.now(), level: 'ok' }, auditEntry));
    }
    emit();
    return rec;
  }

  function setTab(tab) {
    state.ui.tab = tab;
    emit();
  }

  function clearAll() {
    state.draft = null;
    state.history = [];
    state.logs = [];
    emit();
  }

  function log(agent, msg, level) {
    if (!state.logs) state.logs = [];
    state.logs.unshift({ at: Date.now(), agent: agent || 'system', msg: msg || '', level: level || 'ok' });
    if (state.logs.length > 200) state.logs.length = 200;
    persist();
  }

  TK.store = {
    init,
    get,
    me,
    limit,
    LIMIT,
    startDraft,
    ensureDraft,
    patchDraft,
    audit,
    commitDraft,
    decideOn,
    setTab,
    clearAll,
    log,
    subscribe,
    emit,
    persist,
    PROFILE
  };
})(window);
