// Profile photo: header circle, Google photo default, gallery upload,
// per-account isolation (vaulting), payload budget guard. Same harness as
// auth.cjs; the Firebase client is stubbed, users carry uid + photoURL.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
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
    // Circle regression: the global * { border-radius: 0 !important } reset must not square the avatar.
    const radii = await page.evaluate(() => ['#avatar-corner', '#avatar-img', '#avatar-preview', '#avatar-preview-img']
        .map(sel => getComputedStyle(document.querySelector(sel)).borderRadius));
    assert.ok(radii.every(r => r === '50%'), 'avatar circle wins over the global radius reset, got: ' + radii.join(','));
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

    // 7. Preset picker: grid lists every built-in face; picking one replaces
    // the upload, stores only the preset name, and marks the selection.
    const expectedPresets = await page.evaluate(() => window.TANKAN_AVATAR.PRESETS.length);
    assert.strictEqual(await page.locator('#avatar-preset-grid .avatar-preset').count(), expectedPresets, 'grid shows all presets');
    await page.click('#avatar-preset-grid .avatar-preset[data-preset="dumbstruck"]');
    await page.waitForTimeout(200);
    assert.ok((await page.locator('#avatar-img').getAttribute('src')).endsWith('assets/avatars/dumbstruck.webp'), 'header shows the picked preset');
    assert.deepStrictEqual(await page.evaluate(u => JSON.parse(localStorage.getItem('hikeybr_avatar_u_' + u)), A.uid),
        { kind: 'preset', preset: 'dumbstruck' }, 'preset stored as just a name');
    assert.ok(await page.locator('#avatar-preset-grid .avatar-preset[data-preset="dumbstruck"]').evaluate(el => el.classList.contains('selected')), 'picked preset is marked');
    assert.ok(await page.locator('#avatar-remove').isVisible(), 'remove offered with a preset');
    assert.ok(await page.locator('#avatar-use-google').isVisible(), 'google button offered to switch back');

    // 8. Switch to B and back: a preset choice vaults and restores like an upload.
    await page.evaluate(u => window.__setAuthUser(u), B);
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#avatar-img').getAttribute('src'), B.photoURL, "B never sees A's preset");
    assert.strictEqual(await page.evaluate(u => localStorage.getItem('hikeybr_avatar_u_' + u), A.uid), null, "A's preset key left the syncable namespace");
    await page.evaluate(u => window.__setAuthUser(u), A);
    await page.waitForTimeout(200);
    assert.ok((await page.locator('#avatar-img').getAttribute('src')).endsWith('assets/avatars/dumbstruck.webp'), "A's preset restored from vault");

    // 9. Remove clears the preset, back to the Google photo.
    await page.click('#avatar-remove');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.locator('#avatar-img').getAttribute('src'), PIXEL, 'preset removed, Google photo back');

    // 10. An unknown preset name (written by another build) is ignored, not shown broken.
    await page.evaluate(u => localStorage.setItem('hikeybr_avatar_u_' + u, JSON.stringify({ kind: 'preset', preset: 'not-a-face' })), A.uid);
    const fellThrough = await page.evaluate(() =>
        window.TANKAN_AVATAR.resolve({ uid: 'uid-aaa', displayName: 'Asha', email: 'a@example.com', photoURL: 'data:x' }).kind);
    assert.strictEqual(fellThrough, 'google', 'unknown preset falls back to the Google photo');
    await page.evaluate(u => localStorage.removeItem('hikeybr_avatar_u_' + u), A.uid);

    // 11. Sign out: header avatar hidden, no custom key touched.
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

// Static guard: the upload decode path must stay inside the narrow CSP.
// The local test server does not apply _headers, so the Playwright flows
// cannot catch a blob: regression - this reads the files directly.
{
    const fs = require('fs');
    const avatarSrc = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'js', 'hikeybr', 'avatar.js'), 'utf8');
    const headers = fs.readFileSync(require('path').join(__dirname, '..', '_headers'), 'utf8');
    assert.ok(!avatarSrc.includes('URL.createObjectURL('), 'avatar decode must not use blob: object URLs (CSP blocks them)');
    const imgSrc = (headers.match(/img-src ([^;]+)/) || [])[1] || '';
    assert.ok(imgSrc.includes('data:'), 'CSP img-src must allow data: for uploaded avatars');
    console.log('PASS: static CSP/upload-path guard');
}
