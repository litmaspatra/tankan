// "We moved" banner. The same code is served from the old address
// (litmaspatra.github.io/tankan) and from tankan.in; it only does anything on
// the old address. It changes nothing in storage except one sessionStorage
// flag when the banner is dismissed, so it comes back on the next visit.
(function () {
    'use strict';
    var OLD_HOST = 'litmaspatra.github.io';
    var NEW_URL = 'https://tankan.in';
    var q = new URLSearchParams(location.search);
    var force = q.get('movedbanner') === '1'; // test hook for file:// and previews
    if (location.hostname !== OLD_HOST && !force) return;
    try { if (sessionStorage.getItem('tankan_moved_dismissed') === '1') return; } catch (_) {}

    var css = document.createElement('style');
    css.textContent =
        '#moved-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px 14px;padding:8px 16px;background:var(--accent);color:#1a1405;font-size:.9rem;line-height:1.35;text-align:center}' +
        '#moved-bar strong{font-weight:700}' +
        '#moved-bar a,#moved-bar button{font:inherit;cursor:pointer;border-radius:6px;padding:4px 12px;border:1px solid rgba(0,0,0,.45);background:rgba(255,255,255,.35);color:#1a1405;text-decoration:none;font-weight:600}' +
        '#moved-bar a:hover,#moved-bar button:hover{background:rgba(255,255,255,.6)}' +
        '#moved-bar .moved-x{border-color:transparent;background:transparent;font-weight:400;text-decoration:underline}' +
        '#moved-modal{position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px}' +
        '#moved-modal[hidden]{display:none}' +
        '#moved-card{max-width:34rem;width:100%;max-height:90vh;overflow:auto;background:var(--surface-card,#141a13);color:var(--text,#f2ede0);border:1px solid var(--border,#333);border-radius:14px;padding:20px 22px;font-size:.95rem;line-height:1.5}' +
        '#moved-card h2{margin:0 0 6px;font-size:1.15rem}' +
        '#moved-card ol{margin:12px 0;padding-left:1.3rem}' +
        '#moved-card li{margin:9px 0}' +
        '#moved-card .moved-note{background:var(--accent-soft,rgba(240,166,44,.13));border-left:3px solid var(--accent,#f0a62c);padding:8px 12px;border-radius:6px;margin:12px 0;font-size:.88rem}' +
        '#moved-card .moved-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}' +
        '#moved-card a.moved-go,#moved-card button{font:inherit;cursor:pointer;border-radius:8px;padding:8px 16px;border:1px solid var(--border,#444);background:var(--surface,#1b2219);color:var(--text,#f2ede0);text-decoration:none;font-weight:600}' +
        '#moved-card a.moved-go{background:var(--accent,#f0a62c);color:#1a1405;border-color:transparent}' +
        'html.focus-mode #moved-bar{display:none}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'moved-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Tankan has moved');
    bar.innerHTML =
        '<span><strong>टंकण has moved to tankan.in.</strong> Bring your progress over to the new address.</span>' +
        '<a href="' + NEW_URL + '" target="_blank" rel="noopener">Open tankan.in</a>' +
        '<button type="button" id="moved-steps-btn">Show steps</button>' +
        '<button type="button" class="moved-x" id="moved-dismiss">Hide for now</button>';

    var modal = document.createElement('div');
    modal.id = 'moved-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'moved-title');
    modal.innerHTML =
        '<div id="moved-card">' +
        '<h2 id="moved-title">Bring your progress to tankan.in</h2>' +
        '<p>Your progress is stored inside this browser, on this old address. It does not move by itself and signing in on the new site does not find it. Follow these steps once:</p>' +
        '<ol>' +
        '<li><strong>Stay in this same browser</strong> (same browser app, same profile, same device you practised on). Do not switch to another browser or phone - the progress is not there.</li>' +
        '<li>Tap <strong>Open tankan.in</strong> below. It opens in a new tab of this browser.</li>' +
        '<li>On tankan.in open the <strong>Settings</strong> tab and scroll to <strong>Bring your progress from the old site</strong>. Tap that button.</li>' +
        '<li>A small window opens for a moment and closes by itself. If your browser blocks pop-ups, allow them for tankan.in and tap the button again.</li>' +
        '<li>If tankan.in already has some progress, it asks before replacing it. Confirm, and the page reloads with your progress.</li>' +
        '<li>Open the <strong>Profile</strong> tab on tankan.in and use <strong>Sign in with Google</strong>. Your progress is then saved to your account and follows you to any device.</li>' +
        '</ol>' +
        '<div class="moved-note">Nothing is deleted from this old site, so you can try again if a step fails. No pop-up or no luck? Open Settings here, tap <em>Download Backup File</em>, then on tankan.in use <em>Choose Backup File</em> and <em>Import</em>.</div>' +
        '<div class="moved-actions"><a class="moved-go" href="' + NEW_URL + '" target="_blank" rel="noopener">Open tankan.in</a><button type="button" id="moved-close">Close</button></div>' +
        '</div>';

    function open() { modal.hidden = false; var b = modal.querySelector('.moved-go'); if (b) b.focus(); }
    function close() { modal.hidden = true; }
    function mount() {
        document.body.insertBefore(bar, document.body.firstChild);
        document.body.appendChild(modal);
        bar.querySelector('#moved-steps-btn').addEventListener('click', open);
        bar.querySelector('#moved-dismiss').addEventListener('click', function () {
            try { sessionStorage.setItem('tankan_moved_dismissed', '1'); } catch (_) {}
            bar.remove();
        });
        modal.querySelector('#moved-close').addEventListener('click', close);
        modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
