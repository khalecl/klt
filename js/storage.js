/* Khutbah Live Translator — storage.js
   localStorage cache + settings persistence. Keys unchanged.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function cacheSet(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) {
        console.warn('[Cache] Storage full, evicting old quran caches');
        evictOldQuranCache();
        try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch(e2) {}
    }
}
function cacheGet(key, maxAgeMs) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (maxAgeMs && (Date.now() - parsed.ts > maxAgeMs)) return null;
        return parsed.data;
    } catch(e) { return null; }
}
function evictOldQuranCache() {
    try {
        const idx = JSON.parse(localStorage.getItem(CACHE_KEYS.QURAN_INDEX) || '[]');
        while (idx.length > 20) {
            const old = idx.shift();
            localStorage.removeItem(CACHE_KEYS.QURAN_PREFIX + old);
        }
        localStorage.setItem(CACHE_KEYS.QURAN_INDEX, JSON.stringify(idx));
    } catch(e) {}
}
function quranCacheTrack(cacheKey) {
    try {
        let idx = JSON.parse(localStorage.getItem(CACHE_KEYS.QURAN_INDEX) || '[]');
        idx = idx.filter(n => n !== cacheKey);
        idx.push(cacheKey);
        if (idx.length > 30) {
            const old = idx.shift();
            localStorage.removeItem(CACHE_KEYS.QURAN_PREFIX + old);
        }
        localStorage.setItem(CACHE_KEYS.QURAN_INDEX, JSON.stringify(idx));
    } catch(e) {}
}

// [migrated → appState.session.isOnline] (js/state.js)

function loadSettings() { try { const s = localStorage.getItem('kht_cfg_v3'); if (s) cfg = { ...cfg, ...JSON.parse(s) }; } catch(e) {} applySettings(); }
function applySettings() {
    document.getElementById('sInstant').checked = cfg.instant; document.getElementById('sAutoScroll').checked = cfg.autoScroll;
    document.getElementById('sHighlight').checked = cfg.highlight; document.getElementById('sShowOrig').checked = cfg.showOrig;
    document.getElementById('sThresh').value = cfg.threshold; document.getElementById('threshVal').textContent = cfg.threshold;
    document.getElementById('sWakeLock').checked = cfg.wakeLock; document.getElementById('sNoiseFilter').checked = cfg.noiseFilter;
    document.getElementById('sGain').value = cfg.voiceGain; document.getElementById('gainVal').textContent = cfg.voiceGain;
    document.getElementById('sGate').value = cfg.noiseGate; document.getElementById('gateVal').textContent = cfg.noiseGate;
    document.getElementById('sBuffer').value = cfg.bufferTime; document.getElementById('bufferVal').textContent = cfg.bufferTime;
    document.getElementById('sSilence').value = cfg.silenceWait; document.getElementById('silenceVal').textContent = cfg.silenceWait;
    document.querySelectorAll('input[name=engine]').forEach(r => { r.checked = r.value === cfg.engine; });
}
function saveSettings(silent) {
    cfg.instant = document.getElementById('sInstant').checked; cfg.autoScroll = document.getElementById('sAutoScroll').checked;
    cfg.highlight = document.getElementById('sHighlight').checked; cfg.showOrig = document.getElementById('sShowOrig').checked;
    cfg.threshold = parseInt(document.getElementById('sThresh').value); cfg.wakeLock = document.getElementById('sWakeLock').checked;
    cfg.engine = document.querySelector('input[name=engine]:checked')?.value || 'auto';
    cfg.bufferTime = parseInt(document.getElementById('sBuffer').value); cfg.silenceWait = parseFloat(document.getElementById('sSilence').value);
    cfg.noiseFilter = document.getElementById('sNoiseFilter').checked; cfg.voiceGain = parseFloat(document.getElementById('sGain').value);
    cfg.noiseGate = parseInt(document.getElementById('sGate').value);
    if (audioNodes.gain) audioNodes.gain.gain.value = cfg.voiceGain;
    try { localStorage.setItem('kht_cfg_v3', JSON.stringify(cfg)); } catch(e) {}renderTranslations(); // Re-render so showOrig/highlight changes apply immediately
    if (!silent)alert('Settings saved ✓\nNoise filter & gate changes take effect next time you start listening.');
}


// ══════════════════════════════════════════════
// QURAN TAB — v4.6: Multi-Language Translation
// ══════════════════════════════════════════════


// ══════════════════════════════════════════════
// INDEXEDDB PRIMITIVES (generic)
//
// Promise wrappers around IndexedDB. These know nothing about khutbah
// sessions, Quran, or any feature — they are the same kind of generic
// persistence abstraction as cacheSet/cacheGet above, just for a store
// that outgrows localStorage. Feature-specific schema lives in the
// feature module that owns it.
// ══════════════════════════════════════════════

/** True when IndexedDB is usable in this context (absent in private modes / old WebViews). */
function idbAvailable() {
    try { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
    catch (e) { return false; }
}

/** Promisify an IDBRequest. */
function idbRequest(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
    });
}

/**
 * Open (and if needed upgrade) a database.
 * `upgrade(db, oldVersion, newVersion, transaction)` runs inside onupgradeneeded.
 */
function idbOpen(name, version, upgrade) {
    return new Promise((resolve, reject) => {
        if (!idbAvailable()) { reject(new Error('IndexedDB unavailable')); return; }
        let req;
        try { req = indexedDB.open(name, version); }
        catch (e) { reject(e); return; }

        req.onupgradeneeded = (e) => {
            try {
                if (typeof upgrade === 'function') {
                    upgrade(req.result, e.oldVersion, e.newVersion, req.transaction);
                }
            } catch (err) {
                console.error('[storage] IndexedDB upgrade failed', err);
                try { req.transaction.abort(); } catch (e2) {}
                reject(err);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
        req.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'));
    });
}

/** Run `fn(store)` inside a transaction and resolve when it commits. */
function idbTransaction(db, storeName, mode, fn) {
    return new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction(storeName, mode); }
        catch (e) { reject(e); return; }
        const store = tx.objectStore(storeName);
        let result;
        try { result = fn(store); }
        catch (e) { try { tx.abort(); } catch (e2) {} reject(e); return; }
        tx.oncomplete = () => resolve(result && result.then ? undefined : result);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        if (result && typeof result.then === 'function') {
            result.then(r => { result = r; }).catch(reject);
        }
    });
}

/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, {
    cacheSet, cacheGet, evictOldQuranCache, quranCacheTrack,
    loadSettings, applySettings, saveSettings,
    idbAvailable, idbOpen, idbRequest, idbTransaction
});

export {
    cacheSet, cacheGet, evictOldQuranCache, quranCacheTrack,
    loadSettings, applySettings, saveSettings,
    idbAvailable, idbOpen, idbRequest, idbTransaction
};
