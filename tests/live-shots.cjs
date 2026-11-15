// One-off LIVE visual evidence capture for the transfer flow. Synthetic data
// only, fresh isolated contexts, no sign-in. Not part of CI.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const OLD = 'https://litmaspatra.github.io/tankan/';
const NEW = 'https://tankan.in/';
const gotoOld = async (ctx) => {
    const p = await ctx.newPage();
    try { await p.goto(OLD, { waitUntil: 'domcontentloaded' }); } catch (_) {}
    await p.waitForTimeout(1200);
    return p;
};
const until = async (fn, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await new Promise(r => setTimeout(r, 150)); }
    return false;
};
(async () => {
    const browser = await chromium.launch({ headless: true });

    // A. New visitor: banner, no redirect.
    let ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    let page = await gotoOld(ctx);
    assert.ok(page.url().startsWith(OLD));
    await page.screenshot({ path: '/downloads/live-1-new-visitor-banner.png' });
    console.log('shot 1: new visitor banner');

    // B. Synthetic transfer, auto-import, ack, redirect.
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 5, marker: 'live-e2e' })));
    const dest = await ctx.newPage();
    await dest.goto(NEW, { waitUntil: 'domcontentloaded' });
    await dest.waitForTimeout(1000);
    await dest.click('button.nav-tab[data-target="settings"]');
    await dest.waitForTimeout(400);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), dest.click('#bridge-fetch-btn')]);
    await popup.waitForLoadState('domcontentloaded');
    // Popup may complete and be closed by the receiver within a second; try
    // for an early waiting-state shot but never depend on it.
    await popup.waitForTimeout(350).catch(() => {});
    try { if (!popup.isClosed()) { await popup.screenshot({ path: '/downloads/live-2-popup-waiting.png' }); console.log('shot 2: popup waiting'); } } catch (_) {}
    const landed = await until(async () => {
        const s = await dest.evaluate(() => localStorage.getItem('hikeybr_store_v3'));
        return s && JSON.parse(s).marker === 'live-e2e';
    }, 8000);
    assert.ok(landed, 'B: import landed');
    await dest.waitForTimeout(1500); // post-import reload settle
    await dest.click('button.nav-tab[data-target="practice"]');
    await dest.waitForTimeout(800);
    await dest.screenshot({ path: '/downloads/live-3-dest-progress-imported.png' });
    console.log('shot 3: imported progress on tankan.in');
    assert.equal(await page.evaluate(() => localStorage.getItem('tankan_transfer_done')), '1', 'B: flag after ack');
    const ret = await gotoOld(ctx);
    assert.ok(ret.url().startsWith(NEW), 'B2: redirected, got ' + ret.url());
    await ret.waitForTimeout(800);
    await ret.screenshot({ path: '/downloads/live-4-return-redirected.png' });
    console.log('shot 4: return visit redirected to tankan.in');
    await ctx.close();

    // C. Tie -> modal -> Cancel.
    ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    page = await gotoOld(ctx);
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 2, marker: 'old-copy' })));
    const dest2 = await ctx.newPage();
    await dest2.goto(NEW, { waitUntil: 'domcontentloaded' });
    await dest2.waitForTimeout(1000);
    await dest2.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 2, marker: 'dest-copy' })));
    await dest2.click('button.nav-tab[data-target="settings"]');
    await dest2.waitForTimeout(400);
    const [popup2] = await Promise.all([ctx.waitForEvent('page'), dest2.click('#bridge-fetch-btn')]);
    await popup2.waitForLoadState('domcontentloaded');
    const asked = await until(() => dest2.evaluate(() => document.getElementById('import-modal').classList.contains('open')), 8000);
    assert.ok(asked, 'C: modal open');
    await dest2.screenshot({ path: '/downloads/live-5-tie-modal.png' });
    console.log('shot 5: tie modal asking before replace');
    await dest2.click('#import-cancel-btn');
    await dest2.waitForTimeout(600);
    assert.equal(JSON.parse(await dest2.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).marker, 'dest-copy', 'C: dest kept');
    assert.equal(await page.evaluate(() => localStorage.getItem('tankan_transfer_done')), null, 'C: no flag');
    await dest2.screenshot({ path: '/downloads/live-6-after-cancel.png' });
    console.log('shot 6: after cancel, destination unchanged');
    await ctx.close();

    await browser.close();
    console.log('PASS live shots captured');
})().catch(e => { console.error('FAIL live shots:', e.message); process.exit(1); });
