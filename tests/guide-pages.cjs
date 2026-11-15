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

    // The practice page's container: max-width 1100px, 24px side padding.
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(300);
    const practiceMain = await page.locator('main').boundingBox();

    for (const name of ['about', 'tips', 'privacy']) {
        await page.goto(`http://localhost:${port}/${name}.html`);
        await page.waitForTimeout(250);

        // Same margins as the practice page.
        const box = await page.locator('.page').boundingBox();
        assert.ok(box, name + ': .page container exists');
        assert.ok(Math.abs(box.x - practiceMain.x) < 2 && Math.abs(box.width - practiceMain.width) < 2,
            name + ': same margins as practice page, got ' + JSON.stringify(box) + ' vs ' + JSON.stringify(practiceMain));

        // Boxed Back to Tankan button inside the margins.
        const back = page.locator('.guide-top .back-btn:visible');
        assert.strictEqual(await back.count(), 1, name + ': one visible back button');
        assert.match(await back.textContent(), /Back to Tankan|टंकण पर वापस/, name + ': back button says Back to Tankan');
        assert.strictEqual(await back.evaluate(el => getComputedStyle(el).borderStyle), 'solid', name + ': back button is boxed');
        const bBox = await back.boundingBox();
        assert.ok(bBox.x >= box.x && bBox.x + bBox.width <= box.x + box.width, name + ': back button inside page margins');

        // Page follows the site theme, not a hardcoded palette.
        const themed = await page.evaluate(() => {
            const bg = getComputedStyle(document.body).backgroundColor;
            return { theme: document.documentElement.getAttribute('data-theme'), bg };
        });
        assert.strictEqual(themed.theme, 'light', name + ': defaults to the Paper theme');
        assert.strictEqual(themed.bg, 'rgb(239, 230, 208)', name + ': body uses the theme palette, got ' + themed.bg);
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

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    await browser.close();
    server.close();
    console.log('PASS tests/guide-pages.cjs');
})().catch(e => { console.error('FAIL tests/guide-pages.cjs:', e.message); server.close(); process.exit(1); });
