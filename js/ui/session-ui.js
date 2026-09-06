/* Khutbah Live Translator — js/ui/session-ui.js
   Live khutbah session panel.

   WHY A NEW FILE
   tabs.js switches panels, dialogs.js owns the tutorial and skin picker, and
   notifications.js renders the transcript and API badge. A live session HUD —
   status, duration, controls, current segment — is a distinct surface that
   belongs in none of them.

   ARCHITECTURE RULE
   This module DISPLAYS state. It owns no speech recognition, no provider
   calls, no translation logic, no session lifecycle, and no storage. Every
   control here delegates to the existing modules:
       pause  → window.pauseSession()
       resume → window.resumeSession() (+ startListen when the mic is off)
       end    → window.endSession()
   and every value it shows is read from appState, never cached locally.
   There is no second state model.

   UPDATES ARE EVENT-DRIVEN
   It subscribes to the events the pipeline already emits:
       khutbah:recognition-start / -stop / -interim
       khutbah:translation-start / -success / -error / -retry
       khutbah:session-started / -paused / -resumed / -completed
       khutbah:session-segment / -translation / -reset / -error
   The only interval is the duration clock, which is a wall-clock display and
   has nothing to poll — it is started on demand and cleared when not needed. */

const EL = {};          // cached element references
let durationTimer = null;
let providerLabel = '';
let saveState = '';     // '' | 'saving' | 'saved' | 'failed'

/* ── build ─────────────────────────────────────────────────────── */

/**
 * Insert the panel above the translation output, inside the existing
 * translator panel. Markup mirrors the app's existing class conventions
 * so themes and RTL apply without new rules.
 */
function buildSessionPanel() {
    const panel = document.getElementById('panelMain');
    const outBox = document.getElementById('outBox');
    if (!panel || !outBox || document.getElementById('sessionBar')) return;

    const bar = document.createElement('div');
    bar.id = 'sessionBar';
    bar.className = 'session-bar';
    bar.setAttribute('aria-live', 'polite');
    bar.innerHTML = [
        '<div class="session-head">',
        '  <span id="sessionDot" class="session-dot" aria-hidden="true"></span>',
        '  <span id="sessionStatus" class="session-status" data-i18n="sessionIdle">Not recording</span>',
        '  <span id="sessionDuration" class="session-duration" hidden>00:00</span>',
        '  <span id="sessionSaved" class="session-saved" hidden></span>',
        '</div>',
        '<div id="sessionLive" class="session-live" hidden>',
        '  <div class="session-line">',
        '    <span class="session-lbl" data-i18n="sessionHearing">Hearing</span>',
        '    <span id="sessionSource" class="session-source"></span>',
        '  </div>',
        '  <div class="session-line">',
        '    <span class="session-lbl" data-i18n="sessionTranslating">Translating</span>',
        '    <span id="sessionTarget" class="session-target"></span>',
        '  </div>',
        '</div>',
        '<div id="sessionMeta" class="session-meta" hidden>',
        '  <span id="sessionCounts"></span>',
        '  <span id="sessionProvider" class="session-provider"></span>',
        '</div>',
        '<div id="sessionControls" class="session-controls" hidden>',
        '  <button id="sessionPause" class="session-btn" type="button" data-i18n="sessionPause">Pause</button>',
        '  <button id="sessionResume" class="session-btn" type="button" hidden data-i18n="sessionResume">Resume</button>',
        '  <button id="sessionEnd" class="session-btn danger" type="button" data-i18n="sessionEnd">End session</button>',
        '</div>'
    ].join('');

    outBox.parentNode.insertBefore(bar, outBox);

    ['sessionBar','sessionDot','sessionStatus','sessionDuration','sessionSaved','sessionLive',
     'sessionSource','sessionTarget','sessionMeta','sessionCounts','sessionProvider',
     'sessionControls','sessionPause','sessionResume','sessionEnd']
        .forEach(id => { EL[id] = document.getElementById(id); });

    // Controls delegate to the session module. No lifecycle logic lives here.
    EL.sessionPause.addEventListener('click', () => {
        if (typeof window.pauseSession === 'function') window.pauseSession();
        if (window.isListening && typeof window.stopListen === 'function') window.stopListen();
    });
    EL.sessionResume.addEventListener('click', async () => {
        // startListen() already resumes the session via its decorator in app.js.
        if (!window.isListening && typeof window.startListen === 'function') {
            await window.startListen();
        } else if (typeof window.resumeSession === 'function') {
            window.resumeSession();
        }
    });
    EL.sessionEnd.addEventListener('click', () => {
        if (window.isListening && typeof window.stopListen === 'function') window.stopListen();
        if (typeof window.endSession === 'function') window.endSession();
    });
}

/* ── helpers ───────────────────────────────────────────────────── */

/** Localized string with a safe literal fallback (keys may not exist yet). */
function label(key, fallback) {
    try {
        const v = window.t ? window.t(key) : null;
        return (v && v !== key) ? v : fallback;
    } catch (e) { return fallback; }
}

function fmtDuration(ms) {
    if (!(ms >= 0)) return '00:00';
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? (pad(h) + ':' + pad(m) + ':' + pad(s)) : (pad(m) + ':' + pad(s));
}

function setText(el, value) { if (el) el.textContent = value == null ? '' : String(value); }
function show(el, on) { if (el) el.hidden = !on; }

