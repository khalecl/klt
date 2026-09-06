/* Khutbah Live Translator — js/app.js
   Application entry point.
   Refactor Task 5 Phase B / O.

   DEPENDENCY DIRECTION
       app.js
         ↓
       state / config / storage / network
         ↓
       feature modules
         ↓
       UI

   Imports are ordered to match that direction. Each module publishes its
   public names onto the global scope as it loads (see the bridge block at
   the foot of every module), which is what keeps the existing inline HTML
   handlers and cross-module calls working without editing ~700 call sites.
   Those bridges are migration scaffolding and shrink as call sites move to
   explicit imports.

   The DOMContentLoaded sequence below is UNCHANGED from the baseline,
   including the ordering consequence that initSurahList() and
   loadDuasFromJSON() render before initI18n() resolves. */

// ── core ────────────────────────────────────────────────────────────
import './state.js';
import './config.js';
import './storage.js';
import './network.js';

// ── i18n ────────────────────────────────────────────────────────────
import './i18n/i18n.js';

// ── translator pipeline ─────────────────────────────────────────────
//   microphone → audio → speech → segmentation → normalization
//              → queue → translator → providers → UI
import './translator/audio.js';
import './translator/speech.js';
import './translator/segmentation.js';
import './translator/normalization.js';
import './translator/providers/provider.js';
import './translator/providers/lingva.js';
import './translator/providers/mymemory.js';
import './translator/providers/libretranslate.js';
import './translator/queue.js';
import './translator/translator.js';

// ── features ────────────────────────────────────────────────────────
import './quran/quran.js';
import './quran/audio.js';
import './dua/duas.js';
import './prayer/prayer.js';
import './prayer/qibla.js';

// ── khutbah session domain ──────────────────────────────────────────
import './khutbah/session.js';
import './khutbah/history.js';

// ── UI (last: depends on everything above) ──────────────────────────
import './ui/tabs.js';
import './ui/dialogs.js';
import './ui/notifications.js';
import './ui/session-ui.js';

/* ══════════════════════════════════════════════
   DECORATORS
   Preserved from the baseline. Each captures the original exactly once and
   falls through to it, so the web path is untouched when no bridge exists.
   They operate on window.* because the originals now live in other modules.
   ══════════════════════════════════════════════ */

// Prayer lazy-load on first tab visit
const origGoTab = window.goTab;
window.goTab = function (name, btn) {
    origGoTab(name, btn);
    if (name === 'prayer' && !window.prayerLoaded) {
        window.prayerLoaded = true;
        window.fetchPrayerTimes();
    }
};

// Native ML Kit translation
const _origDoTranslate = window.doTranslate;
window.doTranslate = async function (text) {
    if (window.KhutbahEnhanced && window.KhutbahEnhanced.hasMLKit) {
        try {
            const src = document.getElementById('srcLang').value.split('-')[0];
            const tgt = document.getElementById('tgtLang').value;
            if (src === tgt) { window.addEntry(text, text); return; }
            const cacheKey = `${src}|${tgt}|${text.trim().toLowerCase()}`;
            if (window.txCache.has(cacheKey)) {
                window.apiStats.cacheHit++;
                window.addEntry(text, window.txCache.get(cacheKey));
                window.updApiUI();
                return;
            }
            const result = await window.KhutbahEnhanced.translate(text, src, tgt);
            if (result && result.success && result.text) {
                window.txCache.set(cacheKey, result.text);
                window.addEntry(text, result.text);
                window.updApiUI();
                return;
            }
        } catch (e) {
            console.warn('[v4.6] ML Kit failed, using web fallback:', e.message);
        }
    }
    return _origDoTranslate(text);
};

// Native wake lock + foreground service
const _origReqWakeLock = window.reqWakeLock;
window.reqWakeLock = async function () {
    if (window.KhutbahEnhanced) {
        window.KhutbahEnhanced.acquireWakeLock();
        window.KhutbahEnhanced.startForegroundService();
    }
    return _origReqWakeLock();
};
const _origRelWakeLock = window.relWakeLock;
window.relWakeLock = async function () {
    if (window.KhutbahEnhanced) {
        window.KhutbahEnhanced.releaseWakeLock();
        window.KhutbahEnhanced.stopForegroundService();
    }
    return _origRelWakeLock();
};

