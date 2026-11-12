// "We moved" banner: shows only on the old address (forced here via the test
// hook since file:// is not github.io), steps dialog, dismiss, no storage writes.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const base = 'file://' + path.resolve(__dirname, '../index.html');
    // New address (not old host, no hook): no banner.
    await page.goto(base); await page.waitForTimeout(300);
    assert.equal(await page.locator('#moved-bar').count(), 0, 'no banner away from the old address');
    // Old address (hook): banner, steps, dismiss.
    await page.goto(base + '?movedbanner=1'); await page.evaluate(() => sessionStorage.clear());
    await page.goto(base + '?movedbanner=1'); await page.waitForTimeout(300);
    assert.ok(await page.locator('#moved-bar').isVisible(), 'banner shows on old address');
    const before = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    assert.equal(await page.locator('#moved-bar a').getAttribute('href'), 'https://tankan.in');
    await page.click('#moved-steps-btn');
    assert.ok(await page.locator('#moved-card').isVisible(), 'steps dialog opens');
    const txt = await page.locator('#moved-card').innerText();
    assert.match(txt, /same browser/i); assert.match(txt, /Bring your progress from the old site/); assert.match(txt, /Sign in with Google/); assert.match(txt, /Save to my account/); assert.match(txt, /Saved to your account/); assert.match(txt, /which copy to keep/);
    await page.keyboard.press('Escape');
    assert.ok(!(await page.locator('#moved-card').isVisible()), 'Escape closes steps');
    assert.ok(await page.locator('header').isVisible(), 'app header still visible');
    await page.click('#moved-dismiss');
    assert.equal(await page.locator('#moved-bar').count(), 0, 'dismissed');
    await page.goto(base + '?movedbanner=1'); await page.waitForTimeout(300);
    assert.equal(await page.locator('#moved-bar').count(), 0, 'stays hidden for the session');
    assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage))), before, 'localStorage untouched');
    assert.deepEqual(errors, []);
    await browser.close();
    console.log('moved-banner: ok');
})().catch(e => { console.error(e); process.exit(1); });
