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
const openProfile = async page => { await page.click('#avatar-corner'); await page.click('button.nav-tab[data-target="profile"]'); await page.waitForTimeout(250); };

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
    await openProfile(page);
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
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    assert.match(await page.locator('#sync-conflict-text').textContent(), /Restore it to this device/, 'empty device is offered the account copy');
    await page.click('#sync-use-account');
    await page.waitForTimeout(900); // apply + reload
    const restored = await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'));
    assert.ok(restored && restored.includes('"unlockedIndex":12'), 'account copy restored to the empty device');
    await page.context().close();

    // 5. Same keys unlocked, different progress, no practice edge: the tie
    //    keeps the account copy without asking; the replaced device copy is stashed.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 5, marker: 'device' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5, marker: 'account' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(1500); // auto-resolve + reload
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), 'equally-far differing copies resolve without asking');
    let after = await page.evaluate(() => ({ cur: localStorage.getItem('hikeybr_store_v3'), pre: localStorage.getItem('hikeybr_presync_backup') }));
    assert.ok(after.cur.includes('"marker":"account"'), 'an exact tie keeps the account copy on this device');
    const preData = after.pre && JSON.parse(after.pre).data;
    assert.ok(preData && preData.hikeybr_store_v3.includes('"marker":"device"'), 'pre-sync snapshot keeps the replaced device progress');

    // Regression: the internal presync snapshot must not make the restored
    // device look different from its account copy on the next sign-in.
    await page.reload(); await page.waitForTimeout(400);
    await openProfile(page);
    await page.waitForTimeout(500);
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), 'no false conflict after restore with presync snapshot present');
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, 'restored device compares equal to its account copy');
    await page.context().close();

    // Same keys unlocked but this device holds more practice: the device copy
    // wins without asking, stashing the replaced account copy first.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 5, totalLessons: 40, marker: 'device2' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5, totalLessons: 12, marker: 'account2' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(600);
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), 'same keys but more device practice: no prompt');
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"marker":"device2"'), 'the more-practiced device copy updates the account automatically');
    const stash5b = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash5b && stash5b.includes('account2'), 'the replaced account copy is stashed for rollback');
    await page.context().close();

    // 5b. Device strictly further ahead: saves to the account without asking,
    //     stashing the overwritten account copy first.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 8, highestUnlocked: 8, marker: 'device-ahead' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 3, highestUnlocked: 3, marker: 'account-behind' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(600);
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), 'device further ahead: no conflict prompt');
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"marker":"device-ahead"'), 'further-ahead device saves to the account automatically');
    assert.match(await page.locator('#sync-status').textContent(), /further ahead/, 'status explains the automatic choice');
    let stash = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash && stash.includes('account-behind'), 'the overwritten account copy is stashed for rollback');
    await page.context().close();

    // 5c. Account strictly further ahead: restored without asking, device copy
    //     stashed by the normal rollback path.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 3, highestUnlocked: 3, marker: 'device-behind' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 8, highestUnlocked: 8, marker: 'account-ahead' }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(1200); // apply + reload
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('"marker":"account-ahead"'), 'further-ahead account restores automatically');
    stash = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash && stash.includes('device-behind'), 'the replaced device copy is stashed for rollback');
    // The rollback is real: the Settings note appears and restoring goes
    // through the same confirm modal. Signed out so the max-keys rule does
    // not immediately replace the restored copy again.
    await openProfile(page);
    await page.click('#google-signout-btn'); await page.waitForTimeout(300);
    await page.click('#avatar-corner'); await page.click('button.nav-tab[data-target="settings"]'); await page.waitForTimeout(300);
    assert.ok(await page.locator('#rollback-note').isVisible(), 'rollback note appears for the stashed copy');
    await page.click('#rollback-restore-btn'); await page.waitForTimeout(300);
    assert.ok(await page.locator('#import-modal').evaluate(n => n.classList.contains('open')), 'rollback restore asks for confirmation');
    await page.click('#import-confirm-btn'); await page.waitForTimeout(900); // apply + reload
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('device-behind'), 'rollback restores the stashed copy');
    await page.context().close();

    // 6. Offline honesty: a failed save says so and changes nothing.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'device2' })));
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
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
    await openProfile(page);
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
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.dispatchEvent(new Event('tankan-progress-changed')); // pending debounce at the moment of the switch
        window.__authSwitch({ uid: 'u2', displayName: 'B User', email: 'b@example.com' });
    });
    await page.waitForTimeout(1500); // auto-restore of the further-ahead copy + reload
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), 'A->B switch where B is further ahead resolves without asking');
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('B-progress'), "B's further-ahead copy replaces A's local progress");
    const stash8 = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash8 && stash8.includes('A-progress'), "A's replaced progress is stashed for rollback");
    const bDoc = await page.evaluate(() => (JSON.parse(localStorage.getItem('__syncDocs') || '{}').u2 || {}).payload || '');
    assert.ok(bDoc.includes('B-progress') && !bDoc.includes('A-progress'), 'B doc untouched by the restore');
    await page.context().close();

    // 9. Hide flush: an owed push starts immediately when the page hides,
    //    not after the debounce (close-tab loss window).
    page = await newPage();
    await page.addInitScript(() => { window.TANKAN_SYNC_DEBOUNCE_MS = 60000; });
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'flush' })); });
    await openProfile(page);
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
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => { window.__syncFail = true; });
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 5, marker: 'retry' })); window.dispatchEvent(new Event('tankan-progress-changed')); });
    await page.waitForTimeout(600);
    assert.match(await page.locator('#sync-status').textContent(), /Could not save to your account/, 'failed save is honest');
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
    await openProfile(page);
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

    // 12. Offline change + tab closed: the owed change saves itself on reopen
    //     when the account copy has not moved.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'owed' })); });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.__syncFail = true;
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 9, marker: 'owed' }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(600);
    assert.match(await page.locator('#sync-status').textContent(), /Could not save to your account/, 'offline save honestly failed');
    assert.ok(!JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"unlockedIndex":9'), 'failed change never reached the account');
    await page.goto(base); await page.waitForTimeout(900); // reopen; the auth stub restores the session
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, 'reopen pushes the owed change');
    const doc12 = JSON.parse(await readCloud(page));
    assert.ok(doc12.data.hikeybr_store_v3.includes('"unlockedIndex":9'), 'owed change landed after reopen');
    const st12 = await page.evaluate(() => JSON.parse(localStorage.getItem('tankan_sync_state_u1') || '{}'));
    assert.strictEqual(st12.owedLocalJson, null, 'owed marker cleared after recovery');
    await page.context().close();

    // 13. Owed change + another device saved meanwhile: conflict prompt, no silent overwrite.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'owed13' })); });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.__syncFail = true;
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 6, marker: 'owed13' }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('__syncDocs'));
        d.u1 = { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T01:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 20, marker: 'other-device' }) } }), savedAt: { seconds: 1794001000 } };
        localStorage.setItem('__syncDocs', JSON.stringify(d));
    });
    await page.goto(base); await page.waitForTimeout(1500); // auto-restore of the further-ahead copy + reload
    await openProfile(page);
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '13: further-ahead account copy resolves without asking');
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('other-device'), 'other device copy untouched by the restore');
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('other-device'), 'further-ahead account copy restored');
    const stash13 = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash13 && stash13.includes('owed13'), '13: the owed local change survives in the rollback stash');
    await page.context().close();

    // 13b. The same race with the LOCAL change further ahead: the owed device
    //      copy wins and saves without asking.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 20, marker: 'owed13b' })); });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.__syncFail = true;
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 22, marker: 'owed13b' }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        window.__syncFail = false;
        const d = JSON.parse(localStorage.getItem('__syncDocs'));
        d.u1 = { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T01:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 6, marker: 'other-device-behind' }) } }), savedAt: { seconds: 1794001000 } };
        localStorage.setItem('__syncDocs', JSON.stringify(d));
    });
    await page.goto(base); await page.waitForTimeout(900);
    await openProfile(page);
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '13b: further-ahead device copy resolves without asking');
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"unlockedIndex":22'), '13b: the owed further-ahead change saves to the account');
    await page.context().close();

    // 14. Owed state is per-account: B gets no auto-push; returning to A recovers.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => { localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, marker: 'isoA' })); });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(() => {
        window.__syncFail = true;
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 7, marker: 'isoA' }));
        window.dispatchEvent(new Event('tankan-progress-changed'));
    });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__authSwitch({ uid: 'u2', displayName: 'B User', email: 'b@example.com' }));
    await page.waitForTimeout(600);
    assert.ok(await page.locator('#sync-bind-prompt').isVisible(), 'B gets the normal bind ask, not an auto-push');
    assert.ok(!(await page.evaluate(() => JSON.parse(localStorage.getItem('__syncDocs') || '{}').u2 || null)), 'nothing auto-saved to B');
    await page.evaluate(() => { window.__syncFail = false; window.__authSwitch({ uid: 'u1', displayName: 'Test User', email: 'test@example.com' }); });
    await page.waitForTimeout(700);
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3.includes('"unlockedIndex":7'), 'returning to A saves the owed change');
    await page.context().close();

    // 15-18. Changes made while "Checking your account..." is still running (a
    // cold Firestore read took 12s live). They must not be dropped from sync and
    // must not trip a conflict when the account copy is exactly what they built on.
    const envelope = data => JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data });
    const signedInReload = async (pg, docs, localKeys, duringKeys) => {
        await pg.goto(base); await pg.waitForTimeout(300);
        await pg.evaluate(([docs, localKeys]) => {
            localStorage.setItem('__authSeed', JSON.stringify({ uid: 'u1', displayName: 'Test User', email: 'test@example.com' }));
            if (docs) localStorage.setItem('__syncDocs', JSON.stringify({ u1: { payload: docs, savedAt: { seconds: 1794000000 } } }));
            Object.entries(localKeys).forEach(([k, v]) => localStorage.setItem(k, v));
        }, [docs, localKeys]);
        await pg.addInitScript(() => { window.__syncReadDelay = 1500; });
        await pg.reload();
        await openProfile(pg);
        await pg.waitForTimeout(300); // still inside the delayed read
        await pg.evaluate(keys => {
            Object.entries(keys).forEach(([k, v]) => localStorage.setItem(k, v));
            window.dispatchEvent(new Event('tankan-progress-changed'));
        }, duringKeys);
        await pg.waitForTimeout(2600); // read finishes, debounce + push
    };
    const cloudData = pg => pg.evaluate(() => { const d = (JSON.parse(localStorage.getItem('__syncDocs') || '{}').u1 || {}).payload; return d ? JSON.parse(d).data : null; });

    // 15. Account copy equals the device at sign-in; the user keeps practising during the check.
    page = await newPage();
    await signedInReload(page, envelope({ hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5 }) }),
        { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5 }) }, { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 6 }) });
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '15: no conflict when the account copy is what the change built on');
    assert.ok((await cloudData(page)).hikeybr_store_v3.includes('"unlockedIndex":6'), '15: change made during the check reaches the account without another change');
    assert.strictEqual((await page.evaluate(() => JSON.parse(localStorage.getItem('tankan_sync_state_u1') || '{}'))).owedLocalJson, null, '15: nothing left owed');
    await page.context().close();

    // 16. Empty device, empty account; first progress arrives during the check.
    page = await newPage();
    await signedInReload(page, null, {}, { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 1 }) });
    assert.ok(!(await page.locator('#sync-bind-prompt').isVisible()), '16: no bind prompt for a device that was empty when sign-in started');
    const c16 = await cloudData(page);
    assert.ok(c16 && c16.hikeybr_store_v3.includes('"unlockedIndex":1'), '16: first progress made during the check is saved');
    await page.context().close();

    // 17. Another device saved different progress with the same keys unlocked
    //     and no practice edge: the tie keeps the account copy without asking;
    //     the during-check device copy is stashed, nothing is overwritten.
    page = await newPage();
    await signedInReload(page, envelope({ hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5, marker: 'other-device' }) }),
        { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5, marker: 'device-copy' }) }, { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5, marker: 'device-copy' }) });
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '17: equally-far differing copies resolve without asking');
    assert.ok((await cloudData(page)).hikeybr_store_v3.includes('other-device'), '17: account copy untouched by the tie');
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('other-device'), '17: this device now matches the account copy');
    const stash17a = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash17a && JSON.parse(stash17a).data.hikeybr_store_v3.includes('device-copy'), '17: the replaced device copy is stashed for rollback');
    await page.context().close();

    // 17b. The same race with the account copy strictly further ahead resolves
    //      itself: restored, no prompt, the during-check change stashed.
    page = await newPage();
    await signedInReload(page, envelope({ hikeybr_store_v3: JSON.stringify({ unlockedIndex: 9, marker: 'other-device' }) }),
        { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 5 }) }, { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 6 }) });
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '17b: further-ahead account copy resolves without asking');
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('other-device'), '17b: further-ahead account copy restored');
    const stash17 = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash17 && JSON.parse(stash17).data.hikeybr_store_v3.includes('"unlockedIndex":6'), '17b: the during-check change survives in the rollback stash');
    await page.context().close();

    // 18. Account holds an empty backup (e.g. after removing the only item) and the device has data: asks, never auto-pushes.
    page = await newPage();
    await signedInReload(page, envelope({}), { hikeybr_avatar_u_u1: JSON.stringify({ kind: 'preset', preset: 'smuggrin' }) }, {});
    assert.ok(await page.locator('#sync-bind-prompt').isVisible(), '18: device data with an empty account copy asks before binding');
    assert.ok(Object.keys(await cloudData(page)).length === 0, '18: empty account copy untouched');
    await page.context().close();

    // 19. Failed save: Retry button shows, local progress + owed copy survive a reload, retry saves, button hides.
    const sv = n => JSON.stringify({ unlockedIndex: n, marker: 'r19' });
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(v => localStorage.setItem('hikeybr_store_v3', v), sv(4));
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    assert.ok(!(await page.locator('#sync-retry').isVisible()), '19: no retry button when saved');
    await page.evaluate(v => { window.__syncFail = true; localStorage.setItem('hikeybr_store_v3', v); window.dispatchEvent(new Event('tankan-progress-changed')); }, sv(7));
    await page.waitForTimeout(600);
    assert.ok(await page.locator('#sync-retry').isVisible(), '19: failed save shows Retry saving');
    assert.match(await page.locator('#sync-status').textContent(), /safe on this device/, '19: failure text is honest');
    await page.addInitScript(() => { window.__syncFail = true; });
    await page.reload(); await page.waitForTimeout(900); await openProfile(page);
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('"unlockedIndex":7'), '19: local progress kept after reload');
    const st19 = await page.evaluate(() => JSON.parse(localStorage.getItem('tankan_sync_state_u1') || '{}'));
    assert.ok(st19.owedLocalJson && /unlockedIndex\\+":7/.test(st19.owedLocalJson), '19: durable owed copy kept after failed reload ' + JSON.stringify(st19).slice(0,300));
    await page.evaluate(() => { window.__syncFail = false; });
    await page.click('#sync-retry'); await page.waitForTimeout(700);
    assert.ok((await readCloud(page)).includes('unlockedIndex\\":7'), '19: retry saved the owed change');
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, '19: status says saved only after success');
    assert.ok(!(await page.locator('#sync-retry').isVisible()), '19: retry hidden after success');
    await page.context().close();

    // 20. Failed save, then another device changes the account: Retry must not overwrite it.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(v => localStorage.setItem('hikeybr_store_v3', v), sv(4));
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(v => { window.__syncFail = true; localStorage.setItem('hikeybr_store_v3', v); window.dispatchEvent(new Event('tankan-progress-changed')); }, sv(8));
    await page.waitForTimeout(600);
    await page.evaluate(() => {
        window.__syncFail = false;
        const d = JSON.parse(localStorage.getItem('__syncDocs'));
        d.u1 = { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T01:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 8, marker: 'other-device20' }) } }), savedAt: { seconds: 1794002000 } };
        localStorage.setItem('__syncDocs', JSON.stringify(d));
    });
    await page.click('#sync-retry'); await page.waitForTimeout(1500); // check + auto-resolve + reload
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '20: a diverged account copy no longer asks - the account copy is kept');
    assert.ok((await readCloud(page)).includes('other-device20'), '20: retry did not overwrite the account copy');
    assert.ok((await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).includes('other-device20'), '20: this device now matches the account copy');
    const stash20 = await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup'));
    assert.ok(stash20 && stash20.includes('r19'), '20: the owed device copy is stashed for rollback');
    await page.context().close();

    // 21. Stuck (slow) save: honest "still saving" text with Retry; late success clears it.
    page = await newPage();
    await page.addInitScript(() => { window.TANKAN_SYNC_SLOW_MS = 300; });
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(v => localStorage.setItem('hikeybr_store_v3', v), sv(4));
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(400);
    await page.click('#sync-bind-confirm'); await page.waitForTimeout(400);
    await page.evaluate(v => {
        const s = window.TANKAN_SYNC_TEST_STORE; const orig = s.write.bind(s);
        s.write = async p => { await new Promise(r => setTimeout(r, 1200)); return orig(p); };
        localStorage.setItem('hikeybr_store_v3', v); window.dispatchEvent(new Event('tankan-progress-changed'));
    }, sv(9));
    await page.waitForTimeout(800);
    assert.match(await page.locator('#sync-status').textContent(), /Still saving/, '21: slow save is described as still saving, not saved');
    assert.ok(await page.locator('#sync-retry').isVisible(), '21: retry offered while stuck');
    await page.waitForTimeout(1200);
    assert.match(await page.locator('#sync-status').textContent(), /Saved to your account/, '21: late success shows saved');
    assert.ok(!(await page.locator('#sync-retry').isVisible()), '21: retry hidden after late success');
    await page.context().close();

    // 22. Account check itself fails: Retry re-runs the check; it never binds on its own.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(v => { localStorage.setItem('hikeybr_store_v3', v); localStorage.setItem('__authSeed', JSON.stringify({ uid: 'u1', displayName: 'Test User', email: 'test@example.com' })); }, sv(5));
    await page.addInitScript(() => { const t = window.TANKAN_SYNC_TEST_STORE; t.__origRead = t.read.bind(t); t.read = async () => { if (window.__readFail) throw new Error('down'); return t.__origRead(); }; window.__readFail = true; });
    await page.reload(); await page.waitForTimeout(900); await openProfile(page);
    assert.ok(await page.locator('#sync-retry').isVisible(), '22: failed account check offers Retry');
    assert.ok(!(await page.locator('#sync-bind-prompt').isVisible()) && !(await readCloud(page)), '22: nothing bound or uploaded while the check failed');
    await page.evaluate(() => { window.__readFail = false; });
    await page.click('#sync-retry'); await page.waitForTimeout(700);
    assert.ok(await page.locator('#sync-bind-prompt').isVisible(), '22: after retry the normal bind question is asked');
    assert.ok(!(await readCloud(page)), '22: retry did not auto-bind or upload');
    await page.context().close();

    // 23. Unreadable progress on BOTH sides fails closed: a choice, nothing
    //     automatic, nothing overwritten.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', 'not-json{');
        localStorage.setItem('hikeybr_avatar_u_u1', JSON.stringify({ kind: 'preset', preset: 'smuggrin' }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: 'also-not-json{' } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(500);
    assert.ok(await page.locator('#sync-conflict').isVisible(), '23: unreadable copies surface the choice');
    assert.ok(await page.locator('#sync-use-account').isHidden(), '23: no restore of an unreadable account copy');
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3 === 'also-not-json{', '23: account copy untouched');
    assert.equal(await page.evaluate(() => localStorage.getItem('hikeybr_store_v3')), 'not-json{', '23: local copy untouched');
    // The one offered action is saving the device copy over the unreadable
    // account copy - and only on an explicit click.
    await page.click('#sync-use-device'); await page.waitForTimeout(400);
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_store_v3 === 'not-json{', '23: explicit choice saves the device copy');
    await page.context().close();

    // 24. Layouts split across sides merge without asking: device-only
    //     Inscript + account-only Kruti Dev unite both ways, nothing lost.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_inscript_v1', JSON.stringify({ ord: 3, u: 5, h: 5, goal: 25, ks: {}, lessons: [], bestWpm: 0, bestScore: 0, streak: 0, total: 2, secs: 120 }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 12, bestLessonWpm: 40 }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(1500); // resolve + save merge + apply + reload
    assert.ok(!(await page.locator('#sync-conflict').isVisible()) && !(await page.locator('#sync-bind-prompt').isVisible()), '24: split layouts merge without a prompt');
    const cloud24 = JSON.parse(await readCloud(page));
    assert.ok(cloud24.data.hikeybr_store_v3 && cloud24.data.hikeybr_store_v3.includes('"unlockedIndex":12'), '24: account keeps its Kruti Dev progress');
    assert.ok(cloud24.data.hikeybr_inscript_v1 && cloud24.data.hikeybr_inscript_v1.includes('"h":5'), '24: device-only Inscript progress saved to the account');
    assert.ok(await page.evaluate(() => localStorage.getItem('hikeybr_store_v3') && localStorage.getItem('hikeybr_store_v3').includes('"unlockedIndex":12')), '24: account Kruti Dev progress landed on the device');
    assert.ok(await page.evaluate(() => localStorage.getItem('hikeybr_inscript_v1') && localStorage.getItem('hikeybr_inscript_v1').includes('"h":5')), '24: device keeps its Inscript progress');
    const stash24 = JSON.parse(await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup') || 'null'));
    assert.ok(stash24 && stash24.data && stash24.data.hikeybr_inscript_v1, '24: the pre-merge device copy is stashed');
    await page.context().close();

    // 25. Account ahead in Inscript only: applied automatically, no prompt,
    //     nothing pushed back.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_inscript_v1', JSON.stringify({ ord: 3, u: 2, h: 2, goal: 25, ks: {}, lessons: [], bestWpm: 0, bestScore: 0, streak: 0, total: 1, secs: 60 }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_inscript_v1: JSON.stringify({ ord: 3, u: 10, h: 10, goal: 25, ks: {}, lessons: [], bestWpm: 0, bestScore: 0, streak: 0, total: 8, secs: 900 }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    const cloudBefore25 = await readCloud(page);
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(1200); // apply + reload
    assert.ok(!(await page.locator('#sync-conflict').isVisible()), '25: no prompt when the account is simply further ahead');
    assert.ok(await page.evaluate(() => localStorage.getItem('hikeybr_inscript_v1') && localStorage.getItem('hikeybr_inscript_v1').includes('"h":10')), '25: device picked up the account Inscript progress');
    const stash25 = JSON.parse(await page.evaluate(() => localStorage.getItem('hikeybr_presync_backup') || 'null'));
    assert.ok(stash25 && stash25.data && stash25.data.hikeybr_inscript_v1 && stash25.data.hikeybr_inscript_v1.includes('"h":2'), '25: the replaced device copy is stashed');
    assert.deepEqual(JSON.parse(await readCloud(page)).data, JSON.parse(cloudBefore25).data, '25: account content not rewritten');
    await page.context().close();

    // 26. Each side ahead in a different layout: fail closed to the explicit
    //     choice - no auto-resolve, no writes either way.
    page = await newPage();
    await page.goto(base); await page.waitForTimeout(400);
    await page.evaluate(() => {
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 9, bestLessonWpm: 30 }));
        localStorage.setItem('hikeybr_inscript_v1', JSON.stringify({ ord: 3, u: 1, h: 1, goal: 25, ks: {}, lessons: [], bestWpm: 0, bestScore: 0, streak: 0, total: 1, secs: 30 }));
        localStorage.setItem('__syncDocs', JSON.stringify({
            u1: { payload: JSON.stringify({ app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: '2026-11-12T00:00:00Z', data: { hikeybr_store_v3: JSON.stringify({ unlockedIndex: 3, bestLessonWpm: 20 }), hikeybr_inscript_v1: JSON.stringify({ ord: 3, u: 8, h: 8, goal: 25, ks: {}, lessons: [], bestWpm: 0, bestScore: 0, streak: 0, total: 5, secs: 500 }) } }), savedAt: { seconds: 1794000000 } }
        }));
    });
    await openProfile(page);
    await page.click('#google-signin-btn'); await page.waitForTimeout(800);
    assert.ok(await page.locator('#sync-conflict').isVisible(), '26: ahead in different layouts surfaces the choice');
    assert.ok(await page.locator('#sync-use-device').isVisible() && await page.locator('#sync-use-account').isVisible(), '26: both choices offered');
    assert.match(await page.locator('#sync-status').textContent(), /Progress differs/, '26: status says the copies differ');
    assert.ok(JSON.parse(await readCloud(page)).data.hikeybr_inscript_v1.includes('"h":8'), '26: account copy untouched');
    assert.ok(await page.evaluate(() => localStorage.getItem('hikeybr_inscript_v1').includes('"h":1') && localStorage.getItem('hikeybr_store_v3').includes('"unlockedIndex":9')), '26: device copies untouched');
    await page.context().close();

    await browser.close();
    server.close();
    console.log('PASS tests/sync.cjs (29 scenarios)');
})().catch(e => { console.error('FAIL tests/sync.cjs:', e.message); server.close(); process.exit(1); });