window.addEventListener('nativeBridgeReady', function (e) {
    const f = e.detail;
    console.log('[v4.6] Native bridge ready:', f);
    const stsTxt = document.getElementById('stsTxt');
    if (stsTxt && f.hasMLKit) stsTxt.textContent = '🟢 ML Kit Ready • Tap mic to start';
    if (f.hasMLKit) {
        const src = document.getElementById('srcLang').value.split('-')[0];
        const tgt = document.getElementById('tgtLang').value;
        window.KhutbahEnhanced.downloadModel(src, tgt).catch(() => {});
    }
});

/* ══════════════════════════════════════════════
   KHUTBAH SESSION INTEGRATION

   The session layer observes the existing pipeline; it does not sit inside
   it. Every hook below is a decorator that calls the original first and then
   records. Translation semantics, provider selection, ordering, throttling
   and rendering are all untouched — if the session layer were removed, the
   app would behave identically.
   ══════════════════════════════════════════════ */

// Segments: recorded where segmentation emits a completed unit.
const _sessionSink = window.setSegmentationSink;
if (typeof _sessionSink === 'function') {
    window.setSegmentationSink = function (fn) {
        return _sessionSink(function (unit, segment) {
            // Record the segment with its structured metadata (reason, timing,
            // sourceLanguage) rather than just the text.
            try {
                window.addSegment(unit, segment ? {
                    reason: segment.reason,
                    startedAt: segment.startedAt,
                    endedAt: segment.endedAt,
                    sourceLanguage: segment.sourceLanguage,
                    isFinal: segment.isFinal
                } : undefined);
            } catch (e) { console.warn('[session] addSegment', e); }
            // Forward BOTH arguments so downstream consumers still receive the
            // structured segment alongside the plain text.
            return fn(unit, segment);
        });
    };
}

// Translations: recorded where a completed entry is added to the transcript.
// addEntry is the single funnel for every path — web providers, cache hits,
// native ML Kit, and same-language echo — so one hook covers all of them.
const _origAddEntry = window.addEntry;
window.addEntry = function (orig, trans) {
    const result = _origAddEntry.apply(this, arguments);
    try { window.addTranslation(orig, trans); } catch (e) { console.warn('[session] addTranslation', e); }
    return result;
};

// Lifecycle: bound to the existing listen controls.
const _origStartListen = window.startListen;
window.startListen = async function () {
    const result = await _origStartListen.apply(this, arguments);
    try {
        const s = window.getCurrentSession();
        if (!s || window.getSessionStatus() === window.SESSION_STATUS.COMPLETED) {
            window.startSession();
        } else if (window.getSessionStatus() === window.SESSION_STATUS.PAUSED) {
            window.resumeSession();
        }
    } catch (e) { console.warn('[session] start', e); }
    return result;
};

// Stopping the mic pauses rather than ends: a khutbah often has a short break
// between the two parts, and recognition also restarts on its own. Ending is
// an explicit act (endSession), not a side effect of the mic dropping.
const _origStopListen = window.stopListen;
window.stopListen = function () {
    try {
        if (typeof window.endSegmentationSession === 'function') window.endSegmentationSession();
    } catch (e) { console.warn('[session] flush', e); }
    const result = _origStopListen.apply(this, arguments);
    try { window.pauseSession(); } catch (e) { console.warn('[session] pause', e); }
    return result;
};

// Clearing the transcript clears the session too, so the two never disagree.
const _origClearAll = window.clearAll;
window.clearAll = function () {
    const before = window.translations.length;
    const result = _origClearAll.apply(this, arguments);
    if (before && window.translations.length === 0) {
        try { window.resetSession(); } catch (e) { console.warn('[session] reset', e); }
    }
    return result;
};

/* ══════════════════════════════════════════════
   INITIALIZATION
   Explicit, ordered, and guarded.

   Import order above already guarantees the dependency direction:
       core (state, config, storage, network)
         → i18n → translator → features → UI
   Module bodies contain no DOM access, so importing is side-effect-free
   apart from three window-level listeners (online/offline, nativeBridgeReady)
   which do not touch the document. Everything DOM-dependent happens below,
   after the document is ready.
   ══════════════════════════════════════════════ */

let __initDone = false;

/**
 * Run one initialization step in isolation.
 * A failure in a single feature (e.g. a corrupt cached surah list) must not
 * abort the remaining steps and leave the app half-started. Errors are logged
 * loudly, never swallowed silently.
 */
function step(label, fn) {
    try {
        return fn();
    } catch (e) {
        console.error('[init] step failed: ' + label, e);
        return undefined;
    }
}

