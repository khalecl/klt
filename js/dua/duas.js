/* Khutbah Live Translator — dua/duas.js
   Du'a loading, cache, category filtering, rendering. duas.json shape unchanged.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

async function loadDuasFromJSON() {
    const container = document.getElementById('duaContent'), filterBar = document.getElementById('duaFilterBar');
    const cached = cacheGet(CACHE_KEYS.DUAS);
    if (cached) { duaData = cached; buildDuaUI(filterBar); renderDuas('all'); console.log('[Cache] Du\'as from offline cache'); if (isOnline) fetchDuasFromNetwork(true); return; }
    if (!isOnline) { container.innerHTML = '<div class="quran-loading">📴 Offline — Du\'as will be cached when you open this tab online.</div>'; return; }
    await fetchDuasFromNetwork(false);
}

async function fetchDuasFromNetwork(silent) {
    const container = document.getElementById('duaContent'), filterBar = document.getElementById('duaFilterBar');
    try { const res = await fetchWithTimeout(DUAS_JSON_URL, {}, 10000); if (!res.ok) throw new Error(`HTTP ${res.status}`); duaData = await res.json(); cacheSet(CACHE_KEYS.DUAS, duaData); if (!silent) { buildDuaUI(filterBar); renderDuas('all'); } }
    catch (e) { console.warn('Failed to load duas.json:', e.message); if (!silent) { const fallback = cacheGet(CACHE_KEYS.DUAS); if (fallback) { duaData = fallback; buildDuaUI(filterBar); renderDuas('all'); return; } container.innerHTML = `<div class="quran-loading">Could not load Du'as.<br><button class="bar-btn" onclick="loadDuasFromJSON()" style="margin:0 auto">🔄 Retry</button></div>`; filterBar.innerHTML = '<button class="dua-tag on" onclick="filterDua(\'all\',this)">All</button>'; } }
}

function buildDuaUI(filterBar) { let html = '<button class="dua-tag on" onclick="filterDua(\'all\',this)">All</button>'; duaData.categories.forEach(cat => { html += `<button class="dua-tag" onclick="filterDua('${cat.id}',this)">${cat.icon || ''} ${cat.label}</button>`; }); filterBar.innerHTML = html; }

function renderDuas(filter) {
    filter = filter || 'all'; const container = document.getElementById('duaContent');
    const filtered = filter === 'all' ? duaData.duas : duaData.duas.filter(d => d.cat === filter);
    if (!filtered.length) { container.innerHTML = '<div class="quran-loading">No du\'as in this category yet.</div>'; return; }
    container.innerHTML = filtered.map(d => `<div class="dua-card"><div class="dua-title">${d.title}<span class="dua-cat">${d.cat}</span></div><div class="dua-arabic">${d.arabic}</div><div class="dua-translit">${d.transliteration}</div><div class="dua-meaning">${d.meaning}</div><div class="dua-ref">📚 ${d.reference}</div></div>`).join('');
}

function filterDua(cat, btn) { currentDuaFilter = cat; document.querySelectorAll('.dua-tag').forEach(t => t.classList.remove('on')); btn.classList.add('on'); renderDuas(cat); }

// ══════════════════════════════════════════════
// PRAYER TIMES (AlAdhan API)
// ══════════════════════════════════════════════
// [migrated → appState.prayer.timesData / appState.prayer.userCoords] (js/state.js)


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { loadDuasFromJSON, fetchDuasFromNetwork, buildDuaUI, renderDuas, filterDua });

export { loadDuasFromJSON, fetchDuasFromNetwork, buildDuaUI, renderDuas, filterDua };
