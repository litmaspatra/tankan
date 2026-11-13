// Controls cleanup: one font control, one sound model, no theme cycler. Run: node tests/simplify.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');
    const fresh = async seed => {
        await page.goto(url);
        await page.evaluate(s => { localStorage.clear(); if (s) localStorage.setItem('hikeybr_store_v3', JSON.stringify(s)); }, seed);
        await page.reload();
    };
    const snd = () => page.evaluate(() => ({
        icon: document.getElementById('sound-icon').textContent,
        radio: (document.querySelector('input[name=snd]:checked') || {}).value,
        saved: JSON.parse(localStorage.getItem('hikeybr_store_v3') || '{}'),
    }));
    await fresh();
    assert.equal(await page.locator('#lesson-style-select').count(), 0, 'old font style dropdown is gone');
    assert.equal(await page.locator('#theme-toggle-btn').count(), 0, 'theme cycler is gone');
    assert.equal(await page.locator('#theme-select').count(), 1, 'named theme picker stays');
    assert.equal(await page.locator('#opt-font').count(), 1);
    assert.equal(await page.locator('#opt-text-size').count(), 1);
    // header mute <-> lesson radios agree and remember the mode
    await page.click('input[name=snd][value=key]', { force: true }).catch(() => {});
    await page.evaluate(() => { document.querySelector('details.lesson-settings')&&(document.querySelector('details.lesson-settings').open = true); });
    await page.check('input[name=snd][value=key]');
    let s = await snd(); assert.equal(s.icon, '🔊'); assert.equal(s.radio, 'key');
    await page.click('#sound-toggle-btn');
    s = await snd(); assert.equal(s.icon, '🔇'); assert.equal(s.radio, 'none'); assert.equal(s.saved.opts.soundMode, 'key', 'mode remembered while muted'); assert.equal(s.saved.soundEnabled, false);
    await page.click('#sound-toggle-btn');
    s = await snd(); assert.equal(s.icon, '🔊'); assert.equal(s.radio, 'key');
    await page.check('input[name=snd][value=none]');
    s = await snd(); assert.equal(s.icon, '🔇'); assert.equal(s.saved.soundEnabled, false);
    await page.check('input[name=snd][value=error]');
    s = await snd(); assert.equal(s.icon, '🔊'); assert.equal(s.saved.soundEnabled, true); assert.equal(s.saved.opts.soundMode, 'error');
    // migration: legacy 'No sounds' and volume 0 both become muted
    await fresh({ soundEnabled: true, opts: { soundMode: 'none', volume: 70 } });
    s = await snd(); assert.equal(s.icon, '🔇'); assert.equal(s.radio, 'none');
    await fresh({ soundEnabled: true, opts: { soundMode: 'all', volume: 0 } });
    s = await snd(); assert.equal(s.icon, '🔇');
    assert.equal(await page.inputValue('#opt-volume'), '70');
    // legacy lessonStyle in a save is harmless
    await fresh({ lessonStyle: 'large', opts: {} });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.lessonStyle || ''), '');
    assert.deepEqual(errors, []);
    await browser.close();
    console.log('simplify ok');
})().catch(e => { console.error(e); process.exit(1); });
