/* Khutbah Live Translator — js/khutbah/history.js
   Durable storage for completed Khutbah sessions.

   RESPONSIBILITY SPLIT
     session.js  — the live session lifecycle (in-memory, one active sermon)
     history.js  — persistent records of sessions (this file)
     storage.js  — the generic persistence primitives both of them use

   This module owns the khutbah session SCHEMA and nothing else. The raw
   IndexedDB plumbing (idbOpen / idbRequest / idbTransaction) lives in
   storage.js, because it is generic and not khutbah-specific.

   DECOUPLING
   history.js does not import session.js, and session.js does not import
   history.js. They communicate through a DOM CustomEvent
   ('khutbah:session-completed'), so neither module depends on the other and
   no cycle is possible. history.js subscribes; session.js just announces.

   DURABILITY POSTURE
   IndexedDB is the primary store because a long sermon transcript is far
   larger than a settings blob and would compete with the Quran cache for the
   ~5 MB localStorage quota. When IndexedDB is unavailable (private mode, old
   WebView) or fails, records fall back to localStorage rather than being
   dropped. Data loss is always reported, never silent.

   NO AUDIO
   Microphone recordings are never stored. sanitizeRecord() strips any audio
   field defensively, even if a caller passes one in. */

const DB_NAME = 'khutbah';
const DB_VERSION = 1;
const STORE = 'sessions';

/** Bump when the record shape changes; migrate() handles the upgrade path. */
export const SCHEMA_VERSION = 1;

/** localStorage fallback namespace, used only when IndexedDB is unusable. */
const FALLBACK_PREFIX = 'kht_history_';
const FALLBACK_INDEX = 'kht_history_index';

/** Fields that must never be persisted, whatever a caller passes in. */
const FORBIDDEN_FIELDS = ['audio', 'audioUrls', 'audioChunks', 'recording', 'blob', 'stream', 'mediaRecorder'];

let dbPromise = null;
let usingFallback = false;

/* ── database ──────────────────────────────────────────────────── */

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = window.idbOpen(DB_NAME, DB_VERSION, (db, oldVersion) => {
        if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('startedAt', 'startedAt', { unique: false });
            store.createIndex('status', 'status', { unique: false });
        }
        if (oldVersion > 0 && oldVersion < DB_VERSION) {
            console.log('[history] upgrading schema from v' + oldVersion + ' to v' + DB_VERSION);
        }
    }).catch(err => {
        console.warn('[history] IndexedDB unavailable, falling back to localStorage:', err.message);
        usingFallback = true;
        dbPromise = null;
        throw err;
    });
    return dbPromise;
}

/** True when this session is persisting to localStorage instead of IndexedDB. */
export function isUsingFallback() { return usingFallback; }

/* ── record hygiene ────────────────────────────────────────────── */

/**
 * Produce a complete, safe record from whatever was handed in.
 * Missing fields get defaults; forbidden (audio) fields are stripped;
 * arrays that arrived as non-arrays are coerced. Never throws.
 */
export function sanitizeRecord(session) {
    const s = (session && typeof session === 'object') ? session : {};
    const arr = v => Array.isArray(v) ? v : [];

    const record = {
        schemaVersion: SCHEMA_VERSION,
        id: typeof s.id === 'string' && s.id ? s.id : null,
        startedAt: s.startedAt || null,
        endedAt: s.endedAt || null,
        status: s.status || 'completed',
        sourceLanguage: s.sourceLanguage || null,
        targetLanguage: s.targetLanguage || null,
        segments: arr(s.segments),
        translations: arr(s.translations),
        detectedReferences: arr(s.detectedReferences),
        topics: arr(s.topics),
        summary: (s.summary === undefined) ? null : s.summary,
        savedAt: new Date().toISOString()
    };

    if (s.error) record.error = String(s.error);

    // Defensive: never persist audio, even nested inside entries.
    FORBIDDEN_FIELDS.forEach(f => { delete record[f]; });
    const stripAudio = list => list.map(item => {
        if (!item || typeof item !== 'object') return item;
        const copy = Object.assign({}, item);
        FORBIDDEN_FIELDS.forEach(f => { delete copy[f]; });
        return copy;
    });
    record.segments = stripAudio(record.segments);
    record.translations = stripAudio(record.translations);

    return record;
}

