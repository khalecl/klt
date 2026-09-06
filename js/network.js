/* Khutbah Live Translator — network.js
   Shared fetch wrapper and connectivity tracking.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const mergedOptions = { ...options, signal: controller.signal };
    return fetch(url, mergedOptions).then(res => {
        clearTimeout(timer);
        return res;
    }).catch(err => {
        clearTimeout(timer);
        throw err;
    });
}

// ── State ──
// [migrated → appState.audio.*, appState.translator.translations,
//            appState.ui.currentFontSize, appState.ui.tutStep] (js/state.js)

window.addEventListener('online', () => {
    isOnline = true;
    console.log('[Cache] Back online — refreshing stale data');
    if (typeof prayerLoaded !== 'undefined' && prayerLoaded && prayerTimesData) fetchPrayerTimes(true);
    if (duaData && duaData.duas && duaData.duas.length > 0) fetchDuasFromNetwork(true);
});
window.addEventListener('offline', () => { isOnline = false; console.log('[Cache] Offline — serving from cache'); });

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { fetchWithTimeout });

export { fetchWithTimeout };
