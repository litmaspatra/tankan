// Inscript uses the same Lesson settings panel as Kruti Dev: text sources,
// words per lesson, target speed. Run: node -r ./tests/returning-visitor.cjs tests/inscript-lesson-settings.cjs
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
        const P = null;
        localStorage.setItem('hikeybr_inscript_v1', JSON.stringify({ ord: 3, u: 60, h: 60, goal: 25, ks: {}, kl: {}, lessons: [], total: 0, daily: {} }));
    });
    await page.reload(); await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => TankanInscript.active), true);
    // 1. panel is visible and opens
    assert.ok(await page.locator('#lesson-settings').isVisible(), 'lesson settings visible in Inscript');
    await page.click('#lesson-settings > summary'); await page.waitForTimeout(200);
    for (const id of ['jump-select', 'opt-no-alt', 'opt-repeat']) assert.equal(await page.locator('#' + id).isVisible(), false, id + ' hidden (Kruti only)');
    assert.ok(await page.locator('#words-select').isVisible(), 'words per lesson shown');
    await page.screenshot({ path: 'test-results/inscript-settings.png' });
    // 2. words per lesson changes guided lesson length
    await page.selectOption('#words-select', '15'); await page.waitForTimeout(200);
    const n15 = await page.evaluate(() => TankanInscript._state().text.split(' ').length);
    await page.selectOption('#words-select', '50'); await page.waitForTimeout(200);
    const n50 = await page.evaluate(() => TankanInscript._state().text.split(' ').length);
    assert.ok(n50 > n15 * 2, `50 words (${n50}) longer than 15 (${n15})`);
    // 3. custom text
    await page.click('.ls-tab[data-lstab="custom"]');
    await page.fill('#custom-text', 'राम घर जाता है। सीता पढ़ती है');
    await page.dispatchEvent('#custom-text', 'input'); await page.dispatchEvent('#custom-text', 'change'); await page.waitForTimeout(400);
    const ct = await page.evaluate(() => TankanInscript._state().text);
    assert.ok(ct.includes('राम') && ct.includes('सीता'), 'custom text typed in Inscript, got ' + ct);
    // 4. books: a book paragraph, only typable characters
    await page.click('.ls-tab[data-lstab="books"]'); await page.waitForTimeout(2500);
    const bt = await page.evaluate(() => TankanInscript._state().text);
    assert.ok(bt.length > 30 && bt !== ct, 'book text loaded, got ' + bt.slice(0, 40));
    const bad = await page.evaluate(() => { const R = TankanInscript.REV; return Array.from(TankanInscript._state().text).filter(c => c !== ' ' && !(c in R)).join(''); });
    assert.equal(bad, '', 'only typable characters');
    // 5. essays and official words
    await page.click('.ls-tab[data-lstab="essays"]'); await page.waitForTimeout(2500);
    const et = await page.evaluate(() => TankanInscript._state().text);
    assert.ok(et.length > 30 && et !== bt, 'essay text loaded');
    await page.click('.ls-tab[data-lstab="official"]'); await page.waitForTimeout(500);
    const ot = await page.evaluate(() => TankanInscript._state().text);
    assert.ok(ot.length > 10, 'official words lesson');
    // 6. back to guided
    await page.click('.ls-tab[data-lstab="words"]'); await page.waitForTimeout(300);
    assert.ok((await page.evaluate(() => TankanInscript._state().text)).length > 10);
    // 7. speed goal slider drives Inscript's goal, not Kruti's
    await page.evaluate(() => { const s = document.getElementById('speed-goal-select'); s.value = '40'; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => TankanInscript.progress.goal), 40);
    assert.equal(await page.locator('#ins-goal-select').inputValue(), '40');
    const kr = await page.evaluate(() => { const r = localStorage.getItem('hikeybr_store_v3'); return r ? JSON.parse(r).targetSpeedGoal : null; });
    assert.ok(kr === null || kr === 25, 'Kruti goal untouched, got ' + kr);
    await page.reload(); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => TankanInscript.progress.goal), 40, 'goal persists');
    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    await browser.close(); console.log('inscript lesson settings ok');
})().catch(e => { console.error(e); process.exit(1); });
