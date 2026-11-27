// Inscript: balanced starter order + ord-2 migration, Caps Lock block and notice, per-key cursor inside a syllable, font select.
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
 const boot=async(seed)=>{await page.goto(url);await page.evaluate(seed=>{localStorage.clear();localStorage.setItem('tankan_layout','inscript');if(seed)localStorage.setItem('hikeybr_inscript_v1',JSON.stringify(seed));},seed);await page.reload();await page.waitForFunction(()=>window.TankanInscript);};
 // 1. starters alternate hands (right, left, right, left)
 await boot();
 {const r=await page.evaluate(()=>TankanInscript.PROGRESSION.slice(0,6).map(p=>p.cp+':'+p.code));
  assert.deepEqual(r.map(x=>x.split(':')[0]),['र','ि','क','ु','त','्']);
  const hand=c=>['KeyA','KeyS','KeyD','KeyF','KeyG'].includes(c)?'L':'R';
  assert.equal(r.slice(0,4).map(x=>hand(x.split(':')[1])).join(''),'RLRL','first four keys: two per hand');}
 // 2. ord:2 store keeps every unlocked key
 await boot({ord:2,u:3,h:3,goal:25,ks:{},kl:{},lessons:[],total:0,daily:{}});
 {const m=await page.evaluate(()=>{const P=TankanInscript.PROGRESSION,pr=TankanInscript.progress;
   return {kept:['र','क','त','ु'].every(c=>P.findIndex(x=>x.cp===c)<=pr.highestUnlocked),h:pr.highestUnlocked,ord:JSON.parse(localStorage.getItem('hikeybr_inscript_v1')).ord};});
  assert.ok(m.kept,'ord 2 unlocked keys stay unlocked');assert.equal(m.ord,3);}
 await boot({ord:2,u:60,h:60,goal:25,ks:{},kl:{},lessons:[],total:0,daily:{}});
 assert.equal(await page.evaluate(()=>TankanInscript.progress.highestUnlocked),60,'later progress unchanged');
 // 3. Caps Lock: keys are ignored and a notice shows
 await boot();
 const pos=()=>page.evaluate(()=>TankanInscript._state().pos);
 const fire=(caps,key,code)=>page.evaluate(({caps,key,code})=>{const i=document.getElementById('hidden-input');i.focus();i.dispatchEvent(new KeyboardEvent('keydown',{key,code,modifierCapsLock:caps,bubbles:true,cancelable:true}));i.dispatchEvent(new KeyboardEvent('keyup',{key,code,modifierCapsLock:caps,bubbles:true,cancelable:true}));},{caps,key,code});
 const first=await page.evaluate(()=>{const s=TankanInscript._state();const r=TankanInscript.REV[s.text[0]];return r;});
 await fire(true,'x',first.code);
 assert.equal(await pos(),0,'key ignored while Caps Lock is on');
 assert.ok(await page.locator('#capslock-notice').isVisible(),'notice visible');
 await fire(false,'x',first.code);
 assert.equal(await pos(),1,'key works after Caps Lock is off');
 assert.ok(!(await page.locator('#capslock-notice').isVisible()),'notice hidden');
 // 4. one keystroke at a time: रि lights र, then the ि alone (dotted circle); typed text is whole shaped text
 await boot();
 {const r=await page.evaluate(()=>{const I=TankanInscript;
   const set=(w,n)=>{I._setText(w);for(let i=0;i<n;i++){const s=I._state(),q=I.REV[s.text[s.pos]];I.type(q.code,q.shift);}
     return {cur:document.getElementById('text-current').textContent,done:document.getElementById('text-correct').textContent,rem:document.getElementById('text-remaining').textContent};};
   return {a:set('रि',0),b:set('रि',1),c:set('रु क्ष',1),d:set('क्ष',1),e:set('क्ष',2)};});
  assert.deepEqual(r.a,{cur:'र',done:'',rem:'\u25CCि'});
  assert.deepEqual(r.b,{cur:'\u25CCि',done:'र',rem:''});
  assert.equal(r.c.cur,'\u25CCु');
  assert.deepEqual(r.d,{cur:'\u25CC\u094D',done:'क',rem:'ष'});
  assert.deepEqual(r.e,{cur:'ष',done:'क\u094D',rem:''});}
 // 5. font select changes the displayed font and persists
 await page.evaluate(()=>{document.getElementById('lesson-settings').open=true;});
 const sel=page.locator('#opt-font');
 assert.deepEqual(await sel.locator('option').allTextContents(),['Noto Sans Devanagari','Noto Serif Devanagari','Mangal','System default']);
 await sel.selectOption('serif');
 let ff=await page.evaluate(()=>getComputedStyle(document.getElementById('text-remaining')).fontFamily);
 assert.match(ff,/Serif/,'text uses the serif font, got '+ff);
 await page.reload();await page.waitForFunction(()=>window.TankanInscript);
 ff=await page.evaluate(()=>getComputedStyle(document.getElementById('text-remaining')).fontFamily);
 assert.match(ff,/Serif/,'font persists after reload');
 assert.equal(await page.locator('#opt-font').inputValue(),'serif');
 // 6. migrated store with current key below the highest unlocked key still advances when its goal is cleared
 {const ks={};for(const c of ['र','ि','क','ु','त'])ks[c]={hits:50,errors:0,modelSamples:20,modelTtt:100,modelBest:100,accurateBest:100,lastAccuracy:100,recentLessonAccuracy:100,lastLessonWpm:50,targetLessons:3};
  await boot({ord:3,u:1,h:4,goal:25,ks,kl:{},lessons:[],total:3,daily:{}});
  const res=await page.evaluate(()=>{const I=TankanInscript,realNow=Date.now;let now=realNow();Date.now=()=>now;
   const before=I._state().lessons;let g=0;
   while(I._state().lessons===before&&g++<4000){const st=I._state(),ch=st.text[st.pos];now+=250;if(ch===' ')I.type('Space',false);else{const r=I.REV[ch];I.type(r.code,r.shift);}}
   Date.now=realNow;return {u:I.progress.unlockedIndex,h:I.progress.highestUnlocked,g};});
  assert.equal(res.u,2,'current key moves on from F after the lesson (u was below h)');assert.equal(res.h,4);}
 assert.deepEqual(errors,[]);
 await browser.close();console.log('inscript polish ok');
})().catch(e=>{console.error(e);process.exit(1);});
