/* Khutbah Live Translator — ui/startup-status.js   (additive)
   Shows what the app is doing between the mic tap and the first translation,
   so users don't think it is stuck:
     starting   → mic tapped, recognizer not running yet   ("Starting microphone…", spinning ring)
     waiting    → recognizer running, nothing heard yet    ("Ready — waiting for the speaker…")
     hearing    → words are coming in                      ("Hearing speech…")
     translating→ first sentence sent, no result yet       ("Translating the first sentence…")
     done       → first translation shown; normal status text takes over.
   Slow-step hints after STARTING_SLOW_MS / WAITING_SLOW_MS.
   Driven only by existing events (khutbah:recognition-*, khutbah:session-*). */

const STARTING_SLOW_MS = 6000;
const WAITING_SLOW_MS = 20000;

const TEXT = {
    starting: 'Starting microphone',
    startingSlow: 'Still starting — allow microphone access if asked',
    waiting: 'Ready — waiting for the speaker',
    waitingSlow: 'Nothing heard yet — move the phone closer to the speaker',
    hearing: 'Hearing speech',
    translating: 'Translating the first sentence'
};

let state = 'idle';
let slowTimer = null;

function tr(key) {
    const k = 'startup' + key.charAt(0).toUpperCase() + key.slice(1);
    try { if (typeof window.t === 'function') { const v = window.t(k); if (v && v !== k) return v; } } catch (e) {}
    return TEXT[key];
}

function els() {
    return { btn: document.getElementById('micBtn'), txt: document.getElementById('stsTxt'),
             sts: document.querySelector('.sts') };
}

function show(key) {
    const { txt, sts } = els();
    if (txt) txt.textContent = tr(key);
    if (sts) sts.classList.add('sts-busy');
}

function setState(next) {
    state = next;
    clearTimeout(slowTimer); slowTimer = null;
    const { btn, sts } = els();
    if (btn) btn.classList.toggle('starting', next === 'starting');
    if (next === 'idle' || next === 'done') { if (sts) sts.classList.remove('sts-busy'); return; }
    show(next);
    if (next === 'starting') slowTimer = setTimeout(() => { if (state === 'starting') show('startingSlow'); }, STARTING_SLOW_MS);
    if (next === 'waiting') slowTimer = setTimeout(() => { if (state === 'waiting') show('waitingSlow'); }, WAITING_SLOW_MS);
}

function on(name, fn) { window.addEventListener('khutbah:' + name, fn); }

// Mic tap: capture phase, before toggleListen runs.
document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest && e.target.closest('#micBtn');
    if (!btn) return;
    if (!window.isListening) setState('starting');
}, true);

on('recognition-start', () => { if (state === 'starting' || state === 'idle') setState('waiting'); });
on('recognition-interim', (e) => {
    const d = e.detail || {};
    if (!(d.interim || d.final)) return;
    if (state === 'waiting' || state === 'starting') setState('hearing');
    else if (state === 'hearing' || state === 'translating') show(state);   // keep our text over speech.js's
});
on('session-segment', () => { if (state === 'hearing' || state === 'waiting') setState('translating'); });
on('segment-created', () => { if (state === 'hearing' || state === 'waiting') setState('translating'); });
on('session-translation', () => { if (state !== 'idle') setState('done'); });
on('recognition-stop', () => setState('idle'));
on('session-paused', () => setState('idle'));

// If start fails (permission denied → alert), drop the spinner.
setInterval(() => { if (state === 'starting' && !window.isListening && !document.querySelector('#micBtn.live')) {
    const { btn } = els(); if (btn && btn.classList.contains('idle') && Date.now() - (window.__kltStartTap || 0) > 15000) setState('idle'); } }, 3000);
document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#micBtn')) window.__kltStartTap = Date.now(); }, true);

function getStartupState() { return state; }
Object.assign(window, { getStartupState });
export { getStartupState };