/** Detect a record that cannot be trusted. */
function isCorrupt(record) {
    return !record
        || typeof record !== 'object'
        || typeof record.id !== 'string'
        || !record.id
        || !Array.isArray(record.segments)
        || !Array.isArray(record.translations);
}

/**
 * Bring an older record up to the current schema.
 * v0 (unversioned) → v1: fill defaults. Extend as the schema evolves.
 */
function migrate(record) {
    if (!record || typeof record !== 'object') return null;
    const v = record.schemaVersion || 0;
    if (v === SCHEMA_VERSION) return record;
    if (v > SCHEMA_VERSION) {
        console.warn('[history] record ' + record.id + ' has newer schema v' + v +
                     ' — reading defensively');
        return record;
    }
    const migrated = sanitizeRecord(record);
    migrated.savedAt = record.savedAt || migrated.savedAt;
    console.log('[history] migrated record ' + migrated.id + ' from v' + v + ' to v' + SCHEMA_VERSION);
    return migrated;
}

/**
 * Merge an incoming record with one already stored under the same id.
 * A duplicate id must never truncate captured content, so whichever side
 * has more segments/translations wins for that field.
 */
function mergeRecords(existing, incoming) {
    if (!existing) return incoming;
    const longer = (a, b) => (Array.isArray(b) && b.length >= (a || []).length) ? b : a;
    return Object.assign({}, existing, incoming, {
        segments: longer(existing.segments, incoming.segments),
        translations: longer(existing.translations, incoming.translations),
        detectedReferences: longer(existing.detectedReferences, incoming.detectedReferences),
        topics: longer(existing.topics, incoming.topics),
        summary: (incoming.summary != null) ? incoming.summary : existing.summary,
        startedAt: existing.startedAt || incoming.startedAt
    });
}

/* ── localStorage fallback ─────────────────────────────────────── */

function fbIndex() {
    try { return JSON.parse(localStorage.getItem(FALLBACK_INDEX) || '[]'); }
    catch (e) { return []; }
}
function fbSetIndex(ids) {
    try { localStorage.setItem(FALLBACK_INDEX, JSON.stringify(ids)); } catch (e) {}
}
function fbSave(record) {
    try {
        localStorage.setItem(FALLBACK_PREFIX + record.id, JSON.stringify(record));
        const ids = fbIndex();
        if (ids.indexOf(record.id) === -1) { ids.push(record.id); fbSetIndex(ids); }
        return record;
    } catch (e) {
        // Quota: report loudly. Never pretend the save succeeded.
        console.error('[history] fallback save FAILED (quota?) — session NOT persisted:', record.id, e);
        throw new Error('History save failed: ' + (e.name || e.message));
    }
}
function fbGet(id) {
    try {
        const raw = localStorage.getItem(FALLBACK_PREFIX + id);
        return raw ? migrate(JSON.parse(raw)) : null;
    } catch (e) { return null; }
}
function fbAll() {
    return fbIndex().map(fbGet).filter(r => r && !isCorrupt(r));
}

/* ── public API ────────────────────────────────────────────────── */

/**
 * Persist a session. Upserts by id, merging rather than truncating.
 * Resolves with the stored record; rejects if it could not be saved.
 */
