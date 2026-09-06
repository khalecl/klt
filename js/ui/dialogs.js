/* Khutbah Live Translator — ui/dialogs.js
   Tutorial overlay and theme/skin selector.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function changeSkin(skinId, btn) {
    if (!VALID_SKINS.includes(skinId)) skinId = 'masjid-night';
    // Apply to <html> element so CSS [data-skin] selectors work
    if (skinId === 'masjid-night') {
        document.documentElement.removeAttribute('data-skin');
    } else {
        document.documentElement.setAttribute('data-skin', skinId);
    }
    // Update theme-color meta tag for mobile browsers
    const themeColors = {
        'masjid-night': '#0f3d24',
        'desert-sand': '#2c1810',
        'midnight-blue': '#0f1d38',
        'ottoman-rose': '#2a0a14',
        'pure-light': '#e8e0d0',
        'royal-purple': '#1a0a2e'
    };
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = themeColors[skinId] || '#0f3d24';
    // Update UI: highlight active chip
    document.querySelectorAll('.skin-chip').forEach(c => c.classList.remove('on'));
    if (btn) btn.classList.add('on');
    else {
        const chip = document.querySelector(`.skin-chip[data-skin="${skinId}"]`);
        if (chip) chip.classList.add('on');
    }
    // Persist
    localStorage.setItem('kht_skin', skinId);
    console.log('[Skin] Applied:', skinId);
}

function initSkin() {
    const saved = localStorage.getItem('kht_skin') || 'masjid-night';
    changeSkin(saved, null);
}

// ── Platform Detection ──

function buildTutDots() {
    const c = document.getElementById('tutDots'); c.innerHTML = '';
    // Build dots for steps 0-6 (language + 6 tutorial steps)
    for (let i = 0; i <= TUT_TOTAL; i++) {
        const d = document.createElement('div');
        d.className = 'tut-dot' + (i === 0 ? ' on' : '');
        d.dataset.d = i; c.appendChild(d);
    }
}

function showTut() {
    tutStep = 0; // Always start at language selection
    updTut();
    document.getElementById('tutOverlay').classList.add('on');
    // Populate tutorial language selector if not already done
    populateTutLangSelect();
}

function closeTut() { document.getElementById('tutOverlay').classList.remove('on'); localStorage.setItem('kht_tut_v4', '1'); }

function prevTut() { if (tutStep > 1) { tutStep--; updTut(); } }
function nextTut() { if (tutStep < TUT_TOTAL) { tutStep++; updTut(); } else closeTut(); }
function updTut() {
    document.querySelectorAll('.tut-step').forEach(s => { s.classList.toggle('on', +s.dataset.s === tutStep); });
    document.querySelectorAll('.tut-dot').forEach(d => { const n = +d.dataset.d; d.className = 'tut-dot' + (n === tutStep ? ' on' : n < tutStep ? ' done' : ''); });
    const btn = document.getElementById('tutNext');
    btn.textContent = tutStep === TUT_TOTAL ? t('tutStart') : t('tutNext');
    btn.className = 'tut-btn ' + (tutStep === TUT_TOTAL ? 'go' : 'next');
    const backBtn = document.getElementById('tutBack');
    backBtn.style.display = tutStep > 1 ? '' : 'none';
    backBtn.textContent = t('tutBack');
}
// Handle language selection in tutorial
function onTutLangSelect(lang) {
    if (!lang) return;
    // Apply the selected language immediately
    changeUILang(lang);
    // Update the settings dropdown if it exists
    const uiSel = document.getElementById('uiLangSelect');
    if (uiSel) {
        uiSel.value = lang;
    }
}

// Populate tutorial language selector from available languages


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { changeSkin, initSkin, buildTutDots, showTut, closeTut, prevTut, nextTut, updTut, onTutLangSelect });

export { changeSkin, initSkin, buildTutDots, showTut, closeTut, prevTut, nextTut, updTut, onTutLangSelect };
