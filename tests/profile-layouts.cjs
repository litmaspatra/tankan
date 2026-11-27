// Profile tab: the layout picker switches every chart/table between the
// Remington Kruti Dev and Inscript stores, the choice persists, and Reset
// Progress resets the layout the picker is showing - never the other one.
// Run with: node tests/profile-layouts.cjs
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
        localStorage.setItem('hikeybr_store_v3', JSON.stringify({
            unlockedIndex: 5, highestUnlocked: 5, totalLessons: 7, totalPracticeSeconds: 420,
            bestLessonWpm: 33, bestLessonAcc: 97, accuracyStreak: 2, bestStreak: 4,
            totalTypedCount: 5000, totalErrorsCount: 150, targetSpeedGoal: 25, dailyGoalMinutes: 15,
            lessonHistory: [{ wpm: 30, acc: 96, keys: 6, ts: Date.now(), seconds: 120 }],
            dailyStats: { [new Date().toLocaleDateString('en-CA')]: { seconds: 120, lessons: 1, typed: 500, errors: 15 } }
        }));
        localStorage.setItem('hikeybr_inscript_v1', JSON.stringify({
            u: 3, h: 3, goal: 25, ks: {}, kl: {}, lessons: [], bestWpm: 0, bestAcc: 0,
            bestScore: 0, streak: 0, bestStreak: 0, total: 3, secs: 90, typed: 600, terr: 12, daily: {}
        }));
    });
    await page.reload(); await page.waitForTimeout(400);
    const openProfile = async () => { await page.click('#avatar-corner'); await page.click('button.nav-tab[data-target="profile"]'); await page.waitForTimeout(250); };
    const lessonsTile = async () => {
        const t = await page.locator('#prof-tiles-all').innerText();
        const m = t.match(/Lessons\s*\n?\s*(\d+)/i);
        return m ? m[1] : t;
    };

    // 1. Kruti Dev is the default view: its totals, its picker state.
    await openProfile();
    assert.ok(await page.locator('#prof-layout-kruti').isVisible(), 'layout picker shows in the profile');
    assert.ok(await page.locator('#prof-layout-kruti.sel').count() === 1, 'Kruti Dev selected by default');
    assert.equal(await lessonsTile(), '7', 'Kruti Dev lesson total shows');
    assert.ok(await page.locator('#prof-layout-note').isHidden(), 'no Inscript note in the Kruti Dev view');
    assert.ok((await page.locator('#profile-table-body tr[data-key]').count()) > 0, 'Kruti Dev rows carry key data');

    // 2. Switching to Inscript repaints everything from the Inscript store.
    await page.click('#prof-layout-inscript'); await page.waitForTimeout(200);
    assert.equal(await lessonsTile(), '3', 'Inscript lesson total shows after switching');
    assert.ok(await page.locator('#prof-layout-inscript.sel').count() === 1, 'Inscript selected');
    assert.match(await page.locator('#prof-layout-note').textContent(), /expected, not a bug/, 'Inscript WPM note explains the lower reading');
    assert.ok(await page.locator('#prof-layout-note').isVisible(), 'note visible in the Inscript view');
    assert.equal(await page.locator('#profile-table-body tr[data-key]').count(), 0, 'Inscript rows carry no Remington key-popup data');
    assert.ok((await page.locator('#profile-table-body tr').count()) > 0, 'Inscript keys still listed');

    // 3. The choice persists across reload.
    assert.equal(await page.evaluate(() => localStorage.getItem('tankan_profile_layout')), 'inscript', 'choice persisted');
    await page.reload(); await page.waitForTimeout(400);
    await openProfile();
    assert.equal(await lessonsTile(), '3', 'Inscript view restored after reload');

    // 4. Reset in the Inscript view resets Inscript only, and the modal says so.
    await page.click('#reset-settings-btn'); await page.waitForTimeout(150);
    assert.match(await page.locator('#reset-modal-text').textContent(), /Inscript/, 'reset modal names Inscript');
    await page.click('#modal-confirm-btn'); await page.waitForTimeout(300);
    let ins = JSON.parse(await page.evaluate(() => localStorage.getItem('hikeybr_inscript_v1')));
    assert.equal(ins.total, 0, 'Inscript progress reset');
    let kr = JSON.parse(await page.evaluate(() => localStorage.getItem('hikeybr_store_v3')));
    assert.equal(kr.totalLessons, 7, 'Kruti Dev progress untouched by the Inscript reset');

    // 5. Back in the Kruti Dev view, its stats are intact; its modal names Kruti Dev.
    await openProfile();
    await page.click('#prof-layout-kruti'); await page.waitForTimeout(200);
    assert.equal(await lessonsTile(), '7', 'Kruti Dev stats intact');
    await page.click('#reset-settings-btn'); await page.waitForTimeout(150);
    assert.match(await page.locator('#reset-modal-text').textContent(), /Kruti Dev/, 'reset modal names Kruti Dev');
    await page.click('#modal-cancel-btn');

    // 6. No page errors anywhere.
    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));

    await browser.close();
    console.log('profile-layouts: all tests passed');
})().catch(e => { console.error(e); process.exit(1); });
