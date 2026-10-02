/* Khutbah Live Translator — providers/offline-dict.js   (v5.1, additive)
   Offline Arabic → English translator backed by dict/ar-en.json
   (~128k words + khutbah phrases).

   LIFECYCLE
     1. On first page open: fetch dict/ar-en.json, save it to IndexedDB.
     2. Every later open: load from IndexedDB, no network needed.
     3. A new meta.version in the JSON replaces the stored copy.

   USE
     Last-resort provider: used when every online engine fails or the device
     is offline. Phrase match first (longest wins), then word by word with
     clitic stripping. Unknown words stay in Arabic. Output is prefixed "≈"
     so listeners know it is a rough gist, not a full translation. */

const DICT_URL = 'dict/ar-en.json';
const DB_NAME = 'klt-offline-dict';
const DB_STORE = 'dicts';
const DB_KEY = 'ar-en';

const od = { phrases: null, words: null, maxPhrase: 1, ready: false, loading: null, version: null };

/* ── IndexedDB helpers (never throw) ───────────────────────────── */
function idbOpen() {
  return new Promise(function (res) {
    try {
      const rq = indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(DB_STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { res(null); };
    } catch (e) { res(null); }
  });
}
async function idbGet() {
  const db = await idbOpen(); if (!db) return null;
  return new Promise(function (res) {
    try {
      const rq = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(DB_KEY);
      rq.onsuccess = function () { res(rq.result || null); };
      rq.onerror = function () { res(null); };
    } catch (e) { res(null); }
  });
}
async function idbPut(data) {
  const db = await idbOpen(); if (!db) return false;
  return new Promise(function (res) {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(data, DB_KEY);
      tx.oncomplete = function () { res(true); };
      tx.onerror = function () { res(false); };
    } catch (e) { res(false); }
  });
}

/* ── normalization (same folding as the build script) ──────────── */
function fold(s) {
  return String(s || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[.,!?؟،؛:"'()\[\]…«»]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function install(data) {
  od.phrases = new Map(Object.entries(data.phrases || {}));
  od.words = new Map(Object.entries(data.words || {}));
  od.maxPhrase = 1;
  od.phrases.forEach(function (_, k) { od.maxPhrase = Math.max(od.maxPhrase, k.split(' ').length); });
  od.version = data.meta && data.meta.version;
  od.ready = true;
  console.log('[offline-dict] ready — ' + od.words.size + ' words, ' + od.phrases.size + ' phrases (v' + od.version + ')');
  try { window.dispatchEvent(new CustomEvent('khutbah:offline-dict-ready', { detail: { words: od.words.size } })); } catch (e) {}
}

/** Load once: IndexedDB first, network only if missing or outdated. */
function loadOfflineDict() {
  if (od.loading) return od.loading;
  od.loading = (async function () {
    const stored = await idbGet();
    if (stored && stored.words) install(stored);
    if (navigator.onLine === false) return od.ready;
    try {
      const res = await fetch(DICT_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const newer = !stored || !stored.meta || !data.meta || stored.meta.version !== data.meta.version;
      if (newer) {
        install(data);
        const saved = await idbPut(data);
        console.log('[offline-dict] ' + (saved ? 'stored in browser for offline use' : 'could not store (private mode?)'));
      }
    } catch (e) {
      if (!od.ready) console.warn('[offline-dict] download failed, offline translation unavailable:', e.message);
    }
    return od.ready;
  })();
  return od.loading;
}

/* ── lookup ────────────────────────────────────────────────────── */
const PREFIX = { 'و': 'and ', 'ف': 'so ', 'ب': 'with ', 'ل': 'for ', 'ك': 'like ' };
const SUFFIX = [['هما', ' of them both'], ['كم', ' your'], ['هم', ' their'], ['هن', ' their'], ['نا', ' our'], ['ها', ' her'], ['ه', ' his'], ['ي', ' my']];

function wordOnly(w) {
  if (od.words.has(w)) return od.words.get(w);
  if (w.startsWith('ال') && w.length > 3 && od.words.has(w.slice(2))) return 'the ' + od.words.get(w.slice(2));
  if (!w.startsWith('ال') && od.words.has('ال' + w)) return od.words.get('ال' + w).replace(/^the /, '');
  return null;
}
function withSuffix(w) {
  const g = wordOnly(w); if (g) return g;
  for (let i = 0; i < SUFFIX.length; i++) {
    const s = SUFFIX[i][0];
    if (w.length > s.length + 2 && w.endsWith(s)) {
      const b = wordOnly(w.slice(0, -s.length));
      if (b) return b.replace(/^the /, '') + SUFFIX[i][1];
    }
  }
  return null;
}
function lookupWord(w) {
  let g = withSuffix(w); if (g) return g;
  if (w.length > 2 && PREFIX[w[0]]) {
    g = withSuffix(w.slice(1)); if (g) return PREFIX[w[0]] + g;
    if (w.length > 3 && PREFIX[w[1]] && (w[0] === 'و' || w[0] === 'ف')) {
      g = withSuffix(w.slice(2)); if (g) return PREFIX[w[0]] + PREFIX[w[1]] + g;
    }
  }
  return null;
}

/** Returns { text, known, total }. */
function glossArabic(text) {
  const words = fold(text).split(' ').filter(Boolean);
  const out = []; let known = 0;
  for (let i = 0; i < words.length;) {
    let hit = null, len = 0;
    for (let n = Math.min(od.maxPhrase, words.length - i); n >= 2; n--) {
      const k = words.slice(i, i + n).join(' ');
      if (od.phrases.has(k)) { hit = od.phrases.get(k); len = n; break; }
    }
    if (!hit && od.phrases.has(words[i])) { hit = od.phrases.get(words[i]); len = 1; }
    if (!hit) { hit = lookupWord(words[i]); len = 1; }
    if (hit) { out.push(hit); known += len; } else out.push(words[i]);
    i += len;
  }
  return { text: out.join(' ').replace(/\s+/g, ' ').trim(), known: known, total: words.length };
}

/** Provider signature, same as the others: (text, src, tgt) → string|null. */
function tryOfflineDict(text, src, tgt) {
  if (!od.ready || src !== 'ar' || tgt !== 'en') return null;
  const r = glossArabic(text);
  if (!r.total || r.known === 0) return null;
  if (typeof apiStats !== 'undefined') apiStats.offlineOk = (apiStats.offlineOk || 0) + 1;
  return '≈ ' + r.text;
}

function isOfflineDictReady() { return od.ready; }

// Start loading as soon as the page opens; never blocks the UI.
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  setTimeout(loadOfflineDict, 0);
}

Object.assign(window, { tryOfflineDict, glossArabic, loadOfflineDict, isOfflineDictReady });
export { tryOfflineDict, glossArabic, loadOfflineDict, isOfflineDictReady };
