// Real-browser, real-event typing test against the LIVE site (Kartik 2026-11-11:
// "test the fix yourself"). No mocked clock, no direct handleKeystroke calls:
// every keystroke is a real key event through the app's own input pipeline.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = 'https://litmaspatra.github.io/tankan/';
  await page.goto(base + '?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  assert.ok(await page.evaluate(() => document.documentElement.innerHTML.includes('20261111e')), 'live site is on bust e');

  // Her state: 35 keys done, current key त्र, banked best 44.7, 1140 clean timings.
  const seed = await page.evaluate(() => {
    const idx = HiKeybr.KEY_PROGRESSION.findIndex(it => it.h === 'त्र'), k = HiKeybr.KEY_PROGRESSION[idx].k;
    const ks = {}; ks[k] = { modelSamples: 1140, accurateBest: 268.46, modelBest: 268.46, modelTtt: 300, lastAccuracy: 95.2, recentLessonAccuracy: 95.2 };
    localStorage.clear();
    localStorage.setItem('hikeybr_store_v3', JSON.stringify({ unlockedIndex: idx, highestUnlocked: idx, targetSpeedGoal: 45, keyStats: ks }));
    return { idx, k };
  });
  await page.reload(); await page.waitForTimeout(900);
  await page.screenshot({ path: '/downloads/rt-1-before.png' });
  console.log('start:', await page.locator('#lead-samples-status').textContent());

  // Type the lesson with REAL key events, ~200ms between keystrokes (~55-60 WPM), no errors.
  const seq1 = await page.evaluate(() => HiKeybr.targetKrutiText);
  console.log('lesson chars:', seq1.length);
  for (const ch of seq1) { await page.keyboard.type(ch); await page.waitForTimeout(150); }
  await page.waitForTimeout(1500);
  const after = await page.evaluate(k => ({ ui: HiKeybr.unlockedIndex, ks: HiKeybr.keyStats[k], lead: document.getElementById('lead-char').textContent, status: document.getElementById('lead-samples-status').textContent, speed: document.querySelector('.metric-card, [class*=metric]') ? undefined : undefined }), seed.k);
  console.log('after clean lesson:', JSON.stringify(after));
  assert.equal(after.ui, seed.idx + 1, 'REAL TYPING: clean fast lesson unlocked the next key at lesson end');
  assert.ok(after.ks.accurateBest < 268.46, 'banked best improved from 44.7 (' + (12000 / after.ks.accurateBest).toFixed(1) + ' WPM)');
  assert.ok(after.ks.modelSamples > 1140, 'samples accumulated: ' + after.ks.modelSamples);
  await page.screenshot({ path: '/downloads/rt-2-unlocked.png' });

  // Reload: bank and unlock must persist.
  await page.reload(); await page.waitForTimeout(900);
  const re = await page.evaluate(k => ({ ui: HiKeybr.unlockedIndex, ks: HiKeybr.keyStats[k], unlocked: document.getElementById('metric-unlocked').textContent, lead: document.getElementById('lead-char').textContent }), seed.k);
  console.log('after reload:', JSON.stringify(re));
  assert.equal(re.ui, seed.idx + 1, 'unlock persists across reload');
  assert.ok(re.ks.accurateBest < 268.46 && re.ks.modelSamples > 1140, 'banked त्र stats persist across reload');
  await page.screenshot({ path: '/downloads/rt-3-reload.png' });

  // Sloppy lesson on the NEW key: real typing, ~9% errors at the same pace -> no bank, no unlock.
  const cur = await page.evaluate(() => ({ idx: HiKeybr.unlockedIndex, k: HiKeybr.KEY_PROGRESSION[HiKeybr.unlockedIndex].k, h: HiKeybr.KEY_PROGRESSION[HiKeybr.unlockedIndex].h }));
  const seq2 = await page.evaluate(() => HiKeybr.targetKrutiText);
  for (let i = 0; i < seq2.length; i++) {
    if (i % 11 === 5) { await page.keyboard.type(seq2[i] === 'x' ? 'z' : 'x'); await page.waitForTimeout(120); }
    await page.keyboard.type(seq2[i]); await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1500);
  const sloppy = await page.evaluate(c => ({ ui: HiKeybr.unlockedIndex, ks: HiKeybr.keyStats[c.k], status: document.getElementById('lead-samples-status').textContent, acc: document.getElementById('metric-acc') ? document.getElementById('metric-acc').textContent : null }), cur);
  console.log('after sloppy lesson on', cur.h + ':', JSON.stringify(sloppy));
  assert.equal(sloppy.ui, seed.idx + 1, 'sloppy lesson must NOT unlock');
  assert.ok(!sloppy.ks || !sloppy.ks.accurateBest, 'sloppy lesson banks nothing on the new key');
  await page.screenshot({ path: '/downloads/rt-4-sloppy.png' });
  assert.deepEqual(errors, [], 'no page errors: ' + errors.join('; '));
  console.log('REAL-TYPING PASS: goal crossing, unlock, reload persistence, sloppy-lesson refusal - all through real key events on the live site.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
