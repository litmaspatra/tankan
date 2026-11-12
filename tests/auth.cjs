// Google sign-in (Firebase Auth) wiring. Uses a local http server because the
// Account section is offered only on authorized origins (localhost counts) and
// module imports need http. The Firebase client is substituted with a stub via
// window.TANKAN_AUTH_TEST_CLIENT so no Google network is involved; the real
// popup flow is verified live against tankan.in separately.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(ROOT, 'index.html');
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});

const openProfile = async page => { await page.click('button.nav-tab[data-target="profile"]'); await page.waitForTimeout(250); };

(async () => {
    await new Promise(r => server.listen(0, 'localhost', r));
    const base = `http://localhost:${server.address().port}/index.html`;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));

    // Stub Firebase client: signed-out at first; controllable sign-in/out.
    const stub = user => {
        // Test-only seed survives reloads via a localStorage key; set after
        // the preservation snapshots so it never pollutes them.
        window.__authUser = user || JSON.parse(localStorage.getItem('__authSeed') || 'null');
        window.__authCbs = [];
        window.TANKAN_AUTH_TEST_CLIENT = {
            onAuth(cb) { window.__authCbs.push(cb); setTimeout(() => cb(window.__authUser), 0); },
            signIn() {
                if (window.__authFail) return Promise.reject({ code: window.__authFail });
                window.__authUser = { displayName: 'Test User', email: 'test@example.com' };
                window.__authCbs.forEach(cb => cb(window.__authUser));
                return Promise.resolve({ user: window.__authUser });
            },
            signOut() {
                window.__authUser = null;
                window.__authCbs.forEach(cb => cb(null));
                return Promise.resolve();
            }
        };
    };
    await page.addInitScript(stub, null);

    // 1. Signed-out render on an authorized origin: button visible, no errors.
    await page.goto(base);
    await page.waitForTimeout(400);
    await openProfile(page);
    assert.ok(await page.locator('#account-row').isVisible(), 'account row shows on localhost');
    assert.ok(await page.locator('#google-signin-btn').isVisible(), 'sign-in button shows when signed out');
    assert.ok(await page.locator('#account-signed-in').isHidden(), 'signed-in box hidden when signed out');

    // 2. Progress preservation: seed progress keys, sign in, sign out, reload -
    //    the keys must be byte-identical at every step.
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_progress', JSON.stringify({ unlockedIndex: 7, wpm: 42 }));
        localStorage.setItem('hikeymash_history', '[1,2,3]');
    });
    const snap = () => page.evaluate(() => {
        const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); d[k] = localStorage.getItem(k); } return d;
    });
    const before = await snap();
    await page.click('#google-signin-btn');
    await page.waitForTimeout(300);
    assert.match(await page.locator('#account-name').textContent(), /Signed in as Test User/, 'signed-in state renders');
    assert.ok(await page.locator('#account-signed-out').isHidden(), 'signed-out box hidden when signed in');
    assert.deepEqual(await snap(), before, 'sign-in changed no localStorage keys');
    await page.click('#google-signout-btn');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#google-signin-btn').isVisible(), 'back to signed-out after sign-out');
    assert.deepEqual(await snap(), before, 'sign-out changed no localStorage keys');

    // 3. A closed popup explains itself and changes nothing.
    await page.evaluate(() => { window.__authFail = 'auth/popup-closed-by-user'; });
    await page.click('#google-signin-btn');
    await page.waitForTimeout(300);
    assert.match(await page.locator('#account-status').textContent(), /closed before it finished/i, 'closed popup is explained');
    assert.deepEqual(await snap(), before, 'failed sign-in changed no localStorage keys');
    await page.evaluate(() => { window.__authFail = null; });

    // 4. Signed-in state survives a reload (onAuth fires with the stored user).
    await page.evaluate(() => { localStorage.setItem('__authSeed', JSON.stringify({ displayName: 'Test User', email: 'test@example.com' })); });
    await page.reload();
    await page.waitForTimeout(400);
    await openProfile(page);
    assert.match(await page.locator('#account-name').textContent(), /Signed in as Test User/, 'session restored on reload');

    // 5. The row stays hidden where sign-in cannot work (file://).
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForTimeout(400);
    await openProfile(page);
    assert.ok(await page.locator('#account-row').isHidden(), 'account row hidden on file://');

    // 6. The real vendored SDK (no stub) initializes without page errors and
    //    either reports signed-out (network OK) or degrades honestly.
    const page2 = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
    await page2.goto(base);
    await page2.waitForTimeout(4000);
    await openProfile(page2);
    assert.ok(await page2.locator('#account-row').isVisible(), 'account row shows with the real SDK');
    const status2 = (await page2.locator('#account-status').textContent()).trim();
    const btnEnabled = await page2.locator('#google-signin-btn').isEnabled();
    assert.ok(btnEnabled || /unavailable/.test(status2), 'real SDK either works or degrades honestly, status=' + status2);
    assert.deepEqual(errors2, [], 'no page errors with the real SDK: ' + errors2.join(' | '));
    await page2.close();

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    await browser.close();
    server.close();
    console.log('PASS tests/auth.cjs (6 checks)');
})().catch(e => { console.error('FAIL tests/auth.cjs:', e.message); server.close(); process.exit(1); });
