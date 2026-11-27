// Content guides (how-tankan-works, kruti-dev-layout, home-row, posture,
// common-mistakes, alt-codes, building-speed, terms, guides) and the home
// clean home page. Run: node tests/new-guides.cjs
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
const GUIDES = ['how-tankan-works', 'kruti-dev-layout', 'inscript-layout', 'home-row', 'posture', 'common-mistakes', 'alt-codes', 'building-speed'];
const ALL = GUIDES.concat(['terms', 'guides']);
(async () => {
    await new Promise(r => server.listen(0, 'localhost', r));
    const port = server.address().port;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    for (const name of ALL) {
        assert.ok(sitemap.includes(`https://tankan.in/${name}<`), name + ': in sitemap');
        await page.goto(`http://localhost:${port}/${name}.html`);
        await page.waitForTimeout(200);
        const en = await page.locator('#content-en').innerText();
        const words = en.split(/\s+/).filter(Boolean).length;
        if (name !== 'guides') assert.ok(words >= 440, name + ': enough English text, got ' + words);
        assert.strictEqual(await page.locator('h1').first().isVisible(), true, name + ': h1 visible');
        assert.strictEqual(await page.locator('header .brand-title').count(), 1, name + ': site header');
        assert.strictEqual(await page.locator('#avatar-menu .menu-item').count(), 5, name + ': menu has 5 items');
        assert.match(await page.getAttribute('link[rel=canonical]', 'href'), new RegExp(`https://tankan.in/${name}$`), name + ': canonical');
        // every local link in both languages points at a real file
        const hrefs = await page.$$eval('#content-en a, #content-hi a', as => as.map(a => a.getAttribute('href')));
        for (const h of hrefs) {
            if (/^(https?:|mailto:)/.test(h)) continue;
            const f = h.split('#')[0];
            assert.ok(fs.existsSync(path.join(ROOT, f)), name + ': link target exists ' + h);
        }
        // Hindi toggle
        await page.click('#lang-toggle');
        await page.waitForTimeout(100);
        const hi = await page.locator('#content-hi').innerText();
        if (name !== 'guides') assert.ok(hi.split(/\s+/).filter(Boolean).length >= 400, name + ': enough Hindi text');
        assert.ok(await page.locator('#content-hi').isVisible() && !(await page.locator('#content-en').isVisible()), name + ': Hindi shows, English hides');
        await page.click('#lang-toggle');
    }
    // Home page stays clean: no intro or FAQ, nothing below the keyboard but the footer.
    await page.goto(`http://localhost:${port}/index.html`);
    await page.waitForTimeout(500);
    assert.strictEqual(await page.locator('#home-info').count(), 0, 'home: no intro/FAQ block');
    assert.strictEqual(await page.locator('dl').count(), 0, 'home: no FAQ list');
    assert.deepEqual(errors, [], 'no page errors: ' + errors.join('; '));
    await browser.close(); server.close();
    console.log('new-guides: ok');
})().catch(e => { console.error(e); process.exit(1); });
