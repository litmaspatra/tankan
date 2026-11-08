// Profile graph tests: chart math against known answers + seeded SVG output.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');

    // 1. Chart math, pure functions with known answers.
    await page.goto(url);
    const math = await page.evaluate(() => ({
        alpha: HiKeybr.ChartMath.alpha(0.5),
        smooth: HiKeybr.ChartMath.smooth([10, 20, 30], 0.5),
        reg: HiKeybr.ChartMath.linRegress([2, 4, 6]),
        regFlat: HiKeybr.ChartMath.linRegress([7, 7, 7]),
        bw: HiKeybr.ChartMath.bucketWidth(40),
        bwSmall: HiKeybr.ChartMath.bucketWidth(15),
        hist: HiKeybr.ChartMath.histogram([1, 1.5, 2.5, 2.9, 9], 2),
        nice: [HiKeybr.ChartMath.niceCeil(0), HiKeybr.ChartMath.niceCeil(3), HiKeybr.ChartMath.niceCeil(23), HiKeybr.ChartMath.niceCeil(260)]
    }));
    assert.ok(Math.abs(math.alpha - Math.pow(10, -1.5)) < 1e-12, 'keybr alpha');
    assert.deepEqual(math.smooth, [10, 15, 22.5], 'exponential smoothing');
    assert.deepEqual(math.reg, { a: 2, b: 2 }, 'trend of 2,4,6 is +2/lesson from 2');
    assert.deepEqual(math.regFlat, { a: 7, b: 0 }, 'flat series has zero trend');
    assert.equal(math.bw, 2, 'bucket width for range 40');
    assert.equal(math.bwSmall, 1, 'bucket width for range 15');
    assert.deepEqual(math.hist, [{ x0: 0, n: 2 }, { x0: 2, n: 2 }, { x0: 8, n: 1 }], 'histogram buckets');
    assert.deepEqual(math.nice, [1, 5, 25, 500], 'nice axis ceilings');

    // 2. Seeded profile: every graph reflects the stored numbers exactly.
    const day = new Date().toLocaleDateString('en-CA');
    const lessons = [];
    for (let i = 0; i < 12; i++) {
        lessons.push({ wpm: 20 + i, acc: 90 + i, chars: 100 + i * 2, errors: 11 - i, seconds: 24, keys: 4 + (i > 5 ? 1 : 0), score: 1000 + i * 10, wordsPerMinute: 18 + i, ts: Date.now() - (12 - i) * 60000, model: 3 });
    }
    const keyStats = {};
    // d=faster than target, f=within 80%, j=slow, k=very slow
    keyStats.d = { hits: 200, errors: 4, ttt: 400, tttSamples: 60, modelTtt: 400, modelSamples: 60 };   // 30 wpm
    keyStats.f = { hits: 150, errors: 10, ttt: 480, tttSamples: 50, modelTtt: 480, modelSamples: 50 };  // 25 wpm
    keyStats.j = { hits: 90, errors: 30, ttt: 700, tttSamples: 40, modelTtt: 700, modelSamples: 40 };   // ~17 wpm
    keyStats.k = { hits: 40, errors: 40, ttt: 1200, tttSamples: 30, modelTtt: 1200, modelSamples: 30 }; // 10 wpm
    const seed = {
        unlockedIndex: 3, highestUnlocked: 3, targetSpeedGoal: 25,
        keyStats, lessonHistory: lessons,
        keyLearning: { d: { speeds: [18, 22, 26, 30], best: 30 }, f: { speeds: [20, 24], best: 25 } },
        dailyStats: { [day]: { seconds: 288, lessons: 12, typed: 1266, errors: 55 } },
        totalLessons: 12, totalPracticeSeconds: 288,
        bestLessonWpm: 31, bestLessonAcc: 101 - 1, bestStreak: 3, bestScore: 1110,
        accuracyStreak: 3, dailyGoalMinutes: 30
    };
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem('hikeybr_store_v3', JSON.stringify(s)); }, seed);
    await page.reload();
    await page.click('.nav-tab[data-target="profile"]');

    const prof = await page.evaluate(() => ({
        allTiles: document.getElementById('prof-tiles-all').textContent,
        todayTiles: document.getElementById('prof-tiles-today').textContent,
        streak: document.getElementById('prof-streak-line').textContent,
        speedCircles: document.querySelectorAll('#chart-speed svg circle').length,
        distRects: document.querySelectorAll('#chart-speed-dist svg rect').length,
        keySpeedBars: [...document.querySelectorAll('#chart-key-speed svg rect:not(.target-label-bg)')].map(r => r.getAttribute('fill')),
        keyFreqRects: document.querySelectorAll('#chart-key-freq svg rect').length,
        progressRows: document.querySelectorAll('#chart-progress .pg-row').length,
        progressCells: document.querySelectorAll('#chart-progress .pg-cells i').length,
        calCells: [...document.querySelectorAll('#chart-calendar .cal-cell')].filter(c => c.title.includes('lesson')).length,
        oldInsightPanel: !!document.querySelector('#panel-profile .insight-panel'),
        practiceStrip: !!document.querySelector('#panel-practice .alphabet-strip'),
        profileKeyRow: !!document.querySelector('#panel-profile .alphabet-strip')
    }));
    assert.ok(prof.allTiles.includes('12'), 'all-time lessons tile = 12: ' + prof.allTiles);
    assert.ok(prof.allTiles.includes('31.0 wpm'), 'all-time top speed = 31 wpm');
    assert.ok(prof.allTiles.includes('25.5 wpm'), 'average speed = mean of 20..31 = 25.5: ' + prof.allTiles);
    assert.ok(prof.todayTiles.includes('00:04:48'), 'today time = 288s: ' + prof.todayTiles);
    assert.ok(prof.streak.includes('current 3') && prof.streak.includes('longest 3'), 'streak line');
    assert.equal(prof.speedCircles, 36, 'speed chart: 12 lessons x 3 series of dots');
    assert.equal(prof.distRects, 12, 'distribution: 12 lessons in 12 buckets of width 2 over range 11');
    assert.deepEqual(prof.keySpeedBars, ['var(--correct)', 'var(--error)', 'var(--correct)', 'var(--error)'], 'key speed colors vs target 25 (progression order d,k,f j)');
    assert.equal(prof.keyFreqRects, 8, 'key frequency: 4 keys x hits+misses');
    assert.equal(prof.progressRows, 2, 'progress overview: keys with >=2 samples');
    assert.equal(prof.progressCells, 6, 'progress cells = 4 + 2 samples');
    assert.equal(prof.calCells, 1, 'calendar: today shaded');
    assert.equal(prof.oldInsightPanel, false, 'old metric panel removed from profile');
    assert.equal(prof.practiceStrip, true, 'key progression row moved to practice');
    assert.equal(prof.profileKeyRow, false, 'no key progression row left in profile');

    // 3. Smoothness slider re-renders with heavier smoothing (keybr alpha law).
    await page.evaluate(() => { const s = document.getElementById('smoothness'); s.value = 90; s.dispatchEvent(new Event('input')); });
    const heavy = await page.evaluate(() => document.getElementById('chart-speed-legend').textContent);
    assert.ok(heavy.includes('α=0.0020'), 'slider changes alpha per keybr formula: ' + heavy);

    // 4. Migration: an old-format save (no dailyStats/totals) rebuilds aggregates.
    const oldSeed = { unlockedIndex: 3, highestUnlocked: 3, lessonHistory: lessons.slice(0, 5), accuracyStreak: 2 };
    await page.evaluate(s => { localStorage.clear(); localStorage.setItem('hikeybr_store_v3', JSON.stringify(s)); }, oldSeed);
    await page.reload();
    await page.click('.nav-tab[data-target="profile"]');
    const mig = await page.evaluate(() => ({
        tiles: document.getElementById('prof-tiles-all').textContent,
        daily: HiKeybr.dailyStats,
        cal: [...document.querySelectorAll('#chart-calendar .cal-cell')].filter(c => c.title.includes('lesson')).length
    }));
    assert.ok(mig.tiles.includes('24.0 wpm'), 'migrated top speed 24: ' + mig.tiles);
    const d = mig.daily[day];
    assert.ok(d && d.lessons === 5 && Math.abs(d.seconds - 120) < 1, 'dailyStats rebuilt from old history: ' + JSON.stringify(d));
    assert.equal(mig.cal, 1, 'calendar shows the migrated day');

    // 5. Empty profile gets honest empty states, not fake charts.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('.nav-tab[data-target="profile"]');
    const empty = await page.evaluate(() => ({
        speed: document.getElementById('chart-speed').textContent,
        cal: document.getElementById('chart-calendar').textContent
    }));
    assert.ok(empty.speed.includes('Not enough data'), 'speed chart empty state');
    assert.ok(empty.cal.includes('No practice days'), 'calendar empty state');

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('PASS: chart math, seeded profile accuracy, migration, empty states.');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
