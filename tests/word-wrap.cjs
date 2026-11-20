// Words must never split across lines. Legacy KrutiDev bytes reuse ASCII
// punctuation codepoints as Hindi letters (घ = '?k', ण् = '.', ध् = '/'), and
// the Unicode line breaker treated those bytes as wrap opportunities, so words
// like घबराता could split (घ|बराता) even with no error span (Kartik 2026-11-20).
// The renderer groups each space-delimited word into a no-wrap .w span and only
// offers <wbr> points inside exceptionally long unspaced runs.
const { chromium } = require('playwright');
const assert = require('assert/strict');
const path = require('path');

const splitScan = () => {
  const range = document.createRange();
  const chars = [];
  for (const node of [document.getElementById('text-correct'), document.getElementById('text-current'), document.getElementById('text-remaining')]) {
    for (const child of node.childNodes) {
      if (child.tagName === 'WBR') continue;
      const tn = child.nodeType === 3 ? child : child.firstChild;
      if (!tn || tn.nodeType !== 3) continue;
      for (let i = 0; i < tn.length; i++) {
        range.setStart(tn, i); range.setEnd(tn, i + 1);
        const r = range.getBoundingClientRect();
        chars.push({ch: tn.data[i], top: Math.round(r.top), right: r.right});
      }
    }
  }
  const breaks = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].ch !== ' ' && chars[i+1].ch !== ' ' && chars[i+1].top > chars[i].top) breaks.push(chars[i].ch + '|' + chars[i+1].ch);
  }
  return {breaks, chars};
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({viewport:{width:871, height:900}});
  await page.goto(process.env.TANKAN_TEST_URL || 'file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForFunction(() => document.documentElement.dataset.fontReady === '1');

  // Words whose bytes contain break-offering punctuation codepoints.
  const words = ['घबराता','घर','कणाद','धरती','खड़ा','अक्षर','शब्द','षड्यंत्र','दुःख','सीढ़ी','बैठे-बैठे','संस्कृति','क्रिया'];
  const text = Array(40).fill(words.join(' ')).join(' ');
  await page.evaluate((t) => { Tankan.currentLessonText = t; Tankan.regenerateLesson({keepText:true}); }, text);

  const probe = async (label) => {
    const r = await page.evaluate(splitScan);
    assert.equal(r.breaks.length, 0, label + ': no mid-word splits, got ' + JSON.stringify(r.breaks.slice(0, 5)));
  };

  for (const w of [871, 700, 500, 400]) {
    await page.setViewportSize({width: w, height: 900});
    await page.waitForTimeout(150);
    await probe('width ' + w + ' cursor 0');
  }
  await page.setViewportSize({width: 871, height: 900});

  // Cursor advanced cleanly through a word, then with an error behind it.
  await page.locator('#hidden-input').focus();
  const keys = await page.evaluate(() => Tankan.targetKrutiText.slice(0, 10));
  await page.keyboard.type(keys);
  await page.waitForTimeout(150);
  await probe('cursor mid-word');
  await page.keyboard.type('x'); // mistake on the current key: error span under cursor
  await page.waitForTimeout(150);
  await probe('error under cursor');
  await page.keyboard.type(await page.evaluate(() => Tankan.targetKrutiText[Tankan.cursorIndex]));
  await page.waitForTimeout(150);
  await probe('error behind cursor');

  // Exceptionally long unspaced run: must wrap via <wbr> and never overflow.
  await page.evaluate(() => {
    Tankan.currentLessonText = 'क'.repeat(80) + ' छोटा शब्द ' + 'क'.repeat(80);
    Tankan.regenerateLesson({keepText:true});
  });
  await page.waitForTimeout(150);
  const long = await page.evaluate((scanSrc) => {
    const splitScan = eval('(' + scanSrc + ')');
    const r = splitScan();
    const cont = document.getElementById('text-stream-container').getBoundingClientRect();
    const lines = new Set(r.chars.map(c => c.top));
    const maxRight = Math.max(...r.chars.map(c => c.right));
    return {lines: lines.size, maxRight, contRight: cont.right};
  }, splitScan.toString());
  assert.ok(long.lines >= 4, 'long unspaced run wraps to several lines, got ' + long.lines);
  assert.ok(long.maxRight <= long.contRight + 1, 'no horizontal overflow past the container');

  // Ordinary words unchanged: no <wbr> inserted for normal-length words.
  await page.evaluate((t) => { Tankan.currentLessonText = t; Tankan.regenerateLesson({keepText:true}); }, 'घबराता कणाद धरती शब्द संस्कृति ');
  assert.equal(await page.locator('#text-stream-container wbr').count(), 0, 'no wbr in ordinary words');

  await browser.close();
  console.log('PASS: no mid-word splits at 4 widths with clean/error cursor states, long unspaced runs wrap via wbr without overflow, ordinary words carry no wbr');
})().catch(e => { console.error(e); process.exit(1); });
