// Backup/export-import regression tests. Run: node tests/backup.cjs
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');
    const STORE = { unlockedIndex: 10, highestUnlocked: 10, totalTypedCount: 1234, totalErrorsCount: 12 };
    const seed = async () => {
        await page.goto(url);
        await page.evaluate(s => {
            localStorage.clear();
            localStorage.setItem('hikeybr_store_v3', JSON.stringify(s));
            localStorage.setItem('hikeybr_book_progress_nirmala', '7');
            localStorage.setItem('hikeymash_font', 'devlys010');
            localStorage.setItem('hikeymash_history_v1', '[]');
        }, STORE);
        await page.reload();
        await page.click('button.nav-tab[data-target="settings"]');
    };
    await seed();

    // 1. Export produces a paste-safe TANKAN1 code covering every tankan key.
    await page.click('#backup-code-btn');
    await page.waitForSelector('#backup-code-output:not([hidden])');
    const code = await page.inputValue('#backup-code-output');
    assert.ok(code.startsWith('TANKAN1.'), 'export code carries the TANKAN1. prefix');
    const decode = c => {
        let b = c.slice(8).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        return Buffer.from(b, 'base64').toString('utf8');
    };
    const payload = JSON.parse(decode(code));
    assert.equal(payload.kind, 'tankan-progress-backup');
    assert.equal(payload.version, 1, 'versioned format');
    for (const k of ['hikeybr_store_v3', 'hikeybr_book_progress_nirmala', 'hikeymash_font', 'hikeymash_history_v1'])
        assert.ok(k in payload.data, 'backup covers ' + k);
    assert.equal(JSON.parse(payload.data.hikeybr_store_v3).unlockedIndex, 10, 'Hindi text survives the encoding round trip');

    // 2. Round trip: wipe the device, import the code, progress returns.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.click('button.nav-tab[data-target="settings"]');
    await page.fill('#backup-code-input', code);
    await page.click('#backup-import-btn');
    await page.waitForSelector('#import-modal.open');
    const modalText = await page.textContent('#import-modal-text');
    assert.ok(/4 saved entries/.test(modalText), 'confirm modal describes the backup: ' + modalText);
    await page.click('#import-confirm-btn');
    await page.waitForLoadState('load');
    await page.waitForTimeout(400);
    const restored = await page.evaluate(() => ({
        store: JSON.parse(localStorage.getItem('hikeybr_store_v3') || '{}'),
        book: localStorage.getItem('hikeybr_book_progress_nirmala'),
        font: localStorage.getItem('hikeymash_font'),
        unlocked: HiKeybr.unlockedIndex
    }));
    assert.equal(restored.store.unlockedIndex, 10, 'store restored verbatim');
    assert.equal(restored.store.totalTypedCount, 1234);
    assert.equal(restored.book, '7', 'book progress restored');
    assert.equal(restored.font, 'devlys010', 'keymash prefs restored');
    assert.equal(restored.unlocked, 10, 'app runs on the imported progress');

    // 3. Cancel path: valid code, user backs out, nothing changes.
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 4, highestUnlocked: 4 })); });
    await page.reload();
    await page.click('button.nav-tab[data-target="settings"]');
    await page.fill('#backup-code-input', code);
    await page.click('#backup-import-btn');
    await page.waitForSelector('#import-modal.open');
    await page.click('#import-cancel-btn');
    await page.waitForTimeout(200);
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).unlockedIndex, 4, 'cancel leaves existing progress untouched');
    assert.equal(await page.evaluate(() => localStorage.getItem('hikeybr_book_progress_nirmala')), null, 'cancel writes nothing');

    // 4. Corrupt/foreign input is rejected and never overwrites.
    for (const bad of ['total garbage !!!', '{"kind":"other","data":{"hikeybr_store_v3":"{}"}}', '{"kind":"tankan-progress-backup","version":1,"data":{"evil_key":"x"}}', '{"kind":"tankan-progress-backup","version":1,"data":{}}', 'TANKAN1.corruptpayload']) {
        await page.fill('#backup-code-input', bad);
        await page.click('#backup-import-btn');
        await page.waitForTimeout(150);
        assert.equal(await page.locator('#import-modal.open').count(), 0, 'no confirm modal for invalid input: ' + bad.slice(0, 30));
        const status = await page.textContent('#backup-import-status');
        assert.ok(/Nothing was changed/.test(status), 'rejection explains itself: ' + status);
        assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('hikeybr_store_v3'))).unlockedIndex, 4, 'existing progress never overwritten on error');
    }

    assert.deepEqual(errors, [], 'no page errors');
    console.log('PASS: export file/code coverage, versioned validation, confirm-before-replace, cancel safety, corrupt-input rejection, full round trip.');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
