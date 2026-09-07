/* Khutbah Live Translator — providers/mymemory.js
   MyMemory adapter (incl. Italian false-positive guard).
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

async function tryMyMemory(text, src, tgt) {
    try { const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}&de=khaled.mohamed.rady@outlook.com`; const res = await fetchWithTimeout(url, {}, 8000); const data = await res.json(); if (data.responseStatus === 200 && data.responseData?.translatedText) { const trans = data.responseData.translatedText; if (tgt !== 'it' && isLikelyItalian(trans, text)) { apiStats.mmFail++; return null; } if (trans.trim().toLowerCase() === text.trim().toLowerCase()) { apiStats.mmFail++; return null; } apiStats.mmOk++; return trans; } } catch(e) { apiStats.mmFail++; }
    return null;
}

function isLikelyItalian(trans, orig) { const italianMarkers = ['ciao', 'mondo', 'buon', 'giorno', 'grazie', 'prego', 'della', 'nella']; const lower = trans.toLowerCase(); return italianMarkers.some(m => lower.includes(m)) && !orig.toLowerCase().includes(lower.substring(0, 5)); }


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { tryMyMemory, isLikelyItalian });

export { tryMyMemory, isLikelyItalian };
