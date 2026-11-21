/* Khutbah Live Translator — ui/speak.js
   Optional: read each translation aloud (earphones). Off by default (cfg.speak).
   Uses the browser's speechSynthesis — no network, no dependencies.
   Hooked from app.js: addEntry → speakTranslation, startListen → unlockSpeech,
   stopListen → stopSpeaking.

   Voice choice (cfg.speakVoice): 'auto' | 'female' | 'male' | <voiceURI>.
   Browsers don't say a voice's gender, so it is guessed from the voice name
   (known female/male names on Android, iOS, Windows, Chrome). If no voice of the
   wanted gender exists for the language, the best voice is used with a lower
   (male) or higher (female) pitch.

   Robustness: Chrome sometimes never fires onend (utterance garbage-collected,
   engine paused). We keep a reference to the current utterance, call resume(),
   and a watchdog moves on if a line takes far longer than expected. */

const SPEAK_MAX_BACKLOG = 2;   // drop oldest pending lines if reading falls behind
const speakQueue = [];
let speaking = false;
let voicesCache = [];
let current = null;            // keep a reference: stops Chrome dropping onend
let watchdog = null;

// Lower-case name fragments. Checked against voice.name and voiceURI.
const FEMALE = ['zira', 'hazel', 'susan', 'linda', 'heera', 'hoda', 'salma', 'zariyah', 'amina', 'samantha',
    'victoria', 'karen', 'moira', 'tessa', 'fiona', 'veena', 'kate', 'serena', 'allison', 'ava', 'zuzana', 'laila', 'mariam',
    'milena', 'katya', 'irina', 'yelda', 'amelie', 'audrey', 'monica', 'paulina', 'damayanti', 'ting-ting', 'sin-ji', 'kyoko',
    'yuna', 'sara', 'nora', 'alva', 'ellen', 'anna', 'alice', 'joana', 'luciana', 'jenny', 'aria', 'sonia',
    'libby', 'natasha', 'clara', 'emma', 'nanami', 'xiaoxiao', 'ardi_f', 'sfg', 'iob', 'iog', 'tpc', 'tpf', 'cxx', 'arc', 'arz', 'dfc', 'rue'];
const MALE = ['david', 'mark', 'george', 'james', 'richard', 'ravi', 'naayf', 'hamed', 'maged', 'majed', 'tarik', 'daniel',
    'alex', 'fred', 'oliver', 'arthur', 'aaron', 'rishi', 'tom', 'yuri', 'pavel', 'dmitri', 'maxim', 'cem', 'thomas', 'jorge', 'diego',
    'juan', 'luca', 'xander', 'reed', 'eddy', 'grandpa', 'rocko', 'guy', 'ryan', 'eric', 'christopher', 'roger', 'steffan', 'dmitry',
    'iol', 'iom', 'tpd', 'ard', 'are', 'dfd', 'ruc', 'rud'];

function synth() { return ('speechSynthesis' in window) ? window.speechSynthesis : null; }

function loadVoices() {
    const s = synth(); if (!s) return;
    voicesCache = s.getVoices() || [];
    try { window.dispatchEvent(new CustomEvent('khutbah:voices-changed')); } catch (e) {}
}
if (synth()) {
    loadVoices();
    try { synth().addEventListener('voiceschanged', loadVoices); } catch (e) { synth().onvoiceschanged = loadVoices; }
}

function has(list, v) {
    // Whole words only ("Denmark" must not match "mark"). Android names look like
    // "ar-xa-x-ard-local": the 3-letter code is one of the words.
    const n = ((v.name || '') + ' ' + (v.voiceURI || '')).toLowerCase();
    const words = n.split(/[^a-z]+/);
    return list.some(k => k.includes(' ') ? n.includes(k) : words.includes(k));
}
/** 'female' | 'male' | '' */
function voiceGender(v) {
    if (!v) return '';
    const f = has(FEMALE, v), m = has(MALE, v);
    if (/\bfemale\b/i.test(v.name)) return 'female';
    if (/\bmale\b/i.test(v.name)) return 'male';
    return f && !m ? 'female' : m && !f ? 'male' : '';
}

function targetLang() { return (document.getElementById('tgtLang') || {}).value || 'en'; }

/** Voices for a language (exact region first). */
function voicesFor(lang) {
    if (!voicesCache.length) loadVoices();
    const l = (lang || '').toLowerCase(), base = l.split('-')[0];
    const list = voicesCache.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').split('-')[0] === base);
    return list.sort((a, b) => (b.lang.toLowerCase() === l) - (a.lang.toLowerCase() === l) || (b.localService - a.localService));
}

/** → { voice, pitch } for the current setting. */
function pickVoice(lang) {
    const pref = (window.cfg && window.cfg.speakVoice) || 'auto';
    const list = voicesFor(lang);
    if (pref !== 'auto' && pref !== 'female' && pref !== 'male') {
        const v = list.find(x => x.voiceURI === pref) || voicesCache.find(x => x.voiceURI === pref && x.lang && x.lang.toLowerCase().startsWith((lang || '').split('-')[0]));
        if (v) return { voice: v, pitch: 1 };
    }
    if (pref === 'female' || pref === 'male') {
        const v = list.find(x => voiceGender(x) === pref);
        if (v) return { voice: v, pitch: 1 };
        const other = list[0] || null;   // no voice of that gender: shift pitch
        const g = voiceGender(other);
        return { voice: other, pitch: g === pref ? 1 : (pref === 'male' ? 0.75 : 1.2) };
    }
    return { voice: list[0] || null, pitch: 1 };
}

