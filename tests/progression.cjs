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
 // Review mode must announce itself and offer a way back: a quiet review
 // session looks exactly like a stuck unlock (readiness can read 100%).
 await setJump('2');
 assert.equal(await page.locator('#review-banner').isVisible(),true,'review banner shows');
 assert.match(await page.locator('#review-banner-text').textContent(),/unlocking is paused/);
 await page.locator('#review-resume-btn').click();
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),5,'resume returns to the frontier key');
 assert.equal(await page.locator('#jump-select').inputValue(),'auto','resume restores auto');
 assert.equal(await page.locator('#review-banner').isVisible(),false,'banner hides after resume');
 // Tiny pools mix context words for variety instead of robotic two-word loops.
 await setJump('2');
 const variety=await page.evaluate(()=>{const t=HiKeybr.targetKrutiText.trim().split(/\s+/);return {n:t.length,distinct:new Set(t).size,on:t.filter(w=>w.includes('f')).length};});
 assert.ok(variety.distinct>=8,'tiny review pool gains variety (got '+variety.distinct+')');
 assert.ok(variety.on>=variety.n/2,'reviewed key still dominates (got '+variety.on+'/'+variety.n+')');
 await setJump('auto');
 await fresh({unlockedIndex:0,highestUnlocked:3});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),3,'repair old starter save');
 await setJump('0');assert.ok(await page.evaluate(()=>HiKeybr.targetKrutiText.includes('d')));
 await setJump('auto');
 // All progression levels, passing over skipped ones (क्त 50, द्द 51, ट्ट 54, ड्ड 55,
 // त्त 56, क्र 57, फ्र 58, ट्ठ 59, ह्र 60, ह्ल 61, ह्न 62, ँ 63, फ् 64, य् 65, ऊ 66,
 // ञ 67, ऽ 69 - Alt-only, wordless, or excluded conjuncts). Last trainable: ळ (70).
 for(let lesson=0;lesson<90;lesson++){
  const level=await page.evaluate(()=>HiKeybr.unlockedIndex);if(lesson%10===0)console.log('lesson',lesson,'level',level);if(level===70)break;
  r=await complete(100);assert.equal(r.mid,r.before);assert.ok(r.after-r.before<=15,'unlock passes over skipped runs (max 14 consecutive: ट्ट-ञ)');
  await page.evaluate(()=>HiKeybr.regenerateLesson());
 }
 assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),70,'all trainable levels must remain reachable');
 await page.reload();assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),70);
 // Skipped levels: passed over on unlock, repaired on load.
 await fresh({unlockedIndex:65,highestUnlocked:65});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped य् repairs past the Alt-only run to ड़');
 await fresh({unlockedIndex:69,highestUnlocked:69});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),70,'save on skipped ऽ advances to the new final level ळ');
 await fresh({unlockedIndex:58,highestUnlocked:58});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped फ्र repairs past the excluded conjunct run to ड़');
 await fresh({unlockedIndex:53,highestUnlocked:53});r=await complete(100);assert.equal(r.after,68,'clearing द्य skips the excluded conjunct run and lands on ड़');
 await fresh({unlockedIndex:62,highestUnlocked:62});assert.equal(await page.evaluate(()=>HiKeybr.unlockedIndex),68,'save on skipped ह्न repairs to ड़');
 await fresh({unlockedIndex:70,highestUnlocked:70});assert.equal(await page.locator('.ak-badge.skipped').count(),0,'skipped keys never shown in the strip');
 assert.equal(await page.locator('#metric-total-keys').textContent(),'54','total keys reads 54');
 assert.equal(await page.locator('#total-keys-header').textContent(),'54','header reads 54 keys');
 assert.equal(await page.locator('#toggle-locked-keys-btn').textContent(),'Show All 54 Keys','show-all button counts trainable keys');
 await page.locator('#toggle-locked-keys-btn').click();assert.equal(await page.locator('.ak-badge').count(),54,'show-all renders exactly the 54 trainable keys');
 await page.locator('#toggle-locked-keys-btn').click();
 assert.equal(await page.locator('#lp-keys .lp-key').count(),54,'lesson preview matches the strip: 54 trainable keys, no skipped glyphs');
 assert.equal(await page.evaluate(()=>[...document.getElementById('lp-keys').children].some(c=>['क्त','ट्ट','ड्ड','क्र','ट्ठ','ह्ल','ह्न','द्द','त्त','फ्र','ह्र','ँ','फ्','य्','ऊ','ञ','ऽ'].includes(c.textContent))),false,'preview hides every skipped glyph');
 assert.equal(await page.evaluate(()=>[...document.getElementById('jump-select').options].some(o=>/Half-Ya|Nya|Phra|Hra conjunct|Half-Pha|Avagraha|Chandrabindu|Badi Oo vowel|Dda conjunct|Tta \(dental\)|Kta conjunct|Tta conjunct|Ddda|Kra conjunct|Ttha|Hla|Hna/.test(o.textContent))),false,'skipped levels not in review list');
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
 for(const g of ['द्ध','द्य','ड़','G'])assert.ok(fingers[g]&&!/Alt/i.test(fingers[g]),g+' teaches a real keystroke');
 assert.equal(fingers['द्ध'],'Shift + 0');assert.equal(fingers['द्य'],'Shift + \\');
 assert.equal(fingers['G'],'Shift + G','ळ teaches Shift + G');
 // The ळ level trains with its Rajasthani word list before weakness mode starts.
 await fresh({unlockedIndex:70,highestUnlocked:70});
 const la=await page.evaluate(()=>{
  const words=HiKeybr.currentLessonText.split(/\s+/);
  const g=words.filter(w=>HiKeybr.unicodeToKrutiDev(w.replace('।','')).includes('G'));
  return {total:words.length,withLa:g.length,sample:g.slice(0,6)};
 });
 assert.ok(la.withLa>=la.total-2,`ळ level lessons focus on ळ words (${la.withLa}/${la.total}): ${la.sample}`);
 // क्र words stay eligible (typed d then z) but rare; the other excluded conjuncts'
 // words keep their regular bytes, so they remain in normal lessons.
 await fresh({unlockedIndex:70,highestUnlocked:70,keyStats:{G:{targetLessons:3}}});
 const kra=await page.evaluate(()=>{
  const seq=HiKeybr.unicodeToKrutiDev('क्र');let rare=0,other=0;
  for(let i=0;i<40;i++){HiKeybr.regenerateLesson();const words=HiKeybr.currentLessonText.split(/\s+/);rare+=words.filter(w=>HiKeybr.unicodeToKrutiDev(w.replace('।','')).includes(seq)).length;other+=words.length;}
  return {rare,other};
 });
 assert.ok(kra.rare>0,'क्र words still appear after full unlock');
 assert.ok(kra.rare<kra.other*0.2,`क्र words stay rare (${kra.rare}/${kra.other})`);
 // The hint for a क्र byte teaches d then z, never the Alt code.
 const kraHint=await page.evaluate(()=>{
  const s=HiKeybr.unicodeToKrutiDev('क्र');const h=HiKeybr.getKrutiKeystrokeHint?HiKeybr.getKrutiKeystrokeHint(s,null):null;return h?h.keyLabel+': '+h.detail:'';
 });
 assert.ok(/d/i.test(kraHint)&&!/Hold Alt/i.test(kraHint),'क्र hint teaches dz: '+kraHint);
 // All keys unlocked: lessons stop pinning the final glyph and target the weakest keys.
 await fresh({unlockedIndex:70,highestUnlocked:70,keyStats:{G:{targetLessons:3},d:{hits:100,errors:5,ttt:2000,tttSamples:50,modelTtt:2000,modelSamples:50}}});
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