export async function saveSession(session) {
    const record = sanitizeRecord(session);
    if (!record.id) throw new Error('History save refused: session has no id');

    try {
        const db = await openDb();
        const existing = await getSession(record.id).catch(() => null);
        const merged = mergeRecords(existing, record);
        await window.idbTransaction(db, STORE, 'readwrite', store => store.put(merged));
        return merged;
    } catch (err) {
        if (err && /QuotaExceeded/i.test(err.name || '')) {
            console.error('[history] IndexedDB quota exceeded — session NOT saved:', record.id);
            throw err;
        }
        console.warn('[history] IndexedDB save failed, using fallback:', err.message);
        usingFallback = true;
        const existing = fbGet(record.id);
        return fbSave(mergeRecords(existing, record));
    }
}

/** Fetch one record by id, or null. Corrupt records resolve to null. */
export async function getSession(id) {
    if (!id) return null;
    try {
        const db = await openDb();
        const raw = await window.idbTransaction(db, STORE, 'readonly',
            store => window.idbRequest(store.get(id)));
        const rec = migrate(raw);
        if (rec && isCorrupt(rec)) {
            console.warn('[history] corrupt record skipped:', id);
            return null;
        }
        return rec || null;
    } catch (err) {
        return fbGet(id);
    }
}

/**
 * All records, newest first. Corrupt entries are skipped and counted,
 * never allowed to break the whole listing.
 */
export async function getAllSessions() {
    let records = [];
    try {
        const db = await openDb();
        records = await window.idbTransaction(db, STORE, 'readonly',
            store => window.idbRequest(store.getAll()));
    } catch (err) {
        records = fbAll();
    }
    const clean = [];
    let corrupt = 0;
    (records || []).forEach(raw => {
        const rec = migrate(raw);
        if (rec && !isCorrupt(rec)) clean.push(rec); else corrupt++;
    });
    if (corrupt) console.warn('[history] skipped ' + corrupt + ' corrupt record(s)');
    clean.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    return clean;
}

/** Remove one record. Resolves true when it is gone. */
export async function deleteSession(id) {
    if (!id) return false;
    try {
        const db = await openDb();
        await window.idbTransaction(db, STORE, 'readwrite', store => store.delete(id));
    } catch (err) {
        try { localStorage.removeItem(FALLBACK_PREFIX + id); } catch (e) {}
        fbSetIndex(fbIndex().filter(x => x !== id));
    }
    return true;
}

/** Remove every record. */
export async function clearAllSessions() {
    try {
        const db = await openDb();
        await window.idbTransaction(db, STORE, 'readwrite', store => store.clear());
    } catch (err) { /* fall through to clear the fallback too */ }
    try {
        fbIndex().forEach(id => localStorage.removeItem(FALLBACK_PREFIX + id));
        localStorage.removeItem(FALLBACK_INDEX);
    } catch (e) {}
    return true;
}

/** Apply a partial update to a stored record. Returns the updated record. */
export async function updateSession(id, patch) {
    if (!id) throw new Error('updateSession requires an id');
    const existing = await getSession(id);
    if (!existing) throw new Error('No stored session with id ' + id);
    const updated = sanitizeRecord(Object.assign({}, existing, patch || {}, { id: existing.id }));
    return saveSession(updated);
}

/** Count of stored records (cheap listing helper). */
export async function countSessions() {
    const all = await getAllSessions();
    return all.length;
}

/* ── integration: listen, don't import ─────────────────────────── */

/**
 * session.js dispatches 'khutbah:session-completed' when endSession() finishes.
 * Subscribing here keeps the two modules decoupled and acyclic.
 */
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('khutbah:session-completed', function (e) {
        const session = e && e.detail;
        if (!session) return;
        saveSession(session)
            .then(rec => console.log('[history] saved session', rec.id,
                '| segments:', rec.segments.length,
                '| translations:', rec.translations.length))
            .catch(err => console.error('[history] FAILED to save session', session.id, err));
    });
}

Object.assign(window, {
    SCHEMA_VERSION, saveSession, getSession, getAllSessions,
    deleteSession, clearAllSessions, updateSession, countSessions,
    sanitizeRecord, isUsingFallback
});
