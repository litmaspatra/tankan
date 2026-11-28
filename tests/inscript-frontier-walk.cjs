// Auto-advance past already-qualified keys (order-migration recovery).
// Run with: node tests/inscript-frontier-walk.cjs  (CHROME_PATH env overrides the bundled chromium)
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const launch={headless:true};
 if(process.env.CHROME_PATH){launch.executablePath=process.env.CHROME_PATH;launch.args=['--no-sandbox'];}
 const browser=await chromium.launch(launch);
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file://'+path.resolve(__dirname,'../index.html');
 const boot=async(seed)=>{await page.goto(url);await page.evaluate(seed=>{localStorage.clear();localStorage.setItem('tankan_layout','inscript');localStorage.setItem('hikeybr_inscript_v1',JSON.stringify(seed));},seed);await page.reload();await page.waitForFunction(()=>window.TankanInscript&&window.TankanInscript._state);};
 const completeFast=async(ms=250)=>page.evaluate(({ms})=>{
  const I=TankanInscript,realNow=Date.now;let now=realNow();Date.now=()=>now;
  const before=I._state().lessons;let guard=0;
  while(I._state().lessons===before&&guard++<4000){
   const st=I._state(),ch=st.text[st.pos];now+=ms;
   if(ch===' ')I.type('Space',false);else{const r=I.REV[ch];I.type(r.code,r.shift);}
  }
  Date.now=realNow;return I._state().lessons;
 },{ms});
 // Kartik's migrated store shape: target क (u=2) sits below h=4; starters calibrated
 const base=(ka,tA)=>({ord:3,u:2,h:4,goal:25,ks:{
  'र':{hits:80,errors:3,modelSamples:80,modelTtt:260,modelBest:255,accurateBest:255,lastAccuracy:97,recentLessonAccuracy:0,lastLessonWpm:46,targetLessons:4},
  'ि':{hits:40,errors:2,modelSamples:40,modelTtt:300,modelBest:290,accurateBest:290,lastAccuracy:96,recentLessonAccuracy:0,lastLessonWpm:40,targetLessons:4},
  'क':ka,
  'ु':{hits:60,errors:2,modelSamples:60,modelTtt:270,modelBest:265,accurateBest:265,lastAccuracy:96,recentLessonAccuracy:0,lastLessonWpm:44,targetLessons:4},
  'त':{hits:70,errors:2,modelSamples:70,modelTtt:240,modelBest:238,accurateBest:238,lastAccuracy:tA,recentLessonAccuracy:0,lastLessonWpm:50,targetLessons:4}
 },kl:{},lessons:[],bestWpm:0,bestAcc:0,bestScore:0,streak:0,total:9,daily:{}});

 // 1. target qualified only by the lesson itself: one clean lesson clears it and walks to the real frontier
 await boot(base({hits:200,errors:15,modelSamples:200,modelTtt:250,modelBest:250,accurateBest:0,lastAccuracy:93,recentLessonAccuracy:88,lastLessonWpm:44,targetLessons:6},97));
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),2,'no load walk while the target has no banked best');
 assert.equal((await page.locator('#lead-key').textContent()).trim(),'Learning: K','frontier key is क on K');
 await completeFast(250);
 let pr=await page.evaluate(()=>TankanInscript.progress);
 assert.equal(pr.unlockedIndex,5,'one clean lesson clears क and walks past qualified ु and त, got u='+pr.unlockedIndex);
 assert.equal(pr.highestUnlocked,5);
 assert.equal(await page.locator('#metric-unlocked').textContent(),'6','sixth key (्) is the new frontier');
 assert.equal((await page.locator('#lead-key').textContent()).trim(),'Learning: D','frontier key is ◌् on D');

 // 2. store already fully qualified (the morning after): a plain reload walks without any typing
 await boot(base({hits:212,errors:12,modelSamples:212,modelTtt:245,modelBest:245,accurateBest:248,lastAccuracy:96.9,recentLessonAccuracy:96.9,lastLessonWpm:48,targetLessons:7},96.9));
 pr=await page.evaluate(()=>TankanInscript.progress);
 assert.equal(pr.unlockedIndex,5,'reload alone walks qualified keys, got u='+pr.unlockedIndex);
 assert.equal(pr.highestUnlocked,5);
 assert.equal(await page.locator('#metric-unlocked').textContent(),'6');
 assert.equal((await page.locator('#lead-key').textContent()).trim(),'Learning: D');

 // 3. starter gate: a starter key below 95% last accuracy blocks the walk (documented rule)
 const gated=base({hits:212,errors:12,modelSamples:212,modelTtt:245,modelBest:245,accurateBest:248,lastAccuracy:96.9,recentLessonAccuracy:96.9,lastLessonWpm:48,targetLessons:7},96.9);
 gated.ks['ु'].lastAccuracy=90;
 await boot(gated);
 pr=await page.evaluate(()=>TankanInscript.progress);
 assert.equal(pr.unlockedIndex,2,'uncalibrated starter key keeps the frontier put, got u='+pr.unlockedIndex);
 assert.match(await page.locator('#lead-samples-status').textContent(),/calibrating starter keys/);

 // 4. fresh store is untouched by the walk
 await page.goto(url);await page.evaluate(()=>{localStorage.clear();localStorage.setItem('tankan_layout','inscript');});await page.reload();await page.waitForFunction(()=>window.TankanInscript&&window.TankanInscript._state);
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),3,'fresh store still starts on the fourth starter key');
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS: already-qualified keys auto-advance at load and at lesson end; starter gate holds; fresh store untouched');
})().catch(e=>{console.error(e);process.exit(1)});
