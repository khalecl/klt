/* Khutbah Live Translator — translator/translator.js
   Orchestrator: cache -> provider selection -> fallback -> state.
   Contains no provider URLs (see providers/).
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

/** Announce translation progress. Fire-and-forget. */
function txEmit(name, detail) {
    try { window.dispatchEvent(new CustomEvent('khutbah:' + name, { detail: detail })); }
    catch (e) {}
}

async function doTranslate(text) {
    if (!text?.trim()) return;
    const last = translations[translations.length - 1];
    if (last?.orig === text.trim()) return;
    const src = document.getElementById('srcLang').value.split('-')[0];
    const tgt = document.getElementById('tgtLang').value;
    if (src === tgt) { addEntry(text, text); return; }
    const cacheKey = `${src}|${tgt}|${text.trim().toLowerCase()}`;
    if (txCache.has(cacheKey)) { apiStats.cacheHit++; addEntry(text, txCache.get(cacheKey)); updApiUI(); txEmit('translation-success', { text: text, provider: 'cache' }); return; }
    document.getElementById('loader').classList.add('on');
    txEmit('translation-start', { text: text, source: src, target: tgt });
    let result = null;
    let provider = null;
    const engine = cfg.engine;
    if (engine === 'auto' || engine === 'lingva') { result = await tryLingva(text, src, tgt); if (result) provider = 'lingva'; }
    if (!result && (engine === 'auto' || engine === 'mymemory')) { result = await tryMyMemory(text, src, tgt); if (result) provider = 'mymemory'; }
    if (!result && engine === 'auto') { result = await tryLibre(text, src, tgt); if (result) provider = 'libretranslate'; }
    if (!result) {
        // All engines failed — likely rate-limited. Back off and retry once.
        console.warn('[v4.6] All engines failed, retrying after 2.5s backoff...');
        await new Promise(r => setTimeout(r, 2500));
        lastTxApiCall = Date.now();
        txEmit('translation-retry', { text: text });
        result = await tryLingva(text, src, tgt) || await tryMyMemory(text, src, tgt);
        if (result) provider = 'retry';
    }
    document.getElementById('loader').classList.remove('on');
    if (result) { txCache.set(cacheKey, result); if (txCache.size > 500) { const firstKey = txCache.keys().next().value; txCache.delete(firstKey); } addEntry(text, result); txEmit('translation-success', { text: text, translated: result, provider: provider }); }
    else { addEntry(text, '⚠️ Translation unavailable — ' + text); txEmit('translation-error', { text: text }); }
    updApiUI();
}
// ══════════════════════════════════════════════
// TRANSLATION QUEUE — rate-limit + sentence aggregation
// Collects speech fragments, merges short ones into full
// sentences, adds punctuation on pause-flush, and sends
// to the API no faster than TX_MIN_INTERVAL to avoid
// server rate-limit drops.
// ══════════════════════════════════════════════
// [migrated → appState.translator.txQueue / .txProcessing / .lastTxApiCall] (js/state.js)


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { doTranslate });

export { doTranslate };
