/* Khutbah Live Translator — translator/queue.js
   Sequential drain with TX_MIN_INTERVAL throttling. Timing unchanged.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function queueTranslation(text) {
    if (!text?.trim()) return;
    const clean = text.trim();
    // Merge with the last queued fragment if combined it's still a reasonable sentence
    const lastQ = txQueue[txQueue.length - 1];
    if (lastQ && (lastQ.length + clean.length + 1) < TX_MAX_CHARS) {
        txQueue[txQueue.length - 1] = lastQ + ' ' + clean;
    } else {
        txQueue.push(clean);
    }
    processTxQueue();
}

async function processTxQueue() {
    if (txProcessing) return; // already draining
    txProcessing = true;
    while (txQueue.length) {
        let text = txQueue.shift();
        // Pause-triggered flush: ensure sentence ends with punctuation
        if (!/[.!?,،؛؟…:]$/.test(text)) text += '.';
        // Throttle: wait so we never exceed the server's allowable rate
        const wait = TX_MIN_INTERVAL - (Date.now() - lastTxApiCall);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastTxApiCall = Date.now();
        await doTranslate(text);
    }
    txProcessing = false;
}


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { queueTranslation, processTxQueue });

export { queueTranslation, processTxQueue };
