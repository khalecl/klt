/* Khutbah Live Translator — js/khutbah/session.js
   Khutbah session domain.

   A Khutbah Session represents one active Friday sermon. It is the persistent
   conceptual layer that the existing translator pipeline feeds into:

       speech → segmentation → normalization → queue → translation → SESSION

   OWNERSHIP
   This module owns session lifecycle, metadata, segments, translations and
   status. It owns nothing else. It does not touch speech recognition, audio
   processing, translation providers, Quran logic, Prayer logic, or the DOM —
   it has no getElementById, no fetch, and no provider references.

   REUSE
   State lives in appState.khutbah (js/state.js), not in a private global.
   Persistence goes through cacheSet/cacheGet (js/storage.js), so the existing
   quota handling and {ts,data} wrapper apply unchanged.

   NON-INVENTION
   detectedReferences, topics and summary are part of the session model but are
   NEVER populated by this module. Detecting a Qur'anic reference or summarizing
   a sermon means asserting religious content, and a wrong attribution in a
   sermon transcript is worse than no attribution. These fields stay empty until
   something with an explicit, reviewed extraction step fills them. */

const STORAGE_KEY = 'kht_session_current';

/** Valid session statuses. */
export const SESSION_STATUS = {
    IDLE: 'idle',
    LISTENING: 'listening',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    ERROR: 'error'
};

/* ── internals ─────────────────────────────────────────────────── */

function store() {
    // appState is guaranteed present: state.js is imported before this module.
    return window.appState.khutbah;
}

/** Unique id: time-ordered prefix + random suffix, collision-safe in practice. */
function makeId() {
    const rand = (typeof crypto !== 'undefined' && crypto.getRandomValues)
        ? Array.from(crypto.getRandomValues(new Uint8Array(6),))
            .map(b => b.toString(16).padStart(2, '0')).join('')
        : Math.random().toString(16).slice(2, 14);
    return 'kht_' + Date.now().toString(36) + '_' + rand;
}

/** Read the current language pair without owning the selectors. */
function currentPair() {
    try {
        const src = document.getElementById('srcLang');
        const tgt = document.getElementById('tgtLang');
        return {
            sourceLanguage: src ? src.value : null,
            targetLanguage: tgt ? tgt.value : null
        };
    } catch (e) {
        return { sourceLanguage: null, targetLanguage: null };
    }
}

/** Persist the active session. Best-effort: never throws into the caller. */
let persistTimer = null;
function persist(immediate) {
    const s = store();
    const write = () => {
        try {
            if (!s.current) return;
            if (typeof window.cacheSet === 'function') {
                window.cacheSet(STORAGE_KEY, s.current);
            }
        } catch (e) {
            console.warn('[session] persist failed', e);
        }
    };
    if (immediate) { clearTimeout(persistTimer); persistTimer = null; write(); return; }
    // Debounced: a sermon produces many rapid appends; one write per burst.
    clearTimeout(persistTimer);
    persistTimer = setTimeout(write, 1500);
}

/** Announce a session change. Fire-and-forget; never throws into the caller. */
function emit(name, detail) {
    try {
        window.dispatchEvent(new CustomEvent('khutbah:' + name, { detail: detail }));
    } catch (e) { /* event dispatch must never break the session */ }
}

function setStatus(status) {
    const s = store();
    s.status = status;
    if (s.current) s.current.status = status;
}

/* ── lifecycle ─────────────────────────────────────────────────── */

/**
 * Begin a new session. Always starts from a clean object — no field is
 * carried over from a previous session.
 */
export function startSession(options) {
    const opts = options || {};
    const pair = currentPair();
    const s = store();

    s.current = {
        id: makeId(),
        startedAt: new Date().toISOString(),
        endedAt: null,
        status: SESSION_STATUS.LISTENING,
        sourceLanguage: opts.sourceLanguage || pair.sourceLanguage,
        targetLanguage: opts.targetLanguage || pair.targetLanguage,
        segments: [],
        translations: [],
        detectedReferences: [],   // never auto-populated — see header
        topics: [],               // never auto-populated — see header
        summary: null             // never auto-populated — see header
    };
    s.status = SESSION_STATUS.LISTENING;

    persist(true);
    console.log('[session] started', s.current.id);
    emit('session-started', s.current);
    return s.current;
}

/** Pause. Recording continues to be possible; appends are rejected. */
export function pauseSession() {
    const s = store();
    if (!s.current || s.status !== SESSION_STATUS.LISTENING) return s.current;
    setStatus(SESSION_STATUS.PAUSED);
    persist(true);
    emit('session-paused', s.current);
    return s.current;
}

