// Last-lesson per-key speed display: strip tooltip, mastery status line,
// profile popup. Run: node tests/lastlesson.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');

    // Seed: five keys unlocked (the floor is 4), current key 's' (े, index 4)
    // measured but not ready. lastLessonWpm is this lesson's own pace;
    // modelTtt is the EMA. Starter keys all pass calibration.
    const seed = {
        unlockedIndex: 4,
        highestUnlocked: 4,
        targetSpeedGoal: 40,
        opts: {},
        keyStats: {
            d: { hits: 500, errors: 20, ttt: 250, tttSamples: 500, modelTtt: 250, modelBest: 240, modelSamples: 500, accurateBest: 245, lastAccuracy: 97, recentLessonAccuracy: 97, lastLessonWpm: 48.2, lastLessonSamples: 12, lastLessonAt: 1794560000000 },
            k: { hits: 500, errors: 20, ttt: 260, tttSamples: 500, modelTtt: 260, modelBest: 250, modelSamples: 500, accurateBest: 255, lastAccuracy: 96, recentLessonAccuracy: 96, lastLessonWpm: 46.1, lastLessonSamples: 11, lastLessonAt: 1794560000000 },
            f: { hits: 400, errors: 30, ttt: 270, tttSamples: 400, modelTtt: 270, modelBest: 260, modelSamples: 400, accurateBest: 265, lastAccuracy: 96, recentLessonAccuracy: 96, lastLessonWpm: 44.4, lastLessonSamples: 10, lastLessonAt: 1794560000000 },
            j: { hits: 400, errors: 30, ttt: 255, tttSamples: 400, modelTtt: 255, modelBest: 245, modelSamples: 400, accurateBest: 250, lastAccuracy: 97, recentLessonAccuracy: 97, lastLessonWpm: 47.0, lastLessonSamples: 13, lastLessonAt: 1794560000000 },
            s: { hits: 300, errors: 40, ttt: 340, tttSamples: 300, modelTtt: 340, modelBest: 330, modelSamples: 300, accurateBest: 323.6, lastAccuracy: 94.5, recentLessonAccuracy: 94.5, lastLessonWpm: 35.6, lastLessonSamples: 14, lastLessonAt: 1794560000000 },
        },
        keyLearning: {},
    };
    await page.goto(url);
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem('hikeybr_store_v3', JSON.stringify(s)); }, seed);
    await page.reload();
    await page.waitForTimeout(400);

    // Strip tooltip: smoothed + last lesson + banked best are distinct lines.
    const titles = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#alphabet-container .ak-badge')).map(b => b.title));
    const cur = titles.find(t => t.includes('E matra'));
    assert.ok(cur, 'current key badge exists');
    assert.ok(cur.includes('Last: 35.6 WPM'),'last own-key pace');
    assert.ok(cur.includes('Best recorded: 37.1 WPM'),'recorded own-key best');
    assert.ok(!cur.includes('Smoothed'),'no smoothed display');

    // Mastery status line (phone-visible) names the last-lesson pace.
    const status = await page.evaluate(() => document.getElementById('lead-samples-status').textContent);
    assert.ok(status.includes('े last lesson: 35.6 WPM own pace'), 'status names last-lesson pace, got: ' + status);
    assert.ok(status.includes('banked best 37.1 / 40 WPM'), 'status keeps the banked figure, got: ' + status);

    // Profile key popup: Last lesson, Smoothed and Banked are separate rows.
    await page.click('button.nav-tab[data-target="profile"]');
    await page.waitForTimeout(400);
    const row = page.locator('#profile-table-body tr[data-key="s"]');
    await row.hover();
    await page.waitForTimeout(300);
    const popText = await page.evaluate(() => (document.getElementById('key-popup') || {}).textContent || '');
    assert.ok(popText.includes('Last')&&popText.includes('35.6'),'last own-key pace');
    assert.ok(popText.includes('Best')&&popText.includes('37.1'),'best recorded pace');
    assert.ok(popText.includes('Average')&&popText.includes('35.3'),'average is labelled plainly');
    assert.ok(!popText.includes('Smoothed')&&!popText.includes('Banked'),'plain average, last and recorded best');

    // Old saves without lastLessonWpm render without the new lines.
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('hikeybr_store_v3'));
        delete s.keyStats.s.lastLessonWpm;
        localStorage.setItem('hikeybr_store_v3', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForTimeout(400);
    const titles2 = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#alphabet-container .ak-badge')).map(b => b.title));
    const cur2 = titles2.find(t => t.includes('E matra'));
    assert.ok(!cur2.includes('Last:'), 'no last-lesson line before any measured lesson, got: ' + cur2);
    assert.ok(cur2.includes('Best recorded:'), 'banked line still shown');

    assert.deepEqual(errors, []);
    await browser.close();
    console.log('lastlesson ok');
})().catch(e => { console.error(e); process.exit(1); });
