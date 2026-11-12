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
            window.__authSwitch = u => {
                window.__authUser = u;
                if (u) localStorage.setItem('__authSeed', JSON.stringify(u));
                else localStorage.removeItem('__authSeed');
                window.__authCbs.forEach(cb => cb(u));
            };
            window.TANKAN_SYNC_TEST_STORE = {
                _docs() { return JSON.parse(localStorage.getItem('__syncDocs') || '{}'); },
                _save(d) { localStorage.setItem('__syncDocs', JSON.stringify(d)); },
                _key() { return (window.__authUser || {}).uid || 'u1'; },
                async read() {
                    if (window.__syncReadDelay) {
                        const d = window.__syncReadDelay;
                        window.__syncReadDelay = 0;
                        await new Promise(r => setTimeout(r, d));
                    }
                    return this._docs()[this._key()] || null;
                },
                async write(payload) {
                    if (window.__syncFail) throw new Error('unavailable');
                    const d = this._docs();
                    d[this._key()] = { payload, savedAt: { seconds: 1794000000 } };
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

    // 7. Account switch A->B, B's cloud empty: asks before binding, and a
    // progress change racing the async transition never lands A's data in B's doc.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'A-progress' })));
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    assert.ok(((await page.evaluate(() => JSON.parse(localStorage.getItem('__syncDocs') || '{}').u1 || {})).payload || '').includes('A-progress'), 'A bound and saved to A doc');
    await page.evaluate(() => {
        window.__syncReadDelay = 400; // keep the account read in flight
        window.__authSwitch({ uid: 'u2', displayName: 'B User', email: 'b@example.com' });
        setTimeout(() => window.dispatchEvent(new Event('tankan-progress-changed')), 50); // mid-transition practice change
    });
    await page.waitForTimeout(900);
    assert.ok(await page.locator('#sync-bind-prompt').isVisible(), 'switch to an empty-B account asks before binding');
    assert.match(await page.locator('#sync-bind-text').textContent(), /b@example.com/, 'bind prompt names the B account');
    assert.ok(!JSON.parse(await page.evaluate(() => localStorage.getItem('__syncDocs') || '{}')).u2, 'no silent upload of A progress into B doc across the async transition');
    await page.click('#sync-bind-skip'); await page.waitForTimeout(200);
    assert.ok(!JSON.parse(await page.evaluate(() => localStorage.getItem('__syncDocs') || '{}')).u2, 'declining the B bind writes nothing');
    await page.context().close();

    // 8. Account switch A->B, B's cloud differs: conflict surfaces, B doc untouched before a choice.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'A-progress' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u2: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 7, marker: 'B-progress' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.dispatchEvent(new Event('tankan-progress-changed')); // pending debounce at the moment of the switch
        window.__authSwitch({ uid: 'u2', displayName: 'B User', email: 'b@example.com' });
    });
    await page.waitForTimeout(800);
    assert.ok(await page.locator('#sync-conflict').isVisible(), 'A->B switch with different B cloud surfaces the conflict');
    const bDoc = await page.evaluate(() => (JSON.parse(localStorage.getItem('__syncDocs') || '{}').u2 || {}).payload || '');
    assert.ok(bDoc.includes('B-progress') && !bDoc.includes('A-progress'), 'B doc untouched until B chooses');
    await page.context().close();

    // 9. Hide flush: an owed push starts immediately when the page hides,
    //    not after the debounce (close-tab loss window).
    page = await newPage();
    await page.addInitScript(() => { window.TANKAN_SYNC_DEBOUNCE_MS = 60000; });
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'flush' })); });
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.__writes = 0;
        const s = window.TANKAN_SYNC_TEST_STORE;
        const orig = s.write.bind(s);
        s.write = async p => { window.__writes++; return orig(p); };
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => window.__writes), 0, 'debounced push has not fired yet');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => window.__writes), 1, 'pagehide starts the owed push immediately');
    await page.context().close();

    // 10. Offline failure stays owed and flushes on reconnect.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'retry' })); });
    await openSettings(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__syncFail = true; });
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 5, marker: 'retry' })); window.dispatchEvent(new Event('tankan-progress-changed')); });
    await page.waitForTimeout(600);
    assert.match(await page.locator('#sync-status').textContent(), /Could not reach your account/, 'failed save is honest');
    await page.evaluate(() => { window.__syncFail = false; window.dispatchEvent(new Event('online')); });
    await page.waitForTimeout(600);
    const doc10 = JSON.parse(await readCloud(page));
    assert.ok(doc10.data.hikeybr_store_v3.includes('"unlockedIndex":5'), 'reconnect flush saves the owed change');
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, 'status recovers after the retry');
    await page.context().close();

    // 11. Identical sign-in warms the write stream with exactly one identical write.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        const data = { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 4, marker: 'warm' }) };
        localStorage.setItem('hikeybr_store_v3', data.hikeybr_store_v3);
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openSettings(page);
    await page.evaluate(() => {
        window.__writes = 0;
        const s = window.TANKAN_SYNC_TEST_STORE;
        const orig = s.write.bind(s);
        s.write = async p => { window.__writes++; return orig(p); };
    });
    await page.click('#google-signin-btn'); await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => window.__writes), 1, 'identical sign-in fires exactly one warm-up write');
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, 'warm-up keeps the saved status');
    await page.context().close();

    await browser.close();
    server.close();
    console.log('PASS tests/sync.cjs (11 scenarios)');
})().catch(e => { console.error('FAIL tests/sync.cjs:', e.message); server.close(); process.exit(1); });
