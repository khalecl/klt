/* Khutbah Live Translator — providers/lingva.js
   Lingva adapter.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function truncateForUrl(text, maxChars) { if (text.length <= maxChars) return text; const trimmed = text.substring(0, maxChars); const lastSpace = trimmed.lastIndexOf(' '); return lastSpace > maxChars * 0.5 ? trimmed.substring(0, lastSpace) : trimmed; }

async function tryLingva(text, src, tgt) {
    const safeText = truncateForUrl(text, 800);
    for (let attempt = 0; attempt < LINGVA_HOSTS.length; attempt++) {
        const host = LINGVA_HOSTS[(lingvaIdx + attempt) % LINGVA_HOSTS.length];
        try { const url = `${host}/api/v1/${src}/${tgt}/${encodeURIComponent(safeText)}`; const res = await fetchWithTimeout(url, { mode: 'cors' }, 6000); if (!res.ok) throw new Error(res.status); const data = await res.json(); if (data.translation && data.translation.trim()) { apiStats.lingvaOk++; lingvaIdx = (lingvaIdx + attempt) % LINGVA_HOSTS.length; return data.translation; } } catch(e) { apiStats.lingvaFail++; }
    }
    return null;
}


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { truncateForUrl, tryLingva });

export { truncateForUrl, tryLingva };
