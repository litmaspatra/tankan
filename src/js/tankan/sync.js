// Account-backed progress sync (Firestore). Bound to the Google sign-in from
// auth.js: when signed in, the visitor's progress can be saved to their own
// account document (progress/{uid}) and restored on another device.
//
// Safety rules:
// - Nothing is uploaded silently on first sign-in: an empty account copy asks
//   once before this device's progress is bound to the account.
// - When both sides hold different progress, the copy with more keys unlocked
//   wins automatically (the visitor's standing choice); the replaced copy is
//   stashed locally first (hikeybr_presync_backup). Copies with the same keys
//   unlocked resolve by practice volume (total lessons, then practice
//   seconds), an exact tie keeping the account copy - a signed-in visitor
//   whose progress is synced to the account is never asked to keep or
//   replace. Only unreadable copies still surface an explicit choice -
//   freshness or time never decide.
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
    const STORE_KEY = 'hikeybr_store_v3';
    // Furthest progress in a saved store, by keys unlocked. null when the
    // store is missing or unreadable - those cases never auto-resolve.
    const keysUnlockedOf = text => {
        try {
            const s = JSON.parse(text || '{}');
            if (typeof s.highestUnlocked === 'number') return s.highestUnlocked;
            if (typeof s.unlockedIndex === 'number') return s.unlockedIndex;
            return null;
        } catch (_) { return null; }
    };
    // Practice volume in a saved store: [totalLessons, totalPracticeSeconds],
    // missing fields counting as 0, compared lexicographically. Used to pick
    // between readable copies with the same keys unlocked.
    const practiceOf = text => {
        try {
            const s = JSON.parse(text || '{}');
            return [typeof s.totalLessons === 'number' ? s.totalLessons : 0,
                    typeof s.totalPracticeSeconds === 'number' ? s.totalPracticeSeconds : 0];
        } catch (_) { return null; }
    };
    const practiceCmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
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
        if (!bound || applying || !store) return false;
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
            if (uid !== myUid) return false;
            const now = localJson();
            const newer = now !== snapshot;
            writeState(myUid, { baseDataJson: snapshot, owedLocalJson: newer ? now : null });
            if (newer) {
                setStatus('Saving newer changes to your account…');
            } else {
                setStatus('Saved to your account.');
                showRetry(false);
            }
            return true;
        } catch (e) {
            if (uid !== myUid) return false;
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
                // An empty-but-valid account backup holds nothing worth
                // protecting; only a genuinely unreadable copy gets the
                // fail-closed treatment below.
                let cloudEmpty = false;
                if (doc && !cloudObj) {
                    try {
                        const raw = JSON.parse(doc.payload);
                        cloudEmpty = !!(raw && raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) && Object.keys(raw.data).length === 0);
                    } catch (_) {}
                }
                if (doc && !cloudObj && !cloudEmpty) {
                    // The account has a saved copy this device cannot read
                    // (corrupt, or from a newer app version). It is never
                    // overwritten silently: the visitor chooses, and
                    // restoring an unreadable copy is not offered.
                    bound = false;
                    if (localEmpty) {
                        setStatus('Your account has a saved copy this device cannot read - nothing was changed. The account copy is untouched.');
                    } else {
                        conflictText.textContent = 'Your account has a saved copy this device cannot read. Save this device\'s progress to your account instead? The unreadable account copy will be replaced.';
                        useAccountBtn.hidden = true;
                        useDeviceBtn.hidden = false;
                        useDeviceBtn.textContent = 'Save this device\'s progress (replace the account copy)';
                        conflictBox.hidden = false;
                        setStatus('The account copy cannot be read on this device.');
                    }
                } else if (localEmpty) {
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
                useAccountBtn.hidden = false;
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
                // Auto-resolve by furthest progress: the copy with more keys
                // unlocked wins, per the visitor's standing choice. The
                // replaced copy is stashed first (the account copy below, the
                // device copy inside applyCloud), so nothing is unrecoverable.
                // Only unreadable copies still get the choice - freshness or
                // time never decide.
                const localKeys = keysUnlockedOf(collect()[STORE_KEY]);
                const cloudKeys = keysUnlockedOf(cloudObj.data[STORE_KEY]);
                if (localKeys !== null && cloudKeys !== null && localKeys > cloudKeys) {
                    bound = true;
                    try { localStorage.setItem(PRESYNC_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: cloudObj.data })); window.dispatchEvent(new Event('tankan-stash-updated')); } catch (_) {}
                    push().then(ok => {
                        if (ok && uid === user.uid) setStatus('This device is further ahead (' + (localKeys + 1) + ' keys unlocked, the account had ' + (cloudKeys + 1) + ') - saved this device\'s progress to your account.');
                    });
                    return;
                }
                if (localKeys !== null && cloudKeys !== null && cloudKeys > localKeys) {
                    setStatus('Your account is further ahead (' + (cloudKeys + 1) + ' keys unlocked, this device has ' + (localKeys + 1) + ') - bringing it to this device.');
                    applyCloud(cloudObj);
                    return;
                }
                if (localKeys !== null && cloudKeys !== null && localKeys === cloudKeys) {
                    // Same keys unlocked: practice volume decides (total
                    // lessons, then practice seconds); an exact tie keeps the
                    // account copy. The replaced copy is stashed either way,
                    // so nothing is unrecoverable. A signed-in visitor whose
                    // progress is synced to the account is never asked to
                    // keep or replace.
                    const localPractice = practiceOf(collect()[STORE_KEY]);
                    const cloudPractice = practiceOf(cloudObj.data[STORE_KEY]);
                    const cmp = practiceCmp(localPractice, cloudPractice);
                    if (cmp > 0) {
                        bound = true;
                        try { localStorage.setItem(PRESYNC_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: cloudObj.data })); window.dispatchEvent(new Event('tankan-stash-updated')); } catch (_) {}
                        push().then(ok => {
                            if (ok && uid === user.uid) setStatus('Same keys unlocked, but this device has more practice (' + localPractice[0] + ' vs ' + cloudPractice[0] + ' lessons) - saved this device\'s progress to your account.');
                        });
                        return;
                    }
                    setStatus(cmp < 0
                        ? 'Same keys unlocked, but your account has more practice (' + cloudPractice[0] + ' vs ' + localPractice[0] + ' lessons) - bringing it to this device.'
                        : 'Same keys unlocked and equal practice - matched this device to your account copy.');
                    applyCloud(cloudObj);
                    return;
                }
                bound = false;
                conflictText.textContent = 'This device and your account have different progress that cannot be compared safely. Choose which one to keep - the other copy is replaced only when you say so.';
                useDeviceBtn.hidden = false;
                useAccountBtn.hidden = false;
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
