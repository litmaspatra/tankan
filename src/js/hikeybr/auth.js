// Google sign-in (Firebase Authentication, vendored SDK loaded as ES modules).
// Sign-in is OPTIONAL and never touches saved progress: this module reads and
// writes nothing in localStorage - the hikeybr_/hikeymash_ progress keys are
// untouched by sign-in, sign-out, or session restore. Firebase keeps its own
// session under its own IndexedDB database. Score sync and leaderboards are
// not built; signing in only identifies the visitor to the site itself.
(function () {
    const $ = id => document.getElementById(id);
    const row = $('account-row');
    if (!row) return; // panel not on this page

    // Offer sign-in only where Firebase can actually serve it (authorized
    // domains + local dev). Everywhere else (old github.io address, file://)
    // the section stays hidden rather than offering a button that must fail.
    const ALLOWED_HOSTS = new Set(['tankan.in', 'www.tankan.in', 'tankan.pages.dev', 'localhost', '127.0.0.1']);
    if (!ALLOWED_HOSTS.has(location.hostname)) return;

    const CONFIG = {
        apiKey: 'AIzaSyBvXxkdeGhOk_Af7n3S3uofOXzz9veHv_k',
        authDomain: 'tankan-6e340.firebaseapp.com',
        projectId: 'tankan-6e340',
        appId: '1:970907843570:web:dc6aa30474aa4f2d1fc96b'
    };

    const outBox = $('account-signed-out');
    const inBox = $('account-signed-in');
    const nameEl = $('account-name');
    const status = $('account-status');
    const signinBtn = $('google-signin-btn');
    const signoutBtn = $('google-signout-btn');
    row.hidden = false;

    const render = user => {
        if (user) {
            nameEl.textContent = 'Signed in as ' + (user.displayName || user.email || 'Google user');
            outBox.hidden = true;
            inBox.hidden = false;
        } else {
            outBox.hidden = false;
            inBox.hidden = true;
        }
    };

    // The vendored SDK is loaded lazily; tests can substitute a client via
    // window.TANKAN_AUTH_TEST_CLIENT ({ onAuth(cb), signIn(), signOut() }).
    const clientPromise = (async () => {
        if (window.TANKAN_AUTH_TEST_CLIENT) return window.TANKAN_AUTH_TEST_CLIENT;
        const appMod = await import('../vendor/firebase-app.js');
        const authMod = await import('../vendor/firebase-auth.js');
        const app = appMod.initializeApp(CONFIG);
        const auth = authMod.getAuth(app);
        return {
            onAuth(cb) { authMod.onAuthStateChanged(auth, cb); },
            signIn() {
                const provider = new authMod.GoogleAuthProvider();
                return authMod.signInWithPopup(auth, provider);
            },
            signOut() { return authMod.signOut(auth); }
        };
    })();

    // sync.js attaches its own listener through this handle.
    window.__tankanAuthClient = clientPromise;

    clientPromise.then(client => client.onAuth(render)).catch(() => {
        status.textContent = 'Sign-in is unavailable on this connection right now.';
        signinBtn.disabled = true;
    });

    signinBtn.addEventListener('click', async () => {
        status.textContent = 'Opening Google sign-in…';
        signinBtn.disabled = true;
        // Watchdog: if popup-close detection is ever blocked (COOP) the SDK
        // promise stays pending - reset the waiting UI rather than sticking.
        const watchdog = setTimeout(() => {
            status.textContent = '';
            signinBtn.disabled = false;
        }, 30000);
        try {
            const client = await clientPromise;
            await client.signIn();
            status.textContent = '';
        } catch (e) {
            const code = (e && e.code) || '';
            status.textContent = /popup-closed|cancelled|exited/i.test(code)
                ? 'Sign-in was closed before it finished - nothing changed.'
                : 'Sign-in did not complete. Your progress on this device is unchanged.';
        } finally {
            clearTimeout(watchdog);
            signinBtn.disabled = false;
        }
    });

    signoutBtn.addEventListener('click', async () => {
        status.textContent = '';
        try {
            const client = await clientPromise;
            await client.signOut();
        } catch (e) {
            status.textContent = 'Sign-out did not complete. Please try again.';
        }
    });
})();
