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

async function toggleListen() { if (!isListening) await startListen(); else stopListen(); }

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
        let restarts = 0;
        // Long-speech handling. Chrome/Safari only confirm (final) words at a
        // pause, so during long unbroken speech nothing would be translated and
        // a recognition restart would drop it all. We therefore commit stable
        // interim text in chunks ourselves and, when the final arrives, send only
        // the part not already committed.
        let liveText = '', committed = '';
        const COMMIT_CHARS = 90;     // commit once this much new interim text has built up
        const HOLD_WORDS = 2;        // last words may still be revised — keep them back
        const wordCut = (txt, from) => {   // index after the last word we may commit
            const words = txt.slice(from).split(' ');
            if (words.length <= HOLD_WORDS) return from;
            return from + words.slice(0, words.length - HOLD_WORDS).join(' ').length;
        };
        const remainder = (full) => {      // part of full text not yet committed
            full = full.trim();
            if (!committed) return full;
            if (full.toLowerCase().startsWith(committed.toLowerCase())) return full.slice(committed.length).trim();
            // Engine revised earlier words: skip roughly what was already sent.
            if (full.length <= committed.length) return '';
            const sp = full.indexOf(' ', committed.length - 1);
            return sp === -1 ? '' : full.slice(sp).trim();
        };
        const send = (txt) => { txt = (txt || '').trim(); if (txt) window.pushFragment(txt, { isFinal: true }); };
        const rescueInterim = () => { send(remainder(liveText)); liveText = ''; committed = ''; };

        recognition.onstart = () => { isListening = true; restarts = 0; recognitionRestarting = false; updMicUI(true); spEmit('recognition-start', null); console.log('[v4.6] Recognition started on', IS_ANDROID ? 'Android' : 'Desktop/iOS'); if (IS_ANDROID && !stream) console.log('[v4.6] Android: skipping getUserMedia'); };

        recognition.onresult = (e) => {
            restarts = 0;
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '; }
            // All unconfirmed results (Chrome can hold several at once), not just the last.
            for (let i = 0; i < e.results.length; i++) { if (!e.results[i].isFinal) interim += e.results[i][0].transcript + ' '; }
            interim = interim.replace(/\s+/g, ' ').trim();
            document.getElementById('stsTxt').textContent = interim ? t('statusSpeechDetected') : t('statusListening');
            spEmit('recognition-interim', { interim: interim, final: final, transcript: final });

            if (final.trim()) {
                const f = final.replace(/\s+/g, ' ').trim();
                if (committed && committed.toLowerCase().startsWith(f.toLowerCase())) {
                    // Everything confirmed was already sent; keep the extra as committed.
                    committed = committed.slice(f.length).trim();
                } else {
                    send(remainder(f));
                    committed = '';
                }
                liveText = interim;
                if (interim) window.noteSpeechActivity();
                return;
            }
            if (!interim) return;
            liveText = interim;
            window.noteSpeechActivity();
            // Commit stable text during long speech so translation keeps flowing.
            if (!committed || interim.toLowerCase().startsWith(committed.toLowerCase())) {
                const from = committed.length;
                if (interim.length - from >= COMMIT_CHARS) {
                    const cut = wordCut(interim, from);
                    if (cut > from) { send(interim.slice(from, cut)); committed = interim.slice(0, cut).trim(); }
                }
            }
        };

        recognition.onnomatch = () => { console.warn('[v4.6] No match'); document.getElementById('stsTxt').textContent = '🎤 No match — try speaking louder...'; };
        recognition.onerror = (e) => {
            if (e.error !== 'no-speech') rescueInterim();
            console.warn('[v4.6] Recognition error:', e.error, e.message || '');
            if ((e.error === 'no-speech' || e.error === 'audio-capture' || e.error === 'network') && isListening && restarts < 15) { restarts++; setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY * 2); }
            else if (e.error === 'not-allowed') { alert('Microphone permission denied.'); stopListen(); }
            else if (e.error === 'language-not-supported') { alert('Language not supported for speech recognition on your device.'); stopListen(); }
            else if (e.error === 'aborted' && isListening && restarts < 15) { restarts++; setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY * 3); }
        };
        recognition.onend = () => { console.log('[v4.6] Recognition ended, isListening:', isListening); // Keep unconfirmed words; no forced flush (segmentation owns timing).
        rescueInterim();
        if (isListening) setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY); };

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
