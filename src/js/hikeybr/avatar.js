// Profile photo: shown in the top-right header corner after sign-in and
// managed from Settings > Account. Sources: the Google account photo (the
// default once signed in) or a custom upload from the gallery, downscaled
// in the browser to a small data URL. Built-in preset avatars are not
// available yet.
//
// Account isolation: every custom choice is stored under a key containing
// the account uid (hikeybr_avatar_u_<uid>) and only the signed-in account's
// key is ever read. The backup sweep syncs it with that account's progress.
// On sign-in, any other accounts' avatar keys are moved aside to a vault
// prefix (tankan_avatar_vault_) that the backup sweep does not include, so
// one account can never display or silently upload another account's photo;
// a vaulted choice moves back when its own account signs in again. Signing
// out hides the photo entirely.
(function () {
    const $ = id => document.getElementById(id);
    const corner = $('avatar-corner');
    if (!corner) return; // not on this page

    const KEY_PREFIX = 'hikeybr_avatar_u_';      // swept into the account payload
    const VAULT_PREFIX = 'tankan_avatar_vault_'; // same device, not swept
    const MAX_DATAURL_CHARS = 200000;            // hard per-upload ceiling
    const PAYLOAD_BUDGET_CHARS = 450000;         // total payload must stay under the 500KB rule
    const AVATAR_SIZE = 128;
    // Built-in original faces, bundled as small local webp files. A preset
    // choice stores only its name in the per-account key, so it adds ~40
    // bytes to the sync payload and needs no upload budget check.
    const PRESETS = ['dumbstruck','deadlystare','singletear','smuggrin','quiethorror','derpygrin','horrorgrit','deadfish','blissnosebleed','shadowglare','nosepick','goofylaugh'];
    const presetSrc = name => 'assets/avatars/' + name + '.webp';

    const img = $('avatar-img');
    const initial = $('avatar-initial');
    const previewImg = $('avatar-preview-img');
    const previewInitial = $('avatar-preview-initial');
    const useGoogleBtn = $('avatar-use-google');
    const uploadBtn = $('avatar-upload-btn');
    const fileInput = $('avatar-file');
    const removeBtn = $('avatar-remove');
    const presetGrid = $('avatar-preset-grid');
    const status = $('avatar-status');

    let currentUser = null;

    const keyFor = uid => KEY_PREFIX + uid;
    const readCustom = uid => {
        try { return JSON.parse(localStorage.getItem(keyFor(uid)) || 'null'); }
        catch { return null; }
    };
    // sync.js pushes on this event; avatar changes must not wait for a
    // lesson to reach the cloud copy.
    const notifySync = () => window.dispatchEvent(new Event('tankan-progress-changed'));
    const setCustom = (uid, avatar) => { localStorage.setItem(keyFor(uid), JSON.stringify(avatar)); notifySync(); };
    const clearCustom = uid => { localStorage.removeItem(keyFor(uid)); notifySync(); };

    // Move every signed-in account's avatar key that is NOT this uid out of
    // the sync sweep's reach, then bring this uid's vaulted choice back.
    const isolateFor = uid => {
        const moved = [];
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith(KEY_PREFIX) && k !== keyFor(uid)) {
                const otherUid = k.slice(KEY_PREFIX.length);
                localStorage.setItem(VAULT_PREFIX + otherUid, localStorage.getItem(k));
                localStorage.removeItem(k);
                moved.push(otherUid);
            }
        }
        if (!localStorage.getItem(keyFor(uid)) && localStorage.getItem(VAULT_PREFIX + uid)) {
            localStorage.setItem(keyFor(uid), localStorage.getItem(VAULT_PREFIX + uid));
            localStorage.removeItem(VAULT_PREFIX + uid);
        }
        return moved;
    };

    // What the header should show for this auth state.
    const resolve = user => {
        if (!user || !user.uid) return { kind: 'none' };
        const custom = readCustom(user.uid);
        if (custom && custom.kind === 'preset') {
            // An unknown name (older/newer build) is ignored, not shown broken.
            if (PRESETS.includes(custom.preset)) return { kind: 'preset', preset: custom.preset, src: presetSrc(custom.preset) };
        } else if (custom && custom.src) return custom;
        if (user.photoURL) return { kind: 'google', src: user.photoURL };
        return { kind: 'initial', letter: ((user.displayName || user.email || 'ट').trim()[0] || 'ट').toUpperCase() };
    };

    const paintInto = (imgEl, initialEl, resolved) => {
        const showImg = resolved.src && (resolved.kind === 'google' || resolved.kind === 'upload' || resolved.kind === 'preset');
        imgEl.hidden = !showImg;
        if (showImg) imgEl.src = resolved.src;
        initialEl.hidden = showImg;
        if (!showImg) initialEl.textContent = resolved.letter || 'ट';
    };

    const apply = user => {
        currentUser = user;
        const resolved = resolve(user);
        corner.hidden = resolved.kind === 'none';
        if (!corner.hidden) paintInto(img, initial, resolved);
        if (previewImg) paintInto(previewImg, previewInitial, resolved);
        const customShown = resolved.kind === 'upload' || resolved.kind === 'preset';
        if (removeBtn) removeBtn.hidden = !customShown;
        if (useGoogleBtn) useGoogleBtn.hidden = !user || !user.photoURL || !customShown;
        if (presetGrid) {
            presetGrid.querySelectorAll('.avatar-preset').forEach(btn => {
                btn.classList.toggle('selected', resolved.kind === 'preset' && btn.dataset.preset === resolved.preset);
            });
        }
    };

    // Total serialized backup payload with `entry` stored under key `key`:
    // the Firestore rule caps the whole payload, not one upload.
    const projectedPayloadChars = (key, entryJson) => {
        const backup = window.TANKAN_BACKUP;
        if (!backup || !backup.collect) return entryJson.length + 512;
        const data = backup.collect();
        delete data[key];
        data[key] = entryJson;
        return JSON.stringify(data).length;
    };
    const wouldFit = (uid, dataUrl) =>
        dataUrl.length <= MAX_DATAURL_CHARS &&
        projectedPayloadChars(keyFor(uid), JSON.stringify({ kind: 'upload', src: dataUrl })) <= PAYLOAD_BUDGET_CHARS;

    const downscaleFile = file => new Promise((resolveP, rejectP) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            rejectP(new Error('not-an-image'));
            return;
        }
        // FileReader data URL, not createObjectURL: the site's CSP img-src is
        // intentionally narrow ('self' data: lh3) and blocks blob: URLs.
        const reader = new FileReader();
        const pic = new Image();
        reader.onload = () => { pic.src = reader.result; };
        reader.onerror = () => rejectP(new Error('unreadable'));
        reader.readAsDataURL(file);
        pic.onload = () => {
            const side = Math.min(pic.naturalWidth, pic.naturalHeight);
            const sx = (pic.naturalWidth - side) / 2;
            const sy = (pic.naturalHeight - side) / 2;
            const c = document.createElement('canvas');
            c.width = AVATAR_SIZE; c.height = AVATAR_SIZE;
            c.getContext('2d').drawImage(pic, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
            resolveP(c.toDataURL('image/jpeg', 0.85));
        };
        pic.onerror = () => rejectP(new Error('unreadable'));
    });

    const say = msg => { if (status) status.textContent = msg; };

    // ── Controls (Settings > Account) ──────────────────────────────
    if (useGoogleBtn) useGoogleBtn.addEventListener('click', () => {
        if (!currentUser || !currentUser.photoURL) { say('No Google photo on this account.'); return; }
        clearCustom(currentUser.uid);
        say('Using your Google photo.');
        apply(currentUser);
    });
    if (removeBtn) removeBtn.addEventListener('click', () => {
        if (!currentUser) return;
        clearCustom(currentUser.uid);
        say('');
        apply(currentUser);
    });
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file || !currentUser) return;
            say('Preparing photo…');
            try {
                const dataUrl = await downscaleFile(file);
                if (!wouldFit(currentUser.uid, dataUrl)) {
                    say('That photo would make the saved data too large to sync. Try a smaller or simpler image.');
                    return;
                }
                setCustom(currentUser.uid, { kind: 'upload', src: dataUrl });
                say('Photo updated.');
                apply(currentUser);
            } catch {
                say('Could not read that image. Try a JPEG or PNG file.');
            }
        });
    }

    // Built-in preset picker: one button per face, stored as just its name.
    if (presetGrid) {
        PRESETS.forEach(name => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'avatar-preset';
            btn.dataset.preset = name;
            btn.title = 'Use the ' + name + ' avatar';
            const pic = document.createElement('img');
            pic.src = presetSrc(name);
            pic.alt = name + ' avatar';
            pic.loading = 'lazy';
            btn.appendChild(pic);
            btn.addEventListener('click', () => {
                if (!currentUser) return;
                setCustom(currentUser.uid, { kind: 'preset', preset: name });
                say('Avatar updated.');
                apply(currentUser);
            });
            presetGrid.appendChild(btn);
        });
    }

    // Header circle opens Profile > Account.
    corner.addEventListener('click', () => {
        const tab = document.querySelector('button.nav-tab[data-target="profile"]');
        if (tab) tab.click();
    });

    // Auth wiring: hide signed out; isolate per-account keys on every
    // signed-in state before anything can sweep them into a payload.
    const clientPromise = window.__tankanAuthClient;
    if (!clientPromise) { corner.hidden = true; return; }
    clientPromise.then(client => client.onAuth(user => {
        if (user && user.uid) isolateFor(user.uid);
        apply(user);
    })).catch(() => { corner.hidden = true; });

    // Broken image (expired URL, blocked host): fall back to the initial.
    img.addEventListener('error', () => {
        const user = currentUser;
        if (!user) return;
        const fallback = { kind: 'initial', letter: ((user.displayName || user.email || 'ट').trim()[0] || 'ट').toUpperCase() };
        paintInto(img, initial, fallback);
    });

    // Test seam: pure logic only; UI flows go through the real controls.
    window.TANKAN_AVATAR = {
        resolve, isolateFor, wouldFit, apply,
        KEY_PREFIX, VAULT_PREFIX, MAX_DATAURL_CHARS, PAYLOAD_BUDGET_CHARS, PRESETS
    };
})();
