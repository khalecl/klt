/* Khutbah Live Translator — js/translator/providers/ai.js
   AI translation provider.   (v5)

   Same shape as lingva.js / mymemory.js / libretranslate.js: a legacy-style
   `tryAI(text, src, tgt)` returning a translation string or null, plus a
   normalized adapter through providers/provider.js. No new architecture.

   SECURITY — NO KEY IN THE BROWSER
   This file contains no API key and must never contain one. Anything shipped
   to GitHub Pages is public, so a key here would be a key for everyone. All
   requests go to a backend endpoint that holds the credential server-side and
   builds the prompt. The browser only sends text and language codes.

   The endpoint is unset by default, so this provider is INACTIVE until you
   configure one. That keeps translation behaviour unchanged out of the box.

       configureAI({ endpoint: 'https://your-worker.example.workers.dev/api/translate' });

   BOUNDED CONTEXT ONLY
   Context comes from js/translator/context.js, which hard-caps it. This file
   never assembles its own context and never sends a full transcript.

   WHAT IT DOES NOT DO
   No DOM, no speech, no session lifecycle, no UI, no key storage, no
   unrelated state. It prepares a request, reads a response, returns data.

   FAILURE
   Any failure returns null (legacy shape) or a normalized error result, so
   the existing fallback chain continues untouched. A fabricated or partial
   answer is never substituted for a real one. */

const AI_TIMEOUT_MS = 12000;   // AI is slower than a lookup API, but bounded
const AI_MAX_CHARS = 1200;     // refuse oversized units rather than truncate silently

const aiConfig = {
    endpoint: null,   // set via configureAI(); no default, no key
    model: null,      // optional hint; the backend decides what it honours
    enabled: false
};

/** Configure the backend endpoint. Never accepts a key. */
export function configureAI(options) {
    const o = options || {};
    if ('endpoint' in o) aiConfig.endpoint = o.endpoint || null;
    if ('model' in o) aiConfig.model = o.model || null;
    if ('enabled' in o) aiConfig.enabled = !!o.enabled;
    else aiConfig.enabled = !!aiConfig.endpoint;

    // Defensive: refuse anything that looks like a credential.
    ['apiKey', 'key', 'token', 'secret', 'authorization'].forEach(k => {
        if (k in o) {
            console.error('[ai] Refusing to store a credential in the browser. ' +
                          'Keys belong on the backend only. Ignored: ' + k);
        }
    });
    return { endpoint: aiConfig.endpoint, enabled: aiConfig.enabled };
}

/** Current configuration (never includes a credential, because none exists). */
export function getAIConfig() {
    return { endpoint: aiConfig.endpoint, model: aiConfig.model, enabled: aiConfig.enabled };
}

/** True when an endpoint has been configured. */
export function isAIAvailable() {
    return !!(aiConfig.enabled && aiConfig.endpoint);
}

/**
 * Legacy-shape provider call, matching the other three adapters.
 * Returns the translation string, or null on any failure.
 */
export async function tryAI(text, src, tgt) {
    if (!isAIAvailable()) return null;

    const body = String(text == null ? '' : text).trim();
    if (!body) return null;
    if (body.length > AI_MAX_CHARS) {
        console.warn('[ai] unit exceeds ' + AI_MAX_CHARS + ' chars — declining rather than truncating');
        return null;
    }

    // Bounded context only, straight from context.js.
    let context = { pairs: [], glossary: [] };
    try {
        if (typeof window.getContext === 'function') context = window.getContext();
    } catch (e) { /* context is optional; never block a translation on it */ }

    const payload = {
        text: body,
        sourceLanguage: src || null,
        targetLanguage: tgt || null,
        context: context,
        domain: 'khutbah'          // lets the backend select the sermon prompt
    };
    if (aiConfig.model) payload.model = aiConfig.model;

    try {
        const fetcher = (typeof window.fetchWithTimeout === 'function')
            ? window.fetchWithTimeout
            : (u, o) => fetch(u, o);

        const res = await fetcher(aiConfig.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, AI_TIMEOUT_MS);

        if (!res || !res.ok) {
            console.warn('[ai] backend returned ' + (res ? res.status : 'no response'));
            return null;
        }

        const data = await res.json();

        // Backend envelope: { success, translation, provider, warnings }
        // or { success:false, error:{ code, message } }.
        if (data && data.success === false) {
            console.warn('[ai] backend error:', data.error && data.error.code);
            return null;
        }

        // Accept only an explicit, non-empty translation field.
        const out = data && (data.translation || data.text);
        if (!out || !String(out).trim()) return null;

        // Guard against a backend echoing the prompt or refusing in prose.
        const clean = String(out).trim();
        if (clean === body) return null;                       // no-op answer
        if (/^(i (cannot|can't|am unable)|as an ai)/i.test(clean)) {
            console.warn('[ai] backend returned a refusal, not a translation');
            return null;
        }
        return clean;

    } catch (e) {
        console.warn('[ai] request failed:', e && e.message);
        return null;
    }
}

/**
 * Normalized adapter, matching providers/provider.js.
 * Returns { success, text, provider, latency, error }.
 */
export async function translateWithAI(request) {
    const req = request || {};
    const started = Date.now();

    if (!isAIAvailable()) {
        return {
            success: false, text: null, provider: 'ai',
            latency: 0, error: 'AI provider not configured'
        };
    }
    try {
        if (req.signal && req.signal.aborted) {
            return { success: false, text: null, provider: 'ai', latency: 0, error: 'aborted' };
        }
        const result = await tryAI(req.text, req.sourceLanguage, req.targetLanguage);
        const latency = Date.now() - started;
        return result
            ? { success: true, text: result, provider: 'ai', latency: latency, error: null }
            : { success: false, text: null, provider: 'ai', latency: latency, error: 'no translation returned' };
    } catch (e) {
        return {
            success: false, text: null, provider: 'ai',
            latency: Date.now() - started, error: (e && e.message) ? e.message : String(e)
        };
    }
}

Object.assign(window, {
    tryAI, translateWithAI, configureAI, getAIConfig, isAIAvailable
});
