/* Khutbah Live Translator — js/translator/context.js
   Bounded rolling translation context.   (v5, Task 12)

   WHY THIS EXISTS
   Sentence-by-sentence translation loses thread. A khutbah repeats concepts,
   names and Islamic terminology, returns to the same Qur'anic passage, and
   uses pronouns whose referent was established several sentences earlier.
   A small amount of recent context lets a provider stay consistent.

   HARD BOUNDS, NOT SUGGESTIONS
   An unbounded transcript is three problems at once: privacy (the whole
   sermon shipped to a third party), cost, and latency. So the caps live here
   and are deliberately NOT configurable by callers. Old entries are evicted
   automatically, oldest first, so the most relevant context always survives.

   SESSION ISOLATION
   Context is cleared when a khutbah session starts or resets. Context from
   last Friday's sermon must never bleed into this one.

   PRIVACY
   This module never sends anything anywhere. It has no fetch, no network, no
   storage. It holds a small in-memory window and exposes a read-only view.
   The translator/provider layer alone decides what is actually transmitted. */

/** Hard caps. Deliberately not configurable. */
export const CONTEXT_LIMITS = {
    MAX_SEGMENTS: 6,        // recent source segments
    MAX_PAIRS: 4,           // recent source→target pairs
    MAX_TERMINOLOGY: 10,    // recurring terms and their agreed rendering
    MAX_ENTITIES: 10,       // recurring names / places / works
    MAX_TOPICS: 5,          // candidate topics
    MAX_ENTRY_CHARS: 220,   // per stored string
    MAX_TOTAL_CHARS: 900    // absolute ceiling on the serialized payload
};

/** Fresh, empty context object. */
export function createContext() {
    return {
        segments: [],
        pairs: [],
        terminology: [],
        entities: [],
        topics: [],
        startedAt: new Date().toISOString()
    };
}

let ctx = createContext();

/* ── helpers ───────────────────────────────────────────────────── */

function clip(text, max) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    const limit = max || CONTEXT_LIMITS.MAX_ENTRY_CHARS;
    return t.length > limit ? t.slice(0, limit) : t;
}

/** Push with automatic eviction of the oldest entries. */
function pushBounded(list, item, max) {
    list.push(item);
    while (list.length > max) list.shift();
    return item;
}

/** Case/space-insensitive comparison, Arabic-aware when available. */
function key(text) {
    if (typeof window.matchKey === 'function') {
        try { return window.matchKey(text); } catch (e) { /* fall through */ }
    }
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().toLowerCase();
}

/* ── writers ───────────────────────────────────────────────────── */

/** Record a recognized source segment. */
export function addSourceSegment(text) {
    const t = clip(text);
    if (!t) return null;
    const last = ctx.segments[ctx.segments.length - 1];
    if (last && key(last.text) === key(t)) return null;      // duplicate guard
    return pushBounded(ctx.segments,
        { text: t, at: new Date().toISOString() },
        CONTEXT_LIMITS.MAX_SEGMENTS);
}

/**
 * Record a completed source→target pair. Called only after success.
 * NOTE: named addTranslationPair, not addTranslation — js/khutbah/session.js
 * already publishes addTranslation() on the global bridge, and whichever
 * module loaded last would silently win. Distinct names, no collision.
 */
export function addTranslationPair(source, target) {
    const s = clip(source), t = clip(target);
    if (!s || !t) return null;
    const last = ctx.pairs[ctx.pairs.length - 1];
    if (last && key(last.source) === key(s)) return null;
    return pushBounded(ctx.pairs,
        { source: s, target: t },
        CONTEXT_LIMITS.MAX_PAIRS);
}

/**
 * Record a term whose rendering should stay consistent.
 * Supplied explicitly — this module never guesses religious terminology,
 * and never invents a rendering for a term it has not been given.
 */
export function addTerminology(term, rendering) {
    const a = clip(term, 60), b = clip(rendering, 60);
    if (!a || !b) return null;
    const existing = ctx.terminology.find(x => key(x.term) === key(a));
    if (existing) { existing.count += 1; return existing; }
    return pushBounded(ctx.terminology,
        { term: a, rendering: b, count: 1 },
        CONTEXT_LIMITS.MAX_TERMINOLOGY);
}

