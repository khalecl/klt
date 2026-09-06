/* Khutbah Live Translator — quran/quran.js
   Surah loading, caching, rendering, translation-edition selection.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function getSelectedQuranEdition() {
    return document.getElementById('quranTransSelect').value || 'en.sahih';
}

function getQuranEditionLang() {
    // Extract 2-letter language code from edition identifier like "ur.jalandhry"
    return getSelectedQuranEdition().split('.')[0];
}

function isQuranTransRTL() {
    return QURAN_RTL_EDITIONS.includes(getQuranEditionLang());
}

// v4.6: Called when user changes translation language
function changeQuranTranslation() {
    const edition = getSelectedQuranEdition();
    localStorage.setItem('kht_quran_trans', edition);
    console.log('[v4.6] Quran translation changed to:', edition);

    // Reload current surah with new translation
    const num = document.getElementById('surahSelect').value;
    if (num) {
        // Check if we have this surah+edition cached
        const cacheKey = `${num}_${edition}`;
        if (quranCache[cacheKey]) {
            renderSurah(quranCache[cacheKey]);
        } else {
            // Need to fetch with new edition
            loadSurah();
        }
    }
}

function initSurahList() {
    const sel = document.getElementById('surahSelect');
    sel.innerHTML = '<option value="">— Select a Surah —</option>';
    SURAH_LIST.forEach((name, i) => { const opt = document.createElement('option'); opt.value = i + 1; opt.textContent = `${i + 1}. ${name}`; sel.appendChild(opt); });
    sel.value = '1';
    loadSurah();
}

async function loadSurah() {
    const num = document.getElementById('surahSelect').value;
    if (!num) return;

    // Stop any currently playing audio before loading new surah
    qaStop();

    const edition = getSelectedQuranEdition();
    const cacheKey = `${num}_${edition}`;
    const container = document.getElementById('quranContent');

    // In-memory cache (edition-specific)
    if (quranCache[cacheKey]) { renderSurah(quranCache[cacheKey]); return; }

    // localStorage cache (edition-specific, works offline)
    const cached = cacheGet(CACHE_KEYS.QURAN_PREFIX + cacheKey);
    if (cached) {
        quranCache[cacheKey] = cached;
        renderSurah(cached);
        console.log('[Cache] Quran surah', num, 'edition', edition, 'from offline cache');
        if (isOnline) fetchSurahFromAPI(num, edition, true);
        return;
    }

    if (!isOnline) {
        container.innerHTML = '<div class="quran-loading">📴 Offline.<br><small style="color:var(--text-dim)">Open this surah once while online to cache it.</small></div>';
        return;
    }

    container.innerHTML = '<div class="quran-loading"><div class="spinner"></div>Loading Surah...</div>';
    await fetchSurahFromAPI(num, edition, false);
}

async function fetchSurahFromAPI(num, edition, silent) {
    const container = document.getElementById('quranContent');
    const cacheKey = `${num}_${edition}`;
    try {
        // Always fetch Arabic text + selected translation
        // Transliteration is only available in English (en.transliteration)
        const fetches = [
            fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${num}`, {}, 12000),
            fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${num}/${edition}`, {}, 12000),
            fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${num}/en.transliteration`, {}, 12000)
        ];
        const [arRes, transRes, trRes] = await Promise.all(fetches);
        const arData = await arRes.json();
        const transData = await transRes.json();
        const trData = await trRes.json();

        if (arData.code === 200 && transData.code === 200) {
            const editionLang = edition.split('.')[0];
            const surahData = {
                name: arData.data.name,
                englishName: arData.data.englishName,
                englishNameTranslation: arData.data.englishNameTranslation,
                revelationType: arData.data.revelationType,
                numberOfAyahs: arData.data.numberOfAyahs,
                editionName: transData.data.edition?.name || edition,
                editionLang: editionLang,
                isTransRTL: QURAN_RTL_EDITIONS.includes(editionLang),
                ayahs: arData.data.ayahs.map((ayah, idx) => ({
                    number: ayah.numberInSurah,
                    arabic: ayah.text,
                    translation: transData.data.ayahs[idx]?.text || '',
                    transliteration: (trData.code === 200 && trData.data.ayahs[idx]?.text) || ''
                }))
            };
            quranCache[cacheKey] = surahData;
            cacheSet(CACHE_KEYS.QURAN_PREFIX + cacheKey, surahData);
            quranCacheTrack(cacheKey);
            if (!silent) renderSurah(surahData);
        } else if (!silent) {
            container.innerHTML = '<div class="quran-loading">Failed to load. Please try again.</div>';
        }
    } catch (e) {
        console.warn('[v4.6] Quran fetch error:', e.message);
        if (!silent) container.innerHTML = '<div class="quran-loading">Network error. Check your connection.</div>';
    }
}

function renderSurah(data) {
    const container = document.getElementById('quranContent');
    const transRTL = data.isTransRTL || false;

    let html = `
        <div class="surah-header">
            <div class="bismillah">${data.name}</div>
            <div style="font-size:16px;color:var(--cream);font-weight:500;margin-bottom:4px">${data.englishName}</div>
            <div class="surah-info">${data.englishNameTranslation} · ${data.revelationType} · ${data.numberOfAyahs} Ayahs</div>
            ${data.editionName ? `<div class="surah-info" style="margin-top:4px;color:var(--gold);opacity:.7">📖 ${data.editionName}</div>` : ''}
        </div>
    `;

    data.ayahs.forEach(ayah => {
        html += `<div class="ayah-card" id="ayah-${ayah.number}" data-ayah="${ayah.number}">`;
        html += `<button class="ayah-play-btn" onclick="qaToggleAyahPlay(${ayah.number})" title="Play from Ayah ${ayah.number}">▶</button>`;
        html += `<div class="ayah-num">${ayah.number}</div>`;
        if (qShowArabic) html += `<div class="ayah-arabic">${ayah.arabic}</div>`;
        if (qShowTranslit && ayah.transliteration) html += `<div class="ayah-translit">${ayah.transliteration}</div>`;
        if (qShowTrans) html += `<div class="ayah-trans${transRTL ? ' trans-rtl' : ''}">${ayah.translation}</div>`;
        html += `</div>`;
    });

    container.innerHTML = html;
    if (qaState.playing && qaState.surahNum == document.getElementById('surahSelect').value) qaHighlightAyah(qaState.currentAyah);
}

function toggleQView(btn) {
    btn.classList.toggle('on');
    qShowArabic = document.getElementById('qShowArabic').classList.contains('on');
    qShowTranslit = document.getElementById('qShowTranslit').classList.contains('on');
    qShowTrans = document.getElementById('qShowTrans').classList.contains('on');
    const num = document.getElementById('surahSelect').value;
    const edition = getSelectedQuranEdition();
    const cacheKey = `${num}_${edition}`;
    if (num && quranCache[cacheKey]) renderSurah(quranCache[cacheKey]);
}


// ══════════════════════════════════════════════
// QURAN AUDIO PLAYER
// ══════════════════════════════════════════════
// [migrated → appState.quran.player] (js/state.js — defaults preserved verbatim)


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { getSelectedQuranEdition, getQuranEditionLang, isQuranTransRTL, changeQuranTranslation, initSurahList, loadSurah, fetchSurahFromAPI, renderSurah, toggleQView });

export { getSelectedQuranEdition, getQuranEditionLang, isQuranTransRTL, changeQuranTranslation, initSurahList, loadSurah, fetchSurahFromAPI, renderSurah, toggleQView };
