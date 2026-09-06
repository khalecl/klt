/* Khutbah Live Translator — prayer/qibla.js
   Qibla bearing and device compass.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function calcQiblaBearing(lat, lng) { const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI; const lat1 = toRad(lat), lng1 = toRad(lng), lat2 = toRad(KAABA_LAT), lng2 = toRad(KAABA_LNG); const dLng = lng2 - lng1; const x = Math.sin(dLng) * Math.cos(lat2); const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng); return (toDeg(Math.atan2(x, y)) + 360) % 360; }

function toggleQibla() { const wrap = document.getElementById('qiblaWrap'), btn = document.getElementById('qiblaToggle'); qiblaActive = !qiblaActive; if (qiblaActive) { wrap.classList.add('on'); btn.classList.add('active'); btn.innerHTML = '🕋 Hide Qibla Compass'; startQiblaCompass(); } else { wrap.classList.remove('on'); btn.classList.remove('active'); btn.innerHTML = '🕋 Show Qibla Compass'; stopQiblaCompass(); } }

async function startQiblaCompass() {
    const statusEl = document.getElementById('qiblaStatus'), degreeEl = document.getElementById('qiblaDegree');
    if (!userCoords) { const cached = cacheGet(CACHE_KEYS.PRAYER_COORDS); if (cached) userCoords = cached; else { try { statusEl.textContent = 'Getting location...'; statusEl.className = 'qibla-status warn'; const pos = await new Promise((resolve, reject) => { navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }); }); userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; cacheSet(CACHE_KEYS.PRAYER_COORDS, userCoords); } catch(e) { statusEl.textContent = 'Location unavailable — cannot determine Qibla'; statusEl.className = 'qibla-status warn'; return; } } }
    qiblaAngle = calcQiblaBearing(userCoords.lat, userCoords.lng); degreeEl.textContent = qiblaAngle.toFixed(1) + '°'; document.getElementById('qiblaNeedle').style.transform = `translate(-50%,-100%) rotate(${qiblaAngle}deg)`;
    const hasCompass = await requestCompassPermission(); if (hasCompass) { statusEl.textContent = 'Compass active — rotate your device'; statusEl.className = 'qibla-status ok'; } else { statusEl.textContent = `Qibla is ${qiblaAngle.toFixed(1)}° from North (no compass sensor)`; statusEl.className = 'qibla-status warn'; }
}

async function requestCompassPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { try { if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false; } catch(e) { return false; } }
    return new Promise((resolve) => { let resolved = false; const timeout = setTimeout(() => { if (!resolved) { resolved = true; resolve(false); } window.removeEventListener('deviceorientationabsolute', test); window.removeEventListener('deviceorientation', test); }, 2000); const test = (e) => { const h = getHeadingFromEvent(e); if (h !== null && !resolved) { resolved = true; clearTimeout(timeout); window.removeEventListener('deviceorientationabsolute', test); window.removeEventListener('deviceorientation', test); startCompassListener(); resolve(true); } }; window.addEventListener('deviceorientationabsolute', test); window.addEventListener('deviceorientation', test); });
}

function getHeadingFromEvent(e) { if (typeof e.webkitCompassHeading === 'number') return e.webkitCompassHeading; if (e.absolute && typeof e.alpha === 'number') return (360 - e.alpha) % 360; if (typeof e.alpha === 'number') return (360 - e.alpha) % 360; return null; }

function startCompassListener() {
    qiblaOrientationHandler = (e) => { const heading = getHeadingFromEvent(e); if (heading === null || qiblaAngle === null) return; deviceHeading = heading; const ring = document.getElementById('qiblaRing'); if (ring) ring.style.transform = `rotate(${-heading}deg)`; let rel = (qiblaAngle - heading + 360) % 360; const statusEl = document.getElementById('qiblaStatus'); if (statusEl) { if (rel > 350 || rel < 10) { statusEl.textContent = '✅ You are facing the Qibla!'; statusEl.className = 'qibla-status ok'; } else if (rel <= 180) { statusEl.textContent = `Turn right ${rel.toFixed(0)}°`; statusEl.className = 'qibla-status warn'; } else { statusEl.textContent = `Turn left ${(360 - rel).toFixed(0)}°`; statusEl.className = 'qibla-status warn'; } } };
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', qiblaOrientationHandler); else window.addEventListener('deviceorientation', qiblaOrientationHandler);
}

function stopQiblaCompass() { if (qiblaOrientationHandler) { window.removeEventListener('deviceorientationabsolute', qiblaOrientationHandler); window.removeEventListener('deviceorientation', qiblaOrientationHandler); qiblaOrientationHandler = null; } const ring = document.getElementById('qiblaRing'); if (ring) ring.style.transform = ''; }

// [migrated → appState.prayer.loaded] (js/state.js)


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { calcQiblaBearing, toggleQibla, startQiblaCompass, requestCompassPermission, getHeadingFromEvent, startCompassListener, stopQiblaCompass });

export { calcQiblaBearing, toggleQibla, startQiblaCompass, requestCompassPermission, getHeadingFromEvent, startCompassListener, stopQiblaCompass };
