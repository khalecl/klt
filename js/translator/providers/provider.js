/* Khutbah Live Translator — translator/providers/provider.js
   Common provider interface + result normalization.
   Refactor Task 5 Phase J.

   Each provider adapter exposes:

       translate({ text, sourceLanguage, targetLanguage, context, signal })

   and resolves to a normalized result:

       { success, text, provider, latency, error }

   The existing provider functions (tryLingva / tryMyMemory / tryLibre) are
   preserved untouched in their own files — this module wraps them so the
   orchestrator can treat every provider identically. Wrapping rather than
   rewriting keeps the request shapes, timeouts, quirks and success/failure
   heuristics byte-identical to the baseline. */

/** Normalized failure result. */
export function providerError(provider, error, latency) {
    return {
        success: false,
        text: null,
        provider,
        latency: latency || 0,
        error: (error && error.message) ? error.message : String(error || 'unknown')
    };
}

/** Normalized success result. */
export function providerSuccess(provider, text, latency) {
    return { success: true, text, provider, latency: latency || 0, error: null };
}

/**
 * Wrap a legacy (text, src, tgt) -> string|null function in the common
 * interface. Behaviour is unchanged; only the return shape is normalized.
 */
export function makeProvider(name, legacyFn) {
    return {
        name,
        async translate({ text, sourceLanguage, targetLanguage, signal }) {
            const started = Date.now();
            try {
                if (signal && signal.aborted) {
                    return providerError(name, 'aborted', Date.now() - started);
                }
                const result = await legacyFn(text, sourceLanguage, targetLanguage);
                const latency = Date.now() - started;
                return (result && String(result).trim())
                    ? providerSuccess(name, result, latency)
                    : providerError(name, 'empty result', latency);
            } catch (e) {
                return providerError(name, e, Date.now() - started);
            }
        }
    };
}

/**
 * Build the provider registry from the legacy globals.
 * Resolved lazily so load order between provider modules does not matter.
 */
export function getProviders() {
    return {
        lingva:        makeProvider('lingva',        (t, s, g) => window.tryLingva(t, s, g)),
        mymemory:      makeProvider('mymemory',      (t, s, g) => window.tryMyMemory(t, s, g)),
        libretranslate: makeProvider('libretranslate', (t, s, g) => window.tryLibre(t, s, g)),
        ai:            makeProvider('ai',            (t, s, g) => window.tryAI(t, s, g))
    };
}

/**
 * Provider order for a given cfg.engine value.
 * Mirrors the baseline chain in doTranslate() exactly:
 *   auto      -> lingva, mymemory, libretranslate
 *   lingva    -> lingva, mymemory
 *   mymemory  -> mymemory
 */
export function providerChain(engine) {
    // AI is appended last and ONLY when a backend endpoint is configured, so
    // the default chain is byte-identical to the pre-AI behaviour.
    const ai = (typeof window.isAIAvailable === 'function' && window.isAIAvailable()) ? ['ai'] : [];
    if (engine === 'ai')       return ai.concat(['lingva', 'mymemory']);
    if (engine === 'lingva')   return ['lingva', 'mymemory'].concat(ai);
    if (engine === 'mymemory') return ['mymemory'].concat(ai);
    return ['lingva', 'mymemory', 'libretranslate'].concat(ai);
}

Object.assign(window, { providerError, providerSuccess, makeProvider, getProviders, providerChain });