function tickDuration() {
    const s = window.getCurrentSession ? window.getCurrentSession() : null;
    if (!s || !s.startedAt) { setText(EL.sessionDuration, '00:00'); return; }
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
    setText(EL.sessionDuration, fmtDuration(end - new Date(s.startedAt).getTime()));
}

function startClock() {
    tickDuration();
    if (durationTimer) return;
    durationTimer = setInterval(tickDuration, 1000);
}
function stopClock() {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    tickDuration();   // freeze on the final value
}

/* ── render ────────────────────────────────────────────────────── */

/**
 * Single render function. Reads current state from appState and paints.
 * Every event handler funnels here, so the panel can never diverge from
 * the real state.
 */
function renderSession() {
    if (!EL.sessionBar) return;

    const status = window.getSessionStatus ? window.getSessionStatus() : 'idle';
    const session = window.getCurrentSession ? window.getCurrentSession() : null;
    const listening = !!window.isListening;

    EL.sessionBar.setAttribute('data-status', status);
    EL.sessionBar.classList.toggle('active', status === 'listening');

    // 1. Status text
    const statusText = {
        idle:      label('sessionIdle', 'Not recording'),
        listening: listening ? label('sessionListening', 'Listening…')
                             : label('sessionActive', 'Session active — mic off'),
        paused:    label('sessionPaused', 'Paused'),
        completed: label('sessionCompleted', 'Session complete'),
        error:     label('sessionError', 'Session error')
    }[status] || status;
    setText(EL.sessionStatus, statusText);

    // 2. Duration
    show(EL.sessionDuration, !!session);
    if (status === 'listening') startClock(); else stopClock();

    // 3. Live lines only while actively listening
    show(EL.sessionLive, status === 'listening');

    // 4. Counts + provider
    show(EL.sessionMeta, !!session);
    if (session) {
        const segs = session.segments.length, trs = session.translations.length;
        setText(EL.sessionCounts,
            segs + ' ' + label('sessionSegments', 'segments') + ' · ' +
            trs + ' ' + label('sessionTranslations', 'translations'));
    }
    setText(EL.sessionProvider, providerLabel);

    // 5. Controls
    show(EL.sessionControls, !!session && status !== 'completed');
    show(EL.sessionPause, status === 'listening');
    show(EL.sessionResume, status === 'paused');

    // 6. Save state
    if (saveState && status === 'completed') {
        show(EL.sessionSaved, true);
        setText(EL.sessionSaved,
            saveState === 'saved'  ? label('sessionSaved', 'Saved') :
            saveState === 'saving' ? label('sessionSaving', 'Saving…') :
                                     label('sessionSaveFailed', 'Not saved'));
        EL.sessionSaved.setAttribute('data-state', saveState);
    } else {
        show(EL.sessionSaved, false);
    }
}

/* ── subscriptions ─────────────────────────────────────────────── */

function on(name, fn) { window.addEventListener('khutbah:' + name, fn); }

function subscribe() {
    // Recognition
    on('recognition-start', renderSession);
    on('recognition-stop', renderSession);
    on('recognition-interim', e => {
        const d = (e && e.detail) || {};
        const live = (d.interim || d.transcript || '').trim();
        if (EL.sessionSource) EL.sessionSource.textContent = live;
    });

    // Translation / provider status
    on('translation-start', e => {
        providerLabel = label('sessionTranslatingShort', 'translating…');
        if (EL.sessionTarget) {
            EL.sessionTarget.textContent = '…';
            EL.sessionTarget.setAttribute('data-state', 'pending');
        }
        renderSession();
    });
    on('translation-retry', () => {
        providerLabel = label('sessionRetrying', 'retrying…');
        renderSession();
    });
    on('translation-success', e => {
        const d = (e && e.detail) || {};
        providerLabel = d.provider ? (label('sessionVia', 'via') + ' ' + d.provider) : '';
        if (EL.sessionTarget) {
            EL.sessionTarget.textContent = d.translated || '';
            EL.sessionTarget.setAttribute('data-state', 'ok');
        }
        renderSession();
    });
    on('translation-error', () => {
        providerLabel = label('sessionProviderFailed', 'all providers failed');
        if (EL.sessionTarget) EL.sessionTarget.setAttribute('data-state', 'error');
        renderSession();
    });

    // Session lifecycle
    on('session-started', () => { saveState = ''; providerLabel = ''; renderSession(); });
    on('session-paused', renderSession);
    on('session-resumed', renderSession);
    on('session-segment', renderSession);
    on('session-translation', renderSession);
    on('session-reset', () => {
        saveState = ''; providerLabel = '';
        if (EL.sessionSource) EL.sessionSource.textContent = '';
        if (EL.sessionTarget) EL.sessionTarget.textContent = '';
        renderSession();
    });
    on('session-error', renderSession);

    // Completion + save status. history.js performs the write; this only
    // reflects the outcome it can observe.
    on('session-completed', () => {
        saveState = 'saving';
        renderSession();
        setTimeout(async () => {
            try {
                const s = window.getCurrentSession ? window.getCurrentSession() : null;
                if (!s || typeof window.getSession !== 'function') { saveState = ''; renderSession(); return; }
                const stored = await window.getSession(s.id);
                saveState = stored ? 'saved' : 'failed';
            } catch (e) {
                saveState = 'failed';
            }
            renderSession();
        }, 700);
    });
}

/* ── init ──────────────────────────────────────────────────────── */

export function initSessionUI() {
    buildSessionPanel();
    subscribe();
    renderSession();
}

Object.assign(window, { initSessionUI, renderSession });
