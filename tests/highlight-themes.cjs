const { chromium } = require('playwright');
const assert = require('assert/strict');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto(process.env.TANKAN_TEST_URL || 'file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => document.documentElement.dataset.fontReady === '1');
  for (const theme of ['dark', 'navy', 'amber', 'light', 'sunshine', 'forest', 'epaper', 'blackwhite']) {
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      opts.cursorHighlight = true;
      opts.stopOnError = true;
      document.getElementById('opt-cursor').checked = true;
      document.getElementById('opt-cursor').dispatchEvent(new Event('change'));
      HiKeybr.currentLessonText = 'कला और परीक्षण ';
      HiKeybr.regenerateLesson({keepText:true});
    }, theme);
    await page.locator('#hidden-input').focus();
    await page.keyboard.type('x');
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 0);
    await page.keyboard.type('dyk');
    assert.equal(await page.evaluate(() => HiKeybr.cursorIndex), 3);
    assert.equal(await page.locator('.typing-error').textContent(), 'd');
    const styles = await page.evaluate(() => {
      const s = getComputedStyle(document.getElementById('text-current'));
      const e = getComputedStyle(document.querySelector('.typing-error'));
      return [s.backgroundColor, s.color, e.color, e.backgroundColor];
    });
    assert.deepEqual(styles, ['rgb(22, 101, 52)', 'rgb(255, 255, 255)', 'rgb(153, 27, 27)', 'rgb(254, 226, 226)'], theme);
    await page.evaluate(() => {
      document.getElementById('opt-cursor').checked = false;
      document.getElementById('opt-cursor').dispatchEvent(new Event('change'));
    });
    assert.notEqual(await page.locator('#text-current').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(22, 101, 52)');
    assert.equal(await page.locator('.typing-error').evaluate(n => getComputedStyle(n).color), 'rgb(153, 27, 27)');
    await page.evaluate(() => HiKeybr.regenerateLesson({keepText:true}));
    assert.equal(await page.locator('.typing-error').count(), 0);
  }
  console.log('PASS: 8 themes, green current unit, actual wrong/correct/move-on keeps errors red, highlight-off, restart');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
