// Tankan progress-transfer sender. Lives on the OLD origin
// (litmaspatra.github.io/tankan) but is deployed with the same repo everywhere.
// It only acts when opened as a popup by an allowed destination origin with a
// one-time nonce, and it never deletes or changes anything on this origin.
'use strict';
(function () {
    var statusEl = document.getElementById('transfer-status');
    var manualEl = document.getElementById('transfer-manual');
    var doneNoteEl = document.getElementById('transfer-done-note');

    // Exact destinations allowed to receive progress. No wildcards: anything
    // not on this list gets nothing, whatever it claims to be.
    var ALLOWED_DESTINATIONS = ['https://tankan.in', 'https://tankan.pages.dev'];
    var PREFIXES = ['hikeybr_', 'hikeymash_'];

    function show(text, cls) {
        statusEl.textContent = text;
        statusEl.className = cls || '';
    }
    function showManual() {
        show('This tab is not connected to tankan.in.', 'err');
        manualEl.hidden = false;
    }

    var nonce = new URLSearchParams(location.search).get('n') || '';
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !window.opener) {
        showManual();
        return;
    }

    // Announce readiness. No data in this message; '*' is safe here because
    // it only reaches the window that opened us and carries nothing but the
    // nonce the destination itself generated. The payload below only ever
    // goes to a validated whitelisted origin.
    try {
        window.opener.postMessage({ kind: 'tankan-transfer-ready', n: nonce }, '*');
    } catch (_) {
        showManual();
        return;
    }
    show('Connected to tankan.in. Waiting for the go-ahead...');

    var sent = false, applied = false, ackExpiry = null;
    var expiry = setTimeout(function () {
        if (!sent) show('The connection expired. Close this tab and try the button again.', 'err');
    }, 60000);

    window.addEventListener('message', function (event) {
        // Every message must come from the very window that opened us, from an
        // allowed destination origin, and carry our one-time nonce.
        if (event.source !== window.opener) return;
        if (ALLOWED_DESTINATIONS.indexOf(event.origin) === -1) return;
        var d = event.data || {};
        if (d.n !== nonce) return;

        if (!sent && d.kind === 'tankan-transfer-send') {
            sent = true;
            clearTimeout(expiry);

            var data = {}, count = 0;
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                for (var p = 0; p < PREFIXES.length; p++) {
                    if (k.indexOf(PREFIXES[p]) === 0) { data[k] = localStorage.getItem(k); count++; break; }
                }
            }
            var target = event.origin; // reply only to the validated origin
            if (!count) {
                window.opener.postMessage({ kind: 'tankan-transfer-empty', n: nonce }, target);
                show('No saved progress found on the old site in this browser.', 'err');
                doneNoteEl.hidden = false;
                setTimeout(function () { window.close(); }, 4000);
                return;
            }
            var payload = {
                app: 'tankan',
                kind: 'tankan-progress-backup',
                version: 1,
                exportedAt: new Date().toISOString(),
                data: data
            };
            window.opener.postMessage({ kind: 'tankan-transfer-payload', n: nonce, payload: payload }, target);
            show('Progress sent to tankan.in (' + count + ' saved entries). Waiting for tankan.in to finish...', 'ok');
            // tankan.in confirms only after the import has actually landed
            // there (including its replace confirmation). If the visitor
            // cancels there instead, nothing is marked and the old site
            // keeps offering the transfer.
            ackExpiry = setTimeout(function () {
                if (!applied) {
                    show('tankan.in has not confirmed the transfer yet. If you cancelled the import there, close this tab - nothing was marked or changed here.', 'err');
                    doneNoteEl.hidden = false;
                }
            }, 300000);
            return;
        }

        if (sent && !applied && d.kind === 'tankan-transfer-applied') {
            applied = true;
            if (ackExpiry) clearTimeout(ackExpiry);
            // The transfer is confirmed done: mark THIS origin so future
            // visits to the old address go straight to tankan.in.
            try { localStorage.setItem('tankan_transfer_done', '1'); } catch (_) {}
            show('Transfer complete - your progress is on tankan.in. From now on the old address takes you straight there.', 'ok');
            doneNoteEl.hidden = false;
            setTimeout(function () { window.close(); }, 3000);
        }
    });
})();