/** Resume a paused session. */
export function resumeSession() {
    const s = store();
    if (!s.current || s.status !== SESSION_STATUS.PAUSED) return s.current;
    setStatus(SESSION_STATUS.LISTENING);
    persist(true);
    emit('session-resumed', s.current);
    return s.current;
}

/** Finalize. The session object remains readable until reset or a new start. */
export function endSession() {
    const s = store();
    if (!s.current) return null;
    s.current.endedAt = new Date().toISOString();
    setStatus(SESSION_STATUS.COMPLETED);
    persist(true);
    console.log('[session] ended', s.current.id,
        '| segments:', s.current.segments.length,
        '| translations:', s.current.translations.length);

    // Announce completion. js/khutbah/history.js subscribes to this and
    // persists the record. Using an event rather than an import keeps the
    // two modules decoupled — session.js has no knowledge of storage.
    try {
        window.dispatchEvent(new CustomEvent('khutbah:session-completed', {
            detail: JSON.parse(JSON.stringify(s.current))   // snapshot, not a live ref
        }));
    } catch (e) {
        console.warn('[session] completion event failed', e);
    }

    return s.current;
}

/** Mark the session as errored, preserving whatever was captured. */
export function errorSession(reason) {
    const s = store();
    if (!s.current) return null;
    setStatus(SESSION_STATUS.ERROR);
    s.current.error = reason ? String(reason) : 'unknown';
    persist(true);
    emit('session-error', s.current);
    return s.current;
}

/** Clear everything back to idle. */
export function resetSession() {
    const s = store();
    clearTimeout(persistTimer);
    persistTimer = null;
    s.current = null;
    s.status = SESSION_STATUS.IDLE;
    emit('session-reset', null);
    try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    return null;
}

/* ── content ───────────────────────────────────────────────────── */

/**
 * Record one recognized segment (post-segmentation, pre-translation).
 * Ignored when there is no active session or the session is paused, so
 * pausing genuinely stops capture rather than merely hiding it.
 */
export function addSegment(text, meta) {
    const s = store();
    if (!s.current || s.status !== SESSION_STATUS.LISTENING) return null;
    const clean = String(text == null ? '' : text).trim();
    if (!clean) return null;

    const segment = {
        id: s.current.segments.length + 1,
        text: clean,
        at: new Date().toISOString()
    };
    if (meta && typeof meta === 'object') Object.assign(segment, meta);

    s.current.segments.push(segment);
    persist(false);
    emit('session-segment', segment);
    return segment;
}

/**
 * Record one completed translation.
 * `original` is stored verbatim — the recognized text is never replaced by
 * its normalized form.
 */
export function addTranslation(original, translated, meta) {
    const s = store();
    if (!s.current || s.status !== SESSION_STATUS.LISTENING) return null;
    const orig = String(original == null ? '' : original).trim();
    if (!orig) return null;

    const entry = {
        id: s.current.translations.length + 1,
        original: orig,
        translated: String(translated == null ? '' : translated),
        at: new Date().toISOString()
    };
    if (meta && typeof meta === 'object') Object.assign(entry, meta);

    s.current.translations.push(entry);
    persist(false);
    emit('session-translation', entry);
    return entry;
}

/* ── access ────────────────────────────────────────────────────── */

/** The active session object, or null. */
export function getCurrentSession() { return store().current; }

/** Current status string. */
export function getSessionStatus() { return store().status; }

/** True when appends will be accepted. */
export function isSessionActive() {
    return store().status === SESSION_STATUS.LISTENING;
}

/** Restore a previously persisted session (used on reload). */
export function restoreSession() {
    try {
        if (typeof window.cacheGet !== 'function') return null;
        const saved = window.cacheGet(STORAGE_KEY);
        if (!saved || !saved.id) return null;
        const s = store();
        s.current = saved;
        // A restored session is never resumed automatically — the user decides.
        s.status = (saved.status === SESSION_STATUS.COMPLETED)
            ? SESSION_STATUS.COMPLETED
            : SESSION_STATUS.PAUSED;
        s.current.status = s.status;
        return s.current;
    } catch (e) {
        console.warn('[session] restore failed', e);
        return null;
    }
}

/* ── global bridge (migration scaffolding, same pattern as other modules) ── */
Object.assign(window, {
    SESSION_STATUS,
    startSession, pauseSession, resumeSession, endSession, errorSession,
    addSegment, addTranslation, getCurrentSession, getSessionStatus,
    isSessionActive, resetSession, restoreSession
});
