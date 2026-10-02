/* Khutbah Live Translator — providers/gtx.js   (v5.1, additive)
   Google Translate free web endpoint. No key. Called directly from the
   listener's phone, so each user has their own allowance. */
async function tryGtx(text, src, tgt) {
    try {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t'
            + '&sl=' + encodeURIComponent(src) + '&tl=' + encodeURIComponent(tgt)
            + '&q=' + encodeURIComponent(text.slice(0, 1800));
        const res = await fetchWithTimeout(url, {}, 6000);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const out = (data[0] || []).map(s => s && s[0] ? s[0] : '').join('').trim();
        if (out) { apiStats.gtxOk = (apiStats.gtxOk || 0) + 1; return out; }
    } catch (e) { apiStats.gtxFail = (apiStats.gtxFail || 0) + 1; }
    return null;
}
Object.assign(window, { tryGtx });
export { tryGtx };
