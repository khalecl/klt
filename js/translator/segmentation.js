/* Khutbah Live Translator — js/translator/segmentation.js
   Speech → translation-sized segments.   (v5, Task 10)

   Turns ragged recognition output into meaningful language segments. Speech
   recognition emits tiny fragments, repeated finals, half sentences and
   occasionally huge paragraphs; the translator needs sensible chunks instead.

   SCOPE — unchanged
   No speech recognition here, no translation here. This layer receives text
   fragments and emits completed segments to a sink (wired to queueTranslation
   by app.js). It never calls a provider.

   FLUSH TRIGGERS
     sentence    — terminal punctuation on a long-enough buffer
     phrase      — a safe connective boundary once the buffer is substantial
     silence     — pause detected (cfg.silenceWait)
     max-buffer  — cfg.bufferTime elapsed since the first fragment
     max-length  — TX_MAX_CHARS reached
     manual      — explicit flush
     session-end — stopListen / teardown

   MEANING PRESERVATION
   A segment boundary must never fall inside a phrase whose meaning depends on
   staying whole. Arabic religious language is full of these: basmala,
   ta'awwudh, salawat, praise formulae, and the connective particles
   (و / ف / ثم / الذي …) that Arabic uses where English would start a new
   sentence. Splitting mid-quotation produces a mistranslated ayah, which in a
   sermon is worse than a segment that runs slightly long — so when the two
   conflict, length loses. Text is never rewritten, only divided. */

/* ── configuration ─────────────────────────────────────────────── */

/** Below this, a segment is too short to translate meaningfully on its own. */
const MIN_SEGMENT_CHARS = 12;

/** A sentence-terminated buffer shorter than this keeps growing. */
const MIN_SENTENCE_CHARS = 25;

/** Only look for phrase boundaries once the buffer is at least this long. */
const PHRASE_BOUNDARY_MIN = 140;

/** How many recent emissions to remember for duplicate suppression. */
const RECENT_MEMORY = 12;

function maxChars() {
    return (typeof window.TX_MAX_CHARS === 'number') ? window.TX_MAX_CHARS : 400;
}
function bufferSeconds() {
    const c = window.cfg;
    return (c && typeof c.bufferTime === 'number') ? c.bufferTime : 8;
}
function silenceSeconds() {
    const c = window.cfg;
    return (c && typeof c.silenceWait === 'number') ? c.silenceWait : 1.5;
}

/** Terminal punctuation, Latin + Arabic + Urdu. */
const TERMINAL_END = /[.!?\u2026\u061F\u06D4]\s*$/;

/**
 * Arabic connectives and particles. Breaking immediately after one of these
 * orphans it from the clause it governs, so they are never split points.
 */
const ARABIC_CONNECTIVES = [
    'و', 'ف', 'ثم', 'أو', 'أم', 'بل', 'لكن', 'لأن', 'لأنه', 'حتى', 'إذا', 'إذ',
    'الذي', 'التي', 'الذين', 'اللاتي', 'من', 'ما', 'أن', 'إن', 'كأن', 'لعل',
    'قد', 'لقد', 'كي', 'لكي', 'عن', 'في', 'على', 'إلى', 'مع', 'عند'
];

/**
 * Openings of formulaic religious phrases that must stay whole.
 * Used ONLY to suppress a split — never to insert, complete or alter text.
 * If recognition heard a partial basmala, it stays partial.
 */
const PROTECTED_OPENINGS = [
    'بسم الله', 'أعوذ بالله', 'الحمد لله', 'سبحان الله', 'لا إله إلا الله',
    'صلى الله', 'عليه الصلاة', 'رضي الله', 'قال الله', 'قال تعالى', 'قال رسول',
    'يا أيها الذين', 'اللهم', 'أشهد أن', 'بارك الله', 'جزاك الله',
    'ما شاء الله', 'إن شاء الله', 'أستغفر الله'
];

/** Latin-script equivalents, for transliterated or English recognition. */
const PROTECTED_LATIN = [
    'bismillah', 'alhamdulillah', 'subhanallah', 'astaghfirullah',
    'la ilaha illa', 'salla allahu', 'sallallahu', 'radiya allahu',
    'in sha allah', 'insha allah', 'masha allah', 'allahumma', 'ya ayyuha'
];

/* ── state ─────────────────────────────────────────────────────── */

const seg = {
    pending: '',
    startedAt: null,
    sink: null,
    bufferTimer: null,
    silenceTimer: null,
    counter: 0,
    lastEmitted: '',
    recentHashes: []
};

/* ── helpers ───────────────────────────────────────────────────── */

