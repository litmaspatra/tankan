// Account-backed progress sync (Firestore). Bound to the Google sign-in from
// auth.js: when signed in, the visitor's progress can be saved to their own
// account document (progress/{uid}) and restored on another device.
//
// Safety rules (Kartik's requirements):
// - Nothing is uploaded silently on first sign-in: an empty account copy asks
//   once before this device's progress is bound to the account.
// - A non-empty account copy is never overwritten silently, and non-empty
//   local progress is never replaced silently: differences surface a choice.
// - Replacing local progress first stashes a full pre-sync snapshot under
//   hikeybr_presync_backup (restorable via the existing Import flow pattern).
// - Sign-out stops all syncing and changes nothing locally.
// - Remote changes made on other devices mid-session are not pulled in;
//   cloud -> device happens only at sign-in, so an in-progress lesson is
//   never clobbered.
(function () {
    const $ = id => document.getElementById(id);
    const statusEl = $('sync-status');
    if (!statusEl) return; // Account section not on this page

    const bindBox = $('sync-bind-prompt');
    const bindText = $('sync-bind-text');
    const bindConfirm = $('sync-bind-confirm');
    const bindSkip = $('sync-bind-skip');
    const conflictBox = $('sync-conflict');
    const conflictText = $('sync-conflict-text');
    const useDeviceBtn = $('sync-use-device');
    const useAccountBtn = $('sync-use-account');

    const DEBOUNCE_MS = window.TANKAN_SYNC_DEBOUNCE_MS || 5000;
    const PRESYNC_KEY = 'hikeybr_presync_backup';

    const collect = () => window.TANKAN_BACKUP.collect();
    const localJson = () => JSON.stringify(collect());
    const hasLocalProgress = () => Object.keys(collect()).length > 0;

    let uid = null;
    let store = null;
    let bound = false;      // account copy and this device are in a known-safe relationship
    let pushTimer = null;
    let applying = false;   // suppress echo pushes while applying a restore
    let unwatch = null;

    const setStatus = t => { statusEl.textContent = t; };
    const hideBoxes = () => { bindBox.hidden = true; conflictBox.hidden = true; };

    const getStore = async () => {
        if (window.TANKAN_SYNC_TEST_STORE) return window.TANKAN_SYNC_TEST_STORE;
        const fs = await import('../vendor/firebase-firestore.js');
        const db = fs.getFirestore();
        const ref = () => fs.doc(db, 'progress', uid);
        return {
            async read() {
                const snap = await fs.getDoc(ref());
                return snap.exists() ? snap.data() : null;
            },
            async write(payloadJson) {
                await fs.setDoc(ref(), { payload: payloadJson, savedAt: fs.serverTimestamp(), schemaVersion: 1 });
            }
        };
    };

    const parseCloud = doc => {
        try {
            const obj = JSON.parse(doc.payload);
            return window.TANKAN_BACKUP.validate(obj) === null ? obj : null;
        } catch (_) { return null; }
    };

    const push = async () => {
        if (!bound || applying || !store) return;
        setStatus('Saving to your account…');
        try {
            await store.write(window.TANKAN_BACKUP.buildPayload());
            setStatus('Saved to your account.');
        } catch (e) {
            setStatus('Could not reach your account - progress is safe on this device and will be saved when you are back online.');
        }
    };

    const schedulePush = () => {
        if (!bound) return;
        clearTimeout(pushTimer);
        pushTimer = setTimeout(push, DEBOUNCE_MS);
    };

    // Capture the pre-sync snapshot BEFORE the apply wipes all hikeybr_ keys,
    // then write it back (the wipe would otherwise erase the snapshot too).
    const applyCloud = obj => {
        applying = true;
        const prior = collect();
        window.TANKAN_BACKUP.apply(obj);
        try {
            localStorage.setItem(PRESYNC_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: prior }));
        } catch (_) {}
        location.reload();
    };

    const onSignedIn = async user => {
        uid = user.uid;
        hideBoxes();
        setStatus('Checking your account…');
        try {
            store = await getStore();
            const doc = await store.read();
            const cloudObj = doc && parseCloud(doc);
            const local = localJson();
            const localEmpty = !hasLocalProgress();

            if (!doc || !cloudObj) {
                if (localEmpty) {
                    bound = true; // nothing anywhere yet; first practice saves
                    setStatus('Signed in - your progress will be saved to your account as you practice.');
                } else {
                    bound = false;
                    bindText.textContent = 'Save this device\'s progress to ' + (user.email || 'your account') + '? New lessons will keep saving to your account from then on.';
                    bindBox.hidden = false;
                    setStatus('Your progress is on this device only.');
                }
            } else if (localEmpty) {
                bound = false;
                conflictText.textContent = 'Your account has saved progress' + (doc.savedAt ? ' (last saved ' + new Date(doc.savedAt.seconds ? doc.savedAt.seconds * 1000 : doc.savedAt).toLocaleString() + ')' : '') + '. Restore it to this device?';
                useDeviceBtn.hidden = true;
                useAccountBtn.textContent = 'Restore to this device';
                conflictBox.hidden = false;
                setStatus('This device has no progress yet.');
            } else if (JSON.stringify(cloudObj.data) === JSON.stringify(collect())) {
                bound = true;
                setStatus('Saved to your account.');
            } else {
                bound = false;
                conflictText.textContent = 'This device and your account have different progress. Choose which one to keep - the other copy is replaced only when you say so.';
                useDeviceBtn.hidden = false;
                useDeviceBtn.textContent = 'Keep this device\'s progress (update the account)';
                useAccountBtn.textContent = 'Use the account copy here (replace this device)';
                conflictBox.hidden = false;
                setStatus('Progress differs between this device and your account.');
            }
        } catch (e) {
            bound = false;
            setStatus('Could not reach your account - progress is safe on this device. Saving will resume when you are back online.');
        }
    };

    bindConfirm.addEventListener('click', async () => {
        bindBox.hidden = true;
        bound = true;
        await push();
    });
    bindSkip.addEventListener('click', () => {
        bindBox.hidden = true;
        setStatus('Not saved to an account - progress stays on this device.');
    });
    useDeviceBtn.addEventListener('click', async () => {
        conflictBox.hidden = true;
        bound = true;
        await push();
    });
    useAccountBtn.addEventListener('click', () => {
        conflictBox.hidden = true;
        store.read().then(doc => {
            const obj = doc && parseCloud(doc);
            if (obj) applyCloud(obj);
            else setStatus('The account copy could not be read - nothing was changed on this device.');
        }).catch(() => setStatus('The account copy could not be read - nothing was changed on this device.'));
    });

    window.addEventListener('tankan-progress-changed', schedulePush);

    const authReady = window.__tankanAuthClient;
    if (!authReady) return;
    authReady.then(client => client.onAuth(user => {
        clearTimeout(pushTimer);
        if (user) onSignedIn(user);
        else { uid = null; store = null; bound = false; hideBoxes(); setStatus(''); }
    })).catch(() => {});
})();
