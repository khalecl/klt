/* Khutbah Live Translator — quran/audio.js
   Recitation player: 21 reciters, auto-advance, floating controls.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

async function qaFetchAudio(surahNum, reciter) {
    const ck = `audio_${surahNum}_${reciter}`; if (quranCache[ck]) return quranCache[ck];
    try { const res = await fetchWithTimeout(`https://api.alquran.cloud/v1/surah/${surahNum}/${reciter}`, {}, 10000); const data = await res.json(); if (data.code === 200) { const urls = data.data.ayahs.map(a => a.audio); quranCache[ck] = urls; return urls; } } catch (e) { console.error('Audio fetch error:', e); }
    return null;
}

async function qaPlayFromAyah(ayahNum) {
    const surahNum = document.getElementById('surahSelect').value; if (!surahNum) return;
    const reciter = document.getElementById('qaReciterSelect').value; qaState.reciter = reciter; qaState.surahNum = surahNum;
    document.getElementById('qaInfo').textContent = 'Loading audio...'; document.getElementById('qaPlayBtn').disabled = true;
    const urls = await qaFetchAudio(surahNum, reciter);
    if (!urls) { document.getElementById('qaInfo').textContent = 'Audio unavailable'; document.getElementById('qaPlayBtn').disabled = false; return; }
    qaState.audioUrls = urls; qaState.totalAyahs = urls.length; qaState.currentAyah = ayahNum; document.getElementById('qaPlayBtn').disabled = false;
    qaPlayCurrent();
}

// Toggle play/pause for specific ayah button
function qaToggleAyahPlay(ayahNum) {
    const floatingPlay = document.getElementById('qaFloatingPlay');
    // If playing this exact ayah, toggle pause/play
    if (qaState.playing && qaState.currentAyah === ayahNum) {
        qaTogglePlay();
        // Sync floating button to paused state
        if (floatingPlay) {
            floatingPlay.textContent = '▶';
            floatingPlay.classList.remove('playing');
        }
    } else if (qaState.paused && qaState.currentAyah === ayahNum) {
        // Resume from paused
        qaState.audio.play().catch(() => {});
        qaState.paused = false;
        qaState.playing = true;
        document.getElementById('qaPlayBtn').textContent = '⏸';
        document.getElementById('qaPlayBtn').classList.add('playing');
        // Sync floating button to playing state
        if (floatingPlay) {
            floatingPlay.textContent = '⏸';
            floatingPlay.classList.add('playing');
        }
        qaState.progressTimer = setInterval(qaUpdateProgress, 200);
    } else {
        // Start playing from this ayah
        qaPlayFromAyah(ayahNum);
        // Sync floating button to playing state
        if (floatingPlay) {
            floatingPlay.textContent = '⏸';
            floatingPlay.classList.add('playing');
        }
    }
}


// Update all ayah buttons to show correct state
function qaUpdateAyahButtons() {
    document.querySelectorAll('.ayah-play-btn').forEach(btn => {
        const card = btn.closest('.ayah-card');
        if (!card) return;
        const ayahNum = parseInt(card.dataset.ayah);

        if (qaState.playing && qaState.currentAyah === ayahNum) {
            btn.textContent = '⏸';
            btn.classList.add('playing');
        } else if (qaState.paused && qaState.currentAyah === ayahNum) {
            btn.textContent = '▶';
            btn.classList.remove('playing');
        } else {
            btn.textContent = '▶';
            btn.classList.remove('playing');
        }
    });
}

// Floating bar visibility and state management
function qaUpdateFloatingBar() {
    const floatingBar = document.getElementById('qaFloatingBar');
    const floatingPlay = document.getElementById('qaFloatingPlay');
    const floatingPrev = document.getElementById('qaFloatingPrev');
    const floatingNext = document.getElementById('qaFloatingNext');
    const floatingInfo = document.getElementById('qaFloatingInfo');

    if (!floatingBar) return;

    // Show floating bar when playing or paused, hide otherwise
    if (qaState.playing || qaState.paused) {
        floatingBar.classList.add('visible');
    } else {
        floatingBar.classList.remove('visible');
        // Clear info when hidden
        if (floatingInfo) floatingInfo.textContent = '—';
        return;
    }

    // Update play/pause button state
    if (floatingPlay) {
        if (qaState.playing) {
            floatingPlay.textContent = '⏸';
            floatingPlay.classList.add('playing');
        } else {
            floatingPlay.textContent = '▶';
            floatingPlay.classList.remove('playing');
        }
    }

    // Update info text
    if (floatingInfo) {
        const surahName = SURAH_LIST[qaState.surahNum - 1] || '';
        floatingInfo.textContent = `Ayah ${qaState.currentAyah}/${qaState.totalAyahs} · ${surahName}`;
    }
}

function qaPlayCurrent() {
    const idx = qaState.currentAyah - 1; if (idx < 0 || idx >= qaState.audioUrls.length) { qaStop(); return; }
    qaState.audio.pause(); qaState.audio.src = qaState.audioUrls[idx]; qaState.audio.playbackRate = qaState.speed;
    qaState.audio.play().catch(() => {}); qaState.playing = true; qaState.paused = false;
    const playBtn = document.getElementById('qaPlayBtn'); playBtn.textContent = '⏸'; playBtn.classList.add('playing');
    qaHighlightAyah(qaState.currentAyah); qaUpdateInfo(); qaUpdateAyahButtons(); qaUpdateFloatingBar();
    clearInterval(qaState.progressTimer); qaState.progressTimer = setInterval(qaUpdateProgress, 200);
    qaState.audio.onended = () => { if (qaState.currentAyah < qaState.totalAyahs) { qaState.currentAyah++; qaPlayCurrent(); } else qaStop(); };
    qaState.audio.onerror = () => { document.getElementById('qaInfo').textContent = 'Audio error — skipping...'; setTimeout(() => { if (qaState.currentAyah < qaState.totalAyahs) { qaState.currentAyah++; qaPlayCurrent(); } else qaStop(); }, 1000); };
}

function qaTogglePlay() { 
    if (!qaState.playing && !qaState.paused) { 
        qaPlayFromAyah(1); 
        return; 
    } 
    const floatingPlay = document.getElementById('qaFloatingPlay');
    if (qaState.paused) { 
        qaState.audio.play().catch(() => {}); 
        qaState.paused = false; 
        qaState.playing = true; 
        document.getElementById('qaPlayBtn').textContent = '⏸'; 
        document.getElementById('qaPlayBtn').classList.add('playing'); 
        if (floatingPlay) {
            floatingPlay.textContent = '⏸';
            floatingPlay.classList.add('playing');
        }
        qaState.progressTimer = setInterval(qaUpdateProgress, 200); 
        qaUpdateAyahButtons(); 
    } else { 
        qaState.audio.pause(); 
        qaState.paused = true; 
        qaState.playing = false; 
        document.getElementById('qaPlayBtn').textContent = '▶'; 
        document.getElementById('qaPlayBtn').classList.remove('playing'); 
        if (floatingPlay) {
            floatingPlay.textContent = '▶';
            floatingPlay.classList.remove('playing');
        }
        clearInterval(qaState.progressTimer); 
        qaUpdateAyahButtons(); 
    } 
}

function qaStop() {
    // Clear progress timer first to prevent any pending updates
    if (qaState.progressTimer) {
        clearInterval(qaState.progressTimer);
        qaState.progressTimer = null;
    }

    // Clear event handlers FIRST to prevent orphaned callbacks
    // This is critical - must clear before any audio operations
    qaState.audio.onended = null;
    qaState.audio.onerror = null;

    // Safely stop audio without triggering errors
    try {
        qaState.audio.pause();
    } catch (e) {
        // Ignore pause errors - audio might already be stopped
    }

    try {
        // Reset audio element completely
        qaState.audio.currentTime = 0;
        qaState.audio.src = '';
        qaState.audio.load(); // Force reload to clear any pending operations
    } catch (e) {
        // Ignore src clearing errors
    }

    // Reset state
    qaState.playing = false;
    qaState.paused = false;
    qaState.currentAyah = 0;
    qaState.audioUrls = [];

    // Update UI
    clearInterval(qaState.progressTimer);
    const playBtn = document.getElementById('qaPlayBtn');
    if (playBtn) {
        playBtn.textContent = '▶';
        playBtn.classList.remove('playing');
    }
    const floatingPlay = document.getElementById('qaFloatingPlay');
    if (floatingPlay) {
        floatingPlay.textContent = '▶';
        floatingPlay.classList.remove('playing');
    }
    const progressFill = document.getElementById('qaProgressFill');
    if (progressFill) progressFill.style.width = '0%';
    const qaInfo = document.getElementById('qaInfo');
    if (qaInfo) qaInfo.textContent = '—';
    document.querySelectorAll('.ayah-card.ayah-playing').forEach(el => el.classList.remove('ayah-playing'));
    qaUpdateAyahButtons();
    qaUpdateFloatingBar();
}
function qaPlayNext() { if (!qaState.playing && !qaState.paused) return; if (qaState.currentAyah < qaState.totalAyahs) { qaState.currentAyah++; qaPlayCurrent(); } }
function qaPlayPrev() { if (!qaState.playing && !qaState.paused) return; if (qaState.currentAyah > 1) { qaState.currentAyah--; qaPlayCurrent(); } }
function qaHighlightAyah(ayahNum) { document.querySelectorAll('.ayah-card.ayah-playing').forEach(el => el.classList.remove('ayah-playing')); const card = document.getElementById(`ayah-${ayahNum}`); if (card) { card.classList.add('ayah-playing'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
function qaUpdateInfo() { const surahName = SURAH_LIST[qaState.surahNum - 1] || ''; document.getElementById('qaInfo').textContent = `Ayah ${qaState.currentAyah}/${qaState.totalAyahs} · ${surahName}`; }
function qaUpdateProgress() { const a = qaState.audio; if (a.duration) document.getElementById('qaProgressFill').style.width = (a.currentTime / a.duration) * 100 + '%'; }
function qaSeek(e) { const bar = e.currentTarget; const rect = bar.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; if (qaState.audio.duration) qaState.audio.currentTime = pct * qaState.audio.duration; }
function qaCycleSpeed() { const idx = QA_SPEEDS.indexOf(qaState.speed); qaState.speed = QA_SPEEDS[(idx + 1) % QA_SPEEDS.length]; qaState.audio.playbackRate = qaState.speed; document.getElementById('qaSpeedBtn').textContent = qaState.speed + '×'; }
function qaChangeReciter() { const wasPlaying = qaState.playing || qaState.paused; const currentAyah = qaState.currentAyah || 1; if (wasPlaying) { qaState.audio.pause(); qaState.playing = false; qaState.paused = false; clearInterval(qaState.progressTimer); qaPlayFromAyah(currentAyah); } }


// ══════════════════════════════════════════════
// DU'A TAB
// ══════════════════════════════════════════════


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { qaFetchAudio, qaPlayFromAyah, qaToggleAyahPlay, qaUpdateAyahButtons, qaUpdateFloatingBar, qaPlayCurrent, qaTogglePlay, qaStop, qaPlayNext, qaPlayPrev, qaHighlightAyah, qaUpdateInfo, qaUpdateProgress, qaSeek, qaCycleSpeed, qaChangeReciter });

export { qaFetchAudio, qaPlayFromAyah, qaToggleAyahPlay, qaUpdateAyahButtons, qaUpdateFloatingBar, qaPlayCurrent, qaTogglePlay, qaStop, qaPlayNext, qaPlayPrev, qaHighlightAyah, qaUpdateInfo, qaUpdateProgress, qaSeek, qaCycleSpeed, qaChangeReciter };
