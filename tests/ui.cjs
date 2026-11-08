// UI regression tests with real key events. Run: node tests/ui.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');
    const fresh = async (seed) => {
        await page.goto(url);
        await page.evaluate(seed => {
            localStorage.clear();
            if (seed) localStorage.setItem('hikeybr_store_v3', JSON.stringify(seed));
        }, seed);
        await page.reload();
    };

    // 1. Real key events advance the practice cursor.
    await fresh();
    await page.click('#typing-canvas');
    const first = await page.evaluate(() => HiKeybr.targetKrutiText[0]);
    await page.keyboard.press(first === ' ' ? 'Space' : first);
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 1, 'real key advances cursor');
    assert.equal(await page.evaluate(() => HiKeybr.sessionCorrect), 1, 'real key scores once');

    // 2. Custom text field keeps focus while typing (was stolen by the global keydown handler).
    await page.click('#lesson-settings > summary');
    await page.click('.ls-tab[data-lstab="custom"]');
    await page.click('#custom-text');
    await page.keyboard.type('test');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'custom-text', 'textarea keeps focus');
    assert.equal(await page.locator('#custom-text').inputValue(), 'test', 'typed text lands in the field');

    // 3. Alt-code glyph commits as ONE input unit and matches the target sequence.
    await page.evaluate(() => {
        const t = document.getElementById('custom-text');
        t.value = 'क्त क्त क्त';
        t.dispatchEvent(new Event('change'));
    });
    assert.ok((await page.evaluate(() => HiKeybr.targetKrutiText)).startsWith('Dr'), 'क्त encodes to Remington Dr');
    await page.click('#typing-canvas');
    await page.keyboard.down('Alt');
    for (const k of ['Numpad0', 'Numpad2', 'Numpad2', 'Numpad8']) await page.keyboard.press(k);
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 2, 'Alt+0228 types both bytes of क्त');
    assert.equal(await page.evaluate(() => HiKeybr.sessionCorrect), 1, 'Alt-code glyph counts as one input unit');
    // A second Alt entry after a real space gets a valid whole-entry timing.
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
    // Top-row digits work too (laptops without a numpad).
    await page.keyboard.down('Alt');
    for (const k of ['Digit0', 'Digit2', 'Digit2', 'Digit8']) await page.keyboard.press(k);
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 5, 'second क्त via top-row digits + space committed');
    assert.equal(await page.evaluate(() => HiKeybr.sessionCorrect), 3, 'each Alt glyph still one unit');

    // 3b. Verified Kruti Dev 010 / DevLys 010 byte table: Alt+0221 must give फ्र (was wrongly 0217).
    await page.evaluate(() => {
        const t = document.getElementById('custom-text');
        t.value = 'फ्र ह्र ह्र';
        t.dispatchEvent(new Event('change'));
    });
    assert.ok((await page.evaluate(() => HiKeybr.targetKrutiText)).startsWith(String.fromCharCode(221)), 'फ्र encodes to byte 221');
    await page.click('#typing-canvas');
    await page.keyboard.down('Alt');
    for (const k of ['Numpad0', 'Numpad2', 'Numpad2', 'Numpad1']) await page.keyboard.press(k);
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 1, 'Alt+0221 commits फ्र');
    await page.keyboard.press('Space');
    assert.ok((await page.evaluate(() => HiKeybr.targetKrutiText))[2] === String.fromCharCode(235), 'ह्र encodes to byte 235');
    await page.keyboard.down('Alt');
    for (const k of ['Numpad0', 'Numpad2', 'Numpad3', 'Numpad5']) await page.keyboard.press(k);
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 3, 'Alt+0235 commits ह्र');

    // 3d. Windows-style Alt entry: the OS composes Alt+numpad itself, swallows
    //     the Alt keyup, and pushes the composed symbol into the field. The
    //     buffered code must still commit exactly once, and the OS symbol must
    //     not register as a keystroke.
    await page.evaluate(() => {
        const t = document.getElementById('custom-text');
        t.value = 'क्त क्त क्त क्त';
        t.dispatchEvent(new Event('change'));
    });
    await page.click('#typing-canvas');
    // Variant 1: Alt keyup never arrives; a fresh Alt press flushes the buffer.
    await page.evaluate(() => {
        const hi = document.getElementById('hidden-input');
        const kd = (key, code, altKey) => hi.dispatchEvent(new KeyboardEvent('keydown', { key, code, altKey, bubbles: true, cancelable: true }));
        kd('Alt', 'AltLeft', false);
        for (const d of ['0', '2', '2', '8']) kd(d, 'Numpad' + d, true);
        kd('Alt', 'AltLeft', false); // user presses Alt again after the lost keyup
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true }));
    });
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 2, 'lost Alt keyup: fresh Alt press commits क्त');
    assert.equal(await page.evaluate(() => HiKeybr.sessionErrors), 0, 'no errors from lost-keyup entry');

    // Variant 2: the OS-composed symbol arrives (as a keydown) instead of the Alt keyup.
    await page.keyboard.press('Space');
    await page.keyboard.down('Alt');
    for (const k of ['Numpad0', 'Numpad2', 'Numpad2', 'Numpad8']) await page.keyboard.press(k);
    await page.evaluate(() => {
        document.getElementById('hidden-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Ø', bubbles: true, cancelable: true }));
    });
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 5, 'OS symbol keydown commits क्त without an Alt keyup');
    await page.keyboard.up('Alt'); // a late keyup must not double-commit
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 5, 'late Alt keyup does not double-commit');
    assert.equal(await page.evaluate(() => HiKeybr.sessionErrors), 0, 'OS symbol is not counted as an error');

    // Variant 3: the Alt keyup fires first, then the OS symbol arrives late.
    await page.keyboard.press('Space');
    await page.keyboard.down('Alt');
    for (const k of ['Numpad0', 'Numpad2', 'Numpad2', 'Numpad8']) await page.keyboard.press(k);
    await page.keyboard.up('Alt');
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 8, 'Alt keyup commits क्त');
    await page.evaluate(() => {
        const hi = document.getElementById('hidden-input');
        hi.dispatchEvent(new KeyboardEvent('keydown', { key: 'Ø', bubbles: true, cancelable: true }));
        hi.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 8, 'late OS symbol is swallowed after a keyup commit');
    assert.equal(await page.evaluate(() => HiKeybr.sessionErrors), 0, 'late OS symbol adds no error');
    assert.equal(await page.evaluate(() => HiKeybr.sessionCorrect), 5, '3 Alt glyphs + 2 spaces, each glyph one input unit');

    // 3c. Only legacy Remington fonts are offered (Unicode fonts dropped: their
    //     matras/half letters could not highlight per keystroke). Per-byte
    //     highlighting reassembles the lesson byte stream in any listed font.
    const fontOptions = await page.$$eval('#opt-font option', os => os.map(o => o.value));
    assert.ok(fontOptions.includes('devlys010'), 'DevLys 010 is offered');
    assert.ok(fontOptions.includes('devlys040'), 'DevLys 040 is offered');
    assert.ok(fontOptions.includes('devlys040bold'), 'DevLys 040 Bold is offered');
    assert.ok(fontOptions.includes('krutidev021') && fontOptions.includes('krutidev070'), 'extra KrutiDev styles are offered');
    for (const removed of ['noto', 'serif', 'mangal']) assert.ok(!fontOptions.includes(removed), removed + ' removed from the picker');
    await page.evaluate(() => {
        const s = document.getElementById('opt-font');
        s.value = 'devlys040';
        s.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(150);
    const parts = await page.evaluate(() => ({
        correct: document.getElementById('text-correct').textContent,
        current: document.getElementById('text-current').textContent,
        remaining: document.getElementById('text-remaining').textContent
    }));
    assert.equal(parts.correct + parts.current + parts.remaining, await page.evaluate(() => HiKeybr.unicodeToKrutiDev(HiKeybr.currentLessonText)), 'legacy-font spans reassemble the lesson byte stream');

    // 4. Speed control: the lesson-settings slider is the single source of truth.
    assert.equal(await page.$('#settings-speed-goal'), null, 'duplicated Settings speed dropdown removed');
    await page.evaluate(() => {
        const s = document.getElementById('speed-goal-select');
        s.value = '55';
        s.dispatchEvent(new Event('change'));
    });
    assert.equal(await page.locator('#speed-goal-select').inputValue(), '55', 'slider accepts 55');

    // 5. Reload persists settings.
    await page.reload();
    assert.equal(await page.locator('#speed-goal-select').inputValue(), '55', 'speed goal survives reload');

    // 6. Strict unlock: an unmeasured earlier key blocks unlocking even when the
    //    current key is ready; measuring it at goal speed unblocks.
    const readyTarget = { modelSamples: 10, modelTtt: 100, ttt: 100, tttSamples: 10, accurateBest: 100, lastAccuracy: 100, recentLessonAccuracy: 100 };
    const qualified = { modelSamples: 6, modelTtt: 100, ttt: 100, tttSamples: 6, lastAccuracy: 100 };
    const seedStrict = (dStats) => ({
        unlockedIndex: 4, highestUnlocked: 4,
        opts: { strict: true },
        keyStats: { s: readyTarget, k: qualified, f: qualified, j: qualified, ...(dStats ? { d: dStats } : {}) }
    });
    await fresh(seedStrict(null));
    let status = await page.locator('#lead-samples-status').textContent();
    assert.ok(status.includes('earlier keys must also reach the target speed'), 'strict blocks on unmeasured earlier key');
    await fresh(seedStrict(qualified));
    status = await page.locator('#lead-samples-status').textContent();
    assert.ok(status.includes('goal reached'), 'strict passes once every earlier key is measured at goal speed');

    // 7. Save failure surfaces a warning with an export option.
    await fresh();
    await page.evaluate(() => {
        const real = Storage.prototype.setItem;
        window.__restoreSetItem = () => { Storage.prototype.setItem = real; };
        Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
        document.getElementById('opt-strict').dispatchEvent(new Event('change'));
    });
    await page.waitForSelector('#storage-warning', { timeout: 3000 });
    const warnText = await page.locator('#storage-warning').textContent();
    assert.ok(warnText.includes('could not be saved'), 'save failure warns the user');
    assert.ok(await page.locator('#storage-warning button').count() >= 1, 'warning offers an export');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#storage-warning button');
    const download = await downloadPromise;
    assert.ok(download.suggestedFilename().endsWith('.json'), 'export downloads progress JSON');

    // 8. Remington punctuation converts to authentic KrutiDev bytes (books/custom text).
    const punctConv = await page.evaluate(() => HiKeybr.unicodeToKrutiDev(',?.;-:!'));
    assert.equal(punctConv, ']\\-(&%!', 'comma=]  ?=\\  .=-  ;=(  -=&  :=%  !=!');
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('ए')), ',', "the ',' KEY still types ए");
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('घ')), '?k', "the '?' byte still types घ");
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('।')), 'A', 'danda = Shift+A');

    // 8b. Half-letter conjuncts: consonant + halant converts to the font's true
    //     half-form byte (the क ृ ष ् ण bug), never full letter + halant mark.
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('कृष्णा')), 'd`".kk', 'कृष्णा uses the half-ष byte "');
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('ष')), '"k', 'standing ष keeps half + stem');
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('लक्ष्मी')), 'y{eh', 'लक्ष्मी uses the half-क्ष byte {');
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('क्षमा')), '{kek', 'standing क्ष keeps half + stem');
    assert.equal(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('क्यों')), 'D;ksa', 'क्यों uses half-क D');
    assert.ok(!(await page.evaluate(() => HiKeybr.unicodeToKrutiDev('कृष्णा'))).includes('~'), 'no leftover halant byte in कृष्णा');

    // 9. Custom text with punctuation expects the Remington keys ] and \.
    await fresh();
    await page.click('#lesson-settings > summary');
    await page.click('.ls-tab[data-lstab="custom"]');
    await page.evaluate(() => {
        const t = document.getElementById('custom-text');
        t.value = 'राम, क्या?';
        t.dispatchEvent(new Event('change'));
    });
    assert.equal(await page.evaluate(() => HiKeybr.targetKrutiText), 'jke] D;k\\', 'custom text punctuation uses Remington keys');

    // 10. keybr-style flow: finishing ANY lesson (guided, books or custom)
    //     instantly replaces it with a freshly generated lesson - a separate
    //     lesson, not text appended to the previous one, and no toast,
    //     no Enter, no Continue. The finished lesson folds into the history.
    await fresh();
    await page.click('#lesson-settings > summary');
    await page.click('.ls-tab[data-lstab="custom"]');
    await page.evaluate(() => {
        const t = document.getElementById('custom-text');
        t.value = 'राम सीता';
        t.dispatchEvent(new Event('change'));
    });
    const customTarget = await page.evaluate(() => HiKeybr.targetKrutiText);
    await page.evaluate(() => {
        const seq = HiKeybr.targetKrutiText;
        for (const ch of seq) HiKeybr.handleKeystroke(ch);
    });
    const flow = await page.evaluate(() => ({
        cursor: HiKeybr.cursorIndex,
        target: HiKeybr.targetKrutiText,
        history: HiKeybr.lessonHistory.length,
        last: HiKeybr.lessonHistory.at(-1),
        event: (document.getElementById('practice-event') || {}).textContent || '',
        toastPresent: !!document.getElementById('lesson-result'),
        continuePresent: !!document.getElementById('continue-btn')
    }));
    assert.equal(flow.cursor, 0, 'next lesson started automatically (cursor reset)');
    assert.equal(flow.toastPresent, false, 'no result toast exists');
    assert.equal(flow.continuePresent, false, 'no Continue button exists');
    assert.ok(flow.target.length > 0, 'fresh lesson text is ready');
    assert.equal(flow.history, 1, 'completed lesson folded into history');
    assert.ok(flow.last.wpm > 0 && flow.last.seconds > 0 && flow.last.keys >= 4, 'lesson record carries real timing data');
    assert.ok(!flow.event.includes('WPM'), 'custom/books mode: no post-lesson speed strip (guided-only)');

    // 10b. Guided lessons: the SAME text is never extended - completion
    //      replaces the whole block with a newly generated lesson.
    await fresh();
    const guided = await page.evaluate(() => {
        const first = HiKeybr.currentLessonText;
        const firstLen = HiKeybr.targetKrutiText.length;
        const seq = HiKeybr.targetKrutiText;
        for (const ch of seq) HiKeybr.handleKeystroke(ch);
        return {
            first, firstLen,
            afterText: HiKeybr.currentLessonText,
            afterLen: HiKeybr.targetKrutiText.length,
            cursor: HiKeybr.cursorIndex,
            history: HiKeybr.lessonHistory.length,
            event: (document.getElementById('practice-event') || {}).textContent || ''
        };
    });
    assert.ok(guided.event.includes('WPM'), 'guided mode: event line shows the lesson speed');
    assert.equal(guided.cursor, 0, 'guided lesson cursor resets to the start');
    assert.equal(guided.history, 1, 'guided lesson recorded once');
    assert.ok(guided.afterLen < guided.firstLen + 50, 'text was replaced, not extended (was ' + guided.firstLen + ', now ' + guided.afterLen + ')');
    assert.notEqual(guided.afterText, guided.first, 'fresh lesson text generated');

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('PASS: real key events, custom text focus, Alt-code unit scoring, speed control sync, reload persistence, strict unlock, save-failure warning.');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
