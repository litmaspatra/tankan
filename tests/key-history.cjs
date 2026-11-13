// Real per-key history, migration, accessible graph and review preservation.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
const shots=process.env.TANKAN_SCREENSHOTS||require('node:os').tmpdir();
require('node:fs').mkdirSync(shots,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file://'+path.resolve(__dirname,'../index.html');
 await page.goto(url);
 const seed={unlockedIndex:34,highestUnlocked:34,targetSpeedGoal:40,totalLessons:25,
  keyStats:{'=':{hits:200,errors:10,ttt:350,tttSamples:200,modelTtt:350,modelSamples:200,modelBest:340,accurateBest:330,lastAccuracy:94.5}},
  keyLearning:{'=':{times:[380,370,360,350],timestamps:[1,2,3,4],speeds:[31.6,32.4,33.3,34.3]}}
 };
 await page.evaluate(s=>{localStorage.clear();localStorage.setItem('hikeybr_store_v3',JSON.stringify(s));},seed);
 await page.reload();
 await page.locator('.ak-badge[data-key="="]').click();
 assert.equal(await page.locator('#key-popup').isVisible(),true);
 assert.match(await page.locator('#key-popup').textContent(),/Smoothed speed history/);
 assert.equal(await page.locator('#key-popup .kp-dot').count(),seed.keyLearning['='].times.length);
 assert.match(await page.locator('#key-popup').textContent(),/Genuine lesson dots start/);
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),34,'opening graph does not select review');
 await page.screenshot({path:path.join(shots,'tankan-history-legacy-desktop.png')});
 await page.locator('.kp-close').click();
 assert.equal(await page.locator('#key-popup').isVisible(),false,'close remains closed after focus return');
 // A real synthetic keystroke lesson must persist raw own pace, not EMA.
 const after=await page.evaluate(()=>{
  const realNow=Date.now;let now=realNow();Date.now=()=>now;
  for(const ch of HiKeybr.targetKrutiText){now+=300;HiKeybr.handleKeystroke(ch);}
  Date.now=realNow;return JSON.parse(localStorage.getItem('hikeybr_store_v3'));
 });
 const point=after.keyLearning['='].lessons.at(-1);
 assert.ok(point,'new own-key point exists');
 assert.ok(Math.abs(point.wpm-40)<.01,'300 ms key timing = 40 WPM own pace');
 assert.equal(point.accuracy,100);assert.equal(point.lesson,seed.totalLessons+1);
 assert.equal(point.wpm,after.keyStats['='].lastLessonWpm);
 assert.notEqual(point.wpm,12000/after.keyStats['='].modelTtt,'raw own-key speed is not EMA');
 assert.ok(point.samples>0&&point.ts>0);
 await page.reload();
 await page.locator('.ak-badge[data-key="="]').click();
 assert.match(await page.locator('#key-popup h3').textContent(),/Lesson-by-lesson/);
 assert.equal(await page.locator('.kp-dot').count(),1,'no invented backfill');
 await page.locator('.kp-series select').selectOption('smoothed');
 assert.match(await page.locator('#key-popup h3').textContent(),/Smoothed speed/);
 await page.locator('.kp-series select').selectOption('own');
 await page.locator('.kp-dot').focus();await page.keyboard.press('Enter');
 assert.match(await page.locator('.kp-point-detail').textContent(),/40.0 WPM/);
 // Keyboard can open/close, and review is explicit.
 await page.keyboard.press('Escape');
 await page.locator('.ak-badge[data-key="d"]').focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#key-popup').isVisible(),true);
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),after.highestUnlocked);
 await page.locator('.kp-practice').click();
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),0);
 assert.equal(await page.locator('#review-banner').isVisible(),true);
 await page.locator('#review-resume-btn').click();
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),after.highestUnlocked);
 // Long history fixture for layout and history limit. Not a recovered user history.
 const demo={...after,keyLearning:structuredClone(after.keyLearning)};
 demo.keyLearning['='].lessons=Array.from({length:130},(_,i)=>({wpm:29+i*.12+Math.sin(i*1.1)*4,accuracy:i%4===0?94.5:97.2,samples:12,lesson:200+i,ts:Date.now()-(130-i)*60000}));
 demo.keyStats['='].lastLessonWpm=demo.keyLearning['='].lessons.at(-1).wpm;
 await page.evaluate(s=>{localStorage.setItem('hikeybr_store_v3',JSON.stringify(s));},demo);await page.reload();
 await page.locator('.ak-badge[data-key="="]').click();
 assert.equal(await page.locator('.kp-dot').count(),120);
 assert.equal(await page.locator('.kp-trend').count(),1);assert.equal(await page.locator('.kp-goal').count(),1);
 assert.ok(await page.locator('.kp-dot[fill="var(--surface)"]').count()>0);
 await page.screenshot({path:path.join(shots,'tankan-history-demo-desktop.png')});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  const target=page.locator('.ak-badge[data-key="="]');
  await target.scrollIntoViewIfNeeded();const anchor=await target.boundingBox();
  await page.mouse.move(anchor.x+anchor.width/2,anchor.y+anchor.height/2);
  await page.mouse.down();
  assert.equal(await page.locator('#key-popup').isVisible(),false,'pointer-down must not open covering popup');
  await page.mouse.up();
  const box=await page.locator('#key-popup').boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=844,'phone popup contained');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false,'no page horizontal overflow');
  if(width===390)await page.screenshot({path:path.join(shots,'tankan-history-demo-phone.png')});
  await page.locator('.kp-close').click();
 }
 assert.deepEqual(errors,[]);await browser.close();console.log('key-history ok');
})().catch(e=>{console.error(e);process.exit(1)});
