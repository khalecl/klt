/* Khutbah Live Translator — ui/speak.js
   Optional: read each translation aloud (earphones). Off by default (cfg.speak).
   Uses the browser's speechSynthesis — no network, no dependencies.
   Hooked from app.js: addEntry → speakTranslation, startListen → unlockSpeech,
   stopListen → stopSpeaking. */

const SPEAK_MAX_BACKLOG = 2;   // drop oldest pending lines if reading falls behind
const speakQueue = [];
let speaking = false;
let voicesCache = [];

function synth() { return ('speechSynthesis' in window) ? window.speechSynthesis : null; }

function loadVoices() {
    const s = synth(); if (!s) return;
    voicesCache = s.getVoices() || [];
}
if (synth()) {
    loadVoices();
    try { synth().addEventListener('voiceschanged', loadVoices); } catch (e) { synth().onvoiceschanged = loadVoices; }
}

function pickVoice(lang) {
    if (!voicesCache.length) loadVoices();
    const base = (lang || '').toLowerCase().split('-')[0];
    return voicesCache.find(v => v.lang && v.lang.toLowerCase() === (lang || '').toLowerCase())
        || voicesCache.find(v => v.lang && v.lang.toLowerCase().startsWith(base))
        || null;
}

function cleanForSpeech(text) {
    if (!text) return '';
    let t = String(text).trim();
    if (t.startsWith('⚠️')) return '';           // "Translation unavailable" — skip
    t = t.replace(/^≈\s*/, '');                    // offline-dict gist marker
    t = t.replace(/[<>]/g, ' ');
    return t.trim();
}

function speakNext() {
    const s = synth();
    if (!s || speaking || !speakQueue.length) return;
    const text = speakQueue.shift();
    const lang = (document.getElementById('tgtLang') || {}).value || 'en';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = pickVoice(lang); if (v) u.voice = v;
    u.rate = (window.cfg && window.cfg.speakRate) || 1.1;
    u.onend = u.onerror = () => { speaking = false; speakNext(); };
    speaking = true;
    try { s.speak(u); } catch (e) { speaking = false; }
}

/** Called for every new translation (via addEntry decorator). */
function speakTranslation(text) {
    if (!window.cfg || !window.cfg.speak || !synth()) return;
    const t = cleanForSpeech(text);
    if (!t) return;
    speakQueue.push(t);
    while (speakQueue.length > SPEAK_MAX_BACKLOG) speakQueue.shift();
    speakNext();
}

/** iOS Safari only allows speech after a user gesture — call from the mic tap. */
function unlockSpeech() {
    const s = synth();
    if (!s || !window.cfg || !window.cfg.speak) return;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u); } catch (e) {}
}

function stopSpeaking() {
    speakQueue.length = 0; speaking = false;
    try { const s = synth(); if (s) s.cancel(); } catch (e) {}
}

Object.assign(window, { speakTranslation, unlockSpeech, stopSpeaking });
export { speakTranslation, unlockSpeech, stopSpeaking };
