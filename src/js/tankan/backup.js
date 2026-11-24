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
                modalText.textContent = `Backup from ${describeBackup(obj)}. This replaces the progress saved on this device - the replaced copy is kept on this device and can be restored from Settings.`;
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

            // Replaced copies are stashed by sync and by imports
            // under hikeybr_presync_backup (one slot: the most recently
            // replaced copy). Surface it so the rollback is real; restoring
            // goes through the same confirm modal as any other import.
            const rollbackNote = $('rollback-note'), rollbackBtn = $('rollback-restore-btn');
            const showRollback = () => {
                if (!rollbackNote || !rollbackBtn) return;
                let stash = null;
                try { stash = JSON.parse(localStorage.getItem('hikeybr_presync_backup') || 'null'); } catch (_) {}
                if (!stash || !stash.data || !Object.keys(stash.data).length) { rollbackNote.hidden = true; rollbackBtn.hidden = true; return; }
                const when = stash.savedAt ? new Date(stash.savedAt) : null;
                rollbackNote.textContent = 'A copy replaced during sync or import is kept on this device' + (when && !isNaN(when) ? ' (from ' + when.toLocaleString() + ')' : '') + '.';
                rollbackNote.hidden = false;
                rollbackBtn.hidden = false;
            };
            if (rollbackBtn) rollbackBtn.addEventListener('click', () => {
                let stash = null;
                try { stash = JSON.parse(localStorage.getItem('hikeybr_presync_backup') || 'null'); } catch (_) {}
                if (!stash || !stash.data) { setStatus(importStatus, 'The kept copy is not readable.', false); return; }
                startImport(JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: stash.savedAt || new Date().toISOString(), data: stash.data }));
            });
            window.addEventListener('tankan-stash-updated', showRollback);
            showRollback();

            const closeModal = () => {
                modal.classList.remove('open');
                pendingBackup = null;
            };
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
                    // Stash what is about to be replaced (one slot, like sync)
                    // so every replace is undoable from Settings.
                    const prior = collectKeys();
                    applyBackupData(pendingBackup);
                    if (Object.keys(prior).length) {
                        try { localStorage.setItem('hikeybr_presync_backup', JSON.stringify({ savedAt: new Date().toISOString(), data: prior })); } catch (_) {}
                    }
                    modal.classList.remove('open');
                    location.reload();
                } catch (_) {
                    modal.classList.remove('open');
                    pendingBackup = null;
                    setStatus(importStatus, 'This device refused the import (storage full or blocked). Nothing was changed.', false);
                }
            });

})();