/** Record a recurring entity (name, place, work). Never inferred here. */
export function addEntity(name, type) {
    const n = clip(name, 60);
    if (!n) return null;
    const existing = ctx.entities.find(x => key(x.name) === key(n));
    if (existing) { existing.count += 1; return existing; }
    return pushBounded(ctx.entities,
        { name: n, type: type || 'unknown', count: 1 },
        CONTEXT_LIMITS.MAX_ENTITIES);
}

/** Record a candidate topic. Candidate only — never asserted as fact. */
export function addTopic(topic) {
    const t = clip(topic, 60);
    if (!t) return null;
    const existing = ctx.topics.find(x => key(x.topic) === key(t));
    if (existing) { existing.count += 1; return existing; }
    return pushBounded(ctx.topics,
        { topic: t, count: 1 },
        CONTEXT_LIMITS.MAX_TOPICS);
}

/* ── reader ────────────────────────────────────────────────────── */

/**
 * Read-only bounded view for the provider layer.
 * Returns COPIES, so a consumer cannot mutate stored context. Trims from the
 * oldest end until the serialized payload fits MAX_TOTAL_CHARS.
 */
export function getContext() {
    let pairs = ctx.pairs.map(p => ({ source: p.source, target: p.target }));
    let segments = ctx.segments.map(s => s.text);
    let terminology = ctx.terminology.map(t => ({ term: t.term, rendering: t.rendering }));
    let entities = ctx.entities.map(e => ({ name: e.name, type: e.type }));
    let topics = ctx.topics.map(t => t.topic);

    /* Measure the payload that is actually RETURNED, including the truncated
       flag. Use the LONGER boolean literal (false) so the estimate is never
       optimistic by a byte. */
    const size = () => JSON.stringify({
        pairs, segments, terminology, entities, topics, truncated: false
    }).length;
    const before = pairs.length + segments.length;

    /* Drop least-useful first. Translated PAIRS carry the most value for
       consistency, so they are trimmed last and only from the oldest end —
       otherwise a full context window would evict exactly the material the
       provider needs most. */
    while (size() > CONTEXT_LIMITS.MAX_TOTAL_CHARS && topics.length) topics.pop();
    while (size() > CONTEXT_LIMITS.MAX_TOTAL_CHARS && entities.length) entities.pop();
    while (size() > CONTEXT_LIMITS.MAX_TOTAL_CHARS && segments.length) segments.shift();
    while (size() > CONTEXT_LIMITS.MAX_TOTAL_CHARS && terminology.length) terminology.pop();
    // The byte ceiling is absolute: if everything else has been dropped and the
    // payload is still over, oldest pairs go too. A hard cap that can be
    // exceeded is not a cap.
    while (size() > CONTEXT_LIMITS.MAX_TOTAL_CHARS && pairs.length) pairs.shift();

    return {
        pairs, segments, terminology, entities, topics,
        truncated: (pairs.length + segments.length) < before
    };
}

/** Drop all context. Called on session start/reset and language-pair change. */
export function clearContext() {
    ctx = createContext();
    return null;
}

/** Introspection for tests and diagnostics. */
export function contextState() {
    return {
        segmentCount: ctx.segments.length,
        pairCount: ctx.pairs.length,
        terminologyCount: ctx.terminology.length,
        entityCount: ctx.entities.length,
        topicCount: ctx.topics.length,
        bytes: JSON.stringify(getContext()).length,
        startedAt: ctx.startedAt
    };
}

/* ── session isolation ─────────────────────────────────────────── */
/* session.js announces lifecycle changes; subscribing here keeps the two
   modules decoupled (no import in either direction) and guarantees context
   can never leak from one khutbah into the next. */
if (typeof window !== 'undefined' && window.addEventListener) {
    ['session-started', 'session-reset'].forEach(function (evt) {
        window.addEventListener('khutbah:' + evt, function () {
            clearContext();
            console.log('[context] cleared on ' + evt);
        });
    });
}

/* Backwards-compatible alias: recordContext() was the earlier name. */
export const recordContext = addTranslationPair;
export const addGlossaryTerm = addTerminology;

Object.assign(window, {
    CONTEXT_LIMITS, createContext, addSourceSegment, addTranslationPair,
    addTerminology, addEntity, addTopic, getContext, clearContext, contextState,
    recordContext, addGlossaryTerm
});
