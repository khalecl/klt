/* Khutbah Live Translator — providers/mymemory.js
   MyMemory adapter (incl. Italian false-positive guard).
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

/* v5.1: MyMemory accepts ~500 bytes per request; Arabic is 2 bytes/letter.
   Split at word boundaries into ≤450-byte chunks, translate each, join.
   If any chunk fails, the whole call fails (next provider is tried). */
function mmChunks(text, maxBytes) {
    const enc = new TextEncoder(), words = text.split(/\s+/), out = [];
    let cur = '';
    for (const w of words) {
        const next = cur ? cur + ' ' + w : w;
        if (enc.encode(next).length > maxBytes && cur) { out.push(cur); cur = w; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
}

async function tryMyMemoryOne(text, src, tgt) {
    try { const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${src}|${tgt}&de=khaled.mohamed.rady@outlook.com`; const res = await fetchWithTimeout(url, {}, 8000); const data = await res.json(); if (data.quotaFinished) { console.warn('[mymemory] daily quota finished'); return null; } if (data.responseStatus === 200 && data.responseData?.translatedText) { const trans = data.responseData.translatedText; if (/^MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(trans)) return null; if (tgt !== 'it' && isLikelyItalian(trans, text)) return null; if (trans.trim().toLowerCase() === text.trim().toLowerCase()) return null; return trans; } } catch(e) {}
    return null;
}

async function tryMyMemory(text, src, tgt) {
    const parts = mmChunks(text, 450), out = [];
    for (const p of parts) {
        const r = await tryMyMemoryOne(p, src, tgt);
        if (!r) { apiStats.mmFail++; return null; }
        out.push(r);
    }
    apiStats.mmOk++;
    return out.join(' ');
}

function isLikelyItalian(trans, orig) { const italianMarkers = ['ciao', 'mondo', 'buon', 'giorno', 'grazie', 'prego', 'della', 'nella']; const lower = trans.toLowerCase(); return italianMarkers.some(m => lower.includes(m)) && !orig.toLowerCase().includes(lower.substring(0, 5)); }


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { tryMyMemory, isLikelyItalian, mmChunks });

export { tryMyMemory, isLikelyItalian, mmChunks };
