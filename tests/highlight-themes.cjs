const { chromium } = require('playwright');
const assert = require('assert/strict');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto(process.env.TANKAN_TEST_URL || 'file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => document.documentElement.dataset.fontReady === '1');
  for (const theme of ['dark', 'navy', 'amber', 'sunshine', 'forest', 'epaper', 'blackwhite']) {
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      opts.cursorHighlight = true;
      opts.stopOnError = true;
      document.getElementById('opt-cursor').checked = true;
      document.getElementById('opt-cursor').dispatchEvent(new Event('change'));
      Tankan.currentLessonText = 'कला और परीक्षण ';
      Tankan.regenerateLesson({keepText:true});
    }, theme);
    await page.locator('#hidden-input').focus();
    await page.keyboard.type('x');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => Tankan.cursorIndex), 0);
    // A mistake still under the cursor keeps the current-key accent
    // highlight; it only turns red once typing moves past it.
    const stuck = await page.evaluate(() => {
      const err = document.getElementById('text-current').querySelector('.typing-error');
      if (!err) return null;
      const s = getComputedStyle(err);
      return {color:s.color, bg:s.backgroundColor, deco:s.textDecorationLine};
    });
    assert.ok(stuck, theme + ': errored unit under cursor marked');
    const accentNow = await page.evaluate(() => {
      const n=document.createElement('span'); n.style.color='var(--accent)';
      document.body.append(n); const c=getComputedStyle(n).color; n.remove(); return c;
    });
    assert.equal(stuck.color, accentNow, theme + ': current errored key keeps accent colour');
    assert.equal(stuck.bg, 'rgba(0, 0, 0, 0)', theme + ': current errored key keeps glow, no error block');
    assert.equal(stuck.deco, 'none', theme + ': no error underline on current key');
    await page.keyboard.type('dyk');
    assert.equal(await page.evaluate(() => Tankan.cursorIndex), 3);
    assert.equal(await page.locator('.typing-error').textContent(), 'd');
    const styles = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('text-current'));
      const e = getComputedStyle(document.querySelector('.typing-error'));
      const root = getComputedStyle(document.documentElement);
      return {bg:s.backgroundColor, color:s.color, shadow:s.boxShadow,
        outline:s.outlineStyle, accent:root.getPropertyValue('--accent').trim(),
        error:e.color, errorBg:e.backgroundColor, errorDeco:e.textDecorationLine};
    });
    assert.notEqual(styles.bg, 'rgb(22, 101, 52)', theme + ': no green box');
    assert.equal(styles.outline, 'none', theme + ': no outline box');
    assert.equal(styles.color, await page.evaluate(() => {
      const n=document.createElement('span'); n.style.color='var(--accent)';
      document.body.append(n); const c=getComputedStyle(n).color; n.remove(); return c;
    }), theme + ': theme accent current character');
    assert.notEqual(styles.shadow, 'none', theme + ': subtle underline cue');
    // Mistakes take the theme's own error colour with no background block
    // (the hard-coded pale slab used to override dark themes). Black & White,
    // whose --error is white like its text, adds a thin underline instead.
    const expectedError = await page.evaluate(() => {
      const n=document.createElement('span'); n.style.color='var(--error)';
      document.body.append(n); const c=getComputedStyle(n).color; n.remove(); return c;
    });
    assert.equal(styles.error, expectedError, theme + ': theme error colour');
    assert.equal(styles.errorBg, 'rgba(0, 0, 0, 0)', theme + ': no background block');
    if (theme === 'blackwhite') assert.equal(styles.errorDeco, 'underline', theme + ': underline fallback');
    else assert.equal(styles.errorDeco, 'none', theme + ': no underline');
    await page.evaluate(() => {
      document.getElementById('opt-cursor').checked = false;
      document.getElementById('opt-cursor').dispatchEvent(new Event('change'));
    });
    const off = await page.locator('#text-current').evaluate(n => {
      const s=getComputedStyle(n); return [s.backgroundColor,s.boxShadow,s.outlineStyle];
    });
    assert.deepEqual(off, ['rgba(0, 0, 0, 0)', 'none', 'none'], theme + ': highlight off');
    assert.equal(await page.locator('.typing-error').evaluate(n => getComputedStyle(n).color), expectedError);
    await page.evaluate(() => Tankan.regenerateLesson({keepText:true}));
    assert.equal(await page.locator('.typing-error').count(), 0);
  }
  console.log('PASS: 7 themes, theme-accent current unit without green box, mistakes keep theme error colour without background block (underline in blackwhite), highlight-off, restart');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
