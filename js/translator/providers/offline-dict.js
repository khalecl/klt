/* Khutbah Live Translator — providers/offline-dict.js   (v5.2, additive)
   Offline word/phrase translator, four directions:
       ar → en   dict/ar-en.json
       ar → ru   dict/ar-ru.json
       en → ar   dict/en-ar.json
       ru → ar   dict/ru-ar.json   (+ Russian inflected forms → lemma)

   LIFECYCLE
     1. First page open: all four JSON files download in the background,
        one after another, and are saved in IndexedDB.
     2. Later opens: nothing is downloaded unless meta.version changed.
     3. A pair is parsed into memory only the first time it is needed,
        so a phone translating only ar→en never holds the Russian maps.

   OUTPUT
     Phrase match first (longest wins), then word by word. Unknown words
     are kept as spoken. Output starts with "≈" = rough gist. */

const DICT_PAIRS = ['ar-en', 'ar-ru', 'en-ar', 'ru-ar'];
const DICT_BASE = 'dict/';
const DB_NAME = 'klt-offline-dict';
const DB_STORE = 'dicts';

const od = {
    pairs: {},          // pair → { phrases:Map, words:Map, forms:Map|null, maxPhrase, affix, src, tgt }
    stored: {},         // pair → version stored in IndexedDB
    loading: null
};

/* ── IndexedDB (never throws) ─────────────────────────────────── */
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
async function idbGet(key) {
    const db = await idbOpen(); if (!db) return null;
    return new Promise(function (res) {
        try {
            const rq = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
            rq.onsuccess = function () { res(rq.result || null); };
            rq.onerror = function () { res(null); };
        } catch (e) { res(null); }
    });
}
async function idbPut(key, value) {
    const db = await idbOpen(); if (!db) return false;
    return new Promise(function (res) {
        try {
            const tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = function () { res(true); };
            tx.onerror = function () { res(false); };
        } catch (e) { res(false); }
    });
}

