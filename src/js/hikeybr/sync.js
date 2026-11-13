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
    // localStorage enumeration order is device-specific. Compare named values,
    // not serialized insertion order, or an identical restored account (for
    // example progress + avatar) immediately looks like a new conflict.
    // JSON object property order is likewise not progress; array order is.
    const ordered = value => {
        if (Array.isArray(value)) return value.map(ordered);
        if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
        return value;
    };
    const dataJson = data => JSON.stringify(Object.fromEntries(Object.keys(data).filter(key => key !== 'hikeybr_presync_backup').sort().map(key => {
        const raw = data[key];
        try { return [key, ordered(JSON.parse(raw))]; } catch (_) { return [key, raw]; }
    })));
    const localJson = () => JSON.stringify(collect());
    // Durable sync state from older versions contains the original outer map.
    // Normalize it too instead of discarding any unsaved-change debt.
    const sameSnapshot = (snapshot, data) => {
        try { return dataJson(JSON.parse(snapshot)) === dataJson(data); }
        catch (_) { return false; }
    };
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

    let pushPending = false;   // a change is owed to the account but not yet acked

    // Durable owed-state, per account: survives tab closure. baseDataJson is
    // the cloud content the local changes built on (last acked state);
    // owedLocalJson is the local snapshot still owed to the account. Named
    // tankan_sync_state_ so the backup sweep (hikeybr_/hikeymash_) never
    // uploads it, and per-uid so account B never consults account A's debt.
    const stateKey = id => 'tankan_sync_state_' + id;
    const readState = id => { try { return JSON.parse(localStorage.getItem(stateKey(id)) || '{}'); } catch (_) { return {}; } };
    const writeState = (id, patch) => { const s = readState(id); Object.assign(s, patch); localStorage.setItem(stateKey(id), JSON.stringify(s)); };

    // Retry button: shown only when a save failed or is stuck. It never writes
    // directly - it re-runs the full account check, so the same guards apply
    // (owed change is pushed only if the account copy still equals what it
    // was built on; any divergence goes to the normal choice prompt).
    const retryBtn = $('sync-retry');
    let curUser = null;
    let slowTimer = null;
    let inFlight = 0;
    const showRetry = v => { if (retryBtn) retryBtn.hidden = !v; };

    const push = async () => {
        if (!bound || applying || !store) return;
        pushPending = false;
        const snapshot = localJson();
        const payload = window.TANKAN_BACKUP.buildPayload();
        const myUid = uid;
        inFlight++;
        showRetry(false);
        setStatus('Saving to your account…');
        clearTimeout(slowTimer);
        slowTimer = setTimeout(() => {
            if (inFlight && uid === myUid) {
                setStatus('Still saving - the connection is slow. Your progress is safe on this device; you can retry.');
                showRetry(true);
            }
        }, window.TANKAN_SYNC_SLOW_MS || 15000);
        try {
            await store.write(payload);
            if (uid !== myUid) return;
            const now = localJson();
            const newer = now !== snapshot;
            writeState(myUid, { baseDataJson: snapshot, owedLocalJson: newer ? now : null });
            if (newer) {
                setStatus('Saving newer changes to your account…');
            } else {
                setStatus('Saved to your account.');
                showRetry(false);
            }
        } catch (e) {
            if (uid !== myUid) return;
            pushPending = true; // retried on reconnect, on reopen, and on the next change
            writeState(myUid, { owedLocalJson: localJson() });
            setStatus('Could not save to your account - your progress is safe on this device. Tap Retry saving, or it will retry when you are back online.');
            showRetry(true);
        } finally {
            inFlight--;
            if (!inFlight) clearTimeout(slowTimer);
        }
    };

    if (retryBtn) retryBtn.addEventListener('click', () => {
        if (!curUser || curUser.uid !== uid) return;
        clearTimeout(pushTimer);
        showRetry(false);
        onSignedIn(curUser);
    });

    const schedulePush = () => {
        if (!bound) return;
        pushPending = true;
        writeState(uid, { owedLocalJson: localJson() });
        if (!inFlight) setStatus('Changes not saved to your account yet - saving shortly.');
        clearTimeout(pushTimer);
        pushTimer = setTimeout(push, DEBOUNCE_MS);
    };

    // The first write in a session pays Firestore stream setup (measured live:
    // ~4-35s cold vs <1s warm), so the 5s debounce plus a tab close can lose a
    // change. When the page is hidden, start an owed push immediately instead
    // of waiting out the debounce. Not an unload guarantee - the write simply
    // starts while the page is still alive.
    const flushPush = () => {
        if (!pushPending || !bound || applying || !store) return;
        clearTimeout(pushTimer);
        push();
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPush();
    });
    window.addEventListener('pagehide', flushPush);
    window.addEventListener('online', () => { if (pushPending) flushPush(); });

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
        curUser = user;
        hideBoxes();
        showRetry(false);
        setStatus('Checking your account…');
        // What this device held when the check began. The read can take many
        // seconds on a cold Firestore stream; progress made meanwhile is a
        // change built on this snapshot (see 'changedDuringCheck' below).
        const startLocal = localJson();
        try {
            store = await getStore();
            const doc = await store.read();
            if (uid !== user.uid) return; // account changed mid-check: a newer check owns the state
            const cloudObj = doc && parseCloud(doc);
            const local = localJson();
            const changedDuringCheck = local !== startLocal;
            const localEmpty = !hasLocalProgress();

            // Owed-state recovery: a change that never reached the account
            // (offline, failed save, tab closed mid-debounce) is pushed now,
            // but only when the account copy is EXACTLY what that change was
            // based on - if another device saved since, the normal conflict
            // prompt decides; nothing is overwritten silently.
            const st = readState(user.uid);
            if (st.owedLocalJson && cloudObj && sameSnapshot(st.baseDataJson, cloudObj.data) && sameSnapshot(st.owedLocalJson, collect())) {
                bound = true;
                hideBoxes();
                push();
                return;
            }

            // Progress made while this check was still reading. It is safe to
            // save only when the account copy is exactly what the change built
            // on (or the account has nothing and the device had nothing): then
            // nothing on either side is overwritten. Anything else falls
            // through to the normal ask/conflict flow below.
            if (changedDuringCheck && ((cloudObj && sameSnapshot(startLocal, cloudObj.data)) || ((!doc || !cloudObj) && startLocal === '{}'))) {
                bound = true;
                hideBoxes();
                writeState(user.uid, { baseDataJson: cloudObj ? startLocal : '{}', owedLocalJson: local });
                push();
                return;
            }

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
            } else if (sameSnapshot(local, cloudObj.data)) {
                bound = true;
                writeState(user.uid, { baseDataJson: local, owedLocalJson: null });
                setStatus('Saved to your account.');
                // Warm the write stream with an identical-content write so the
                // first real change saves in ~1s instead of paying cold stream
                // setup (tens of seconds) the user may close the tab during.
                push();
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
            if (uid !== user.uid) return;
            bound = false;
            setStatus('Could not reach your account - progress is safe on this device. Tap Retry saving to check again.');
            showRetry(true);
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
        pushPending = false;
        // Any auth transition drops the previous account's binding and store
        // synchronously: a racing debounced push must never carry one
        // account's progress into another account's document.
        bound = false;
        store = null;
        uid = user ? user.uid : null;
        curUser = user || null;
        clearTimeout(slowTimer);
        showRetry(false);
        hideBoxes();
        if (user) onSignedIn(user);
        else setStatus('');
    })).catch(() => {});
})();
