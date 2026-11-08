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
 // All progression levels, passing over skipped ones. ऽ (index 69) is skipped,
 // so the last trainable key is ड़ (68).
 for(let lesson=0;lesson<90;lesson++){
  const level=await page.evaluate(()=>HiKeybr.unlockedIndex);if(lesson%10===0)console.log('lesson',lesson,'level',level);if(level===68)break;
  r=await complete(100);assert.equal(r.mid,r.before);assert.ok(r.after-r.before<=4,'unlock passes over skipped runs (max 3 consecutive: ह्र/ह्ल/ह्न)');
  await page.evaluate(()=>HiKeybr.regenerateLesson());
 }
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'all trainable levels must remain reachable');
 await page.reload();assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68);
 // Skipped levels (ड्ड 55, फ्र 58, ह्र/ह्ल/ह्न 60-62, फ् 64, य् 65, ञ 67, ऽ 69): passed over on unlock, repaired on load.
 await fresh({unlockedIndex:65,highestUnlocked:65});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),66,'save on skipped य् repairs to ऊ');
 await fresh({unlockedIndex:67,highestUnlocked:67});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped ञ repairs to ड़');
 await fresh({unlockedIndex:69,highestUnlocked:69});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped final level ऽ falls back to ड़');
 await fresh({unlockedIndex:64,highestUnlocked:64});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),66,'save on skipped फ् repairs past य् to ऊ');
 await fresh({unlockedIndex:57,highestUnlocked:57});r=await complete(100);assert.equal(r.after,59,'clearing क्र skips फ्र and lands on ट्ठ');
 await fresh({unlockedIndex:59,highestUnlocked:59});r=await complete(100);assert.equal(r.after,63,'clearing ट्ठ skips ह्र/ह्ल/ह्न and lands on चँद्रबिंदु');
 await fresh({unlockedIndex:68,highestUnlocked:69});assert.equal(await page.locator('.ak-badge.skipped').count(),8,'skipped badges shown inside the unlocked range (ऽ clamps out of range)');
 assert.equal(await page.evaluate(()=>[...document.getElementById('jump-select').options].some(o=>/Half-Ya|Nya|Ddda conjunct|Phra|Hra|Hla|Hna|Half-Pha|Avagraha/.test(o.textContent))),false,'skipped levels not in review list');
 // Sprinkle: skipped Alt-code words appear about once per lesson, only where their other letters are unlocked.
 const sprinkleCount=()=>page.evaluate(()=>{
  const glyphs=HiKeybr.KEY_PROGRESSION.filter(x=>x.skip&&x.alt).map(x=>HiKeybr.unicodeToKrutiDev(x.h));
  return HiKeybr.currentLessonText.split(/\s+/).filter(w=>{const s=HiKeybr.unicodeToKrutiDev(w.replace('।',''));return glyphs.some(g=>s.includes(g));}).length;
 });
 await fresh({unlockedIndex:5,highestUnlocked:5});
 for(let i=0;i<3;i++){await page.evaluate(()=>HiKeybr.regenerateLesson());assert.equal(await sprinkleCount(),0,'no skipped-glyph words before their other letters unlock');}
 await fresh({unlockedIndex:6,highestUnlocked:6});
 for(let i=0;i<3;i++){await page.evaluate(()=>HiKeybr.regenerateLesson());assert.equal(await sprinkleCount(),1,'ह्रास fits once स/ा are unlocked (ह lives inside the Alt glyph)');}
 await fresh({unlockedIndex:68,highestUnlocked:69});
 for(let i=0;i<4;i++){await page.evaluate(()=>HiKeybr.regenerateLesson());assert.ok(await sprinkleCount()>=1,'at least one skipped-glyph word per lesson at full unlock (some, like खड्डा, are also naturally eligible)');}
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
 console.log('PASS: starter coverage, speed/accuracy gates, lesson-end single unlock, review isolation, saved-progress recovery, skip-level repair, Alt-code sprinkling.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
