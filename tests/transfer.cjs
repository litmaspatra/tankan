// Progress-transfer bridge: receiver mechanics on file:// (sender side and the
// real cross-origin flow are verified live against github.io + tankan.in).
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const url = 'file://' + path.resolve(__dirname, '../index.html');
    const fresh = async () => { await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(300); };
    const openSettings = async () => { await page.click('#avatar-corner'); await page.click('button.nav-tab[data-target="settings"]'); await page.waitForTimeout(250); };

    // 1. The bridge button is offered away from the old site, and transfer.html
    //    without an opener/nonce refuses politely instead of doing anything.
    await fresh(); await openSettings();
    assert.ok(await page.locator('#bridge-fetch-btn').isVisible(), 'bridge button shows on a non-old origin');
    const tpage = await browser.newPage();
    await tpage.goto('file://' + path.resolve(__dirname, '../transfer.html'));
    await tpage.waitForTimeout(300);
    assert.match(await tpage.locator('#transfer-status').textContent(), /not connected/i, 'sender page refuses without opener/nonce');
    assert.ok(await tpage.locator('#transfer-manual').isVisible(), 'sender page explains the real path');
    await tpage.close();

    // 2. Popup blocked => honest fallback, nothing imported.
    await fresh(); await openSettings();
    await page.evaluate(() => { window.open = () => null; });
    await page.click('#bridge-fetch-btn');
    await page.waitForTimeout(300);
    assert.match(await page.locator('#bridge-status').textContent(), /blocked the pop-up/i, 'popup-blocked path explains itself');
    assert.equal(await page.evaluate(() => localStorage.length), 0, 'nothing stored on blocked path');

    // 3. Messages from the wrong source / with the wrong nonce are ignored.
    await fresh(); await openSettings();
    let opened = null;
    await page.evaluate(() => { window.open = url => { window.__openedUrl = url; return window; }; }); // pretend a popup exists (self as source won't match checks below)
    await page.click('#bridge-fetch-btn');
    await page.waitForTimeout(300);
    const openedUrl = await page.evaluate(() => window.__openedUrl || '');
    assert.match(openedUrl, /^https:\/\/litmaspatra\.github\.io\/tankan\/transfer\.html\?n=[A-Za-z0-9_-]{24}$/, 'opens the old-site transfer page with a one-time nonce');
    await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-payload', n: 'forged', payload: { kind: 'tankan-progress-backup', version: 1, data: { hikeybr_store_v3: '{}' } } }, source: null, origin: 'https://litmaspatra.github.io' }));
    });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => localStorage.getItem('hikeybr_store_v3')), null, 'forged message imports nothing');

    // 4. The ready ping is answered with a send request bound to the nonce and
    //    targeted at the old origin only.
    await fresh(); await openSettings();
    const sent = await page.evaluate(async () => {
        const posted = [];
        let nonce = null;
        const realOpen = window.open.bind(window);
        const fakePopup = realOpen('about:blank', '_blank', 'width=10,height=10');
        fakePopup.postMessage = (m, t) => posted.push({ m, t });
        window.open = url => { nonce = new URL(url).searchParams.get('n'); return fakePopup; };
        document.getElementById('bridge-fetch-btn').click();
        await new Promise(r => setTimeout(r, 200));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: nonce }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 200));
        return posted;
    });
    assert.equal(sent.length, 1, 'exactly one send request');
    assert.equal(sent[0].t, 'https://litmaspatra.github.io', 'send request targets only the old origin');
    assert.equal(sent[0].m.kind, 'tankan-transfer-send', 'send request kind');
    assert.ok(/^[A-Za-z0-9_-]{24}$/.test(sent[0].m.n), 'send request carries the nonce');

    // 5. A valid payload with an empty destination imports without the replace
    //    confirm; the whole flow is driven with one fake popup object.
    await fresh(); await openSettings();
    const res5 = await page.evaluate(async () => {
        const store = { unlockedIndex: 6, highestUnlocked: 6, opts: {}, lessonHistory: [{ wpm: 40, acc: 98, ts: 1 }] };
        const payload = { app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: new Date().toISOString(), data: { hikeybr_store_v3: JSON.stringify(store) } };
        let nonce = null;
        const realOpen = window.open.bind(window);
        const fakePopup = realOpen('about:blank', '_blank', 'width=10,height=10');
        const posted = [];
        fakePopup.postMessage = (m, t) => { posted.push({ m, t }); };
        window.open = url => { nonce = new URL(url).searchParams.get('n'); return fakePopup; };
        document.getElementById('bridge-fetch-btn').click();
        await new Promise(r => setTimeout(r, 150));
        // A ready ping with a WRONG nonce must be ignored (no send request).
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: 'wrong-nonce-wrong-nonce' }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 100));
        if (posted.length) return 'ready with a wrong nonce was answered';
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: nonce }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 100));
        if (posted.length !== 1 || posted[0].m.kind !== 'tankan-transfer-send') return 'ready with the real nonce was not answered';
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-payload', n: nonce, payload }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 200));
        const stored = localStorage.getItem('hikeybr_store_v3');
        if (!stored) return 'payload was not imported';
        if (JSON.parse(stored).highestUnlocked !== 6) return 'wrong data imported';
        if (document.getElementById('import-modal').classList.contains('open')) return 'empty destination must not require the replace confirm';
        const acks = posted.filter(x => x.m.kind === 'tankan-transfer-applied');
        if (acks.length !== 1) return 'direct import must confirm the transfer to the old site';
        if (acks[0].t !== 'https://litmaspatra.github.io') return 'confirmation targets the wrong origin';
        if (acks[0].m.n !== nonce) return 'confirmation carries the wrong nonce';
        return 'ok';
    });
    assert.equal(res5, 'ok', 'empty destination imports directly: ' + res5);

    // 6a. Old site strictly further ahead: imports without asking, confirms
    //     the transfer, and stashes the replaced copy.
    await fresh(); await openSettings();
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 2, highestUnlocked: 2, opts: {}, lessonHistory: [] })));
    const res6 = await page.evaluate(async () => {
        const store = { unlockedIndex: 6, highestUnlocked: 6, opts: {}, lessonHistory: [] };
        const payload = { app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: new Date().toISOString(), data: { hikeybr_store_v3: JSON.stringify(store) } };
        let nonce = null;
        const realOpen = window.open.bind(window);
        const fakePopup = realOpen('about:blank', '_blank', 'width=10,height=10');
        const posted = [];
        fakePopup.postMessage = (m, t) => { posted.push({ m, t }); };
        window.open = url => { nonce = new URL(url).searchParams.get('n'); return fakePopup; };
        document.getElementById('bridge-fetch-btn').click();
        await new Promise(r => setTimeout(r, 150));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: nonce }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 100));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-payload', n: nonce, payload }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 200));
        if (document.getElementById('import-modal').classList.contains('open')) return 'further-ahead old site should import without the modal';
        const now = JSON.parse(localStorage.getItem('hikeybr_store_v3'));
        if (now.highestUnlocked !== 6) return 'further-ahead old-site progress was not imported';
        const stash = JSON.parse(localStorage.getItem('hikeybr_presync_backup') || 'null');
        if (!stash || !stash.data || !stash.data.hikeybr_store_v3 || JSON.parse(stash.data.hikeybr_store_v3).highestUnlocked !== 2) return 'replaced copy not stashed for rollback';
        const acks = posted.filter(x => x.m.kind === 'tankan-transfer-applied');
        if (acks.length !== 1 || acks[0].m.n !== nonce || acks[0].t !== 'https://litmaspatra.github.io') return 'auto import must confirm the transfer to the old site';
        return 'ok';
    });
    assert.equal(res6, 'ok', 'further-ahead old site imports automatically: ' + res6);

    // 6b. tankan.in strictly further ahead: nothing imported, nothing marked,
    //     the old site is told its copy was kept.
    await fresh(); await openSettings();
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 8, highestUnlocked: 8, opts: {}, lessonHistory: [] })));
    const res6b = await page.evaluate(async () => {
        const store = { unlockedIndex: 2, highestUnlocked: 2, opts: {}, lessonHistory: [] };
        const payload = { app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: new Date().toISOString(), data: { hikeybr_store_v3: JSON.stringify(store) } };
        let nonce = null;
        const realOpen = window.open.bind(window);
        const fakePopup = realOpen('about:blank', '_blank', 'width=10,height=10');
        const posted = [];
        fakePopup.postMessage = (m, t) => { posted.push({ m, t }); };
        window.open = url => { nonce = new URL(url).searchParams.get('n'); return fakePopup; };
        document.getElementById('bridge-fetch-btn').click();
        await new Promise(r => setTimeout(r, 150));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: nonce }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 100));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-payload', n: nonce, payload }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 200));
        if (JSON.parse(localStorage.getItem('hikeybr_store_v3')).highestUnlocked !== 8) return 'further-ahead tankan.in progress was replaced';
        if (document.getElementById('import-modal').classList.contains('open')) return 'kept copy should not open the modal';
        if (posted.some(x => x.m.kind === 'tankan-transfer-applied')) return 'nothing landed, so nothing may be confirmed';
        const kept = posted.filter(x => x.m.kind === 'tankan-transfer-kept');
        if (kept.length !== 1 || kept[0].m.n !== nonce || kept[0].t !== 'https://litmaspatra.github.io') return 'old site not told its copy was kept';
        if (localStorage.getItem('tankan_transfer_done')) return 'kept transfer must not mark the old origin';
        if (!/already further ahead/.test(document.getElementById('bridge-status').textContent)) return 'status does not explain the kept copy';
        return 'ok';
    });
    assert.equal(res6b, 'ok', 'further-ahead tankan.in keeps its copy: ' + res6b);

    // 6c. Equally far existing progress => the confirm modal still gates the
    //     replacement, and only the confirm tells the old site it landed.
    await fresh(); await openSettings();
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 6, highestUnlocked: 6, opts: {}, lessonHistory: [] })));
    const res6c = await page.evaluate(async () => {
        const store = { unlockedIndex: 6, highestUnlocked: 6, opts: {}, lessonHistory: [], marker: 'incoming' };
        const payload = { app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: new Date().toISOString(), data: { hikeybr_store_v3: JSON.stringify(store) } };
        let nonce = null;
        const realOpen = window.open.bind(window);
        const fakePopup = realOpen('about:blank', '_blank', 'width=10,height=10');
        const posted = [];
        fakePopup.postMessage = (m, t) => { posted.push({ m, t }); };
        window.open = url => { nonce = new URL(url).searchParams.get('n'); return fakePopup; };
        document.getElementById('bridge-fetch-btn').click();
        await new Promise(r => setTimeout(r, 150));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: nonce }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 100));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-payload', n: nonce, payload }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 200));
        const modalOpen = document.getElementById('import-modal').classList.contains('open');
        const before = JSON.parse(localStorage.getItem('hikeybr_store_v3')).marker;
        if (!modalOpen) return 'equally-far copies must still ask';
        if (before === 'incoming') return 'progress changed before confirmation';
        if (posted.some(x => x.m.kind === 'tankan-transfer-applied')) return 'transfer confirmed before the import landed';
        document.getElementById('import-confirm-btn').click(); // confirm handler reloads the page
        const acks = posted.filter(x => x.m.kind === 'tankan-transfer-applied');
        if (acks.length !== 1 || acks[0].m.n !== nonce || acks[0].t !== 'https://litmaspatra.github.io') return 'confirmed import must tell the old site the transfer landed';
        return 'ok';
    });
    assert.equal(res6c, 'ok', 'equally-far copies require confirmation: ' + res6c);

    // The confirmed import reloaded the page; let that reload finish before
    // driving the popup (a fresh goto would race it).
    await page.waitForTimeout(800);

    // The confirmed replace stashed the replaced copy for rollback.
    const stash6c = await page.evaluate(() => JSON.parse(localStorage.getItem('hikeybr_presync_backup') || 'null'));
    assert.ok(stash6c && stash6c.data && JSON.parse(stash6c.data.hikeybr_store_v3).marker !== 'incoming', 'confirmed replace stashes the replaced copy');

    // 6d. Cancelling the tie modal keeps both copies, marks nothing, stashes
    //     nothing, and clears the 'confirm to finish' instruction.
    await fresh(); await openSettings();
    await page.evaluate(() => localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: 6, highestUnlocked: 6, opts: {}, lessonHistory: [], marker: 'current' })));
    const res6d = await page.evaluate(async () => {
        const store = { unlockedIndex: 6, highestUnlocked: 6, opts: {}, lessonHistory: [], marker: 'incoming' };
        const payload = { app: 'tankan', kind: 'tankan-progress-backup', version: 1, exportedAt: new Date().toISOString(), data: { hikeybr_store_v3: JSON.stringify(store) } };
        let nonce = null;
        const realOpen = window.open.bind(window);
        const fakePopup = realOpen('about:blank', '_blank', 'width=10,height=10');
        const posted = [];
        fakePopup.postMessage = (m, t) => { posted.push({ m, t }); };
        window.open = url => { nonce = new URL(url).searchParams.get('n'); return fakePopup; };
        document.getElementById('bridge-fetch-btn').click();
        await new Promise(r => setTimeout(r, 150));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-ready', n: nonce }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 100));
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-payload', n: nonce, payload }, source: fakePopup, origin: 'https://litmaspatra.github.io' }));
        await new Promise(r => setTimeout(r, 200));
        if (!document.getElementById('import-modal').classList.contains('open')) return 'tie must ask';
        document.getElementById('import-cancel-btn').click();
        await new Promise(r => setTimeout(r, 100));
        window.open = realOpen; // no reload follows a cancel - restore for later tests
        if (JSON.parse(localStorage.getItem('hikeybr_store_v3')).marker !== 'current') return 'cancel changed the progress';
        if (localStorage.getItem('hikeybr_presync_backup')) return 'cancel stashed a copy it did not replace';
        if (posted.some(x => x.m.kind === 'tankan-transfer-applied')) return 'cancel confirmed the transfer';
        const bs = document.getElementById('bridge-status').textContent;
        if (!/cancel/i.test(bs)) return 'cancel must replace the confirm-to-finish instruction, got: ' + bs;
        return 'ok';
    });
    assert.equal(res6d, 'ok', 'tie cancel keeps everything and says so: ' + res6d);

    // 7. Sender side: with a real opener + nonce it announces readiness, sends
    //    the saved entries on a validated request, and marks THIS origin only
    //    after the destination confirms the import landed.
    const [pop] = await Promise.all([
        page.context().waitForEvent('page'),
        page.evaluate(() => window.open('transfer.html?n=ABCDEFGHIJKLMNOP1234', '_blank')),
    ]);
    await pop.waitForTimeout(400);
    assert.match(await pop.locator('#transfer-status').textContent(), /Connected to tankan\.in/i, 'sender announces readiness with a real opener');
    await pop.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-send', n: 'ABCDEFGHIJKLMNOP1234' }, source: window.opener, origin: 'https://tankan.in' }));
    });
    await pop.waitForTimeout(300);
    assert.match(await pop.locator('#transfer-status').textContent(), /Waiting for tankan\.in to finish/i, 'sender waits for the destination after sending');
    assert.equal(await page.evaluate(() => localStorage.getItem('tankan_transfer_done')), null, 'no done marker before the destination confirms');
    await pop.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', { data: { kind: 'tankan-transfer-applied', n: 'ABCDEFGHIJKLMNOP1234' }, source: window.opener, origin: 'https://tankan.in' }));
    });
    await pop.waitForTimeout(300);
    assert.match(await pop.locator('#transfer-status').textContent(), /Transfer complete/i, 'sender reports the confirmed transfer');
    assert.equal(await page.evaluate(() => localStorage.getItem('tankan_transfer_done')), '1', 'confirmed transfer marks the old origin');
    await pop.close();

    assert.deepEqual(errors, [], 'no page errors');
    await browser.close();
    console.log('PASS: transfer bridge receiver, popup fallback, origin/nonce guards, empty vs existing destination, applied-ack marks the old origin.');
})().catch(e => { console.error(e); process.exit(1); });
