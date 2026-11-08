// Run with Playwright available: node tests/progression.cjs
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file://'+path.resolve(__dirname,'../index.html');
 const fresh=async(seed)=>{await page.goto(url);await page.evaluate(seed=>{localStorage.clear();if(seed)localStorage.setItem('hikeybr_store_v3',JSON.stringify(seed));},seed);await page.reload();};
 const setJump=v=>page.evaluate(v=>{const s=document.getElementById('jump-select');s.value=v;s.dispatchEvent(new Event('change'));},v);
 const complete=async(ms=250,errorRate=0)=>page.evaluate(({ms,errorRate})=>{
  const realNow=Date.now;let now=realNow();Date.now=()=>now;
  const before=HiKeybr.unlockedIndex,seq=HiKeybr.targetKrutiText;
  let mid=before;
  for(let i=0;i<seq.length;i++){
   if(errorRate&&i%errorRate===0){now+=ms;HiKeybr.handleKeystroke('☃');}
   now+=ms;HiKeybr.handleKeystroke(seq[i]);
   if(i===seq.length-2)mid=HiKeybr.unlockedIndex;
  }
  Date.now=realNow;
  return {before,mid,after:HiKeybr.unlockedIndex,saved:JSON.parse(localStorage.getItem('hikeybr_store_v3'))};
 },{ms,errorRate});
 await fresh();
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),3);
 assert.deepEqual(await page.evaluate(()=>[...new Set(HiKeybr.targetKrutiText.replaceAll(' ',''))].sort()),['d','f','j','k']);
 let r=await complete(750);assert.equal(r.after,3,'slow lessons must not unlock');
 await page.evaluate(()=>HiKeybr.regenerateLesson());r=await complete(250,4);assert.equal(r.after,3,'low accuracy must not unlock');
 await page.evaluate(()=>HiKeybr.regenerateLesson());
 for(let i=0;i<5;i++){r=await complete();assert.equal(r.mid,r.before,'no mid-lesson unlock');assert.ok(r.after-r.before<=1);if(r.after===4)break;await page.evaluate(()=>HiKeybr.regenerateLesson());}
 assert.equal(r.after,4,'mixed starters should permit first unlock');
 await page.evaluate(()=>HiKeybr.regenerateLesson());assert.ok(await page.evaluate(()=>HiKeybr.targetKrutiText.includes('s')));
 r=await complete();assert.equal(r.after,5,'next key must unlock alone');
 await setJump('0');
 r=await complete();assert.equal(r.after,0,'review must not advance progression');assert.equal(r.saved.highestUnlocked,5);
 assert.equal(await page.locator('#metric-unlocked').textContent(),'6');
 await setJump('auto');assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),5);
 await setJump('0');await page.reload();assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),5,'reload resumes auto');
 await fresh({unlockedIndex:0,highestUnlocked:3});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),3,'repair old starter save');
 await setJump('0');assert.ok(await page.evaluate(()=>HiKeybr.targetKrutiText.includes('d')));
 await setJump('auto');
 // All 70 progression levels, including rare Alt-code fallback lessons.
 for(let lesson=0;lesson<90;lesson++){
  const level=await page.evaluate(()=>HiKeybr.unlockedIndex);if(lesson%10===0)console.log('lesson',lesson,'level',level);if(level===69)break;
  r=await complete(100);assert.equal(r.mid,r.before);assert.ok(r.after-r.before<=2,'unlock advances at most one real key (skipped levels passed over)');
  await page.evaluate(()=>HiKeybr.regenerateLesson());
 }
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),69,'all levels must remain reachable');
 await page.reload();assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),69);
 // Skipped levels (य् index 65, ञ index 67): passed over on unlock and repaired on load.
 await fresh({unlockedIndex:65,highestUnlocked:65});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),66,'save on skipped य् repairs to ऊ');
 await fresh({unlockedIndex:67,highestUnlocked:67});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped ञ repairs to ड़');
 await fresh({unlockedIndex:64,highestUnlocked:64});r=await complete(100);assert.equal(r.after,66,'clearing फ् skips य् and lands on ऊ');
 await fresh({unlockedIndex:68,highestUnlocked:68});assert.equal(await page.locator('.ak-badge.skipped').count(),2,'two skipped badges shown once both are inside the unlocked range');
 assert.equal(await page.evaluate(()=>[...document.getElementById('jump-select').options].some(o=>o.textContent.includes('Half-Ya')||o.textContent.includes('Nya'))),false,'skipped levels not in review list');
 assert.deepEqual(errors,[]);
 await fresh();await page.screenshot({path:'/tmp/hikeybr-starter.png',fullPage:true});
 console.log('PASS: starter coverage, speed/accuracy gates, lesson-end single unlock, review isolation, saved-progress recovery, all 70 levels.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
