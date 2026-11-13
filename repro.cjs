const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file://'+path.resolve('/tmp/tankan/index.html');
 // Kartik's screenshot state: 35/54 unlocked, target त्र, 458 clean timings,
 // accurateBest null, goal 40, last accuracy 85.3%.
 const setup=async()=>{await page.goto(url);await page.evaluate(()=>{localStorage.clear();
   const KP=HiKeybr.KEY_PROGRESSION;const idx=KP.findIndex(it=>it.h==='त्र');const k=KP[idx].k;
   const ks={};ks[k]={modelSamples:458,modelBest:352,modelTtt:352,lastAccuracy:85.3,recentLessonAccuracy:85.3};
   localStorage.setItem('hikeybr_store_v3',JSON.stringify({unlockedIndex:idx,highestUnlocked:idx,targetSpeedGoal:40,keyStats:ks}));
 });await page.reload();await page.waitForTimeout(400);};
 const typeLesson=(ms,errorRate)=>page.evaluate(({ms,errorRate})=>{
   const realNow=Date.now;let now=realNow();Date.now=()=>now;
   const seq=HiKeybr.targetKrutiText;
   for(let i=0;i<seq.length;i++){
     if(errorRate&&i%errorRate===0){now+=250;HiKeybr.handleKeystroke('☃');}
     now+=ms;HiKeybr.handleKeystroke(seq[i]);
   }
   Date.now=realNow;
 },{ms,errorRate});
 const status=()=>page.locator('#lead-samples-status').textContent();
 await setup();
 console.log('START:',await status());
 // Three lessons like his: ~91% accuracy (1 error per 12 keys), pace 34 WPM (352ms)
 for(let i=0;i<3;i++){await typeLesson(352,12);await page.evaluate(()=>HiKeybr.regenerateLesson());await page.waitForTimeout(100);}
 let ks=await page.evaluate(()=>{const KP=HiKeybr.KEY_PROGRESSION;const k=KP.find(it=>it.h==='त्र').k;return HiKeybr.keyStats[k];});
 console.log('AFTER 3x ~92% LESSONS: banked=',ks.accurateBest,'samples=',ks.modelSamples,'lastAcc=',ks.lastAccuracy.toFixed(1));
 console.log('STATUS:',await status());
 // One careful lesson: 1 error per 40 keys (~97.6%), same 34 WPM pace
 await typeLesson(352,40);
 ks=await page.evaluate(()=>{const KP=HiKeybr.KEY_PROGRESSION;const k=KP.find(it=>it.h==='त्र').k;return HiKeybr.keyStats[k];});
 console.log('AFTER 97.6% LESSON: banked=',ks.accurateBest,'=',(12000/ks.accurateBest).toFixed(1),'WPM lastAcc=',ks.lastAccuracy.toFixed(1));
 console.log('STATUS:',await status());
 assert.deepEqual(errors,[],'no page errors: '+errors.join('; '));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
