/* Khutbah Live Translator — providers/libretranslate.js
   LibreTranslate adapter.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

async function tryLibre(text, src, tgt) {
    for (const host of LIBRE_HOSTS) { try { const res = await fetchWithTimeout(`${host}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, source: src, target: tgt, format: 'text' }) }, 8000); if (!res.ok) continue; const data = await res.json(); if (data.translatedText && data.translatedText.trim()) { apiStats.lingvaOk++; return data.translatedText; } } catch(e) {} }
    return null;
}


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { tryLibre });

export { tryLibre };
