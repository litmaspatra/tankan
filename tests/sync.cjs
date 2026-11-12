// Account-backed progress sync. Stubbed auth client + stubbed cloud store on a
// local http server; the real Firestore path is verified live separately.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(ROOT, 'index.html');
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});
const openSettings = async page => { await page.click('button.nav-tab[data-target="settings"]'); await page.waitForTimeout(250); };

(async () => {
    await new Promise(r => server.listen(0, 'localhost', r));
    const base = `http://localhost:${server.address().port}/index.html`;
    const browser = await chromium.launch({ headless: true });

    // Each scenario is a fresh device: its own context, its own storage.
    const newPage = async () => {
        const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
        const page = await ctx.newPage();
        page.on('pageerror', e => { throw new Error('pageerror: ' + e.message); });
        await page.addInitScript(() => {
            window.TANKAN_SYNC_DEBOUNCE_MS = 150;
            window.__authUser = JSON.parse(localStorage.getItem('__authSeed') || 'null');
            window.__authCbs = [];
            window.TANKAN_AUTH_TEST_CLIENT = {
                onAuth(cb) { window.__authCbs.push(cb); setTimeout(() => cb(window.__authUser), 0); },
                signIn() {
                    window.__authUser = { uid: 'u1', displayName: 'Test User', email: 'test@example.com' };
                    localStorage.setItem('__authSeed', JSON.stringify(window.__authUser));
                    window.__authCbs.forEach(cb => cb(window.__authUser));
                    return Promise.resolve({ user: window.__authUser });
                },
                signOut() {
                    window.__authUser = null;
                    localStorage.removeItem('__authSeed');
                    window.__authCbs.forEach(cb => cb(null));
                    return Promise.resolve();
                }
            };
            window.TANKAN_SYNC_TEST_STORE = {
                _docs() { return JSON.parse(localStorage.getItem('__syncDocs') || '{}'); },
                _save(d) { localStorage.setItem('__syncDocs', JSON.stringify(d)); },
                async read() { return this._docs().u1 || null; },
                async write(payload) {
                    if (window.__syncFail) throw new Error('unavailable');
                    const d = this._docs();
                    d.u1 = { payload, savedAt: { seconds: 1794000000 } };
                    this._save(d);
                }
            };
        });
        return page;
    };
    const readCloud = page => page.evaluate(() => (JSON.parse(localStorage.getItem('__syncDocs') || '{}').u1 || {}).payload || null);

    // 1. First bind: sign-in with local progress and an empty account asks, then saves.
    let page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 5, bestLessonWpm: 33 })));
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    assert.ok(await page.locator('#sync-bind-prompt').isVisible(), 'bind prompt shows on first sign-in with local progress');
    assert.match(await page.locator('#sync-bind-text').textContent(), /test@example\.com/, 'prompt names the account');
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    const cloud1 = JSON.parse(await readCloud(page));
    assert.equal(cloud1.kind, 'tankan-progress-backup', 'cloud holds the versioned backup envelope');
    assert.ok(cloud1.data.hikeybr_store_v3.includes('"unlockedIndex":5'), 'cloud payload carries the local progress');
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, 'status confirms the save');

    // 2. Ongoing practice saves (debounced).
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 6, bestLessonWpm: 36 }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(600);
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"unlockedIndex":6'), 'practice change syncs after the debounce');

    // 3. Sign-out stops all syncing.
    await page.click('#google-signout-btn'); await page.waitForTimeout(300);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 9 }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(500);
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"unlockedIndex":6'), 'no syncing after sign-out');
    await page.context().close();

    // 4. Restore to an empty device (account copy exists, local empty).
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('__syncDocs', JSON.stringify({
        u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 12, bestLessonWpm: 40 }) } }), savedAt: { seconds: 1794000000 } }
    })));
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    assert.match(await page.locator('#sync-conflict-text').textContent(), /Restore it to this device/, 'empty device is offered the account copy');
    await page.click('#sync-use-account');
    await page.waitForTimeout(900); // apply + reload
    const restored = await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'));
    assert.ok(restored && restored.includes('"unlockedIndex":12'), 'account copy restored to the empty device');
    await page.context().close();

    // 5. Conflict (both differ): account-choice stashes a pre-sync backup and replaces local; device-choice overwrites cloud.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 3, marker: 'device' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 8, marker: 'account' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    assert.ok(await page.locator('#sync-conflict').isVisible(), 'conflict surfaces when both sides differ');
    await page.click('#sync-use-account');
    await page.waitForTimeout(900);
    let after = await page.evaluate(() => ({ cur: localStorage.getItem('hikeybr_store_v3'), pre: localStorage.getItem('hikeybr_presync_backup') }));
    assert.ok(after.cur.includes('"marker":"account"'), 'account choice replaces local progress');
    const preData = after.pre && JSON.parse(after.pre).data;
    assert.ok(preData && preData.hikeybr_store_v3.includes('"marker":"device"'), 'pre-sync snapshot keeps the replaced device progress');

    // Regression: the internal presync snapshot must not make the restored
    // device look different from its account copy on the next sign-in.
    await page.reload(); await page.waitForTimeout(400);
    await openSettings(page);
    await page.waitForTimeout(500);
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), 'no false conflict after restore with presync snapshot present');
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, 'restored device compares equal to its account copy');
    await page.context().close();

    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 3, marker: 'device2' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 8, marker: 'account2' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-use-device'); await page.waitForTimeout(400);
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"marker":"device2"'), 'device choice updates the account copy');

    // 6. Offline honesty: a failed save says so and changes nothing.
    await page.evaluate(() => {
        window.__syncFail = true;
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'device2' }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(600);
    assert.match(await page.locator('#sync-status').textContent(), /safe on this device/, 'failed save is honest about local safety');
    await page.context().close();

    await browser.close();
    server.close();
    console.log('PASS tests/sync.cjs (6 scenarios)');
})().catch(e => { console.error('FAIL tests/sync.cjs:', e.message); server.close(); process.exit(1); });
