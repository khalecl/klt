/* Khutbah Live Translator — js/translator/normalization.js
   Conservative normalization of recognized text.   (v5, Tasks 8 + 11)

   TWO LEVELS, DELIBERATELY SEPARATE
     SAFE  — only lossless Unicode/whitespace tidying. Never changes a letter,
             never removes diacritics. Suitable for text on its way to a
             translation provider.
     MATCH — SAFE plus orthographic folding (diacritics, alef/ya/hamza forms,
             ta marbuta, punctuation). LOSSY BY DESIGN and for comparison ONLY:
             duplicate detection, search, and Quran reference lookup.

   The MATCH form must never be displayed, stored as the transcript, or sent
   to a provider. Folding أ/إ/آ to ا and dropping harakat makes two spellings
   of the same word compare equal, which is exactly what matching needs and
   exactly what you do not want in a sermon transcript.

   CRITICAL RULE — the original is never replaced
   Every function returns the original alongside anything derived. The UI keeps
   showing the recognized wording; addEntry() still stores entry.orig verbatim.

   WHAT THIS MODULE WILL NOT DO
     - insert, complete or "correct" any Qur'anic ayah or Hadith
     - expand or substitute religious phrases
     - spell-correct, transliterate, or guess at unclear audio
     - alter proper names
   Getting a sermon quotation subtly wrong is worse than leaving it ragged, so
   anything beyond mechanical, reversible-in-meaning cleanup is out of scope. */

/** Terminal punctuation set — matches the baseline processTxQueue() test. */
const TERMINAL = /[.!?,،؛؟…:]$/;

/** Collapse runs of whitespace, trim edges. Purely mechanical. */
export function collapseWhitespace(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
}

/** Remove duplicated adjacent punctuation left by interim/final overlap. */
export function tidyPunctuation(text) {
    return String(text == null ? '' : text)
        .replace(/\s+([.!?,،؛؟:])/g, '$1')   // no space before punctuation
        .replace(/([.!?،؛؟])\1{1,}/g, '$1'); // collapse exact repeats
}

/**
 * Ensure a unit ends with terminal punctuation.
 * Lifted from the baseline processTxQueue(), which appended '.' on flush.
 */
export function ensureTerminalPunctuation(text) {
    const s = String(text == null ? '' : text);
    if (!s) return s;
    return TERMINAL.test(s) ? s : s + '.';
}

/**
 * Remove a leading overlap repeated from the previous unit.
 * Android emits progressive isFinal events that can restate the tail of the
 * previous fragment. Only an EXACT leading duplicate is removed, and only
 * when a clear word boundary follows — never a fuzzy match.
 */
export function stripLeadingOverlap(text, previous) {
    const s = collapseWhitespace(text);
    const p = collapseWhitespace(previous);
    if (!s || !p) return s;
    const words = p.split(' ');
    for (let n = Math.min(words.length, 8); n >= 3; n--) {
        const tail = words.slice(-n).join(' ');
        if (s.toLowerCase().startsWith(tail.toLowerCase() + ' ')) {
            return s.slice(tail.length + 1).trim();
        }
    }
    return s;
}

/**
 * Full conservative pass.
 * Returns { original, normalized, changed } — the original is never discarded.
 */
export function normalize(text, options) {
    const opts = options || {};
    const original = String(text == null ? '' : text);

    let out = collapseWhitespace(original);
    if (opts.previous) out = stripLeadingOverlap(out, opts.previous);
    out = tidyPunctuation(out);
    if (opts.terminal !== false) out = ensureTerminalPunctuation(out);

    return { original, normalized: out, changed: out !== original };
}



/* ══════════════════════════════════════════════════════════════
   ARABIC NORMALIZATION (Task 11)
   ══════════════════════════════════════════════════════════════ */

/** Tatweel / kashida — pure typographic elongation, carries no meaning. */
const TATWEEL = /\u0640/g;

/** Zero-width and bidi control characters that recognition sometimes emits. */
const INVISIBLES = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/** Arabic diacritics: harakat, tanween, shadda, sukun, superscript alef, quranic marks. */
const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED]/g;

/** Alef variants → bare alef. Orthographic only. */
const ALEF_VARIANTS = /[\u0622\u0623\u0625\u0671\u0672\u0673\u0675]/g;

/**
 * SAFE normalization. Lossless with respect to meaning.
 * Removes only elongation and invisible controls, applies Unicode NFC, and
 * tidies whitespace. Letters and diacritics are left untouched.
 */
export function normalizeArabicSafe(text) {
    let t = String(text == null ? '' : text);
    try { t = t.normalize('NFC'); } catch (e) { /* older engines */ }
    t = t.replace(INVISIBLES, '');
    t = t.replace(TATWEEL, '');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
}

/**
 * MATCH normalization. Lossy folding for comparison only.
 * Never display this, never store it as the transcript, never send it to a
 * translation provider.
 */
export function normalizeArabicMatch(text) {
    let t = normalizeArabicSafe(text);
    t = t.replace(DIACRITICS, '');            // harakat, tanween, shadda, sukun
    t = t.replace(ALEF_VARIANTS, '\u0627');    // أ إ آ ٱ → ا
    t = t.replace(/\u0649/g, '\u064A');        // ى → ي  (alef maqsura → ya)
    t = t.replace(/\u0629/g, '\u0647');        // ة → ه  (ta marbuta → ha)
    t = t.replace(/[\u0624\u0626]/g, '\u0621'); // ؤ ئ → ء
    t = t.replace(/[\u060C\u061B\u061F\u06D4.,;:!?\u2026"'()\[\]]/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t.toLowerCase();                   // folds any Latin mixed in
}

/**
 * Public Arabic normalizer.
 *
 *   normalizeArabic(text)                    → SAFE string (default)
 *   normalizeArabic(text, { level:'match' }) → MATCH string
 *   normalizeArabic(text, { detailed:true }) → structured result
 *
 * The structured form always carries the original, so no caller can
 * accidentally lose it.
 */
export function normalizeArabic(text, options) {
    const opts = options || {};
    const original = String(text == null ? '' : text);
    const safe = normalizeArabicSafe(original);
    const match = normalizeArabicMatch(original);

    if (opts.detailed) {
        return {
            original: original,
            normalized: (opts.level === 'match') ? match : safe,
            safe: safe,
            match: match,
            hasArabic: containsArabic(original),
            changed: safe !== original
        };
    }
    return (opts.level === 'match') ? match : safe;
}

/** True when the string contains any Arabic-script character. */
export function containsArabic(text) {
    return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(
        String(text == null ? '' : text));
}

/**
 * Comparison key for duplicate detection, search and reference matching.
 * Arabic goes through MATCH folding; other scripts get whitespace/case
 * folding only, so non-Arabic behaviour is unchanged.
 */
export function matchKey(text) {
    const t = String(text == null ? '' : text);
    if (containsArabic(t)) return normalizeArabicMatch(t);
    return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when two strings are the same utterance, ignoring orthographic variation. */
export function isSameUtterance(a, b) {
    const ka = matchKey(a), kb = matchKey(b);
    return !!ka && ka === kb;
}

Object.assign(window, {
    collapseWhitespace, tidyPunctuation, ensureTerminalPunctuation,
    stripLeadingOverlap, normalize,
    normalizeArabic, normalizeArabicSafe, normalizeArabicMatch,
    containsArabic, matchKey, isSameUtterance
});
