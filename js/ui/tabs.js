/* Khutbah Live Translator — ui/tabs.js
   Panel switching only. No business logic.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

function goTab(name, btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('panel' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('on');
}

// ══════════════════════════════════════════════
// TUTORIAL
// ══════════════════════════════════════════════


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { goTab });

export { goTab };
