/* Khutbah Live Translator — translator/speech.js
   SpeechRecognition lifecycle. Android/iOS branches preserved.
   Does NOT translate — it emits fragments to the segmentation layer.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

/** Announce recognition state. Fire-and-forget. */
function spEmit(name, detail) {
    try { window.dispatchEvent(new CustomEvent('khutbah:' + name, { detail: detail })); }
    catch (e) {}
}

function safeStartRecognition() {
    if (!recognition || !isListening || recognitionRestarting) return;
    recognitionRestarting = true;
    recognition.continuous = true; recognition.interimResults = true;
    recognition.lang = document.getElementById('srcLang').value;
    if (IS_ANDROID) recognition.maxAlternatives = 1;
    const doStart = () => { try { recognition.start(); } catch(e) { if (e.name !== 'InvalidStateError') console.warn('[v4.6] Recognition restart failed:', e.message); } setTimeout(() => { recognitionRestarting = false; }, RESTART_DELAY); };
    if (IS_ANDROID) setTimeout(doStart, 50); else doStart();
}

// Go through window.* so app.js decorators (session start/pause, final flush) always run.
async function toggleListen() { if (!isListening) await window.startListen(); else window.stopListen(); }

async function startListen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition not supported.\n\nAndroid: Use Chrome\niPhone/iPad: Use Safari'); return; }
    try {
        recognition = new SR(); recognition.continuous = true; recognition.interimResults = true;
        recognition.lang = document.getElementById('srcLang').value;
        if (IS_ANDROID) recognition.maxAlternatives = 1;
        // "Enhanced noise filter" off → don't open a second, processed mic stream at all,
        // so nothing can filter what Chrome's recognizer hears (best for a distant speaker).
        if (!IS_ANDROID && !(window.cfg && window.cfg.noiseFilter === false)) {
            // echoCancellation OFF: it removes sound played by this device itself (e.g. a video
            // of the speaker), so the recognizer barely heard it. KLT never plays through the speaker.
            const audioConstraints = { echoCancellation: false, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 16000 }, latency: { ideal: 0 } };
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            runViz(stream); setupRecorder(processedStream || stream);
        }
        if (cfg.wakeLock) await reqWakeLock();
        let restarts = 0, running = false;
        // Self-healing: Chrome refuses to restart recognition while the tab is in
        // the background, so restarts fail there and used to give up. A health
        // check restarts it whenever we should be listening but are not, and
        // returning to the tab resets the retry budget.
        if (window.__kltHealth) clearInterval(window.__kltHealth);
        if (window.__kltVis) document.removeEventListener('visibilitychange', window.__kltVis);
        window.__kltHealth = setInterval(() => {
            if (!isListening) { clearInterval(window.__kltHealth); return; }
            if (!running && !document.hidden && !recognitionRestarting) {
                console.log('[speech] health check: recognizer not running → restarting');
                restarts = 0; safeStartRecognition();
            }
        }, 3000);
        window.__kltVis = () => {
            if (document.hidden || !isListening) return;
            restarts = 0; recognitionRestarting = false;
            if (!running) { console.log('[speech] tab visible again → restarting mic'); safeStartRecognition(); }
        };
        document.addEventListener('visibilitychange', window.__kltVis);
        // ── Long-speech + frozen-recognizer handling ─────────────────────────
        // Browsers confirm (final) words only at a pause, sometimes never, and
        // Chrome can freeze on an unconfirmed result. We therefore track how much
        // of EACH result (by index) has already been sent, and send:
        //   • a final's unsent part when it arrives;
        //   • stable chunks of a long interim (every ~90 chars, last 2 words held);
        //   • the whole interim if it stops changing (watchdog);
        // and restart the recognizer if it stays frozen.
        // Tracking is by WORD count per result (not characters): when Chrome
        // corrects earlier words the count barely moves, so we never cut a word
        // in half or skip words.
        const COMMIT_WORDS = 10, HOLD_WORDS = 2;
        // Tracking is by WORD count over the WHOLE session transcript (all results
        // joined), so it doesn't matter how Chrome splits, merges or reshuffles
        // its result pieces. Reset when recognition restarts.
        let sentWords = 0, liveWords = [], lastSendAt = Date.now();
        const SEND_EVERY_MS = 3000, MIN_TIMED_WORDS = 4;   // fast speakers never pause: send every 3 s
        let stableTimer = null, stallTimer = null;
        const norm = (x) => (x || '').replace(/\s+/g, ' ').trim();
        const send = (txt) => { txt = norm(txt); if (txt) window.pushFragment(txt, { isFinal: true }); };
        const sendUpTo = (upto, why) => {
            upto = Math.min(upto, liveWords.length);
            if (upto <= sentWords) return;
            const piece = liveWords.slice(sentWords, upto).join(' ');
            if (why) console.log('[speech] ' + why + ':', piece.slice(0, 60));
            send(piece); sentWords = upto; lastSendAt = Date.now(); sentTail = liveWords.slice(Math.max(0, upto - 4), upto);
        };
        // Re-find our position if Chrome dropped or reshuffled earlier text:
        // locate the last words we sent and continue right after them.
        let sentTail = [];
        const key = (w) => (w || '').toLowerCase().replace(/[.,!?;:«»"']/g, '');
        const tailAt = (pos) => { const k = sentTail.length; if (pos < k) return false; for (let j = 0; j < k; j++) if (key(liveWords[pos - k + j]) !== key(sentTail[j])) return false; return true; };
        const realign = () => {
            if (!sentWords || !sentTail.length || tailAt(sentWords)) return;
            for (let pos = liveWords.length; pos >= sentTail.length; pos--) if (tailAt(pos)) { sentWords = pos; return; }
            // Tail not found: text was replaced. Continue from the same relative point if possible.
            if (sentWords > liveWords.length) { console.log('[speech] transcript shrank — resyncing'); sentWords = Math.max(0, liveWords.length - HOLD_WORDS - COMMIT_WORDS); }
        };
        const flushInterims = (why) => sendUpTo(liveWords.length, why);
        // Debug: last 300 raw recognition events. In the console: copy(JSON.stringify(__kltSpeechLog))
        window.__kltSpeechLog = window.__kltSpeechLog || [];
        const clearWatch = () => { clearTimeout(stableTimer); clearTimeout(stallTimer); };
        const armWatch = () => {
            clearWatch();
            stableTimer = setTimeout(() => {
                flushInterims('interim stable → translate');
                stallTimer = setTimeout(() => {
                    if (!isListening) return;
                    console.log('[speech] recognizer frozen → restarting');
                    try { recognition.stop(); } catch (e) {}
                }, 5000);
            }, ((window.cfg && window.cfg.silenceWait) || 1.5) * 1000 + 300);
        };
        const rescueInterim = () => { clearWatch(); flushInterims(); sentWords = 0; liveWords = []; sentTail = []; };

        recognition.onstart = () => { running = true; isListening = true; restarts = 0; recognitionRestarting = false; updMicUI(true); spEmit('recognition-start', null); console.log('[v4.6] Recognition started on', IS_ANDROID ? 'Android' : 'Desktop/iOS'); if (IS_ANDROID && !stream) console.log('[v4.6] Android: skipping getUserMedia'); };

        recognition.onresult = (e) => {
            restarts = 0;
            const parts = [], interimParts = [], finalParts = [];
            let lastFinal = true;
            for (let i = 0; i < e.results.length; i++) {
                const tx = norm(e.results[i][0].transcript), f = e.results[i].isFinal;
                if (!tx) continue;
                parts.push(tx); (f ? finalParts : interimParts).push(tx); lastFinal = f;
            }
            try { window.__kltSpeechLog.push({ t: Date.now(), ri: e.resultIndex, r: Array.from(e.results).map(r => [r[0].transcript, r.isFinal]) }); if (window.__kltSpeechLog.length > 300) window.__kltSpeechLog.shift(); } catch (x) {}
            // Android Chrome repeats earlier text inside later results: use the longest one only.
            const joined = IS_ANDROID ? parts.reduce((a, b) => (b.length > a.length ? b : a), '') : parts.join(' ');
            liveWords = joined.split(' ').filter(Boolean);
            realign();
            const hasInterim = interimParts.length > 0;
            if (!hasInterim) {
                clearWatch();
                sendUpTo(liveWords.length);                       // everything confirmed
            } else {
                // confirmed words up to the interim part are safe; hold back the last words of the interim
                const stable = liveWords.length - HOLD_WORDS;
                if (stable - sentWords >= COMMIT_WORDS) sendUpTo(stable);
                else if (stable - sentWords >= MIN_TIMED_WORDS && Date.now() - lastSendAt >= SEND_EVERY_MS) sendUpTo(stable);
                window.noteSpeechActivity(); armWatch();
            }
            document.getElementById('stsTxt').textContent = hasInterim ? t('statusSpeechDetected') : t('statusListening');
            const interimText = interimParts.join(' ');
            const finalText = finalParts.join(' ');
            spEmit('recognition-interim', { interim: interimText, final: finalText, transcript: finalText });
        };

        recognition.onnomatch = () => { console.warn('[v4.6] No match'); document.getElementById('stsTxt').textContent = '🎤 No match — try speaking louder...'; };
        recognition.onerror = (e) => {
            if (e.error !== 'no-speech') rescueInterim();
            console.warn('[v4.6] Recognition error:', e.error, e.message || '');
            if ((e.error === 'no-speech' || e.error === 'audio-capture' || e.error === 'network') && isListening && restarts < 15) { restarts++; setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY * 2); }
            else if (e.error === 'not-allowed' && (document.hidden || running === false && restarts > 0)) { console.log('[speech] mic blocked while tab in background — will resume when visible'); }
            else if (e.error === 'not-allowed') { alert('Microphone permission denied.'); stopListen(); }
            else if (e.error === 'language-not-supported') { alert('Language not supported for speech recognition on your device.'); stopListen(); }
            else if (e.error === 'aborted' && isListening && restarts < 15) { restarts++; setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY * 3); }
        };
        recognition.onend = () => { running = false; console.log('[v4.6] Recognition ended, isListening:', isListening); // Keep unconfirmed words; no forced flush (segmentation owns timing).
        rescueInterim();
        // In a background tab Chrome refuses restarts; wait for the tab to be visible.
        if (isListening && !document.hidden) setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY); };

        if (IS_ANDROID) { setTimeout(() => { try { recognition.start(); console.log('[v4.6] Android: recognition.start() called (deferred)'); } catch(e) { console.error('[v4.6] Android start failed:', e); } }, 50); }
        else recognition.start();
    } catch (e) { console.error('[v4.6] startListen error:', e); alert('Microphone access denied.'); }
}

