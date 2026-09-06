/* Khutbah Live Translator — ui/notifications.js
   Transcript rendering, API status badge, export and feedback.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function updApiUI() {
    const dot = document.getElementById('apiDot'), label = document.getElementById('apiLabel');
    const total = apiStats.lingvaOk + apiStats.mmOk + apiStats.cacheHit, fails = apiStats.lingvaFail + apiStats.mmFail;
    if (fails === 0 || total > fails * 3) { dot.className = 'api-dot ok'; label.textContent = `API OK · ${total} translated`; }
    else if (total > fails) { dot.className = 'api-dot warn'; label.textContent = `Fallback active · ${total} ok`; }
    else { dot.className = 'api-dot err'; label.textContent = `API issues · ${fails} errors`; }
}

// ══════════════════════════════════════════════
// TRANSLATION DISPLAY
// ══════════════════════════════════════════════
// Escape text before it is placed into innerHTML. Recognized speech and
// third-party translation API responses are untrusted strings.
function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function addEntry(orig, trans) {
    if (translations.some(t => t.orig === orig.trim() && t.text === trans.trim())) return;
    translations.push({ orig: orig.trim(), text: trans.trim(), time: new Date().toLocaleTimeString() });
    renderTranslations();
}

function renderTranslations() {
    const box = document.getElementById('outBox');
    const tgt = document.getElementById('tgtLang').value;
    const isRtl = RTL_LANGS.includes(tgt);
    if (!translations.length) { box.innerHTML = '<div class="empty-msg"><span class="icon">🕌</span>' + t('emptyMsg').replace('\n','<br>') + '</div>'; return; }
    box.innerHTML = translations.map((entry, i) => {
        const isLast = i === translations.length - 1;
        let cls = 'sent' + (isRtl ? ' rtl' : '') + (isLast && cfg.highlight ? ' latest' : '');
        let html = escHtml(entry.text);
        if (cfg.showOrig && entry.orig !== entry.text) html = `<div style="opacity:.45;font-size:.85em;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:6px">${escHtml(entry.orig)}</div>${escHtml(entry.text)}`;
        return `<div class="${cls}">${html}</div>`;
    }).join('');
    if (cfg.autoScroll) box.scrollTop = box.scrollHeight;
}

// ══════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════
function adjFont(d) { currentFontSize = Math.max(12, Math.min(36, currentFontSize + d)); document.documentElement.style.setProperty('--font-size', currentFontSize + 'px'); document.getElementById('fontVal').textContent = currentFontSize + 'px'; }
function clearAll() { if (!translations.length || confirm(t('clearConfirm'))) { translations = []; renderTranslations(); } }
function saveText() {
    if (!translations.length) { alert(t('noTranslations')); return; }
    const lines = translations.map(t => { let line = `[${t.time}] ${t.text}`; if (cfg.showOrig) line = `[${t.time}]\nOriginal: ${t.orig}\nTranslation: ${t.text}`; return line; }).join('\n\n');
    const header = `Khutbah Translation — ${new Date().toLocaleDateString()}\n${'═'.repeat(40)}\n\n`;
    const blob = new Blob([header + lines], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `khutbah-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(a.href);
}

function sendFB() {
    const name = document.getElementById('fbName').value.trim(), email = document.getElementById('fbEmail').value.trim(), type = document.getElementById('fbType').value, msg = document.getElementById('fbMsg').value.trim();
    if (!name || !email || !type || !msg) { alert('Please fill all fields'); return; }
    const body = `*Khutbah v5 Feedback*%0A%0AName: ${encodeURIComponent(name)}%0AEmail: ${encodeURIComponent(email)}%0AType: ${encodeURIComponent(type)}%0A%0AMessage:%0A${encodeURIComponent(msg)}`;
    window.open(`https://wa.me/201227822099?text=${body}`, '_blank');
    ['fbName','fbEmail','fbMsg'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('fbType').value = '';
}

// ══════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { updApiUI, escHtml, addEntry, renderTranslations, adjFont, clearAll, saveText, sendFB });

export { updApiUI, escHtml, addEntry, renderTranslations, adjFont, clearAll, saveText, sendFB };
