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
 // All progression levels, passing over skipped ones (फ्र 58, ह्र 60, ँ 63, फ् 64,
 // य् 65, ऊ 66, ञ 67, ऽ 69 - Alt-only or wordless glyphs). Last trainable: ड़ (68).
 for(let lesson=0;lesson<90;lesson++){
  const level=await page.evaluate(()=>HiKeybr.unlockedIndex);if(lesson%10===0)console.log('lesson',lesson,'level',level);if(level===68)break;
  r=await complete(100);assert.equal(r.mid,r.before);assert.ok(r.after-r.before<=6,'unlock passes over skipped runs (max 5 consecutive: ँ/फ्/य्/ऊ/ञ)');
  await page.evaluate(()=>HiKeybr.regenerateLesson());
 }
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'all trainable levels must remain reachable');
 await page.reload();assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68);
 // Skipped levels: passed over on unlock, repaired on load.
 await fresh({unlockedIndex:65,highestUnlocked:65});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped य् repairs past the Alt-only run to ड़');
 await fresh({unlockedIndex:69,highestUnlocked:69});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped final level ऽ falls back to ड़');
 await fresh({unlockedIndex:58,highestUnlocked:58});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),59,'save on skipped फ्र repairs to ट्ठ');
 await fresh({unlockedIndex:57,highestUnlocked:57});r=await complete(100);assert.equal(r.after,59,'clearing क्र skips फ्र and lands on ट्ठ');
 await fresh({unlockedIndex:62,highestUnlocked:62});r=await complete(100);assert.equal(r.after,68,'clearing ह्न skips the ँ-ञ run and lands on ड़');
 await fresh({unlockedIndex:68,highestUnlocked:69});assert.equal(await page.locator('.ak-badge.skipped').count(),0,'skipped keys never shown in the strip');
 assert.equal(await page.locator('#metric-total-keys').textContent(),'60','total keys reads 60');
 assert.equal(await page.locator('#total-keys-header').textContent(),'60','header reads 60 keys');
 assert.equal(await page.locator('#toggle-locked-keys-btn').textContent(),'Show All 60 Keys','show-all button counts trainable keys');
 await page.locator('#toggle-locked-keys-btn').click();assert.equal(await page.locator('.ak-badge').count(),60,'show-all renders exactly the 60 trainable keys');
 await page.locator('#toggle-locked-keys-btn').click();
 assert.equal(await page.evaluate(()=>[...document.getElementById('jump-select').options].some(o=>/Half-Ya|Nya|Phra|Hra conjunct|Half-Pha|Avagraha|Chandrabindu|Badi Oo vowel|Dda conjunct|Tta \(dental\)/.test(o.textContent))),false,'skipped levels not in review list');
 // Alt-only glyphs never appear in guided lessons (book/paragraph mode only).
 const altByteCount=()=>page.evaluate(()=>{
  const glyphs=HiKeybr.KEY_PROGRESSION.filter(x=>x.skip&&x.alt).map(x=>HiKeybr.unicodeToKrutiDev(x.h)); // फ्र, ह्र, ँ, फ्, ऊ, ञ, ऽ - kept क्र (Ø, typed dz) is intentional
  return HiKeybr.currentLessonText.split(/\s+/).filter(w=>{const s=HiKeybr.unicodeToKrutiDev(w.replace('।',''));return glyphs.some(g=>s.includes(g));}).length;
 });
 for(const seed of [{unlockedIndex:30,highestUnlocked:30},{unlockedIndex:59,highestUnlocked:59},{unlockedIndex:68,highestUnlocked:69}]){
  await fresh(seed);
  for(let i=0;i<3;i++){await page.evaluate(()=>HiKeybr.regenerateLesson());assert.equal(await altByteCount(),0,'no Alt-code glyph words in guided lessons');}
 }
 // Kept conjuncts teach real keystrokes, never Alt codes.
 const fingers=await page.evaluate(()=>Object.fromEntries(HiKeybr.KEY_PROGRESSION.filter(x=>!x.skip).map(x=>[x.k,x.finger])));
 for(const g of ['क्त','द्ध','द्य','क्र','ड्ड','ह्ल','ह्न','ड़'])assert.ok(fingers[g]&&!/Alt/i.test(fingers[g]),g+' teaches a real keystroke');
 assert.equal(fingers['द्ध'],'Shift + 0');assert.equal(fingers['द्य'],'Shift + \\');
 // All keys unlocked: lessons stop pinning the final glyph and target the weakest keys.
 await fresh({unlockedIndex:68,highestUnlocked:69,keyStats:{d:{hits:100,errors:5,ttt:2000,tttSamples:50,modelTtt:2000,modelSamples:50}}});
 r=await page.evaluate(()=>{
  const words=HiKeybr.currentLessonText.split(/\s+/);
  const withK=words.filter(w=>HiKeybr.unicodeToKrutiDev(w.replace('।','')).includes('d')).length;
  const withDda=words.filter(w=>HiKeybr.unicodeToKrutiDev(w.replace('।','')).includes('M+')).length;
  return {total:words.length,withK,withDda};
 });
 assert.ok(r.withK>=r.total-5,`weakest key क should dominate the lesson (${r.withK}/${r.total})`);
 assert.ok(r.withDda<=2,`final glyph ड़ must not pin lessons after full unlock (${r.withDda}/${r.total})`);
 assert.deepEqual(errors,[]);
 await fresh();await page.screenshot({path:'/tmp/hikeybr-starter.png',fullPage:true});
 console.log('PASS: starter coverage, speed/accuracy gates, lesson-end single unlock, review isolation, saved-progress recovery, skip-level repair, Alt-only exclusion, real-keystroke conjuncts.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
