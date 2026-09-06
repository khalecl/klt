/* ═══════════════════════════════════════════════════════════════
   KHUTBAH LIVE TRANSLATOR — CENTRALIZED APPLICATION STATE
   js/state.js · v4.6.1-baseline

   Single source of truth for all mutable application state.

   MIGRATION CONTRACT
   ------------------
   Every variable below used to be a top-level `let`/`const` in
   index.html. They are now fields of `appState`, and each legacy
   name is re-exposed on the global object as an accessor property
   that reads and writes straight through to appState.

   That means existing code keeps working verbatim:

       isListening = true;        // → appState.audio.isListening = true
       if (isListening) { ... }   // → reads appState.audio.isListening

   Both spellings stay in sync permanently because they are the same
   storage. No call site had to change, and no behaviour changed.

   WHY ACCESSORS RATHER THAN A SEARCH-AND-REPLACE
   ---------------------------------------------
   A `let` binding cannot be aliased in JavaScript, so the only way
   to centralize state without editing ~700 references at once is to
   drop the `let` declarations and let the identifiers resolve to
   global accessor properties instead. This keeps the migration
   incremental and reversible: call sites can be moved to explicit
   `appState.*` access one domain at a time, and the accessors are
   deleted only once a domain has no legacy references left.

   LOAD ORDER
   ----------
   This file MUST be loaded before the main application script.
   The accessors have to exist before any code that references
   these identifiers is parsed and run.

   WHAT IS DELIBERATELY *NOT* HERE
   -------------------------------
   Immutable configuration constants (LINGVA_HOSTS, CACHE_KEYS,
   SURAH_LIST, KAABA_LAT, RTL_LANGS, TX_MIN_INTERVAL, VALID_SKINS,
   LOCALE_FALLBACK, …) are configuration, not state. They never
   change at runtime, so they stay where they are. Moving them would
   add churn without adding a single guarantee.

   Function-local variables (transcript, silenceTimer, restarts, …)
   are not application state either; they belong to their closures.
   ═══════════════════════════════════════════════════════════════ */