function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

/**
 * Comparison key for duplicate detection.
 * Uses the Arabic MATCH folding from normalization.js when available, so two
 * recognitions of the same phrase that differ only in harakat or alef form
 * (أ vs ا, with vs without diacritics) are recognised as the same utterance.
 * Falls back to plain lowercasing if that module has not loaded.
 * This affects COMPARISON ONLY — the emitted segment text is never folded.
 */
function matchable(s) {
    if (typeof window.matchKey === 'function') {
        try { return window.matchKey(s); } catch (e) { /* fall through */ }
    }
    return norm(s).toLowerCase();
}

/** Cheap stable hash over the comparison key. */
function hash(s) {
    const t = matchable(s);
    let h = 0;
    for (let i = 0; i < t.length; i++) { h = ((h << 5) - h + t.charCodeAt(i)) | 0; }
    return h + ':' + t.length;
}

/** True while a protected formulaic phrase is still open near the tail. */
function isProtectedContext(text) {
    const t = norm(text);
    if (!t) return false;
    const tail = t.slice(-40);
    const lower = tail.toLowerCase();
    for (let i = 0; i < PROTECTED_OPENINGS.length; i++) {
        const at = tail.lastIndexOf(PROTECTED_OPENINGS[i]);
        if (at !== -1 && (tail.length - at) < 35) return true;
    }
    for (let i = 0; i < PROTECTED_LATIN.length; i++) {
        const at = lower.lastIndexOf(PROTECTED_LATIN[i]);
        if (at !== -1 && (lower.length - at) < 35) return true;
    }
    return false;
}

/** True when the text ends on a word that must not be orphaned. */
function endsOnConnective(text) {
    const words = norm(text).split(' ');
    const last = words[words.length - 1];
    if (!last) return false;
    const bare = last.replace(/[.,\u060C\u061B:!?\u2026\u061F\u06D4]/g, '');
    if (!bare) return false;
    if (ARABIC_CONNECTIVES.indexOf(bare) !== -1) return true;
    if (bare.length === 1 && /[\u0621-\u064A]/.test(bare)) return true;
    return false;
}

/** Safe to cut here? */
function canSplit(text) {
    const t = norm(text);
    if (t.length < MIN_SEGMENT_CHARS) return false;
    // A sentence that has actually terminated is closed: a protected formula
    // earlier in it is no longer "open", so cutting here cannot split a phrase.
    // Without this, any sentence merely CONTAINING a formula would never flush.
    const terminated = TERMINAL_END.test(t);
    if (!terminated && isProtectedContext(t)) return false;
    if (endsOnConnective(t)) return false;
    return true;
}

function isSentenceBoundary(text) {
    const t = norm(text);
    return TERMINAL_END.test(t) && t.length >= MIN_SENTENCE_CHARS && canSplit(t);
}

function isPhraseBoundary(text) {
    const t = norm(text);
    if (t.length < PHRASE_BOUNDARY_MIN) return false;
    if (!/[\u060C,\u061B;:]\s*$/.test(t)) return false;
    return canSplit(t);
}

function sourceLanguage() {
    try {
        const el = document.getElementById('srcLang');
        return el ? el.value : null;
    } catch (e) { return null; }
}

function clearTimers() {
    if (seg.bufferTimer) { clearTimeout(seg.bufferTimer); seg.bufferTimer = null; }
    if (seg.silenceTimer) { clearTimeout(seg.silenceTimer); seg.silenceTimer = null; }
}

function armTimers() {
    if (seg.silenceTimer) clearTimeout(seg.silenceTimer);
    seg.silenceTimer = setTimeout(function () { flushSegment('silence'); }, silenceSeconds() * 1000);
    if (!seg.bufferTimer) {
        seg.bufferTimer = setTimeout(function () { flushSegment('max-buffer'); }, bufferSeconds() * 1000);
    }
}

/** Already emitted? Covers repeated finals, restarts and reconnects. */
function isDuplicate(text) {
    const h = hash(text);
    if (seg.lastEmitted && h === hash(seg.lastEmitted)) return true;
    return seg.recentHashes.indexOf(h) !== -1;
}

function remember(text) {
    seg.lastEmitted = text;
    seg.recentHashes.push(hash(text));
    if (seg.recentHashes.length > RECENT_MEMORY) seg.recentHashes.shift();
}

/* ── emission ──────────────────────────────────────────────────── */

/**
 * Build the structured segment and hand it downstream.
 * The sink receives the plain text (what queueTranslation has always
 * expected) plus the structured object as a second argument, so existing
 * consumers keep working unchanged.
 */
