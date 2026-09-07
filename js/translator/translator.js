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
    if (txCache.has(cacheKey)) { apiStats.cacheHit++; const cached = txCache.get(cacheKey); addEntry(text, cached); updApiUI(); try { if (typeof window.addSourceSegment === 'function') window.addSourceSegment(text); if (typeof window.addTranslationPair === 'function') window.addTranslationPair(text, cached); } catch (e) {} txEmit('translation-success', { text: text, translated: cached, provider: 'cache' }); return; }
    document.getElementById('loader').classList.add('on');
    txEmit('translation-start', { text: text, source: src, target: tgt });
    try { if (typeof window.addSourceSegment === 'function') window.addSourceSegment(text); } catch (e) {}
    let result = null;
    let provider = null;
    const validationWarnings = [];

    /* Accept a provider result only if it survives validation. A response that
       is empty, HTML, an error string, identical to the source or otherwise
       malformed is treated as a FAILURE so the next provider is tried — see
       js/translator/validation.js. Never repaired, only accepted or rejected. */
    const accept = function (candidate, name) {
        if (!candidate) return false;
        if (typeof window.validateTranslation !== 'function') {
            result = candidate; provider = name; return true;      // module absent: prior behaviour
        }
        const v = window.validateTranslation(candidate, text, { sameLanguage: src === tgt });
        if (!v.valid) {
            console.warn('[translate] ' + name + ' rejected — ' + v.reason);
            txEmit('translation-rejected', { provider: name, reason: v.reason });
            return false;
        }
        if (v.warnings && v.warnings.length) validationWarnings.push.apply(validationWarnings, v.warnings);
        result = candidate; provider = name; return true;
    };

    const engine = cfg.engine;
    if (engine === 'auto' || engine === 'lingva') accept(await tryLingva(text, src, tgt), 'lingva');
    if (!result && (engine === 'auto' || engine === 'mymemory')) accept(await tryMyMemory(text, src, tgt), 'mymemory');
    if (!result && engine === 'auto') accept(await tryLibre(text, src, tgt), 'libretranslate');
    if (!result) {
        // All engines failed — likely rate-limited. Back off and retry once.
        console.warn('[v4.6] All engines failed, retrying after 2.5s backoff...');
        await new Promise(r => setTimeout(r, 2500));
        lastTxApiCall = Date.now();
        txEmit('translation-retry', { text: text });
        if (!accept(await tryLingva(text, src, tgt), 'retry')) {
            accept(await tryMyMemory(text, src, tgt), 'retry');
        }
    }
    // Final fallback: AI, only when a backend endpoint has been configured.
    // Inactive by default, so the existing chain is unchanged out of the box.
    if (!result && typeof window.isAIAvailable === 'function' && window.isAIAvailable()) {
        accept(await window.tryAI(text, src, tgt), 'ai');
    }
    document.getElementById('loader').classList.remove('on');
    if (result) { txCache.set(cacheKey, result); if (txCache.size > 500) { const firstKey = txCache.keys().next().value; txCache.delete(firstKey); } addEntry(text, result); try { if (typeof window.addTranslationPair === 'function') window.addTranslationPair(text, result); } catch (e) {} txEmit('translation-success', { text: text, translated: result, provider: provider, warnings: validationWarnings }); }
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
