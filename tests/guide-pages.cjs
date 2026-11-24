// Guide pages (about, tips, privacy): they share the practice page's
// container margins, follow the site's selected theme, carry a boxed
// "Back to Tankan" button, and keep the Hindi toggle inside the page
// margins. Run: node tests/guide-pages.cjs
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
    const port = server.address().port;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));

    // The practice page's actual content column: #panel-practice sits inside
    // <main> as an 880px/92% centered column on desktop.
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(300);
    const practiceMain = await page.locator('#panel-practice').boundingBox();
    const indexHeader = await page.locator('header').boundingBox();
    const appThemes = await page.evaluate(() =>
        Array.from(document.getElementById('theme-select').options).map(o => [o.value, o.textContent]));

    for (const name of ['about', 'tips', 'privacy']) {
        await page.goto(`http://localhost:${port}/${name}.html`);
        await page.waitForTimeout(250);

        // Same margins as the practice page.
        const box = await page.locator('.page').boundingBox();
        assert.ok(box, name + ': .page container exists');
        assert.ok(Math.abs(box.x - practiceMain.x) < 2 && Math.abs(box.width - practiceMain.width) < 2,
            name + ': same margins as practice content column, got ' + JSON.stringify(box) + ' vs ' + JSON.stringify(practiceMain));

        // Boxed Back to Tankan button inside the margins.
        const back = page.locator('.guide-top .back-btn:visible');
        assert.strictEqual(await back.count(), 1, name + ': one visible back button');
        assert.match(await back.textContent(), /Back to Tankan|टंकण पर वापस/, name + ': back button says Back to Tankan');
        assert.strictEqual(await back.evaluate(el => getComputedStyle(el).borderStyle), 'solid', name + ': back button is boxed');
        const bBox = await back.boundingBox();
        assert.ok(bBox.x >= box.x && bBox.x + bBox.width <= box.x + box.width, name + ': back button inside page margins');

        // Same site header as the practice page: logo, Practice/Leaderboard
        // tabs, avatar menu, theme dropdown and sound toggle.
        const header = page.locator('header');
        assert.strictEqual(await header.count(), 1, name + ': header present');
        const hBox = await header.boundingBox();
        assert.ok(Math.abs(hBox.x - indexHeader.x) < 2 && Math.abs(hBox.y - indexHeader.y) < 2 &&
            Math.abs(hBox.width - indexHeader.width) < 2 && Math.abs(hBox.height - indexHeader.height) < 2,
            name + ': header box matches practice header, got ' + JSON.stringify(hBox) + ' vs ' + JSON.stringify(indexHeader));
        assert.match(await header.locator('.brand-title').textContent(), /टंकण/, name + ': header logo');
        const tabs = header.locator('nav a.nav-tab');
        assert.strictEqual(await tabs.count(), 2, name + ': Practice and Leaderboard tabs');
        assert.strictEqual(await tabs.nth(0).getAttribute('href'), 'index.html', name + ': Practice tab goes home');
        assert.strictEqual(await tabs.nth(1).getAttribute('href'), 'index.html#leaderboard', name + ': Leaderboard tab deep-links');
        assert.strictEqual(await header.locator('.brand').getAttribute('href'), 'index.html', name + ': logo goes home');

        // Avatar menu lists the same four entries, with the current page marked.
        await header.locator('#avatar-corner').click();
        const items = header.locator('#avatar-menu .menu-item');
        assert.strictEqual(await items.count(), 5, name + ': avatar menu has Profile/Settings/Tips/About/Contact');
        const hrefs = await items.evaluateAll(els => els.map(e => e.getAttribute('href')));
        assert.deepStrictEqual(hrefs, ['index.html#profile', 'index.html#settings', 'tips.html', 'about.html', 'contact.html'], name + ': avatar menu links');
        if (name !== 'privacy') {
            assert.strictEqual(await header.locator(`#avatar-menu .menu-item[href="${name}.html"]`).getAttribute('aria-current'), 'page',
                name + ': current page marked in menu');
        }
        await page.keyboard.press('Escape');

        // Theme dropdown mirrors the app's Settings select, value for value.
        await header.locator('#theme-menu-btn').click();
        const guideThemes = await header.locator('#menu-theme-row button').evaluateAll(els => els.map(e => [e.dataset.theme, e.textContent]));
        assert.deepStrictEqual(guideThemes, appThemes, name + ': theme dropdown matches the app select');
        await page.keyboard.press('Escape');

        // Page follows the site theme, not a hardcoded palette.
        const themed = await page.evaluate(() => {
            const bg = getComputedStyle(document.body).backgroundColor;
            return { theme: document.documentElement.getAttribute('data-theme'), bg };
        });
        assert.strictEqual(themed.theme, 'dark', name + ': defaults to the Ink theme');
        assert.strictEqual(themed.bg, 'rgb(16, 20, 15)', name + ': body uses the theme palette, got ' + themed.bg);
    }

    // A theme saved by the app applies to the guide pages too.
    await page.goto(`http://localhost:${port}/index.html`);
    await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('hikeybr_store_v3') || '{}');
        d.theme = 'navy';
        localStorage.setItem('hikeybr_store_v3', JSON.stringify(d));
    });
    await page.goto(`http://localhost:${port}/about.html`);
    await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'navy', 'about: saved site theme applies');
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(6, 32, 40)', 'about: navy palette applied');

    // Tips: the Hindi toggle lives inside the page margins and flips the
    // content plus the back button language.
    await page.goto(`http://localhost:${port}/tips.html`);
    await page.waitForTimeout(250);
    const pageBox = await page.locator('.page').boundingBox();
    const langBtn = page.locator('#lang-toggle');
    const lBox = await langBtn.boundingBox();
    assert.ok(lBox.x >= pageBox.x && lBox.x + lBox.width <= pageBox.x + pageBox.width, 'tips: Hindi toggle inside page margins');
    assert.strictEqual(await langBtn.evaluate(el => getComputedStyle(el).position), 'static', 'tips: Hindi toggle is not fixed/floating');
    await langBtn.click();
    await page.waitForTimeout(150);
    assert.ok(await page.locator('#content-hi').isVisible(), 'tips: Hindi content shows');
    const hiBack = page.locator('.guide-top .back-btn[data-lang="hi"]');
    assert.ok(await hiBack.isVisible(), 'tips: Hindi back button shows');
    assert.match(await hiBack.textContent(), /टंकण पर वापस/, 'tips: Hindi back button label');

    // Phone width: the guide column matches the practice column there too
    // (full width, 12px padding) and the Hindi toggle stays inside it.
    const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mob.on('pageerror', e => errors.push('mobile: ' + e.message));
    await mob.goto(`http://localhost:${port}/index.html`);
    await mob.waitForTimeout(300);
    const mobPractice = await mob.locator('#panel-practice').boundingBox();
    await mob.goto(`http://localhost:${port}/tips.html`);
    await mob.waitForTimeout(250);
    const mobPage = await mob.locator('.page').boundingBox();
    assert.ok(Math.abs(mobPage.x - mobPractice.x) < 2 && Math.abs(mobPage.width - mobPractice.width) < 2,
        'mobile tips: same margins as practice column, got ' + JSON.stringify(mobPage) + ' vs ' + JSON.stringify(mobPractice));
    const mobLang = await mob.locator('#lang-toggle').boundingBox();
    assert.ok(mobLang.x >= mobPage.x && mobLang.x + mobLang.width <= mobPage.x + mobPage.width, 'mobile tips: Hindi toggle inside page margins');
    await mob.close();

    // Picking a theme on a guide page applies immediately, persists to the
    // app's store and survives a reload - and the practice page picks it up.
    await page.goto(`http://localhost:${port}/tips.html`);
    await page.waitForTimeout(250);
    await page.locator('#theme-menu-btn').click();
    await page.locator('#menu-theme-row button[data-theme="forest"]').click();
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'forest', 'tips: theme applies live');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hikeybr_store_v3')).theme), 'forest', 'tips: theme saved to the app store');
    await page.reload();
    await page.waitForTimeout(250);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'forest', 'tips: theme survives reload');
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'forest', 'practice: picks up the theme chosen on the guide page');

    // Sound toggle on a guide page mirrors the app's soundEnabled flag.
    await page.goto(`http://localhost:${port}/about.html`);
    await page.waitForTimeout(250);
    assert.strictEqual(await page.locator('#sound-icon').textContent(), '🔊', 'about: sound starts on');
    await page.locator('#sound-toggle-btn').click();
    assert.strictEqual(await page.locator('#sound-icon').textContent(), '🔇', 'about: sound toggles off');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hikeybr_store_v3')).soundEnabled), false, 'about: muted state saved to the app store');
    await page.locator('#sound-toggle-btn').click();
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('hikeybr_store_v3')).soundEnabled), true, 'about: sound toggles back on');

    // Deep links from the guide header open the matching panel on the app.
    for (const target of ['profile', 'settings', 'leaderboard']) {
        await page.goto(`http://localhost:${port}/index.html#${target}`);
        await page.waitForTimeout(300);
        assert.ok(await page.locator(`#panel-${target}`).evaluate(el => el.classList.contains('active')),
            'index.html#' + target + ' opens the ' + target + ' panel');
    }

    // Mobile: the header wraps with the tabs on their own row, same as the app.
    const mob2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mob2.on('pageerror', e => errors.push('mobile2: ' + e.message));
    await mob2.goto(`http://localhost:${port}/tips.html`);
    await mob2.waitForTimeout(250);
    const mobNav = await mob2.locator('header nav').boundingBox();
    const mobBrand = await mob2.locator('header .brand').boundingBox();
    assert.ok(mobNav.y > mobBrand.y, 'mobile tips: tabs wrap to their own row');
    assert.ok(mobNav.width > 350, 'mobile tips: tabs span the header width');
    // Same as the app on phones: the badge and tab labels stay visible.
    assert.notStrictEqual(await mob2.locator('header .brand-badge').evaluate(el => getComputedStyle(el).display), 'none', 'mobile tips: brand badge visible');
    assert.notStrictEqual(await mob2.locator('header nav .nav-tab .nav-label').first().evaluate(el => getComputedStyle(el).display), 'none', 'mobile tips: tab labels visible');
    await mob2.close();

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    await browser.close();
    server.close();
    console.log('PASS tests/guide-pages.cjs');
})().catch(e => { console.error('FAIL tests/guide-pages.cjs:', e.message); server.close(); process.exit(1); });
