// Run with: node tests/inscript-progression.cjs  (CHROME_PATH env overrides the bundled chromium)
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
 const fresh=async(seed)=>{await page.goto(url);await page.evaluate(seed=>{localStorage.clear();localStorage.setItem('tankan_layout','inscript');if(seed)localStorage.setItem('tankan_inscript_v1',JSON.stringify(seed));},seed);await page.reload();};
 // type the whole lesson at `ms` per keystroke, page-side with a fake clock (fast, one round trip)
 const completeFast=async(ms=250,errorRate=0)=>page.evaluate(({ms,errorRate})=>{
  const I=TankanInscript,realNow=Date.now;let now=realNow();
  Date.now=()=>now;
  const before=I._state().lessons;let guard=0;
  while(I._state().lessons===before&&guard++<4000){
   const st=I._state(),ch=st.text[st.pos];
   if(errorRate&&st.pos>0&&st.pos%errorRate===0){
    now+=ms;
    for(const code of Object.keys(I.MAP)){const m=I.MAP[code];if(m&&m[0]!==ch&&m[1]!==ch&&!I.SHORT[code]){I.type(code,false);break;}}
   }
   now+=ms;
   if(ch===' ')I.type('Space',false);
   else{const r=I.REV[ch];I.type(r.code,r.shift);}
  }
  Date.now=realNow;
  return {lessons:I._state().lessons,guard};
 },{ms,errorRate});

 // 1. fresh profile starts on the four starter keys with a guided lesson
 await fresh();
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),3);
 let st=await page.evaluate(()=>({text:TankanInscript._state().text,unlocked:[...new Set(TankanInscript._state().text.replaceAll(' ',''))]}));
 assert.ok(st.unlocked.length>=1&&st.unlocked.every(c=>['क','र','ा','ि'].includes(c)),'starter lesson uses only starter keys, got '+st.unlocked.join(''));
 assert.ok(st.text.trim().length>0,'lesson text present');

 // 2. UI: target card, stats strip, alphabet strip are live; counts are Inscript's
 assert.equal(await page.locator('#metric-total-keys').textContent(),String(await page.evaluate(()=>TankanInscript.PROGRESSION.length)));
 assert.equal(await page.locator('#metric-unlocked').textContent(),'4');
 assert.equal(await page.locator('#alphabet-container .ak-badge').count(),4,'strip shows unlocked keys only');
 assert.ok(await page.locator('.target-card').isVisible(),'mastery card visible in Inscript mode');
 assert.equal((await page.locator('#lead-key').textContent()).trim(),'Learning: F','frontier key is ि on F');
 await page.screenshot({path:'test-results/inscript-fresh.png'});

 // 3. slow lessons must not unlock; low accuracy must not unlock
 let r=await completeFast(750);
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),3,'750ms/keystroke is below 25 WPM goal');
 await page.evaluate(()=>TankanInscript.newLesson());
 r=await completeFast(250,4);
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),3,'25% error lessons must not unlock');

 // 4. fast clean lessons unlock keys one at a time
 for(let i=0;i<8;i++){
  await page.evaluate(()=>TankanInscript.newLesson());
  const b=await page.evaluate(()=>TankanInscript.progress.unlockedIndex);
  await completeFast(250);
  const a=await page.evaluate(()=>TankanInscript.progress.unlockedIndex);
  assert.ok(a-b<=1,'at most one key per lesson ('+b+'->'+a+')');
  if(a===4)break;
 }
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),4,'starter keys cleared after honest fast lessons');
 assert.equal(await page.locator('#metric-unlocked').textContent(),'5');

 // 5. persistence: reload keeps progress; the Kruti Dev store is untouched
 await page.reload();
 assert.equal(await page.evaluate(()=>TankanInscript.progress.unlockedIndex),4,'Inscript progress persists across reload');
 assert.equal(await page.evaluate(()=>localStorage.getItem('hikeybr_store_v3')),null,'Remington store not created by Inscript mode');

 // 6. measurement model: shift discount + clean timings
 await fresh({u:23,h:23,goal:25,ks:{},lessons:[],bestWpm:0,bestScore:0,streak:0,total:0}); // ख (Shift+K) unlocked
 await page.evaluate(()=>{TankanInscript._setText('कख');});
 await page.evaluate(()=>{const realNow=Date.now;let now=realNow();Date.now=()=>now;TankanInscript.type('KeyK',false);now+=600;TankanInscript.type('KeyK',true);Date.now=realNow;});
 let kh=await page.evaluate(()=>TankanInscript.progress.keyStats['ख']);
 assert.ok(kh&&kh.lastLessonWpm,'ख measured');
 // 600ms interval, one Shift action discounted -> 300ms per keystroke -> 40 WPM
 assert.ok(Math.abs(kh.lastLessonWpm-40)<1.5,'shift-discounted pace ~40 WPM, got '+kh.lastLessonWpm);
 let ka=await page.evaluate(()=>TankanInscript.progress.keyStats['क']);
 assert.ok(!ka||!ka.modelSamples,'first keystroke of a lesson carries no interval sample');

 // 7. conjunct shortcut: Shift+7 types क्ष, splitting its interval across codepoints
 await fresh({u:40,h:40,goal:25,ks:{},lessons:[],bestWpm:0,bestScore:0,streak:0,total:0});
 await page.evaluate(()=>{TankanInscript._setText('क्ष');});
 await page.evaluate(()=>{const realNow=Date.now;let now=realNow();Date.now=()=>now;TankanInscript.type('KeyK',false);now+=900;TankanInscript.type('Digit7',true);Date.now=realNow;});
 // 'क' first (no sample), then shortcut must match the remaining 2 codepoints? text is क + ् + ष (3 cps): क consumed, shortcut क्ष = 3 cps does NOT match remainder (् ष) -> error path. Use pure क्ष text instead.
 st=await page.evaluate(()=>TankanInscript._state());
 assert.equal(st.errs,1,'shortcut must not partially match');

 await fresh({u:40,h:40,goal:25,ks:{},lessons:[],bestWpm:0,bestScore:0,streak:0,total:0});
 await page.evaluate(()=>{TankanInscript._setText('क्ष क्ष');});
 await page.evaluate(()=>{const realNow=Date.now;let now=realNow();Date.now=()=>now;TankanInscript.type('Digit7',true);now+=600;TankanInscript.type('Space',false);now+=600;TankanInscript.type('Digit7',true);Date.now=realNow;});
 st=await page.evaluate(()=>TankanInscript._state());
 assert.equal(st.lessons,1,'shortcut typed the whole conjunct lesson');
 let ksha=await page.evaluate(()=>TankanInscript.progress.keyStats['ष']);
 assert.ok(ksha&&ksha.modelSamples>=1,'shortcut credits its codepoints');
 assert.ok(Math.abs(ksha.lastLessonWpm-120)<15,'600ms with Shift discounted (2 actions) split across 3 codepoints = 100ms/cp = 120 WPM, got '+ksha.lastLessonWpm);

 // 8. review mode pauses unlocking and the banner says so
 await fresh();
 await page.locator('#alphabet-container .ak-badge').first().click();
 assert.equal(await page.evaluate(()=>TankanInscript.progress.reviewMode),true,'tapping key 1 starts review');
 assert.ok(await page.locator('#review-banner').isVisible(),'review banner shows');
 assert.match(await page.locator('#review-banner-text').textContent(),/unlocking is paused/);
 await page.locator('#review-resume-btn').click();
 assert.equal(await page.evaluate(()=>TankanInscript.progress.reviewMode),false,'resume returns to auto');

 // 9. goal control changes the target and persists
 await page.locator('#ins-goal-select').selectOption('40');
 assert.equal(await page.evaluate(()=>TankanInscript.progress.goal),40);
 await page.reload();
 assert.equal(await page.evaluate(()=>TankanInscript.progress.goal),40,'goal persists');

 // 10. no page errors anywhere in Inscript mode
 assert.deepEqual(errors,[],'no page errors: '+errors.join(' | '));

 // 11. Kruti Dev mode still boots clean with no page errors (regression guard)
 await page.evaluate(()=>{localStorage.clear();});
 await page.reload();
 assert.equal(await page.evaluate(()=>Tankan.unlockedIndex),3,'Remington mode unaffected');
 assert.deepEqual(errors,[],'no page errors in Remington mode: '+errors.join(' | '));

 await browser.close();
 console.log('inscript-progression: all tests passed');
})().catch(e=>{console.error(e);process.exit(1);});
