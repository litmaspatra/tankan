// Synthetic reproduction of the "35th key stuck at 44.7/45" report (Kartik
// 2026-11-11): verifies the per-key banking pipeline end to end so the
// explanation rests on tested behavior, not code reading.
//   A. A qualifying lesson (fast target key, 95%+ accuracy) banks and unlocks.
//   B. A fast-but-sloppy lesson moves the displayed best but NOT the bank.
//   C. Banked values survive save + reload.
//   D. One huge outlier timing cannot poison the bank or the model best.
//   E. Advancing to the next key leaves the previous key's stats intact.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file://'+path.resolve(__dirname,'../index.html');
 const fresh=async(seed)=>{await page.goto(url);await page.evaluate(seed=>{localStorage.clear();if(seed)localStorage.setItem('hikeybr_store_v3',JSON.stringify(seed));},seed);await page.reload();await page.waitForTimeout(400);};
 // Her state: 35 keys done, current key त्र ('='), banked best 44.7 WPM, 1140 clean timings.
 const herState=async()=>{await page.goto(url);await page.waitForTimeout(400);return page.evaluate(()=>{
   const KP=HiKeybr.KEY_PROGRESSION;
   const idx=KP.findIndex(it=>it.h==='त्र'),k=KP[idx].k;
   const ks={};ks[k]={modelSamples:1140,accurateBest:268.46,modelBest:268.46,modelTtt:300,lastAccuracy:95.2,recentLessonAccuracy:95.2};
   return {seed:{unlockedIndex:idx,highestUnlocked:idx,targetSpeedGoal:45,keyStats:ks},idx,k};
 });};
 // Type the current lesson; per-keystroke ms, optional injected errors and one outlier pause.
 const typeLesson=(msFor,errorRate,outlier)=>page.evaluate(({msForStr,errorRate,outlier})=>{
   const msFor=eval('('+msForStr+')');
   const realNow=Date.now;let now=realNow();Date.now=()=>now;
   const seq=HiKeybr.targetKrutiText;
   const traSeq=HiKeybr.unicodeToKrutiDev('त्र');let traSeen=0;
   const before=HiKeybr.unlockedIndex;
   for(let i=0;i<seq.length;i++){
     if(errorRate&&i%errorRate===0){now+=250;HiKeybr.handleKeystroke('☃');}
     let ms=msFor(seq[i],i);
     if(outlier&&seq.substr(i,traSeq.length)===traSeq){traSeen++;if(traSeen===3){now+=30000;ms+=0;}}
     now+=ms;HiKeybr.handleKeystroke(seq[i]);
   }
   Date.now=realNow;
   return {before,after:HiKeybr.unlockedIndex,traSeq};
 },{msForStr:msFor.toString(),errorRate,outlier});

 // A. Qualifying lesson: every keystroke 200ms (60 WPM), no errors -> banks, gate passes, unlock at lesson end.
 let st=await herState();await fresh(st.seed);
 let r=await typeLesson(()=>200,0,false);
 assert.equal(r.after,st.idx+1,'fast accurate lesson unlocks the next key at lesson end');
 let ks=await page.evaluate(k=>HiKeybr.keyStats[k],st.k);
 assert.ok(ks.accurateBest<=215,'qualifying lesson banks the fast mean (got '+ks.accurateBest+')');
 assert.ok(ks.modelSamples>1140,'clean timings keep accumulating ('+ks.modelSamples+')');
 // E. Stats for the completed key stay intact after advancing.
 assert.equal(ks.lastAccuracy,100,'previous key stats intact after advancing');
 assert.ok((await page.evaluate(k=>HiKeybr.keyStats[k].modelSamples,st.k))>1140,'previous key samples not reset');

 // C. Persistence: the bank survives save + reload.
 let saved=await page.evaluate(k=>JSON.parse(localStorage.getItem('hikeybr_store_v3')).keyStats[k],st.k);
 assert.ok(saved&&saved.accurateBest<=215,'banked best persisted to storage');
 await page.reload();await page.waitForTimeout(400);
 ks=await page.evaluate(k=>HiKeybr.keyStats[k],st.k);
 assert.ok(ks.accurateBest<=215&&ks.modelSamples>1140,'banked best and samples survive reload');

 // B. Fast-but-sloppy lesson (~80% accuracy): display best moves, bank does not.
 st=await herState();await fresh(st.seed);
 r=await typeLesson(()=>200,4,false);
 assert.equal(r.after,st.idx,'low accuracy must not unlock');
 ks=await page.evaluate(k=>HiKeybr.keyStats[k],st.k);
 assert.equal(Math.round(ks.accurateBest*100),26846,'sloppy lesson never banks (bank stays 44.7)');
 assert.ok(ks.modelTtt<300&&ks.modelTtt>200,'one fast lesson nudges the smoothed pace only 10% ('+ks.modelTtt+')');
 assert.equal(ks.modelBest,268.46,'one fast lesson does NOT move the displayed best - by design (anti-lucky-unlock)');
 const status=await page.locator('#lead-samples-status').textContent();
 assert.match(status,/need 95% lesson accuracy/,'unmet line names the accuracy gap');
 assert.match(status,/banked best 44\.7/,'unmet line quotes the unchanged bank, not the moved display best');
 const pct=await page.locator('#progress-stat-pct').textContent();
 assert.match(pct,/99%/,'readiness stays capped at 99%');
 // Sustained fast sloppy lessons DO converge the smoothed pace: after 15, the
 // any-lesson tracker shows sub-goal speed even though nothing ever banked.
 for(let i=0;i<15;i++){await page.evaluate(()=>HiKeybr.regenerateLesson());await typeLesson(()=>200,4,false);}
 ks=await page.evaluate(k=>HiKeybr.keyStats[k],st.k);
 assert.ok(ks.modelBest<240,'sustained fast pace converges the display best ('+ks.modelBest+')');
 assert.equal(Math.round(ks.accurateBest*100),26846,'bank still untouched after 16 sloppy lessons');

 // D. One 30-second outlier on a target-key hit cannot poison bank or model best.
 st=await herState();await fresh(st.seed);
 r=await typeLesson(()=>200,0,true);
 ks=await page.evaluate(k=>HiKeybr.keyStats[k],st.k);
 assert.ok(ks.accurateBest<=268.46,'outlier never worsens the bank ('+ks.accurateBest+')');
 assert.ok(ks.modelBest<=268.46,'outlier never worsens the model best ('+ks.modelBest+')');
 assert.equal(r.after,st.idx+1,'outlier lesson still unlocks when the trimmed mean qualifies');

 assert.deepEqual(errors,[],'no page errors: '+errors.join('; '));
 console.log('PASS: qualifying bank+unlock, sloppy-lesson bank refusal with moving display, persistence, outlier resistance, key-advance isolation.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
