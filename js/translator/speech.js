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
        let transcript = '', silenceTimer, bufferFlushTimer, restarts = 0;

        recognition.onstart = () => { isListening = true; restarts = 0; recognitionRestarting = false; updMicUI(true); spEmit('recognition-start', null); console.log('[v4.6] Recognition started on', IS_ANDROID ? 'Android' : 'Desktop/iOS'); if (IS_ANDROID && !stream) console.log('[v4.6] Android: skipping getUserMedia'); };

        recognition.onresult = (e) => {
            clearTimeout(silenceTimer); restarts = 0;
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '; else interim = e.results[i][0].transcript; }
            if (final) { if (IS_ANDROID) transcript = final; else transcript += final; }
            document.getElementById('stsTxt').textContent = interim ? t('statusSpeechDetected') : t('statusListening');
            spEmit('recognition-interim', { interim: interim, final: final, transcript: transcript });
            if (cfg.instant && final && transcript.trim()) {
                clearTimeout(bufferFlushTimer); clearTimeout(silenceTimer);
                if (IS_ANDROID) { silenceTimer = setTimeout(() => { if (transcript.trim()) { queueTranslation(transcript.trim()); transcript = ''; } }, 600); }
                else { bufferFlushTimer = null; queueTranslation(transcript.trim()); transcript = ''; }
            } else if (!cfg.instant && (transcript + interim).trim()) {
                clearTimeout(silenceTimer);
                silenceTimer = setTimeout(() => { if (transcript.trim()) { clearTimeout(bufferFlushTimer); bufferFlushTimer = null; queueTranslation(transcript.trim()); transcript = ''; } }, cfg.silenceWait * 1000);
            }
            if (transcript.trim() && !bufferFlushTimer) {
                bufferFlushTimer = setTimeout(() => { bufferFlushTimer = null; if (transcript.trim()) { clearTimeout(silenceTimer); queueTranslation(transcript.trim()); transcript = ''; } }, cfg.bufferTime * 1000);
            }
        };

        recognition.onnomatch = () => { console.warn('[v4.6] No match'); document.getElementById('stsTxt').textContent = '🎤 No match — try speaking louder...'; };
        recognition.onerror = (e) => {
            console.warn('[v4.6] Recognition error:', e.error, e.message || '');
            if ((e.error === 'no-speech' || e.error === 'audio-capture' || e.error === 'network') && isListening && restarts < 15) { restarts++; setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY * 2); }
            else if (e.error === 'not-allowed') { alert('Microphone permission denied.'); stopListen(); }
            else if (e.error === 'language-not-supported') { alert('Language not supported for speech recognition on your device.'); stopListen(); }
            else if (e.error === 'aborted' && isListening && restarts < 15) { restarts++; setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY * 3); }
        };
        recognition.onend = () => { console.log('[v4.6] Recognition ended, isListening:', isListening); if (transcript.trim()) { queueTranslation(transcript.trim()); transcript = ''; } if (isListening) setTimeout(() => { if (isListening) safeStartRecognition(); }, RESTART_DELAY); };

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
