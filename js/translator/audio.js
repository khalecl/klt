/* Khutbah Live Translator — translator/audio.js
   Microphone capture, Web Audio DSP chain, recorder, wake lock.
   DSP filter values are UNCHANGED from the baseline.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function buildViz() {
    const c = document.getElementById('viz'); c.innerHTML = '';
    for (let i = 0; i < 16; i++) { const b = document.createElement('div'); b.className = 'viz-bar'; c.appendChild(b); }
}

 function runViz(rawStream) {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(rawStream);
        let lastNode = source;
        if (cfg.noiseFilter) {
            // ── v4.7: Aggressive far-mic chain (mosque-distance mode) ──
            // 1. Stronger highpass at 180 Hz to kill room rumble
            const highpass = audioCtx.createBiquadFilter();
            highpass.type = 'highpass'; highpass.frequency.value = 180; highpass.Q.value = 0.7;
            lastNode.connect(highpass); lastNode = highpass; audioNodes.highpass = highpass;

            // 2. Pre-emphasis: 1-pole high-shelf, ~+6dB/oct above 1.6 kHz
            //    Undoes the low-pass coloration that distance + reverb impose
            const preEmph = audioCtx.createIIRFilter([1, -0.97], [1]);
            lastNode.connect(preEmph); lastNode = preEmph; audioNodes.preEmph = preEmph;

            // 3. Lowpass at 6 kHz (slightly higher than before — keep more consonant detail)
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = 'lowpass'; lowpass.frequency.value = 6000; lowpass.Q.value = 0.7;
            lastNode.connect(lowpass); lastNode = lowpass; audioNodes.lowpass = lowpass;

            // 4. AGGRESSIVE presence boost at 2.2 kHz (was +4 dB, now +9 dB)
            //    This is the F2/F3 formant region — what the recognizer keys on
            const presence = audioCtx.createBiquadFilter();
            presence.type = 'peaking'; presence.frequency.value = 2200;
            presence.gain.value = 9; presence.Q.value = 0.8;
            lastNode.connect(presence); lastNode = presence; audioNodes.presence = presence;

            // 5. NEW: High-shelf at 4 kHz, +6 dB — restores consonant articulation (s, t, sh)
            const airShelf = audioCtx.createBiquadFilter();
            airShelf.type = 'highshelf'; airShelf.frequency.value = 4000; airShelf.gain.value = 6;
            lastNode.connect(airShelf); lastNode = airShelf; audioNodes.airShelf = airShelf;

            // 6. Compressor (unchanged)
            const compressor = audioCtx.createDynamicsCompressor();
            compressor.threshold.value = -30; compressor.knee.value = 15; compressor.ratio.value = 8;
            compressor.attack.value = 0.005; compressor.release.value = 0.15;
            lastNode.connect(compressor); lastNode = compressor; audioNodes.compressor = compressor;
        }
        const gainNode = audioCtx.createGain(); gainNode.gain.value = cfg.voiceGain;
        lastNode.connect(gainNode); lastNode = gainNode; audioNodes.gain = gainNode;
        if (cfg.noiseGate > 0 && !IS_ANDROID) {
            const gateNode = audioCtx.createScriptProcessor(2048, 1, 1);
            const gateThreshold = cfg.noiseGate / 100;
            gateNode.onaudioprocess = (e) => { const input = e.inputBuffer.getChannelData(0); const output = e.outputBuffer.getChannelData(0); let rms = 0; for (let i = 0; i < input.length; i++) rms += input[i] * input[i]; rms = Math.sqrt(rms / input.length); const gate = rms > gateThreshold ? 1 : 0; for (let i = 0; i < input.length; i++) output[i] = input[i] * gate; };
            lastNode.connect(gateNode); lastNode = gateNode; audioNodes.gate = gateNode;
        }
        const destNode = audioCtx.createMediaStreamDestination(); lastNode.connect(destNode); processedStream = destNode.stream;
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; lastNode.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const bars = document.querySelectorAll('.viz-bar');
        (function loop() {
            if (!isListening || !audioCtx) return;
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const dot = document.getElementById('stsDot');
            dot.style.boxShadow = avg > cfg.threshold ? `0 0 ${Math.min(avg/3,16)}px var(--gold)` : 'none';
            bars.forEach((bar, i) => { const v = data[i * 4] || 0; bar.style.height = Math.max(6, (v / 255) * 40) + 'px'; bar.style.background = avg > cfg.threshold ? 'var(--gold)' : 'rgba(212,168,67,.3)'; });
            requestAnimationFrame(loop);
        })();
    } catch(e) { console.warn('[v4.7] Audio processing setup failed:', e); processedStream = rawStream; }
}

// ══════════════════════════════════════════════
// SPEECH RECOGNITION
// ══════════════════════════════════════════════

function setupRecorder(s) {
    try { const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/wav'; mediaRecorder = new MediaRecorder(s, { mimeType: mime }); mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); }; mediaRecorder.onstop = () => { const blob = new Blob(audioChunks, { type: mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'wav'; a.download = `khutbah-${new Date().toISOString().slice(0,10)}.${ext}`; a.click(); URL.revokeObjectURL(a.href); audioChunks = []; }; } catch(e) {}
}

function toggleRec() {
    if (!mediaRecorder) { alert('Start listening first'); return; }
    const btn = document.getElementById('recBtn'), txt = document.getElementById('recTxt');
    if (!isRecording) { audioChunks = []; mediaRecorder.start(1000); isRecording = true; txt.textContent = t('btnRecStop'); btn.style.borderColor = '#e53935'; btn.style.color = '#e53935'; }
    else { mediaRecorder.stop(); isRecording = false; txt.textContent = t('btnRec'); btn.style.borderColor = ''; btn.style.color = ''; }
}

async function reqWakeLock() { if ('wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch(e) {} } }
async function relWakeLock() { if (wakeLock) { try { await wakeLock.release(); } catch(e) {} wakeLock = null; } }
/* visibilitychange handler moved to js/app.js (single registration) */


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { buildViz, runViz, setupRecorder, toggleRec, reqWakeLock, relWakeLock });

export { buildViz, runViz, setupRecorder, toggleRec, reqWakeLock, relWakeLock };