function emit(text, reason, startedAt) {
    const clean = norm(text);
    if (!clean) return null;
    if (isDuplicate(clean)) {
        console.log('[segmentation] duplicate suppressed:', clean.slice(0, 40));
        return null;
    }

    seg.counter += 1;
    const segment = {
        id: seg.counter,
        text: clean,
        startedAt: startedAt || new Date().toISOString(),
        endedAt: new Date().toISOString(),
        sourceLanguage: sourceLanguage(),
        isFinal: true,
        reason: reason || 'unknown'
    };

    remember(clean);

    try {
        window.dispatchEvent(new CustomEvent('khutbah:segment-created', { detail: segment }));
    } catch (e) {}

    try {
        if (seg.sink) seg.sink(clean, segment);
        else if (typeof window.queueTranslation === 'function') window.queueTranslation(clean);
    } catch (e) {
        console.warn('[segmentation] sink failed', e);
    }

    return segment;
}

/* ── public API (names unchanged) ──────────────────────────────── */

/** Wire the downstream consumer. app.js sets this to queueTranslation. */
export function setSegmentationSink(fn) { seg.sink = fn; }

/**
 * Accept one recognized fragment.
 * Merges into the pending buffer and flushes at a natural boundary.
 * options.isFinal === false marks an interim result, which is ignored.
 */
export function pushFragment(text, options) {
    const clean = norm(text);
    if (!clean) return null;

    const isFinal = !options || options.isFinal !== false;
    if (!isFinal) return null;

    // Repeated / progressive finals (Android) must not double up.
    if (seg.pending) {
        const p = matchable(seg.pending);
        const c = matchable(clean);
        if (p === c) return null;                 // exact repeat
        if (p.endsWith(c)) return null;           // already contained at the tail
        if (c.indexOf(p) === 0) {                 // superset: replace, don't append
            seg.pending = clean;
            armTimers();
            return maybeFlush();
        }
    }

    if (!seg.pending) {
        seg.pending = clean;
        seg.startedAt = new Date().toISOString();
    } else if ((seg.pending.length + clean.length + 1) <= maxChars()) {
        seg.pending = seg.pending + ' ' + clean;
    } else {
        flushSegment('max-length', true);
        seg.pending = clean;
        seg.startedAt = new Date().toISOString();
    }

    armTimers();
    return maybeFlush();
}

/** Flush if a natural boundary has been reached. */
function maybeFlush() {
    if (!seg.pending) return null;
    if (seg.pending.length >= maxChars()) return flushSegment('max-length', true);
    if (isSentenceBoundary(seg.pending)) return flushSegment('sentence');
    if (isPhraseBoundary(seg.pending)) return flushSegment('phrase');
    return null;
}

/**
 * Flush the pending buffer.
 * Refuses when the buffer is too short or sits mid-phrase, unless forced.
 * manual, session-end and max-length always flush.
 */
export function flushSegment(reason, force) {
    const why = reason || 'manual';
    const always = force || why === 'manual' || why === 'session-end' || why === 'max-length';

    if (!seg.pending) { clearTimers(); return null; }

    const text = norm(seg.pending);

    if (!always) {
        if (text.length < MIN_SEGMENT_CHARS) return null;
        if (!canSplit(text)) {
            // Mid-phrase: give it more room rather than break meaning.
            if (seg.silenceTimer) clearTimeout(seg.silenceTimer);
            seg.silenceTimer = setTimeout(function () { flushSegment(why); }, silenceSeconds() * 1000);
            return null;
        }
    }

    clearTimers();
    const started = seg.startedAt;
    seg.pending = '';
    seg.startedAt = null;
    return emit(text, why, started);
}

/** Session/end flush — always emits whatever valid text remains. */
export function endSegmentationSession() {
    const out = flushSegment('session-end', true);
    clearTimers();
    return out;
}

/** Drop the buffer without emitting, and forget duplicate history. */
export function resetSegmentation() {
    clearTimers();
    seg.pending = '';
    seg.startedAt = null;
    seg.lastEmitted = '';
    seg.recentHashes = [];
    seg.counter = 0;
    return null;
}

/** Introspection for tests and the UI. */
export function segmentationState() {
    return {
        pending: seg.pending,
        startedAt: seg.startedAt,
        count: seg.counter,
        firstFragmentAt: seg.startedAt ? new Date(seg.startedAt).getTime() : 0
    };
}

Object.assign(window, {
    setSegmentationSink, pushFragment, flushSegment,
    endSegmentationSession, resetSegmentation, segmentationState
});
