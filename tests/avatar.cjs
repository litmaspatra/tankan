// Profile photo: header circle, Google photo default, gallery upload,
// per-account isolation (vaulting), payload budget guard. Same harness as
// auth.cjs; the Firebase client is stubbed, users carry uid + photoURL.
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

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const A = { uid: 'uid-aaa', displayName: 'Asha', email: 'a@example.com', photoURL: PIXEL };
const B = { uid: 'uid-bbb', displayName: 'Bhanu', email: 'b@example.com', photoURL: 'https://lh3.googleusercontent.com/a/b' };

const openSettings = async page => { await page.click('button.nav-tab[data-target="settings"]'); await page.waitForTimeout(250); };

(async () => {
    await new Promise(r => server.listen(0, 'localhost', r));
    const base = `http://localhost:${server.address().port}/index.html`;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));

    // Controllable auth stub. Signed out at first; __authUser switches user.
    await page.addInitScript(() => {
        window.__authUser = null;
        window.__authCbs = [];
        window.__setAuthUser = u => { window.__authUser = u; window.__authCbs.forEach(cb => cb(u)); };
        window.TANKAN_AUTH_TEST_CLIENT = {
            onAuth(cb) { window.__authCbs.push(cb); setTimeout(() => cb(window.__authUser), 0); },
            signIn() { return Promise.resolve({ user: window.__authUser }); },
            signOut() { window.__setAuthUser(null); return Promise.resolve(); }
        };
    });

    await page.goto(base);
    await page.waitForTimeout(400);

    // 1. Signed out: header avatar hidden, nothing stored.
    assert.ok(await page.locator('#avatar-corner').isHidden(), 'signed out: header avatar hidden');

    // 2. Sign in as A: header shows A's Google photo by default.
    await page.evaluate(u => window.__setAuthUser(u), A);
    await page.waitForTimeout(200);
    assert.ok(await page.locator('#avatar-corner').isVisible(), 'signed in: header avatar visible');
    assert.strictEqual(await page.locator('#avatar-img').getAttribute('src'), PIXEL, 'default is the Google photo');
    await openSettings(page);
    assert.strictEqual(await page.locator('#avatar-preview-img').getAttribute('src'), PIXEL, 'settings preview matches');
    assert.ok(await page.locator('#avatar-use-google').isHidden(), 'google button hidden while already on google photo');
    assert.ok(await page.locator('#avatar-remove').isHidden(), 'remove hidden with no custom photo');

    // 3. Upload a photo via the real file control: custom beats Google.
    const png = Buffer.from(PIXEL.split(',')[1], 'base64');
    await page.setInputFiles('#avatar-file', { name: 'me.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(400);
    const uploaded = await page.locator('#avatar-img').getAttribute('src');
    assert.ok(uploaded && uploaded.startsWith('data:image/jpeg'), 'upload downscaled to jpeg data URL');
    assert.ok(uploaded.length < 200000, 'upload within per-image ceiling');
    assert.strictEqual(await page.evaluate(u => JSON.parse(localStorage.getItem('hikeybr_avatar_u_' + u)).kind, A.uid), 'upload', 'stored under per-uid key');
    assert.ok(await page.locator('#avatar-use-google').isVisible(), 'google button offered to switch back');
    assert.ok(await page.locator('#avatar-remove').isVisible(), 'remove offered with custom photo');

    // 4. "Use my Google photo" clears the custom choice.
    await page.click('#avatar-use-google');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#avatar-img').getAttribute('src'), PIXEL, 'back to Google photo');
    assert.strictEqual(await page.evaluate(u => localStorage.getItem('hikeybr_avatar_u_' + u), A.uid), null, 'custom choice cleared');

    // 5. Re-upload, then switch to B: B must never see or sweep A's photo.
    await page.setInputFiles('#avatar-file', { name: 'me.png', mimeType: 'image/png', buffer: png });
    await page.waitForTimeout(400);
    await page.evaluate(u => window.__setAuthUser(u), B);
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#avatar-img').getAttribute('src'), B.photoURL, "B sees B's own Google photo, not A's upload");
    assert.strictEqual(await page.evaluate(u => localStorage.getItem('hikeybr_avatar_u_' + u), A.uid), null, "A's key left the syncable namespace");
    assert.ok(await page.evaluate(u => localStorage.getItem('tankan_avatar_vault_' + u), A.uid), "A's choice vaulted, not deleted");
    const swept = await page.evaluate(() => window.TANKAN_BACKUP.collect());
    assert.ok(!Object.keys(swept).some(k => k.startsWith('hikeybr_avatar_u_')), "nothing sweepable binds another account's photo to B's payload");

    // 6. Back to A: vaulted choice returns.
    await page.evaluate(u => window.__setAuthUser(u), A);
    await page.waitForTimeout(200);
    const restored = await page.locator('#avatar-img').getAttribute('src');
    assert.ok(restored && restored.startsWith('data:image/jpeg'), "A's custom photo restored from vault");
    assert.strictEqual(await page.evaluate(u => localStorage.getItem('tankan_avatar_vault_' + u), A.uid), null, 'vault emptied after restore');

    // 7. Sign out: header avatar hidden, no custom key touched.
    await page.evaluate(() => window.__setAuthUser(null));
    await page.waitForTimeout(200);
    assert.ok(await page.locator('#avatar-corner').isHidden(), 'signed out again: hidden');

    // 8. Budget guard: oversized uploads rejected by wouldFit.
    const fits = await page.evaluate(u => {
        const big = 'data:image/jpeg;base64,' + 'A'.repeat(210000);
        const small = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
        return { big: window.TANKAN_AVATAR.wouldFit(u, big), small: window.TANKAN_AVATAR.wouldFit(u, small) };
    }, A.uid);
    assert.strictEqual(fits.big, false, 'over-ceiling upload rejected');
    assert.strictEqual(fits.small, true, 'small upload accepted');

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    await browser.close();
    server.close();
    console.log('avatar: all assertions passed');
})().catch(e => { console.error(e); process.exit(1); });
