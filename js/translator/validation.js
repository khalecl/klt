/* Khutbah Live Translator — js/translator/validation.js
   Provider response validation.   (v5, Task 13)

   WHY A SEPARATE MODULE
   The checks below are numerous enough, and change independently enough, that
   inlining them in translator.js would bury the orchestration logic. This file
   owns "is this response actually a translation?" and nothing else.

   WHY IT MATTERS HERE
   Free translation endpoints fail in ways that still return HTTP 200: an empty
   body, the source echoed back, an HTML error page, a rate-limit notice as
   plain text, mojibake from an encoding mismatch. In a sermon, presenting one
   of those as the translation is worse than presenting nothing — the person
   reading has no way to know it is wrong.

   CONTRACT
       validateTranslation(translated, source, { targetLanguage })
         → { valid, reason, severity, warnings, text }

   `valid:false` means the orchestrator should treat the provider as failed and
   continue down the fallback chain. Validation NEVER repairs or rewrites a
   response — it only accepts or rejects. Silently "fixing" provider output is
   how fabricated text reaches a transcript. */

/** Below this, output is suspiciously short unless the source was short too. */
const MIN_CHARS = 2;

/** Output shorter than source × this ratio suggests truncation or summary. */
const MIN_LENGTH_RATIO = 0.25;

/** Output longer than source × this ratio suggests the model added commentary. */
const MAX_LENGTH_RATIO = 6;

/** Markers of an HTML/XML page returned instead of text. */
const HTML_PATTERN = /<\s*(!doctype|html|head|body|script|div|span|p|br|table)\b|&lt;\s*html/i;

/** Provider error text that arrives with a 200 status. */
const ERROR_PHRASES = [
    'rate limit', 'quota exceeded', 'too many requests', 'try again later',
    'service unavailable', 'internal server error', 'bad gateway',
    'invalid api key', 'unauthorized', 'access denied', 'forbidden',
    'mymemory warning', 'query length limit', 'translation not available',
    'no translation found', 'error occurred', 'request failed',
    'you have exceeded', 'daily limit'
];

/** Model refusal / meta-commentary rather than a translation. */
const REFUSAL_PATTERN =
    /^\s*(i (cannot|can't|am unable|do not|don't)|as an ai|sorry,|unfortunately,|note:|translation:)/i;

/** Replacement characters and common mojibake signatures. */
/* U+FFFD, or the signature of UTF-8 bytes misdecoded as Latin-1: a lead byte
   in C2–DF immediately followed by a continuation byte in 80–BF. That pair is
   how "السلام" becomes "Ø§Ù„Ø³Ù„Ø§Ù…". */
const ENCODING_PATTERN = /\uFFFD|[\u00C2-\u00DF][\u0080-\u00BF]|â€[\u0099\u009C\u009D]/;

function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

/** Comparison key; Arabic-aware when normalization.js is loaded. */
function key(s) {
    if (typeof window.matchKey === 'function') {
        try { return window.matchKey(s); } catch (e) { /* fall through */ }
    }
    return norm(s).toLowerCase();
}

/** Detect a response that just repeats one token or phrase over and over. */
function isDegenerateRepeat(text) {
    const words = norm(text).split(' ');
    if (words.length < 6) return false;
    const unique = new Set(words.map(w => w.toLowerCase()));
    if (unique.size === 1) return true;
    // A single short phrase repeated to fill the output
    if (unique.size <= 2 && words.length >= 10) return true;
    return false;
}

function fail(reason, severity) {
    return { valid: false, reason: reason, severity: severity || 'error', warnings: [], text: null };
}

/**
 * Validate a provider response.
 * Returns a structured verdict; never throws, never modifies the text.
 */
export function validateTranslation(translated, source, options) {
    const opts = options || {};
    const warnings = [];

    // 1. Missing / empty
    if (translated == null) return fail('empty: null response');
    const text = norm(translated);
    const src = norm(source);
    if (!text) return fail('empty: blank response');

    // 2. Malformed type
    if (typeof translated !== 'string') return fail('malformed: not a string');

    // 3. HTML instead of text
    if (HTML_PATTERN.test(text)) return fail('malformed: HTML returned instead of text');

    // 4. Encoding damage
    if (ENCODING_PATTERN.test(text)) return fail('encoding: replacement characters or mojibake');

    // 5. Error message disguised as success
    const lower = text.toLowerCase();
    for (let i = 0; i < ERROR_PHRASES.length; i++) {
        if (lower.indexOf(ERROR_PHRASES[i]) !== -1 && text.length < 200) {
            return fail('provider error returned as success: "' + ERROR_PHRASES[i] + '"');
        }
    }

    // 6. Refusal / meta-commentary
    if (REFUSAL_PATTERN.test(text)) return fail('refusal or commentary, not a translation');

    // 7. Identical to source (no translation performed).
    //    Legitimate when the two languages are the same — the caller handles
    //    that case before reaching a provider, so here it means failure.
    if (src && key(text) === key(src)) {
        if (opts.sameLanguage) {
            warnings.push('source and target identical (same language)');
        } else {
            return fail('identical to source: provider did not translate');
        }
    }

    // 8. Degenerate repetition
    if (isDegenerateRepeat(text)) return fail('degenerate: repeated output');

    // 9. Extremely short output
    if (text.length < MIN_CHARS && src.length > 10) {
        return fail('too short: ' + text.length + ' chars');
    }

    // 10. Suspicious length ratios — warnings, not rejections, because
    //     legitimate translations vary a great deal in length between
    //     languages (Arabic → English commonly expands).
    if (src.length >= 40) {
        const ratio = text.length / src.length;
        if (ratio < MIN_LENGTH_RATIO) {
            return fail('truncated or summarized: output is ' +
                        Math.round(ratio * 100) + '% of source length');
        }
        if (ratio > MAX_LENGTH_RATIO) {
            warnings.push('output much longer than source (ratio ' + ratio.toFixed(1) + ')');
        }
    }

    // 11. Untranslated markers left by a backend
    if (/^untranslatable$/i.test(text)) return fail('backend reported untranslatable');

    return { valid: true, reason: null, severity: null, warnings: warnings, text: text };
}

/** Convenience boolean for call sites that do not need the detail. */
export function isValidTranslation(translated, source, options) {
    return validateTranslation(translated, source, options).valid;
}

Object.assign(window, { validateTranslation, isValidTranslation });