function initApp() {
    if (__initDone) { console.warn('[init] initApp() called twice — ignored'); return; }
    __initDone = true;

    // ── 1. Settings — must precede anything reading cfg ──────────────
    step('settings', () => window.loadSettings());

    // ── 2. Static DOM scaffolding (no network, no cache) ─────────────
    step('visualizer', () => window.buildViz());
    step('tutorial dots', () => window.buildTutDots());
    step('surah list', () => window.initSurahList());

    // ── 3. Cached/deferred data ──────────────────────────────────────
    //     storage.js is already imported, so the cache layer is available
    //     before any feature asks for cached data.
    step("du'a data", () => window.loadDuasFromJSON());

    // ── 4. Restore persisted selections ──────────────────────────────
    step('restore selections', () => {
        const savedSrc = localStorage.getItem('kht_src');
        const savedTgt = localStorage.getItem('kht_tgt');
        if (savedSrc) document.getElementById('srcLang').value = savedSrc;
        if (savedTgt) document.getElementById('tgtLang').value = savedTgt;

        // v4.6: Restore saved Quran translation language
        const savedQuranTrans = localStorage.getItem('kht_quran_trans');
        if (savedQuranTrans) document.getElementById('quranTransSelect').value = savedQuranTrans;
    });

    // ── 5. Localization + theme ──────────────────────────────────────
    //     Async by design. Kept non-blocking exactly as in the baseline:
    //     the surah list and du'a list may paint before locales resolve.
    step('i18n', () => {
        Promise.all([window.initI18n(), window.initAvailableLangs()])
            .catch(e => console.error('[init] i18n failed', e));
    });
    step('skin', () => window.initSkin());

    // ── 5b. Restore a persisted session, if one exists ───────────────
    //      Restored sessions come back PAUSED — never auto-resumed.
    step('session restore', () => {
        if (typeof window.restoreSession === 'function') window.restoreSession();
    });

    // ── 6. Event wiring ──────────────────────────────────────────────
    step('event wiring', wireEvents);
    step('session UI', () => window.initSessionUI());

    // ── 7. First-run tutorial (last: needs i18n under way) ───────────
    step('tutorial', () => {
        if (!localStorage.getItem('kht_tut_v4')) setTimeout(window.showTut, 500);
    });

    console.log('[v4.6] Platform:',
        window.IS_ANDROID ? 'Android' : window.IS_IOS ? 'iOS' : 'Desktop',
        window.IS_CHROME ? 'Chrome' : 'Other',
        '| Restart delay:', window.RESTART_DELAY + 'ms');
    console.log('[app] Khutbah v5 — modular build ready');
}

/**
 * All DOM event listeners, registered exactly once.
 * Prayer stays lazy (goTab decorator, first visit only) and Qibla stays
 * inert until toggleQibla() is called — neither is wired here.
 */
function wireEvents() {
    const srcLang = document.getElementById('srcLang');
    const tgtLang = document.getElementById('tgtLang');

    srcLang.addEventListener('change', function () {
        localStorage.setItem('kht_src', this.value);
        if (window.recognition && window.isListening) {
            window.recognition.lang = this.value;
            try { window.recognition.stop(); } catch (e) {}
            setTimeout(() => {
                if (window.isListening) window.safeStartRecognition();
            }, window.RESTART_DELAY);
        }
    });

    // Single handler. The baseline registered two separate 'change' listeners
    // on tgtLang (re-render, then ML Kit model prefetch); merged here so the
    // ordering is explicit rather than registration-order dependent.
    tgtLang.addEventListener('change', function () {
        localStorage.setItem('kht_tgt', this.value);
        window.renderTranslations();
        if (window.KhutbahEnhanced && window.KhutbahEnhanced.hasMLKit) {
            const src = srcLang.value.split('-')[0];
            window.KhutbahEnhanced.downloadModel(src, this.value).catch(() => {});
        }
    });

    // Re-acquire wake lock and restart recognition on foreground return
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && window.isListening && window.cfg.wakeLock) {
            await window.reqWakeLock();
            if (window.IS_ANDROID && window.recognition) {
                setTimeout(() => {
                    if (window.isListening) window.safeStartRecognition();
                }, window.RESTART_DELAY);
            }
        }
    });

    // Segmentation feeds the queue. Wired here so the sink exists before any
    // speech fragment can be produced (mic requires a user gesture, which
    // cannot precede this point).
    if (typeof window.setSegmentationSink === 'function') {
        window.setSegmentationSink(unit => window.queueTranslation(unit));
    }
}

/* type="module" scripts are deferred, so they execute after parsing but
   before DOMContentLoaded. readyState is normally 'interactive' here, in
   which case the DOM is complete and we start immediately. The listener
   branch covers the non-deferred/edge case. */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
    initApp();
}

export { initApp };
