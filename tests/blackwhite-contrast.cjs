// Black & White theme contrast: accent/error/key-active are all white in this
// theme, so controls that pair them with white text must use dark text.
// Checks rendered computed colors, not source strings. Run: node tests/blackwhite-contrast.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

function lum(rgb) {
    const m = rgb.match(/rgba?\(([^)]+)\)/);
    const [r, g, b] = m[1].split(',').slice(0, 3).map(Number).map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(fg, bg) {
    const l1 = lum(fg), l2 = lum(bg);
    const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');

    const seed = {
        unlockedIndex: 4,
        highestUnlocked: 4,
        targetSpeedGoal: 40,
        theme: 'blackwhite',
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
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'blackwhite');

    const styles = sel => page.evaluate(s => {
        const el = document.querySelector(s);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { color: cs.color, background: cs.backgroundColor, text: el.textContent.trim() };
    }, sel);

    // Brand icon glyph must read on its chip.
    let st = await styles('.brand-icon');
    assert.ok(st && ratio(st.color, st.background) >= 4.5, `brand icon readable (ratio ${st && ratio(st.color, st.background).toFixed(2)})`);

    // Enter review mode through the strip: click an earlier key, then Practice.
    await page.click('#alphabet-container .ak-badge[data-key="d"]');
    await page.waitForTimeout(250);
    await page.click('#key-popup .kp-practice');
    await page.waitForTimeout(400);
    assert.ok(await page.evaluate(() => !document.getElementById('review-banner').hidden), 'review banner visible');

    // The reported bug: Resume auto button text on its own background.
    st = await styles('#review-resume-btn');
    assert.ok(st && ratio(st.color, st.background) >= 4.5, `resume button readable (ratio ${st && ratio(st.color, st.background).toFixed(2)})`);

    // Danger button (Reset Progress) on the profile tab.
    await page.click('button.nav-tab[data-target="profile"]');
    await page.waitForTimeout(400);
    st = await styles('#reset-settings-btn');
    assert.ok(st && ratio(st.color, st.background) >= 4.5, `danger button readable (ratio ${st && ratio(st.color, st.background).toFixed(2)})`);

    // Shift-needed key: force the state class and check every label layer.
    await page.click('button.nav-tab[data-target="practice"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        const key = document.querySelector('#keyboard-frame .k-key:not(.label-key)') || document.querySelector('#keyboard-frame .k-key');
        key.classList.add('shift-needed');
    });
    await page.waitForTimeout(400); // key background animates over 80ms; read the settled state
    for (const sel of ['#keyboard-frame .k-key.shift-needed .hi-main', '#keyboard-frame .k-key.shift-needed .hi-shift', '#keyboard-frame .k-key.shift-needed .en-sub']) {
        st = await page.evaluate(s => {
            const key = document.querySelector('#keyboard-frame .k-key.shift-needed');
            const lab = key && key.querySelector(s.split(' ').pop());
            if (!lab) return null;
            const cs = getComputedStyle(lab);
            return { color: cs.color, background: getComputedStyle(key).backgroundColor };
        }, sel);
        if (st) assert.ok(ratio(st.color, st.background) >= 4.5, `${sel} readable (ratio ${ratio(st.color, st.background).toFixed(2)})`);
    }

    // Other themes must be untouched: the button keeps its accent fill and
    // white label there (their accents are dark enough by design).
    for (const theme of ['dark', 'navy', 'forest', 'amber', 'light', 'sunshine', 'epaper']) {
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        const b = await styles('#review-resume-btn');
        assert.equal(b && b.color, 'rgb(255, 255, 255)', `resume button label unchanged in ${theme}`);
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'blackwhite'));

    assert.deepEqual(errors, []);
    await browser.close();
    console.log('blackwhite-contrast ok');
})().catch(e => { console.error(e); process.exit(1); });