function stopListen() {
    isListening = false; recognitionRestarting = false;
    if (recognition) try { recognition.stop(); } catch(e){}
    if (audioCtx) try { audioCtx.close(); } catch(e){} audioCtx = null;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (processedStream) { processedStream.getTracks().forEach(t => t.stop()); processedStream = null; }
    audioNodes = {}; relWakeLock(); updMicUI(false);
    spEmit('recognition-stop', null);
}

function updMicUI(on) {
    const btn = document.getElementById('micBtn'), dot = document.getElementById('stsDot'), txt = document.getElementById('stsTxt');
    if (on) { btn.className = 'mic live'; btn.textContent = '⏹️'; dot.classList.add('on'); txt.textContent = t('statusListening'); if (IS_ANDROID) startFakeViz(); }
    else { btn.className = 'mic idle'; btn.textContent = '🎤'; dot.classList.remove('on'); dot.style.boxShadow = 'none'; txt.textContent = t('statusReady'); if (IS_ANDROID) stopFakeViz(); document.querySelectorAll('.viz-bar').forEach(b => { b.style.height = '8px'; b.style.background = 'rgba(212,168,67,.3)'; }); }
}

// [migrated → appState.audio.fakeVizInterval] (js/state.js)
function startFakeViz() { const bars = document.querySelectorAll('.viz-bar'); fakeVizInterval = setInterval(() => { bars.forEach(bar => { const h = 6 + Math.random() * 28; bar.style.height = h + 'px'; bar.style.background = h > 15 ? 'var(--gold)' : 'rgba(212,168,67,.3)'; }); }, 150); }
function stopFakeViz() { clearInterval(fakeVizInterval); fakeVizInterval = null; }

// ══════════════════════════════════════════════
// TRANSLATION ENGINE
// ══════════════════════════════════════════════


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { safeStartRecognition, toggleListen, startListen, stopListen, updMicUI, startFakeViz, stopFakeViz });

export { safeStartRecognition, toggleListen, startListen, stopListen, updMicUI, startFakeViz, stopFakeViz };
