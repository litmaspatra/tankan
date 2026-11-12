// Themes + wheel zoom regression. Run: node tests/themes-zoom.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const opts = await page.$$eval('#theme-select option', o => o.map(x => x.value));
    for (const t of ['dark', 'navy', 'amber', 'light', 'sunshine', 'forest', 'epaper', 'blackwhite']) assert.ok(opts.includes(t), 'theme ' + t);
    await page.click('text=Settings');
    await page.selectOption('#theme-select', 'blackwhite');
    await page.click('text=Practice');
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(0, 0, 0)');
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'blackwhite', 'theme persists');
    const fs = () => page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('text-stream-container')).fontSize));
    const keyH = () => page.$eval('#keyboard-frame .k-key', e => e.getBoundingClientRect().height);
    const f0 = await fs(), k0 = await keyH();
    await page.mouse.move(600, 420);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(500);
    assert.ok(await fs() > f0 + 2, 'wheel up over text grows it');
    await page.mouse.move(600, 680);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
    await page.waitForTimeout(500);
    assert.ok(await keyH() < k0 - 1, 'wheel down over keyboard shrinks it');
    // Max-size cap (Kartik 2026-11-11): wheel up must never exceed the natural size.
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(500);
    const kc = await keyH();
    assert.ok(Math.abs(kc - k0) < 1.5, 'keyboard is capped at its natural size (' + kc + ' vs ' + k0 + ')');
    assert.ok((await page.evaluate(() => document.getElementById('keyboard-frame').getBoundingClientRect().width)) <= 885, 'frame width stays within the practice column');
    // A pre-cap save with kbScale>1 renders at the natural size, not larger.
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('hikeybr_store_v3')); d.opts = Object.assign({}, d.opts, { kbScale: 1.5 }); localStorage.setItem('hikeybr_store_v3', JSON.stringify(d)); });
    await page.reload(); await page.waitForTimeout(700);
    assert.ok(Math.abs((await keyH()) - k0) < 1.5, 'old >1 save renders at the natural size');
    await page.waitForTimeout(400);
    await page.reload();
    await page.waitForTimeout(700);
    assert.ok(await fs() > f0 + 2, 'text size persists');
    await page.click('#typing-canvas', { modifiers: ['Alt'] });
    await page.waitForTimeout(500);
    assert.equal(await fs(), 32, 'Alt+click resets text size');
    // Phones: the slider's full 18-64 range must apply (a min() cap at 1.75rem
    // once made every value above 28px render identically - "size doesn't change").
    const mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mpage.on('pageerror', e => errors.push(e.message));
    await mpage.goto('file://' + path.resolve(__dirname, '../index.html'));
    await mpage.evaluate(() => localStorage.clear());
    await mpage.reload();
    await mpage.waitForTimeout(700);
    const mfs = () => mpage.evaluate(() => parseFloat(getComputedStyle(document.getElementById('text-stream-container')).fontSize));
    const setSlider = v => mpage.evaluate(val => { const s = document.getElementById('opt-text-size'); s.value = val; s.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await setSlider(48); await mpage.waitForTimeout(400);
    assert.ok(Math.abs((await mfs()) - 48) < 1.2, 'phone slider applies 48px (got ' + (await mfs()) + ')');
    await setSlider(22); await mpage.waitForTimeout(400);
    assert.ok(Math.abs((await mfs()) - 22) < 1.2, 'phone slider applies 22px (got ' + (await mfs()) + ')');
    await mpage.close();
    assert.deepEqual(errors, []);
    await browser.close();
    console.log('PASS: eight themes, theme persistence, wheel zoom of text/keyboard, reset, phone text-size range.');
})();
