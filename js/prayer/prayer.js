/* Khutbah Live Translator — prayer/prayer.js
   Geolocation, AlAdhan timings, caching, countdown, methods.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

async function fetchPrayerTimes(silentRefresh) {
    const method = document.getElementById('prayerMethod').value, locEl = document.getElementById('prayerLocation');
    if (!isOnline && !silentRefresh) { const cp = cacheGet(CACHE_KEYS.PRAYER_DATA); const cc = cacheGet(CACHE_KEYS.PRAYER_COORDS); if (cp) { prayerTimesData = cp; if (cc) userCoords = cc; renderPrayerTimes(cp); locEl.textContent = '📴 Offline — showing cached prayer times'; return; } locEl.textContent = '📴 Offline — no cached prayer data yet.'; return; }
    try {
        if (!userCoords) { const cc = cacheGet(CACHE_KEYS.PRAYER_COORDS); if (cc) userCoords = cc; else { if (!navigator.geolocation) { locEl.textContent = '📍 Geolocation not supported.'; const cp = cacheGet(CACHE_KEYS.PRAYER_DATA); if (cp) { prayerTimesData = cp; renderPrayerTimes(cp); } return; } if (!silentRefresh) locEl.textContent = t('prayerDetecting'); const pos = await new Promise((resolve, reject) => { navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }); }); userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; cacheSet(CACHE_KEYS.PRAYER_COORDS, userCoords); } }
        const url = `https://api.aladhan.com/v1/timings?latitude=${userCoords.lat}&longitude=${userCoords.lng}&method=${method}`;
        const res = await fetchWithTimeout(url, {}, 10000); const data = await res.json();
        if (data.code === 200) { prayerTimesData = data.data; cacheSet(CACHE_KEYS.PRAYER_DATA, data.data); cacheSet(CACHE_KEYS.PRAYER_METHOD, method); renderPrayerTimes(data.data); try { const geoRes = await fetchWithTimeout(`https://api.aladhan.com/v1/qibla/${userCoords.lat}/${userCoords.lng}`, {}, 8000); const geoData = await geoRes.json(); locEl.textContent = `📍 ${userCoords.lat.toFixed(2)}°, ${userCoords.lng.toFixed(2)}° • Qibla: ${geoData.data?.direction?.toFixed(1) || '—'}°`; } catch(e) { locEl.textContent = `📍 ${userCoords.lat.toFixed(2)}°, ${userCoords.lng.toFixed(2)}°`; } }
    } catch (e) {
        if (e.code === 1 || e.code === 2 || e.code === 3) { const msgs = { 1:'📍 Location denied.', 2:'📍 Location unavailable.', 3:'📍 Location timed out.' }; locEl.textContent = msgs[e.code] || '📍 Location error.'; const cc = cacheGet(CACHE_KEYS.PRAYER_COORDS); if (cc && !userCoords) { userCoords = cc; return fetchPrayerTimes(silentRefresh); } }
        else locEl.textContent = '⚠️ Could not load prayer times.';
        const cp = cacheGet(CACHE_KEYS.PRAYER_DATA); if (cp && !silentRefresh) { prayerTimesData = cp; renderPrayerTimes(cp); locEl.textContent += ' (cached)'; }
    }
}

function renderPrayerTimes(data) {
    const timings = data.timings; const prayers = ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'];
    const arabicNames = { Fajr:'الفجر', Sunrise:'الشروق', Dhuhr:'الظهر', Asr:'العصر', Maghrib:'المغرب', Isha:'العشاء' };
    const prayerIcons = { Fajr:'🌅', Sunrise:'☀️', Dhuhr:'🌤️', Asr:'🌇', Maghrib:'🌆', Isha:'🌙' };
    const iqamaOffsets = { Fajr:20, Dhuhr:15, Asr:15, Maghrib:5, Isha:15 };
    prayers.forEach(p => { const el = document.getElementById('pt' + p); if (el) el.textContent = timings[p] || '--:--'; const iqEl = document.getElementById('iq' + p); if (iqEl && iqamaOffsets[p] && timings[p]) { const [h, m] = timings[p].split(':').map(Number); const iqMins = h * 60 + m + iqamaOffsets[p]; iqEl.textContent = 'Iqama ' + String(Math.floor(iqMins / 60) % 24).padStart(2,'0') + ':' + String(iqMins % 60).padStart(2,'0'); } });
    const now = new Date(); const nowMins = now.getHours() * 60 + now.getMinutes();
    let nextPrayer = null, nextPrayerMins = null, prevPrayerMins = null;
    const prayerMins = {}; prayers.forEach(p => { if (timings[p]) { const [h, m] = timings[p].split(':').map(Number); prayerMins[p] = h * 60 + m; } });
    for (const p of prayers) { if (prayerMins[p] !== undefined && prayerMins[p] > nowMins) { nextPrayer = p; nextPrayerMins = prayerMins[p]; break; } }
    if (!nextPrayer) { nextPrayer = 'Fajr'; nextPrayerMins = prayerMins['Fajr'] + 24 * 60; }
    const prayerKeys = Object.keys(prayerMins); for (let i = prayerKeys.length - 1; i >= 0; i--) { if (prayerMins[prayerKeys[i]] <= nowMins) { prevPrayerMins = prayerMins[prayerKeys[i]]; break; } }
    if (prevPrayerMins === null) prevPrayerMins = prayerMins['Isha'] ? prayerMins['Isha'] - 24 * 60 : nowMins;
    document.querySelectorAll('.prayer-row').forEach(row => { row.classList.remove('next', 'passed'); const pName = row.dataset.prayer; if (pName === nextPrayer) row.classList.add('next'); else if (prayerMins[pName] !== undefined && prayerMins[pName] <= nowMins) row.classList.add('passed'); });
    document.getElementById('prayerHeroName').textContent = nextPrayer; document.getElementById('prayerHeroArabic').textContent = arabicNames[nextPrayer] || ''; document.getElementById('prayerHeroIcon').textContent = prayerIcons[nextPrayer] || '🕌'; document.querySelector('[data-i18n="prayerAdhanAt"]').textContent = t('prayerAdhanAt');
    window._nextPrayerMins = nextPrayerMins; window._prevPrayerMins = prevPrayerMins; window._prayerTimings = timings;
    if (window._prayerCountdownInterval) clearInterval(window._prayerCountdownInterval); updatePrayerCountdown(); window._prayerCountdownInterval = setInterval(updatePrayerCountdown, 1000);
    if (data.date) { const h = data.date.hijri, g = data.date.gregorian; if (h) { document.getElementById('hijriDateDisplay').textContent = `${h.day} ${h.month.en} ${h.year} AH`; document.getElementById('hijriDateSub').textContent = `${g?.weekday?.en || ''}, ${g?.date || ''}`; } }
}

function updatePrayerCountdown() {
    const now = new Date(); const nowTotalSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    let targetSecs = (window._nextPrayerMins || 0) * 60; let diff = targetSecs - nowTotalSecs; if (diff < 0) diff += 24 * 3600;
    const hours = Math.floor(diff / 3600), mins = Math.floor((diff % 3600) / 60), secs = diff % 60;
    const cdH = document.getElementById('cdHours'), cdM = document.getElementById('cdMins'), cdS = document.getElementById('cdSecs');
    if (cdH) cdH.textContent = String(hours).padStart(2, '0'); if (cdM) cdM.textContent = String(mins).padStart(2, '0'); if (cdS) cdS.textContent = String(secs).padStart(2, '0');
    const prevSecs = (window._prevPrayerMins || 0) * 60; let totalSpan = targetSecs - prevSecs; if (totalSpan <= 0) totalSpan += 24 * 3600; let elapsed = nowTotalSecs - prevSecs; if (elapsed < 0) elapsed += 24 * 3600; const pct = Math.min(1, Math.max(0, elapsed / totalSpan));
    const arc = document.getElementById('prayerArc'); if (arc) { const circumference = 2 * Math.PI * 44; arc.style.strokeDashoffset = circumference * (1 - pct); }
    if (diff <= 0) { clearInterval(window._prayerCountdownInterval); setTimeout(fetchPrayerTimes, 2000); }
}

// ══════════════════════════════════════════════
// QIBLA COMPASS
// ══════════════════════════════════════════════
// [migrated → appState.prayer.qibla.*] (js/state.js)


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { fetchPrayerTimes, renderPrayerTimes, updatePrayerCountdown });

export { fetchPrayerTimes, renderPrayerTimes, updatePrayerCountdown };
