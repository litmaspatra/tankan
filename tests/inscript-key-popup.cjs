// Inscript key-speed popup: strip badge and Profile chart open the same
// Last/Best/Average card with lesson dots from the Inscript store.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
    const launch = { headless: true };
    if (process.env.CHROME_PATH) { launch.executablePath = process.env.CHROME_PATH; launch.args = ['--no-sandbox']; }
    const browser = await chromium.launch(launch);
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');
    await page.goto(url);
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('tankan_layout', 'inscript');
    });
    await page.reload(); await page.waitForTimeout(500);
    const keyName = await page.evaluate(() => { const l = Object.keys(localStorage).filter(k => /layout/i.test(k)); return l; });
    console.log('layout keys', keyName);
    const first = await page.evaluate(() => TankanInscript.PROGRESSION[0].cp);
    await page.evaluate((cp) => {
        const raw = JSON.parse(localStorage.getItem('hikeybr_inscript_v1') || 'null') || {u:3,h:3,goal:25,ks:{},kl:{},lessons:[],total:0,daily:{}};
        raw.ks[cp] = {hits:40,errors:2,modelSamples:30,modelTtt:400,modelBest:400,accurateBest:380,lastLessonWpm:31,lastAccuracy:96};
        raw.kl[cp] = {speeds:[20,24,28],lessons:[[20,95,10,Date.now()-3e5,1],[24,96,10,Date.now()-2e5,2],[31,97,10,Date.now()-1e5,3]]};
        localStorage.setItem('hikeybr_inscript_v1', JSON.stringify(raw));
    }, first);
    await page.reload(); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => TankanInscript.active), true, 'inscript active');
    const badge = page.locator('#alphabet-container .ak-badge').first();
    await badge.hover(); await page.waitForTimeout(300);
    assert.equal(await page.locator('#key-popup').isVisible(), true, 'popup opens on strip hover');
    const t = await page.locator('#key-popup').textContent();
    assert.match(t, /Last/); assert.match(t, /Best/); assert.match(t, /Average/);
    assert.equal(await page.locator('#key-popup .kp-dot').count(), 3, 'three lesson dots');
    await page.screenshot({ path: '/tmp/inscript-popup.png' });
    await page.mouse.move(5, 5); await page.waitForTimeout(500);
    // Profile chart hit area
    await page.click('#avatar-corner'); await page.click('button.nav-tab[data-target="profile"]'); await page.waitForTimeout(300);
    const hit = page.locator('#chart-key-speed rect.key-hit').first();
    assert.ok(await hit.count() >= 1, 'profile chart has hit areas for inscript');
    await hit.click(); await page.waitForTimeout(300);
    assert.equal(await page.locator('#key-popup').isVisible(), true, 'popup opens from profile chart');
    assert.deepEqual(errors, []);
    await browser.close(); console.log('inscript key popup ok');
})().catch(e => { console.error(e); process.exit(1); });
