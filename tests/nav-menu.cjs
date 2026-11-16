// Header menus: Practice + Leaderboard are the only top-level tabs; the
// profile-picture corner opens a menu with Profile, Settings, Tips and About;
// a separate Theme button beside the sound toggle opens a dropdown that
// mirrors the Settings select. Everything must work signed out, on desktop
// and on a phone-width viewport.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(ROOT, 'index.html');
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});

(async () => {
    await new Promise(r => server.listen(0, 'localhost', r));
    const base = `http://localhost:${server.address().port}/index.html`;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
        window.__authUser = null;
        window.__authCbs = [];
        window.TANKAN_AUTH_TEST_CLIENT = {
            onAuth(cb) { window.__authCbs.push(cb); setTimeout(() => cb(window.__authUser), 0); },
            signIn() { return Promise.resolve({ user: window.__authUser }); },
            signOut() { return Promise.resolve(); }
        };
    });
    await page.goto(base);
    await page.waitForTimeout(400);

    // 1. Only Practice and Leaderboard remain top-level.
    const topTabs = await page.evaluate(() => Array.from(document.querySelectorAll('nav > .nav-tab')).map(b => b.dataset.target));
    assert.deepStrictEqual(topTabs, ['practice', 'leaderboard'], 'top-level tabs are Practice + Leaderboard, got: ' + topTabs.join(','));

    // 2. Signed out: the corner shows and opens the menu with every entry,
    //    and the menu no longer carries the theme picker.
    assert.ok(await page.locator('#avatar-corner').isVisible(), 'corner visible signed out');
    await page.click('#avatar-corner');
    await page.waitForTimeout(150);
    assert.ok(await page.locator('#avatar-menu').isVisible(), 'menu opens');
    const entries = await page.evaluate(() => Array.from(document.querySelectorAll('#avatar-menu .menu-item')).map(el => el.textContent.trim()));
    ['Profile', 'Settings', 'Tips', 'About'].forEach(name => assert.ok(entries.some(e => e.includes(name)), 'menu has ' + name + ', got: ' + entries.join('|')));
    assert.strictEqual(await page.locator('#avatar-menu #menu-theme-row').count(), 0, 'theme picker is not inside the profile menu');
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('#avatar-menu a.menu-item')).map(a => a.getAttribute('href')).sort());
    assert.deepStrictEqual(links, ['about.html', 'tips.html'], 'Tips and About link to the real pages');

    const aligned = await page.locator('#avatar-menu .menu-item').evaluateAll(items => items.map(item => {
        const icon = item.querySelector('.nav-icon').getBoundingClientRect();
        const label = item.querySelector('.nav-label').getBoundingClientRect();
        return { iconX: icon.x, labelX: label.x, width: icon.width,
            centerDelta: Math.abs(icon.y + icon.height / 2 - label.y - label.height / 2) };
    }));
    assert.ok(aligned.every(row => row.iconX === aligned[0].iconX && row.labelX === aligned[0].labelX && row.width === 20 && row.centerDelta < .1), 'all menu icons and labels share aligned columns and vertical centers');

    // 3. The Theme button sits beside the sound toggle and opens a dropdown
    //    with all eight themes; picking one works signed out, syncs the
    //    Settings select and persists.
    assert.ok(await page.locator('#theme-menu-btn').isVisible(), 'theme button visible signed out');
    const order = await page.evaluate(() => Array.from(document.querySelectorAll('.header-actions > *')).map(el => el.id || el.className));
    assert.ok(order.indexOf('theme-wrap') > -1 && order.indexOf('theme-wrap') < order.indexOf('sound-toggle-btn'), 'theme button next to sound toggle, got: ' + order.join(','));
    await page.click('#theme-menu-btn');
    await page.waitForTimeout(150);
    assert.ok(await page.locator('#theme-menu').isVisible(), 'theme dropdown opens');
    assert.ok(await page.locator('#avatar-menu').isHidden(), 'opening themes closes the profile menu');
    assert.strictEqual(await page.locator('#menu-theme-row .theme-choice').count(), 8, 'all eight themes pickable without Settings');
    await page.click('.theme-choice[data-theme="forest"]');
    await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'forest', 'theme applied');
    assert.strictEqual(await page.locator('#theme-select').inputValue(), 'forest', 'Settings select stays in sync');
    assert.ok(await page.locator('.theme-choice[data-theme="forest"]').evaluate(el => el.classList.contains('active')), 'active theme marked');
    await page.reload();
    await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'forest', 'theme persists across reload');

    await page.click('#theme-menu-btn');
    const themeLines = await page.locator('.theme-choice').evaluateAll(items => items.map(item => {
        const range = document.createRange(); range.selectNodeContents(item);
        return { lines: range.getClientRects().length, overflow: item.scrollWidth > item.clientWidth };
    }));
    assert.ok(themeLines.every(row => row.lines === 1 && !row.overflow), 'theme names stay on one line with room for selection check');
    await page.click('#theme-menu-btn');

    // 4. Profile entry switches panels, closes the menu, and the sign-in
    //    affordance is right there for a signed-out visitor.
    await page.click('#avatar-corner');
    await page.waitForTimeout(150);
    await page.click('#avatar-menu button.nav-tab[data-target="profile"]');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#avatar-menu').isHidden(), 'menu closes after a panel pick');
    assert.ok(await page.locator('#panel-profile').evaluate(el => el.classList.contains('active')), 'profile panel active');
    assert.ok(await page.locator('#google-signin-btn').isVisible(), 'sign-in reachable from the menu path');

    // 5. Outside click closes both menus.
    await page.click('#avatar-corner');
    await page.waitForTimeout(150);
    await page.mouse.click(60, 500);
    await page.waitForTimeout(100);
    assert.ok(await page.locator('#avatar-menu').isHidden(), 'outside click closes the profile menu');
    await page.click('#theme-menu-btn');
    await page.waitForTimeout(150);
    await page.mouse.click(60, 500);
    await page.waitForTimeout(100);
    assert.ok(await page.locator('#theme-menu').isHidden(), 'outside click closes the theme dropdown');

    // 6. Phone width: both menus open fully inside the viewport.
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mob.on('pageerror', e => errors.push('mobile: ' + e.message));
    await mob.goto(base);
    await mob.waitForTimeout(400);
    await mob.click('#avatar-corner');
    await mob.waitForTimeout(150);
    assert.ok(await mob.locator('#avatar-menu').isVisible(), 'mobile: menu opens');
    const box = await mob.locator('#avatar-menu').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, 'mobile: menu inside the viewport, got ' + JSON.stringify(box));
    await mob.click('#theme-menu-btn');
    await mob.waitForTimeout(150);
    assert.ok(await mob.locator('#theme-menu').isVisible(), 'mobile: theme dropdown opens');
    const tbox = await mob.locator('#theme-menu').boundingBox();
    assert.ok(tbox && tbox.x >= 0 && tbox.x + tbox.width <= 390, 'mobile: theme dropdown inside the viewport, got ' + JSON.stringify(tbox));
    await mob.click('.theme-choice[data-theme="sunshine"]');
    await mob.waitForTimeout(200);
    assert.strictEqual(await mob.evaluate(() => document.documentElement.getAttribute('data-theme')), 'sunshine', 'mobile: theme picks');

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    await browser.close();
    server.close();
    console.log('PASS tests/nav-menu.cjs');
})().catch(e => { console.error('FAIL tests/nav-menu.cjs:', e.message); server.close(); process.exit(1); });