(function (global) {
    'use strict';

    // ── The single structured state object ──────────────────────
    const appState = {

        /* TRANSLATOR — transcript, engine bookkeeping, request queue */
        translator: {
            translations:   [],          // [{orig, text, time}] — the sermon transcript
            txCache:        new Map(),   // `${src}|${tgt}|${text}` → translation (FIFO, cap 500)
            txQueue:        [],          // pending source strings awaiting translation
            txProcessing:   false,       // single-flight guard on the queue drain loop
            lastTxApiCall:  0,           // timestamp used for TX_MIN_INTERVAL throttling
            lingvaIdx:      0,           // round-robin pointer into LINGVA_HOSTS
            apiStats:       { lingvaOk: 0, lingvaFail: 0, mmOk: 0, mmFail: 0, cacheHit: 0 }
        },

        /* AUDIO — speech recognition, capture, DSP graph, wake lock */
        audio: {
            recognition:           null,   // SpeechRecognition instance
            isListening:           false,  // master listening flag
            isRecording:           false,  // MediaRecorder flag
            recognitionRestarting: false,  // guards overlapping restarts
            mediaRecorder:         null,
            audioChunks:           [],
            audioCtx:              null,   // AudioContext
            analyser:              null,   // AnalyserNode driving the visualizer
            stream:                null,   // raw getUserMedia stream (stays null on Android)
            processedStream:       null,   // output of the DSP chain
            audioNodes:            {},     // named DSP nodes: highpass, preEmph, presence, …
            fakeVizInterval:       null,   // Android synthetic visualizer timer
            wakeLock:              null    // Screen Wake Lock sentinel
        },

        /* QURAN — reader view state and the recitation player */
        quran: {
            cache:        {},     // in-memory surah payloads
            showArabic:   true,
            showTranslit: true,
            showTrans:    true,
            player: {
                playing:      false,
                paused:       false,
                surahNum:     null,
                currentAyah:  0,
                totalAyahs:   0,
                audioUrls:    [],
                audio:        (typeof Audio !== 'undefined') ? new Audio() : null,
                reciter:      'ar.alafasy',
                speed:        1,
                progressTimer: null
            }
        },

        /* DU'A */
        dua: {
            data:          { categories: [], duas: [] },
            currentFilter: 'all'
        },

        /* PRAYER — timings, location, and the Qibla compass */
        prayer: {
            timesData: null,    // last AlAdhan response
            userCoords: null,   // {lat, lng}
            loaded:     false,  // lazy-load guard for the first Prayer tab visit
            qibla: {
                angle:             null,   // computed great-circle bearing to the Kaaba
                deviceHeading:     null,   // live compass heading
                active:            false,
                orientationHandler: null   // listener ref, needed for clean teardown
            }
        },

        /* SETTINGS — the user-configurable cfg object (persisted as kht_cfg_v3) */
        settings: {
            cfg: {
                instant: true, autoScroll: true, highlight: true, showOrig: false,
                threshold: 15, wakeLock: true, engine: 'auto',
                bufferTime: 8, silenceWait: 1.5,
                noiseFilter: true, voiceGain: 2.5, noiseGate: 20
            }
        },

        /* UI — presentation and localization state */
        ui: {
            currentFontSize: 18,     // px, clamped 12–36
            tutStep:         0,      // tutorial position (0 = language selection)
            currentLocale:   {},     // active locale object backing t()
            currentLang:     'en'
        },

        /* KHUTBAH — the active Friday sermon session.
           Owned by js/khutbah/session.js. Nothing else writes here. */
        khutbah: {
            current: null,      // the active session object, or null
            status: 'idle'      // idle | listening | paused | completed | error
        },

        /* SESSION — per-session environment facts */
        session: {
            isOnline: (typeof navigator !== 'undefined' && 'onLine' in navigator)
                        ? navigator.onLine : true
        }
    };

    // ── Legacy global name → path inside appState ────────────────
    // This map is the migration ledger. As call sites are moved to
    // explicit appState.* access, entries are removed from here.
    const BINDINGS = {
        // translator
        translations:          ['translator', 'translations'],
        txCache:               ['translator', 'txCache'],
        txQueue:               ['translator', 'txQueue'],
        txProcessing:          ['translator', 'txProcessing'],
        lastTxApiCall:         ['translator', 'lastTxApiCall'],
        lingvaIdx:             ['translator', 'lingvaIdx'],
        apiStats:              ['translator', 'apiStats'],

        // audio
        recognition:           ['audio', 'recognition'],
        isListening:           ['audio', 'isListening'],
        isRecording:           ['audio', 'isRecording'],
        recognitionRestarting: ['audio', 'recognitionRestarting'],
        mediaRecorder:         ['audio', 'mediaRecorder'],
        audioChunks:           ['audio', 'audioChunks'],
        audioCtx:              ['audio', 'audioCtx'],
        analyser:              ['audio', 'analyser'],
        stream:                ['audio', 'stream'],
        processedStream:       ['audio', 'processedStream'],
        audioNodes:            ['audio', 'audioNodes'],
        fakeVizInterval:       ['audio', 'fakeVizInterval'],
        wakeLock:              ['audio', 'wakeLock'],

        // quran
        quranCache:            ['quran', 'cache'],
        qShowArabic:           ['quran', 'showArabic'],
        qShowTranslit:         ['quran', 'showTranslit'],
        qShowTrans:            ['quran', 'showTrans'],
        qaState:               ['quran', 'player'],

        // dua
        duaData:               ['dua', 'data'],
        currentDuaFilter:      ['dua', 'currentFilter'],

        // prayer
        prayerTimesData:       ['prayer', 'timesData'],
        userCoords:            ['prayer', 'userCoords'],
        prayerLoaded:          ['prayer', 'loaded'],
        qiblaAngle:            ['prayer', 'qibla', 'angle'],
        deviceHeading:         ['prayer', 'qibla', 'deviceHeading'],
        qiblaActive:           ['prayer', 'qibla', 'active'],
        qiblaOrientationHandler: ['prayer', 'qibla', 'orientationHandler'],

        // settings
        cfg:                   ['settings', 'cfg'],

        // ui
        currentFontSize:       ['ui', 'currentFontSize'],
        tutStep:               ['ui', 'tutStep'],
        currentLocale:         ['ui', 'currentLocale'],
        currentLang:           ['ui', 'currentLang'],

        // session
        isOnline:              ['session', 'isOnline']
    };

    // ── Install the compatibility accessors ─────────────────────
    const collisions = [];

    Object.keys(BINDINGS).forEach(function (name) {
        const path = BINDINGS[name];

        // Never silently clobber something the platform already owns.
        if (Object.prototype.hasOwnProperty.call(global, name)) {
            collisions.push(name);
            return;
        }

        const container = path.slice(0, -1).reduce(function (o, k) { return o[k]; }, appState);
        const key = path[path.length - 1];

        Object.defineProperty(global, name, {
            get: function () { return container[key]; },
            set: function (v) { container[key] = v; },
            enumerable: true,
            configurable: true   // configurable so the migration can retire bindings later
        });
    });

    if (collisions.length) {
        console.error('[state] Name collisions with existing globals — NOT bound:', collisions);
    }

    // ── Expose ──────────────────────────────────────────────────
    global.appState = appState;

    // Introspection helper for tests and future migration steps.
    global.__stateBindings = BINDINGS;

    console.log('[state] Centralized state ready —',
        Object.keys(BINDINGS).length, 'variables across',
        Object.keys(appState).length, 'domains');

})(typeof window !== 'undefined' ? window : globalThis);
