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
        if (!IS_ANDROID) {
            const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: { ideal: 16000 }, latency: { ideal: 0 } };
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
        const COMMIT_WORDS = 12, HOLD_WORDS = 2;
        let sent = {}, lastResults = [];          // sent[i] = words of result i already sent; -1 = done
        let stableTimer = null, stallTimer = null;
        const norm = (x) => (x || '').replace(/\s+/g, ' ').trim();
        const send = (txt) => { txt = norm(txt); if (txt) window.pushFragment(txt, { isFinal: true }); };
        const sendWords = (i, text, upto) => {    // send words [sent[i], upto)
            const words = norm(text).split(' ').filter(Boolean);
            const from = Math.max(0, sent[i] || 0);
            upto = Math.min(upto == null ? words.length : upto, words.length);
            if (upto > from) send(words.slice(from, upto).join(' '));
            sent[i] = Math.max(from, upto);
        };
        const flushInterims = (why) => {          // send everything not yet sent
            lastResults.forEach((r, i) => {
                if (r.final || sent[i] === -1) return;
                const n = r.text ? r.text.split(' ').length : 0;
                if (n > (sent[i] || 0)) { if (why) console.log('[speech] ' + why + ':', r.text.split(' ').slice(sent[i] || 0).join(' ').slice(0, 60)); sendWords(i, r.text); }
            });
        };
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
        const rescueInterim = () => { clearWatch(); flushInterims(); sent = {}; lastResults = []; };

        recognition.onstart = () => { running = true; isListening = true; restarts = 0; recognitionRestarting = false; updMicUI(true); spEmit('recognition-start', null); console.log('[v4.6] Recognition started on', IS_ANDROID ? 'Android' : 'Desktop/iOS'); if (IS_ANDROID && !stream) console.log('[v4.6] Android: skipping getUserMedia'); };

        recognition.onresult = (e) => {
            restarts = 0;
            lastResults = [];
            let hasInterim = false;
            for (let i = 0; i < e.results.length; i++) {
                const text = norm(e.results[i][0].transcript), isFinal = e.results[i].isFinal;
                lastResults.push({ text: text, final: isFinal });
                if (i < e.resultIndex) continue;
                if (isFinal) { if (sent[i] !== -1) { sendWords(i, text); sent[i] = -1; } }
                else {
                    hasInterim = true;
                    if (sent[i] === -1) sent[i] = 0;
                    const n = text ? text.split(' ').length : 0, stable = n - HOLD_WORDS;
                    if (stable - (sent[i] || 0) >= COMMIT_WORDS) sendWords(i, text, stable);
                }
            }
            document.getElementById('stsTxt').textContent = hasInterim ? t('statusSpeechDetected') : t('statusListening');
            const interimText = lastResults.filter(r => !r.final).map(r => r.text).join(' ');
            const finalText = lastResults.slice(e.resultIndex).filter(r => r.final).map(r => r.text).join(' ');
            spEmit('recognition-interim', { interim: interimText, final: finalText, transcript: finalText });
            if (hasInterim) { window.noteSpeechActivity(); armWatch(); } else clearWatch();
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