/* ── normalization ────────────────────────────────────────────── */
function foldAr(s) {
    return String(s || '')
        .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
        .replace(/[.,!?؟،؛:"'()\[\]…«»]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}
function foldLatinCyr(s) {
    return String(s || '').toLowerCase()
        .replace(/[\u0300\u0301]/g, '').replace(/ё/g, 'е')
        .replace(/[.,!?;:"()\[\]…«»—–]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

/* ── loading ──────────────────────────────────────────────────── */
function install(pair, data) {
    const p = {
        src: data.meta.src, tgt: data.meta.tgt, affix: data.meta.affix || null,
        phrases: new Map(Object.entries(data.phrases || {})),
        words: new Map(Object.entries(data.words || {})),
        forms: data.forms ? new Map(Object.entries(data.forms)) : null,
        maxPhrase: 1
    };
    p.phrases.forEach(function (_, k) { p.maxPhrase = Math.max(p.maxPhrase, k.split(' ').length); });
    od.pairs[pair] = p;
    console.log('[offline-dict] ' + pair + ' ready — ' + p.words.size + ' words, ' + p.phrases.size + ' phrases');
    return p;
}

/** Download every pair once and keep it in IndexedDB. Background only. */
function loadOfflineDict() {
    if (od.loading) return od.loading;
    od.loading = (async function () {
        for (const pair of DICT_PAIRS) {
            const stored = await idbGet(pair);
            if (stored && stored.meta) od.stored[pair] = stored.meta.version;
            if (navigator.onLine === false) continue;
            try {
                const res = await fetch(DICT_BASE + pair + '.json', { cache: 'no-cache' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                if (!stored || !stored.meta || stored.meta.version !== data.meta.version) {
                    const ok = await idbPut(pair, data);
                    od.stored[pair] = data.meta.version;
                    delete od.pairs[pair];                     // re-parse new version on next use
                    console.log('[offline-dict] ' + pair + (ok ? ' stored in browser' : ' could not be stored'));
                }
            } catch (e) {
                if (!stored) console.warn('[offline-dict] ' + pair + ' download failed:', e.message);
            }
        }
        try { window.dispatchEvent(new CustomEvent('khutbah:offline-dict-ready', { detail: Object.assign({}, od.stored) })); } catch (e) {}
        return Object.keys(od.stored);
    })();
    return od.loading;
}

/** Parse a pair into memory on first use (from IndexedDB). */
async function ensurePair(pair) {
    if (od.pairs[pair]) return od.pairs[pair];
    const data = await idbGet(pair);
    return data && data.words ? install(pair, data) : null;
}

/* ── Arabic source lookup (clitics) ──────────────────────────── */
function arWordOnly(p, w) {
    const art = p.affix ? p.affix.article : '';
    const strip = function (g) { return art && g.indexOf(art) === 0 ? g.slice(art.length) : g; };
    if (p.words.has(w)) return p.words.get(w);
    if (w.startsWith('ال') && w.length > 3 && p.words.has(w.slice(2))) return art + p.words.get(w.slice(2));
    if (!w.startsWith('ال') && p.words.has('ال' + w)) return strip(p.words.get('ال' + w));
    return null;
}
function arWithSuffix(p, w) {
    const g = arWordOnly(p, w); if (g) return g;
    const poss = p.affix.poss, art = p.affix.article;
    const keys = Object.keys(poss).sort(function (a, b) { return b.length - a.length; });
    for (const s of keys) {
        if (w.length > s.length + 2 && w.endsWith(s)) {
            let b = arWordOnly(p, w.slice(0, -s.length));
            if (b) { if (art && b.indexOf(art) === 0) b = b.slice(art.length); return poss[s] + ' ' + b; }
        }
    }
    return null;
}
function arLookup(p, w) {
    let g = arWithSuffix(p, w); if (g) return g;
    const conj = p.affix.conj;
    if (w.length > 2 && conj[w[0]]) {
        g = arWithSuffix(p, w.slice(1)); if (g) return conj[w[0]] + g;
        if (w.length > 3 && conj[w[1]] && (w[0] === 'و' || w[0] === 'ف')) {
            g = arWithSuffix(p, w.slice(2)); if (g) return conj[w[0]] + conj[w[1]] + g;
        }
    }
    return null;
}

/* ── English / Russian source lookup ─────────────────────────── */
function enLookup(p, w) {
    if (p.words.has(w)) return p.words.get(w);
    const tries = [];
    if (w.endsWith('ies')) tries.push(w.slice(0, -3) + 'y');
    if (w.endsWith('ied')) tries.push(w.slice(0, -3) + 'y');
    if (w.endsWith('es')) tries.push(w.slice(0, -2));
    if (w.endsWith('s')) tries.push(w.slice(0, -1));
    if (w.endsWith('ed')) { tries.push(w.slice(0, -2)); tries.push(w.slice(0, -1)); }
    if (w.endsWith('ing')) { tries.push(w.slice(0, -3)); tries.push(w.slice(0, -3) + 'e'); }
    if (w.endsWith('ly')) tries.push(w.slice(0, -2));
    if (w.endsWith("'s")) tries.push(w.slice(0, -2));
    for (const t of tries) if (t.length > 1 && p.words.has(t)) return p.words.get(t);
    return null;
}
function ruLookup(p, w) {
    if (p.words.has(w)) return p.words.get(w);
    if (p.forms && p.forms.has(w)) { const lem = p.forms.get(w); if (p.words.has(lem)) return p.words.get(lem); }
    return null;
}

/* ── core ─────────────────────────────────────────────────────── */
function glossWith(p, text) {
    const isAr = p.src === 'ar';
    const words = (isAr ? foldAr(text) : foldLatinCyr(text)).split(' ').filter(Boolean);
    const out = []; let known = 0;
    for (let i = 0; i < words.length;) {
        let hit = null, len = 0;
        for (let n = Math.min(p.maxPhrase, words.length - i); n >= 1; n--) {
            const k = words.slice(i, i + n).join(' ');
            if (p.phrases.has(k)) { hit = p.phrases.get(k); len = n; break; }
        }
        if (hit === null) {
            len = 1;
            hit = isAr ? arLookup(p, words[i]) : (p.src === 'ru' ? ruLookup(p, words[i]) : enLookup(p, words[i]));
        }
        if (hit !== null) { if (hit) out.push(hit); known += len; } else out.push(words[i]);
        i += len;
    }
    return { text: out.join(' ').replace(/\s+/g, ' ').trim(), known: known, total: words.length };
}

/** Provider signature: (text, src, tgt) → Promise<string|null>. */
async function tryOfflineDict(text, src, tgt) {
    const pair = src + '-' + tgt;
    if (DICT_PAIRS.indexOf(pair) < 0) return null;
    const p = await ensurePair(pair);
    if (!p) return null;
    const r = glossWith(p, text);
    if (!r.total || r.known === 0 || !r.text) return null;
    if (typeof apiStats !== 'undefined') apiStats.offlineOk = (apiStats.offlineOk || 0) + 1;
    return '≈ ' + r.text;
}

/** True when the pair (or any pair, if omitted) is available offline. */
function isOfflineDictReady(src, tgt) {
    if (!src) return Object.keys(od.stored).length > 0;
    return !!od.stored[src + '-' + tgt];
}
function offlineDictPairs() { return DICT_PAIRS.slice(); }

if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') setTimeout(loadOfflineDict, 0);

Object.assign(window, { tryOfflineDict, loadOfflineDict, isOfflineDictReady, offlineDictPairs });
export { tryOfflineDict, loadOfflineDict, isOfflineDictReady, offlineDictPairs };
