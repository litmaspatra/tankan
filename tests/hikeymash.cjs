// HiKeymash regression tests: Remington punctuation, single typing view, inline results.
// Run: node tests/hikeymash.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../hikeymash.html'));

    // 1. Punctuation in text converts to the authentic Remington keys.
    const conv = await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev(',?.;-:!'));
    assert.equal(conv, ']\\-(&%!', 'comma=]  ?=\\  .=-  ;=(  -=&  :=%  !=!');
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('ए')), ',', "the ',' KEY still types ए");
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('घ')), '?k', "the '?' byte still types घ");
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('।')), 'A', 'danda = Shift+A');
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('॥')), 'AA', 'double danda = two dandas');
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('राम, क्या?')), 'jke] D;k\\', 'letters untouched, punctuation remapped');

    // 2. Exactly one visual of the paragraph (duplicate preview removed).
    assert.equal(await page.evaluate(() => document.getElementById('literature-preview')), null, 'no duplicate paragraph view');

    // 3. A snippet with punctuation is typed with real key events, including ] and \.
    await page.evaluate(() => window.__HIKEYMASH__.loadSnippet({ id: 't1', title: 'टेस्ट', author: 'परीक्षक', category: 'prose', genre: 'परीक्षण', text: 'राम, सीता?' }));
    const target = await page.evaluate(() => window.__HIKEYMASH__.getState().targetKruti);
    assert.ok(target.includes(']'), 'comma in target as ] byte: ' + target);
    assert.ok(target.includes('\\'), 'question mark in target as \\ byte: ' + target);
    await page.click('#typing-canvas');
    for (const ch of target) {
        if (ch === ' ') await page.keyboard.press('Space');
        else if (ch === '\\') await page.keyboard.press('Backslash');
        else await page.keyboard.press(ch);
    }
    const st = await page.evaluate(() => window.__HIKEYMASH__.getState());
    assert.equal(st.isCompleted, true, 'snippet completes');
    assert.equal(st.mistakes, 0, 'no mistakes with the correct Remington keys');

    // 4. Results appear keymash-style: inline panel replacing the typing area, not a fixed modal window.
    assert.ok(await page.evaluate(() => document.getElementById('results-modal').classList.contains('open')), 'results show');
    assert.ok(await page.evaluate(() => document.body.classList.contains('showing-results')));
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById('results-modal')).position), 'fixed', 'results are inline, not an overlay window');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('typing-canvas')).display), 'none', 'typing area hidden while results show');
    assert.ok(await page.locator('#modal-next-btn').isVisible(), 'next action visible');
    assert.ok(await page.locator('#modal-retry-btn').isVisible(), 'retry action visible');

    // 4b. Results reveal the title that was hidden while typing.
    assert.ok((await page.locator('#res-quote-title').textContent()).includes('टेस्ट'), 'results reveal the hidden title');

    // 5. The next action returns to the typing view.
    await page.click('#modal-next-btn');
    assert.ok(await page.evaluate(() => !document.body.classList.contains('showing-results')), 'results cleared');
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.getElementById('typing-canvas')).display), 'none', 'typing area back after next');

    // 5b. Stored-XSS regression: a crafted history record (reachable through a
    //    malicious backup import, which restores hikeymash_ keys verbatim) must
    //    render as inert text in the history table, never as markup.
    await page.evaluate(() => localStorage.setItem('hikeymash_history_v1', JSON.stringify([
        { date: '<img src=x onerror=window.__xss=1>', title: '<svg onload=window.__xss=1>परीक्षण</svg><script>window.__xss=1</script>', wpm: '"><img src=x onerror=window.__xss=1>', acc: '85', time: '10' }
    ])));
    await page.evaluate(() => window.__HIKEYMASH__.loadSnippet({ id: 't3', title: 'टेस्ट', author: 'परीक्षक', category: 'prose', genre: 'परीक्षण', text: 'राम' }));
    const t3 = await page.evaluate(() => window.__HIKEYMASH__.getState().targetKruti);
    await page.click('#typing-canvas');
    for (const ch of t3) { if (ch === ' ') await page.keyboard.press('Space'); else await page.keyboard.press(ch); }
    assert.ok(await page.evaluate(() => document.getElementById('results-modal').classList.contains('open')), 'results show with crafted history present');
    assert.equal(await page.evaluate(() => window.__xss || 0), 0, 'no injected handler executed');
    assert.equal(await page.$eval('#history-table-body', el => el.querySelectorAll('img,svg,script').length), 0, 'no markup injected into the history table');
    assert.ok((await page.locator('#history-table-body').textContent()).includes('<svg onload'), 'payload survives as visible text');
    await page.click('#modal-next-btn');

    // 6. Half-letter conjuncts convert to true KrutiDev half-form bytes.
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('कृष्णा')), 'd`".kk', 'कृष्णा uses the half-ष byte, not full ष + halant');
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('लक्ष्मी')), 'y{eh', 'लक्ष्मी uses the half-क्ष byte');
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('ष')), '"k', 'standing ष keeps its stem');
    assert.ok(!(await page.evaluate(() => window.__HIKEYMASH__.unicodeToKrutiDev('कृष्णा'))).includes('~'), 'no leftover halant byte');

    // 7. Guess-the-title: the banner never reveals title or author while typing.
    await page.evaluate(() => window.__HIKEYMASH__.loadSnippet({ id: 't2', title: 'गुप्त-रचना', author: 'गुप्त-लेखक', category: 'prose', genre: 'परीक्षण', text: 'राम सीता' }));
    const bannerText = await page.evaluate(() => document.querySelector('.snippet-banner').textContent);
    assert.ok(!bannerText.includes('गुप्त-रचना'), 'title hidden while typing');
    assert.ok(!bannerText.includes('गुप्त-लेखक'), 'author hidden while typing');

    // 8. keymash-style: the category picker lives in the lobby only - never
    //    while typing - and no WPM/accuracy HUD or progress bar shows mid-race.
    assert.equal(await page.$$eval('.pill-btn[data-cat]', els => els.length), 0, 'no in-race category selector');
    assert.equal(await page.$('#lobby-cat-pills'), null, 'no content selector - race content is always mixed');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('lobby-screen')).display), 'none', 'lobby hidden while typing');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.hud-strip')).display), 'none', 'no speed/accuracy HUD while typing');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.progress-bar-container')).display), 'none', 'no progress bar while typing');

    // 9. No immediate repeats: consecutive picks never serve the same paragraph twice.
    const picks = await page.evaluate(() => {
        const out = [];
        let last = null;
        for (let i = 0; i < 30; i++) {
            const sn = window.__HIKEYMASH__.pickSnippet('all', last);
            out.push(sn.id);
            last = sn.id;
        }
        return out;
    });
    for (let i = 1; i < picks.length; i++) assert.notEqual(picks[i], picks[i - 1], 'no immediate repeat');
    assert.ok(new Set(picks).size > 5, 'picks vary across the library');

    // 10. Refresh button loads a different paragraph.
    const beforeRefresh = await page.evaluate(() => window.__HIKEYMASH__.getState().currentSnippet.id);
    await page.click('#match-refresh-btn');
    assert.notEqual(await page.evaluate(() => window.__HIKEYMASH__.getState().currentSnippet.id), beforeRefresh, 'refresh loads a new paragraph');

    // 11. Ping is measured, not a hardcoded 42ms (offline file:// shows --).
    assert.notEqual(await page.locator('#match-ping-val').textContent(), '42ms', 'ping is real, not decoration');

    // 12. Lobby opens on landing; START MATCH hides it and runs the countdown.
    await page.reload();
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('lobby-screen')).display), 'block', 'lobby shows on landing');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('match-screen')).display), 'none', 'match hidden behind the lobby');
    await page.click('#lobby-start-btn');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('lobby-screen')).display), 'none', 'lobby hidden after START');
    assert.ok(await page.evaluate(() => document.getElementById('countdown-overlay').classList.contains('show')), 'countdown runs');
    await page.waitForTimeout(3200);
    assert.ok(!(await page.evaluate(() => document.getElementById('countdown-overlay').classList.contains('show'))), 'countdown clears');

    // 13. Mixed pool serves both cinema and literature with no immediate repeat.
    await page.click('#match-leave-btn');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('lobby-screen')).display), 'block', 'LEAVE returns to the lobby');
    // Deterministic: sweep Math.random across [0,1) so draws cover the whole pool
    // (cinema is the tail ~6%), instead of hoping a random sample hits it.
    const mixPicks = await page.evaluate(() => {
        const real = Math.random; let i = 0; const N = 2000;
        Math.random = () => ((i++ % N) + 0.5) / N;
        try { return Array.from({length: N}, () => window.__HIKEYMASH__.pickRaceSnippet()); } finally { Math.random = real; }
    });
    const cats = new Set(mixPicks.map(p => p.category));
    assert.ok(cats.has('cinema'), 'mixed pool includes cinema');
    assert.ok([...cats].some(c => c && c !== 'cinema'), 'mixed pool includes literature');
    const ids = mixPicks.map(p => p.id);
    assert.ok(ids.slice(1).every((id, i) => id !== ids[i]), 'picks do not repeat immediately');

    // 14. Book Reader: opens a saved paragraph, finishing flows to the next.
    await page.evaluate(() => window.__HIKEYMASH__.openBook('idgah'));
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.appMode), 'book', 'book mode active');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('book-bar')).display), 'flex', 'book bar visible');
    assert.ok((await page.locator('#book-bar-pos').textContent()).includes('1 /'), 'starts at paragraph 1');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('racers-section')).display), 'none', 'no bots while reading');
    await page.evaluate(() => {
        const seq = window.__HIKEYMASH__.getState().targetKruti;
        for (const ch of seq) window.__HIKEYMASH__.handleKeystroke(ch);
    });
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => window.__HIKEYMASH__.bookState.paraIndex), 1, 'finishing a paragraph advances to the next');
    assert.equal(await page.evaluate(() => localStorage.getItem('hikeybr_book_progress_idgah')), '1', 'reading progress persisted');
    assert.ok(!(await page.evaluate(() => document.getElementById('results-modal').classList.contains('open'))), 'no race results in book mode');
    await page.evaluate(() => window.__HIKEYMASH__.showLobby());
    await page.evaluate(() => localStorage.removeItem('hikeybr_book_progress_idgah'));

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('PASS: Remington punctuation keys, single typing view, inline keymash-style results, next/retry flow.');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