function cleanForSpeech(text) {
    if (!text) return '';
    let t = String(text).trim();
    if (t.startsWith('⚠️')) return '';           // "Translation unavailable" — skip
    t = t.replace(/^≈\s*/, '');                    // offline-dict gist marker
    t = t.replace(/[<>]/g, ' ');
    return t.trim();
}

function finish() {
    clearTimeout(watchdog); watchdog = null;
    speaking = false; current = null;
    setTimeout(speakNext, 0);
}

function sayNow(text, lang, onDone) {
    const s = synth(); if (!s) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const { voice, pitch } = pickVoice(lang);
    if (voice) { try { u.voice = voice; u.lang = voice.lang; } catch (e) { console.warn('[speak] voice rejected, using default'); } }
    u.pitch = pitch;
    u.rate = (window.cfg && window.cfg.speakRate) || 1.1;
    u.volume = 1;
    u.onend = u.onerror = (ev) => { if (ev && ev.type === 'error') console.warn('[speak] error:', ev.error); onDone(); };
    current = u;
    try { if (s.paused) s.resume(); s.speak(u); } catch (e) { console.warn('[speak]', e); return false; }
    // Watchdog: ~75 ms per character at rate 1, plus 2.5 s.
    clearTimeout(watchdog);
    watchdog = setTimeout(() => { console.warn('[speak] no end event — moving on'); try { s.cancel(); } catch (e) {} onDone(); },
        2500 + text.length * 75 / u.rate);
    return true;
}

function speakNext() {
    if (!synth() || speaking || !speakQueue.length) return;
    const text = speakQueue.shift();
    speaking = true;
    if (!sayNow(text, targetLang(), finish)) speaking = false;
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
    try { if (s.paused) s.resume(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u); } catch (e) {}
}

function stopSpeaking() {
    speakQueue.length = 0; speaking = false; current = null;
    clearTimeout(watchdog); watchdog = null;
    try { const s = synth(); if (s) s.cancel(); } catch (e) {}
}

const SAMPLES = {
    en: 'This is how the translation will sound.', ar: 'هكذا ستُقرأ الترجمة.', ur: 'ترجمہ اس طرح سنائی دے گا۔',
    fr: 'Voici comment la traduction sera lue.', ru: 'Так будет звучать перевод.', tr: 'Çeviri böyle okunacak.',
    id: 'Beginilah terjemahan akan dibacakan.', ms: 'Beginilah terjemahan akan dibacakan.', es: 'Así sonará la traducción.',
    de: 'So wird die Übersetzung klingen.', bn: 'অনুবাদ এভাবে শোনা যাবে।', hi: 'अनुवाद ऐसे सुनाई देगा।'
};
/** Settings "▶ Test voice" button — works even with cfg.speak off. Must be a user tap (iOS). */
function testVoice() {
    const s = synth();
    if (!s) { alert('This browser cannot speak text.'); return; }
    stopSpeaking();
    const lang = targetLang();
    if (!voicesFor(lang).length) console.warn('[speak] no installed voice for', lang);
    sayNow(SAMPLES[lang.split('-')[0]] || SAMPLES.en, lang, () => { clearTimeout(watchdog); current = null; });
}

/** Fill the Settings voice list for the current translation language. */
function fillVoiceSelect() {
    const sel = document.getElementById('sSpeakVoice'); if (!sel) return;
    const pref = (window.cfg && window.cfg.speakVoice) || 'auto';
    const list = voicesFor(targetLang());
    const nF = list.filter(v => voiceGender(v) === 'female').length, nM = list.filter(v => voiceGender(v) === 'male').length;
    const opt = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; };
    sel.innerHTML = '';
    sel.appendChild(opt('auto', 'Automatic'));
    sel.appendChild(opt('female', '♀ Female' + (nF ? '' : ' (simulated)')));
    sel.appendChild(opt('male', '♂ Male' + (nM ? '' : ' (simulated)')));
    list.forEach(v => {
        const g = voiceGender(v);
        sel.appendChild(opt(v.voiceURI, (g === 'female' ? '♀ ' : g === 'male' ? '♂ ' : '• ') + v.name + ' (' + v.lang + ')'));
    });
    sel.value = [...sel.options].some(o => o.value === pref) ? pref : 'auto';
    const hint = document.getElementById('speakVoiceInfo');
    if (hint) hint.textContent = list.length ? (list.length + ' voice(s) on this device for this language.')
        : 'No voice installed for this language on this device — add one in the phone\'s Text-to-speech settings.';
}
window.addEventListener('khutbah:voices-changed', fillVoiceSelect);
document.addEventListener('change', (e) => { if (e.target && e.target.id === 'tgtLang') fillVoiceSelect(); });
document.addEventListener('DOMContentLoaded', fillVoiceSelect);
setTimeout(fillVoiceSelect, 1500);

Object.assign(window, { speakTranslation, unlockSpeech, stopSpeaking, testVoice, fillVoiceSelect, voiceGender, voicesFor });
export { speakTranslation, unlockSpeech, stopSpeaking, testVoice, fillVoiceSelect, voiceGender, voicesFor };
