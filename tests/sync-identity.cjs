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
const openProfile = async page => { await page.click('button.nav-tab[data-target="profile"]'); await page.waitForTimeout(250); };

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


    let shared=null,writes=0;
    const device=async(width=1366)=>{
        const p=await newPage();await p.setViewportSize({width,height:900});
        await p.exposeFunction('__cloudRead',()=>shared);
        await p.exposeFunction('__cloudWrite',payload=>{shared={payload};writes++;});
        await p.addInitScript(()=>{window.TANKAN_SYNC_TEST_STORE={read:()=>window.__cloudRead(),write:p=>window.__cloudWrite(p)};});
        return p;
    };
    const envelope=data=>({payload:JSON.stringify({app:'tankan',kind:'tankan-progress-backup',version:1,data})});
    const progress=n=>JSON.stringify({unlockedIndex:n,highestUnlocked:n,bestScore:n*100,lessonHistory:[{wpm:n,acc:99,chars:100,errors:1,seconds:60,score:100,ts:1},{wpm:n+1,acc:98,chars:100,errors:2,seconds:60,score:101,ts:2}]});
    const avatar=JSON.stringify({kind:'preset',preset:'bottts'});
    const seed=async(p,n)=>{await p.goto(base);await p.evaluate(({n,avatar})=>{localStorage.setItem('hikeybr_store_v3',n);localStorage.setItem('hikeybr_avatar_u_u1',avatar);},{n:progress(n),avatar});await openProfile(p);await p.click('#google-signin-btn');};
    const status=async(p,fragment)=>p.waitForFunction(t=>document.getElementById('sync-status').textContent.includes(t),fragment);
    const hidden=async p=>{assert.equal(await p.locator('#sync-conflict').isVisible(),false);assert.equal(await p.locator('#sync-bind-prompt').isVisible(),false);};

    // Same account on two device contexts, different key/property order.
    shared=envelope({hikeybr_avatar_u_u1:JSON.stringify({preset:'bottts',kind:'preset'}),hikeybr_store_v3:progress(8)});
    let laptop=await device(),phone=await device(390);await seed(laptop,8);await status(laptop,'Saved');await hidden(laptop);await seed(phone,8);await status(phone,'Saved');await hidden(phone);
    await phone.reload();await openProfile(phone);await status(phone,'Saved');await hidden(phone);
    const kept=JSON.parse(shared.payload).data;assert.equal(JSON.parse(kept.hikeybr_store_v3).bestScore,800);
    await phone.context().close();await laptop.context().close();

    // Genuine difference stays a choice. Restore account, retain rollback,
    // hide successful replacement on this device and subsequent reload.
    shared=envelope({hikeybr_avatar_u_u1:avatar,hikeybr_store_v3:progress(12)});
    phone=await device(390);await seed(phone,8);await status(phone,'differs');assert.ok(await phone.locator('#sync-conflict').isVisible());const before=shared.payload;
    await phone.click('#sync-use-account');await phone.waitForLoadState('domcontentloaded');await status(phone,'Saved');await openProfile(phone);await hidden(phone);
    let local=await phone.evaluate(()=>({current:JSON.parse(localStorage.getItem('hikeybr_store_v3')),rollback:JSON.parse(localStorage.getItem('hikeybr_presync_backup')).data}));
    assert.equal(local.current.bestScore,1200);assert.equal(JSON.parse(local.rollback.hikeybr_store_v3).bestScore,800);
    await phone.reload();await status(phone,'Saved');await hidden(phone);
    await openProfile(phone);await phone.locator('#sync-status').scrollIntoViewIfNeeded();await phone.screenshot({animations:'disabled',fullPage:false,path:path.join(process.env.TANKAN_SCREENSHOTS||require('node:os').tmpdir(),'tankan-sync-after-restore-phone.png')});

    // The other device's differing progress is NOT silently pulled/replaced.
    laptop=await device();await seed(laptop,7);await status(laptop,'differs');assert.equal(JSON.parse(await laptop.evaluate(()=>localStorage.getItem('hikeybr_store_v3'))).bestScore,700);
    await laptop.click('#sync-use-device');await status(laptop,'Saved');await hidden(laptop);assert.equal(JSON.parse(JSON.parse(shared.payload).data.hikeybr_store_v3).bestScore,700);
    assert.equal(JSON.parse(await phone.evaluate(()=>localStorage.getItem('hikeybr_store_v3'))).bestScore,1200);
    await laptop.reload();await status(laptop,'Saved');await hidden(laptop);
    await openProfile(laptop);await laptop.locator('#sync-status').scrollIntoViewIfNeeded();await laptop.screenshot({animations:'disabled',path:path.join(process.env.TANKAN_SCREENSHOTS||require('node:os').tmpdir(),'tankan-sync-after-update-desktop.png')});
    await phone.reload();await openProfile(phone);await status(phone,'differs');assert.ok(await phone.locator('#sync-conflict').isVisible(),'a newer genuine other-device change still needs consent');
    await laptop.context().close();await phone.context().close();

    // Legacy outer-JSON owed state must still recover, including reordered
    // keys. No debt is discarded or replaced by the remote base.
    const baseData={hikeybr_avatar_u_u1:avatar,hikeybr_store_v3:progress(5)},owedData={hikeybr_store_v3:progress(6),hikeybr_avatar_u_u1:avatar};shared=envelope(baseData);
    phone=await device();await phone.goto(base);await phone.evaluate(({baseData,owedData})=>{for(const[k,v]of Object.entries(owedData))localStorage.setItem(k,v);localStorage.setItem('tankan_sync_state_u1',JSON.stringify({baseDataJson:JSON.stringify(baseData),owedLocalJson:JSON.stringify(owedData)}));},{baseData,owedData});await openProfile(phone);await phone.click('#google-signin-btn');await status(phone,'Saved');await hidden(phone);assert.equal(JSON.parse(JSON.parse(shared.payload).data.hikeybr_store_v3).bestScore,600);await phone.context().close();

    // Same stats with DIFFERENT ordered lesson history is not equal.
    shared=envelope({hikeybr_store_v3:progress(8),hikeybr_avatar_u_u1:avatar});laptop=await device();await laptop.goto(base);await laptop.evaluate(({raw,avatar})=>{const p=JSON.parse(raw);p.lessonHistory.reverse();localStorage.setItem('hikeybr_store_v3',JSON.stringify(p));localStorage.setItem('hikeybr_avatar_u_u1',avatar);},{raw:progress(8),avatar});await openProfile(laptop);await laptop.click('#google-signin-btn');await status(laptop,'differs');assert.ok(await laptop.locator('#sync-conflict').isVisible());await laptop.context().close();
    await browser.close();server.close();console.log('PASS sync identity:two-device key/property order, both replacement directions, reload, rollback, no remote clobber, legacy debt, real history conflicts');
})().catch(e=>{console.error(e);server.close();process.exit(1)});
