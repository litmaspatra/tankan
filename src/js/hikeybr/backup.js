        // Backup & restore: export every tankan localStorage key (progress,
        // stats, settings, book positions, keymash history) as a versioned
        // JSON file or a copy-able TANKAN1. code, and import either safely.
        // Import validates the whole payload before anything is written and
        // always asks before replacing existing progress.
        (function () {
            const PREFIXES = ['hikeybr_', 'hikeymash_'];
            const CODE_PREFIX = 'TANKAN1.';
            const BACKUP_KIND = 'tankan-progress-backup';

            const $ = id => document.getElementById(id);
            const downloadBtn = $('backup-download-btn');
            if (!downloadBtn) return; // panel not on this page

            const codeBtn = $('backup-code-btn');
            const codeOut = $('backup-code-output');
            const exportStatus = $('backup-export-status');
            const fileInput = $('backup-file-input');
            const fileBtn = $('backup-file-btn');
            const codeIn = $('backup-code-input');
            const importBtn = $('backup-import-btn');
            const importStatus = $('backup-import-status');
            const modal = $('import-modal');
            const modalText = $('import-modal-text');
            const cancelBtn = $('import-cancel-btn');
            const confirmBtn = $('import-confirm-btn');
            let pendingBackup = null;

            const collectKeys = () => {
                const data = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    // hikeybr_presync_backup is sync's internal rollback
                    // snapshot, not progress: carrying it into payloads
                    // would make a restored device look different from its
                    // account copy and loop the conflict dialog.
                    if (k === 'hikeybr_presync_backup') continue;
                    if (PREFIXES.some(p => k.startsWith(p))) data[k] = localStorage.getItem(k);
                }
                return data;
            };

            const buildPayload = () => JSON.stringify({
                app: 'tankan',
                kind: BACKUP_KIND,
                version: 1,
                exportedAt: new Date().toISOString(),
                data: collectKeys()
            });

            // UTF-8 safe, URL/paste-safe base64 (Hindi text survives the round trip).
            const encodeCode = json => {
                const bytes = new TextEncoder().encode(json);
                let bin = '';
                bytes.forEach(b => { bin += String.fromCharCode(b); });
                return CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            };
            const decodeCode = code => {
                let b = code.slice(CODE_PREFIX.length).trim().replace(/-/g, '+').replace(/_/g, '/');
                while (b.length % 4) b += '=';
                const bin = atob(b);
                const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
                return new TextDecoder().decode(bytes);
            };

            // Returns an error string, or null when the backup is safe to apply.
            const validate = obj => {
                if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'That is not a backup file.';
                if (obj.kind !== BACKUP_KIND) return 'That is not a Tankan progress backup.';
                if (typeof obj.version !== 'number' || obj.version < 1 || obj.version > 1) return 'This backup version is not supported.';
                if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) return 'The backup data is missing.';
                const keys = Object.keys(obj.data);
                if (!keys.length) return 'The backup is empty.';
                for (const k of keys) {
                    if (!PREFIXES.some(p => k.startsWith(p))) return 'The backup contains unknown entries.';
                    if (typeof obj.data[k] !== 'string') return 'The backup data is corrupt.';
                }
                if (obj.data.hikeybr_store_v3) {
                    try {
                        const store = JSON.parse(obj.data.hikeybr_store_v3);
                        if (!store || typeof store !== 'object' || Array.isArray(store)) return 'The main progress data is corrupt.';
                    } catch (_) { return 'The main progress data is corrupt.'; }
                }
                return null;
            };

            const setStatus = (el, msg, ok) => {
                el.textContent = msg || '';
                el.style.color = ok ? 'var(--success, #2e7d32)' : 'var(--danger, #c62828)';
            };

            downloadBtn.addEventListener('click', () => {
                try {
                    const json = buildPayload();
                    const blob = new Blob([json], { type: 'application/json' });
                    const a = document.createElement('a');
                    const stamp = new Date().toISOString().slice(0, 10);
                    a.href = URL.createObjectURL(blob);
                    a.download = `tankan-progress-backup-${stamp}.json`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                    setStatus(exportStatus, 'Backup file downloaded.', true);
                } catch (_) {
                    setStatus(exportStatus, 'Could not create the backup file on this device.', false);
                }
            });

            codeBtn.addEventListener('click', async () => {
                try {
                    const code = encodeCode(buildPayload());
                    codeOut.hidden = false;
                    codeOut.value = code;
                    codeOut.focus();
                    codeOut.select();
                    let copied = false;
                    try { await navigator.clipboard.writeText(code); copied = true; }
                    catch (_) {
                        try { copied = document.execCommand('copy'); } catch (_) {}
                    }
                    setStatus(exportStatus, copied ? 'Backup code copied - paste it anywhere to keep it safe.' : 'Backup code ready - long-press and copy it.', true);
                } catch (_) {
                    setStatus(exportStatus, 'Could not create the backup code on this device.', false);
                }
            });

            const describeBackup = obj => {
                const parts = [];
                if (obj.exportedAt) {
                    const d = new Date(obj.exportedAt);
                    parts.push(isNaN(d) ? 'an unknown date' : d.toLocaleString());
                }
                parts.push(Object.keys(obj.data).length + ' saved entries');
                try {
                    const store = JSON.parse(obj.data.hikeybr_store_v3 || '{}');
                    if (typeof store.unlockedIndex === 'number' && typeof KEY_PROGRESSION !== 'undefined' && KEY_PROGRESSION[store.unlockedIndex]) {
                        parts.push(`progress up to '${KEY_PROGRESSION[store.unlockedIndex].h}'`);
                    }
                } catch (_) {}
                return parts.join(' · ');
            };

            const startImport = text => {
                setStatus(importStatus, '', true);
                let obj = null, err = null;
                try {
                    const t = String(text || '').trim();
                    if (!t) throw new Error('empty');
                    obj = t.startsWith(CODE_PREFIX) ? JSON.parse(decodeCode(t)) : JSON.parse(t);
                } catch (_) {
                    err = 'That file or code is not readable as a Tankan backup.';
                }
                if (!err) err = validate(obj);
                if (err) {
                    pendingBackup = null;
                    setStatus(importStatus, err + ' Nothing was changed.', false);
                    return;
                }
                pendingBackup = obj;
                modalText.textContent = `Backup from ${describeBackup(obj)}. This replaces the progress saved on this device - it cannot be undone.`;
                modal.classList.add('open');
            };

            fileBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                const f = fileInput.files && fileInput.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => startImport(reader.result);
                reader.onerror = () => setStatus(importStatus, 'Could not read that file. Nothing was changed.', false);
                reader.readAsText(f);
                fileInput.value = '';
            });
            importBtn.addEventListener('click', () => startImport(codeIn.value));

            const closeModal = () => { modal.classList.remove('open'); pendingBackup = null; };
            cancelBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

            // Wipe only tankan keys, then write the validated backup.
            const applyBackupData = obj => {
                const ours = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (PREFIXES.some(p => k.startsWith(p))) ours.push(k);
                }
                ours.forEach(k => localStorage.removeItem(k));
                Object.entries(obj.data).forEach(([k, v]) => localStorage.setItem(k, v));
            };

            // Sync module surface: collect/validate/apply/build over the same
            // versioned backup envelope used by export/import.
            window.TANKAN_BACKUP = { collect: collectKeys, validate, apply: applyBackupData, buildPayload };

            confirmBtn.addEventListener('click', () => {
                if (!pendingBackup) { closeModal(); return; }
                try {
                    applyBackupData(pendingBackup);
                    modal.classList.remove('open');
                    location.reload();
                } catch (_) {
                    modal.classList.remove('open');
                    pendingBackup = null;
                    setStatus(importStatus, 'This device refused the import (storage full or blocked). Nothing was changed.', false);
                }
            });

            // ---- Bring your progress from the old site (github.io) ----
            // One click: open the old site's transfer page as a popup, prove the
            // request with a one-time nonce + origin/source checks, receive the
            // backup payload, and import it. The old site is never changed.
            const OLD_ORIGIN = 'https://litmaspatra.github.io';
            const bridgeBtn = $('bridge-fetch-btn'), bridgeStatus = $('bridge-status');
            if (bridgeBtn && bridgeStatus) {
                if (location.hostname === 'litmaspatra.github.io') {
                    bridgeBtn.hidden = true; // already on the old site - nothing to bring
                } else {
                    bridgeBtn.addEventListener('click', () => {
                        setStatus(bridgeStatus, '', true);
                        const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
                        const popup = window.open(OLD_ORIGIN + '/tankan/transfer.html?n=' + nonce, 'tankan-transfer', 'width=560,height=680');
                        if (!popup) {
                            setStatus(bridgeStatus, 'Your browser blocked the pop-up. Allow pop-ups for this site and try again - or use Export on the old site and Import here.', false);
                            return;
                        }
                        setStatus(bridgeStatus, 'Talking to the old site...', true);
                        let timer = null;
                        const cleanup = () => {
                            window.removeEventListener('message', onMsg);
                            if (timer) { clearTimeout(timer); timer = null; }
                            try { if (!popup.closed) popup.close(); } catch (_) {}
                        };
                        const onMsg = e => {
                            if (e.source !== popup || e.origin !== OLD_ORIGIN) return;
                            const d = e.data || {};
                            if (d.n !== nonce) return;
                            if (d.kind === 'tankan-transfer-ready') {
                                popup.postMessage({ kind: 'tankan-transfer-send', n: nonce }, OLD_ORIGIN);
                            } else if (d.kind === 'tankan-transfer-empty') {
                                cleanup();
                                setStatus(bridgeStatus, 'No saved progress was found on the old site in this browser.', false);
                            } else if (d.kind === 'tankan-transfer-payload') {
                                const err = validate(d.payload);
                                if (err) {
                                    cleanup();
                                    setStatus(bridgeStatus, 'The old site sent something unreadable. Nothing was changed.', false);
                                    return;
                                }
                                cleanup();
                                let hasExisting = false;
                                for (let i = 0; i < localStorage.length; i++) {
                                    const k = localStorage.key(i);
                                    if (PREFIXES.some(p => k.startsWith(p))) { hasExisting = true; break; }
                                }
                                if (hasExisting) {
                                    // Replacing real progress always asks first.
                                    startImport(JSON.stringify(d.payload));
                                    setStatus(bridgeStatus, 'Progress received - confirm the replacement to finish.', true);
                                } else {
                                    try {
                                        applyBackupData(d.payload);
                                        setStatus(bridgeStatus, 'Progress brought over from the old site - reloading...', true);
                                        setTimeout(() => location.reload(), 900);
                                    } catch (_) {
                                        setStatus(bridgeStatus, 'This device refused the import (storage full or blocked). Nothing was changed.', false);
                                    }
                                }
                            }
                        };
                        window.addEventListener('message', onMsg);
                        timer = setTimeout(() => {
                            cleanup();
                            setStatus(bridgeStatus, 'No answer from the old site. If the pop-up did not open, allow pop-ups and try again - or use Export on the old site and Import here.', false);
                        }, 25000);
                    });
                }
            }
        })();
