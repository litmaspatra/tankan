// Official word-practice mode: pool honesty, slow-words drill, per-word stats,
// persistence, and non-regression of guided lessons.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 await page.setDefaultNavigationTimeout(90000);page.setDefaultTimeout(60000); // parallel runs of many Chromiums made the 30s goto default time out (observed once)
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='file://'+path.resolve(__dirname,'../index.html');
 const fresh=async(seed)=>{await page.goto(url);await page.evaluate(seed=>{localStorage.clear();if(seed)localStorage.setItem('hikeybr_store_v3',JSON.stringify(seed));},seed);await page.reload();await page.waitForTimeout(400);};
 const clickTab=async t=>{await page.evaluate(()=>{document.getElementById('lesson-settings').open=true;});await page.locator(`.ls-tab[data-lstab="${t}"]`).click();};
 const lessonWords=()=>page.evaluate(()=>HiKeybr.currentLessonText.trim().split(/\s+/).filter(Boolean));

 // 1. Pool honesty at hu=15 (89 eligible official words)
 await fresh({unlockedIndex:15,highestUnlocked:15});
 await clickTab('official');await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('book-mode')),true,'official mode uses practice (book-mode) chrome');
 let words=await lessonWords();
 const check=await page.evaluate(ws=>({official:ws.every(w=>OFFICIAL_WORDS.includes(w))}),words);
 assert.ok(check.official,'every lesson word is an official word');
 assert.ok(new Set(words).size>=10,'official lesson has variety (got '+new Set(words).size+')');
 assert.match(await page.locator('#text-source-note').textContent(),/unlocking is paused/);
 assert.match(await page.locator('#official-info').textContent(),/89 of 776/);
 // Lesson Preview shows the real unlock state, not the book-mode "all keys" claim
 const lp=await page.evaluate(()=>({on:document.querySelectorAll('#lp-keys .lp-key.on').length,all:document.querySelectorAll('#lp-keys .lp-key').length,cur:document.getElementById('lp-current').textContent}));
 assert.equal(lp.on,16,'preview marks exactly the 16 unlocked trainable keys');
 assert.match(lp.cur,/unlocking is paused/,'preview caption says unlocking is paused');
 assert.match(lp.cur,/paused/,'preview caption explains unlocking is paused');
 assert.ok(!/All keys are unlocked/.test(lp.cur),'no all-keys-unlocked claim in official mode');

 // 2. Words use only unlocked keys: every byte must be physically typeable at hu=15
 const typed=await page.evaluate(()=>{
   const KP=KEY_PROGRESSION.slice(0,16),ks=new Set(KP.map(x=>x.k));
   const SB={'~':'`','!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0','_':'-','+':'=','{':'[','}':']','|':'\\',':':';','"':"'",'<':',','>':'.','?':'/'};
   return [...HiKeybr.targetKrutiText].every(c=>c===' '||ks.has(c)||ks.has(c.toLowerCase())||ks.has(SB[c]));
 });
 assert.ok(typed,'no locked-key bytes in the official lesson');

 // 3. Tiny pool: hu=3 (1 official word) refuses honestly and falls back
 await fresh({unlockedIndex:3,highestUnlocked:3});
 await clickTab('official');await page.waitForTimeout(400);
 assert.match(await page.locator('#practice-event').textContent(),/need a few more unlocked keys/,'empty pool explains itself');
 assert.equal(await page.evaluate(()=>document.querySelector('.ls-tab.active').dataset.lstab),'words','falls back to guided lessons');
 // The explanation must survive the guided path overwriting #word-pool-status,
 // with counts, or the mode looks silently broken (only a 5s flash).
 const poolLine=await page.locator('#word-pool-status').textContent();
 assert.match(poolLine,/Official words need a few more unlocked keys/,'pool status keeps the official explanation after fallback');
 assert.match(poolLine,/only 1 of 776 fit your 4 unlocked keys/,'pool status carries pool and key counts');
 assert.match(poolLine,/guided practice shown instead/,'pool status says what is shown instead');
 assert.match(poolLine,/usable at this level/,'guided pool stats still follow the explanation');
 // ...and it clears once the user explicitly picks another tab
 await clickTab('words');await page.waitForTimeout(400);
 assert.ok(!/Official words/.test(await page.locator('#word-pool-status').textContent()),'explanation clears after explicitly choosing guided lessons');

 // 4. Guided lessons untouched after switching back
 await fresh({unlockedIndex:15,highestUnlocked:15});
 await clickTab('official');await page.waitForTimeout(300);await clickTab('words');await page.waitForTimeout(400);
 words=await lessonWords();
 const focused=await page.evaluate(ws=>ws.filter(w=>unicodeToKrutiDev(w).includes(KEY_PROGRESSION[15].k)).length,words);
 assert.ok(focused>=words.length/2,'guided lesson still focuses the current key ('+focused+'/'+words.length+')');

 // 5. Per-word stat capture: one deliberately slow word stands out
 await fresh({unlockedIndex:5,highestUnlocked:5});
 await page.evaluate(()=>{
   const realNow=Date.now;let now=realNow();Date.now=()=>now;
   const seq=HiKeybr.targetKrutiText,slowSeq=';kj'; // यार - every occurrence typed slowly
   for(let i=0;i<seq.length;i++){const slow=seq.substr(i,slowSeq.length)===slowSeq;const ms=slow?900:80;now+=ms;HiKeybr.handleKeystroke(seq[i]);}
   Date.now=realNow;
 });
 const ws=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('hikeybr_store_v3')).wordStats||{};return Object.entries(s).map(([w,v])=>({w,avg:v.ms/v.n,n:v.n})).sort((a,b)=>b.avg-a.avg);});
 assert.ok(ws.length>=3,'word stats recorded for the lesson ('+ws.length+' words)');
 assert.equal(ws[0].w,'यार','the deliberately slow word ranks slowest: '+JSON.stringify(ws));
 assert.ok(ws[0].avg>ws[ws.length-1].avg*2,'slow word clearly separated ('+Math.round(ws[0].avg)+'ms vs '+Math.round(ws[ws.length-1].avg)+'ms)');

 // 6. Slow-words drill: only recorded slow official words, slowest included
 const slowSeed={unlockedIndex:25,highestUnlocked:25,wordStats:{
   'अनुमोदित':{n:3,ms:30000,last:1},'अनुलग्नक':{n:2,ms:18000,last:2},'अनुस्मारक':{n:4,ms:32000,last:3},
   'अंकित':{n:5,ms:2000,last:4},'अनुमति':{n:6,ms:2400,last:5},'अनुपालन':{n:3,ms:3600,last:6}}};
 await fresh(slowSeed);
 await clickTab('official');await page.waitForTimeout(300);
 await page.evaluate(()=>{const o=document.getElementById('opt-slow-words');o.checked=true;o.dispatchEvent(new Event('change'));});await page.waitForTimeout(400);
 words=await lessonWords();
 for(const w of ['अनुस्मारक','अनुमोदित','अनुलग्नक'])assert.ok(words.includes(w),'recorded slow word '+w+' appears in the drill');
 assert.ok(words.every(w=>['अनुस्मारक','अनुमोदित','अनुलग्नक','अंकित','अनुमति','अनुपालन'].includes(w)),'drill uses only recorded words');
 assert.match(await page.locator('#word-pool-status').textContent(),/slow words/i);
 assert.equal(await page.locator('#slow-words-count').textContent(),'6','recorded slow count shows');

 // 7. Persistence: mode and word stats survive reload
 await page.reload();await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>document.querySelector('.ls-tab.active').dataset.lstab),'official','official mode persists across reload');
 const ws2=await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('hikeybr_store_v3')).wordStats||{}).length);
 assert.equal(ws2,6,'word stats persist');

 // 8. Slow toggle with too few recorded words falls back to the full pool honestly
 await fresh({unlockedIndex:25,highestUnlocked:25,wordStats:{'अंकित':{n:2,ms:4000,last:1}}});
 await clickTab('official');await page.waitForTimeout(300);
 await page.evaluate(()=>{const o=document.getElementById('opt-slow-words');o.checked=true;o.dispatchEvent(new Event('change'));});
 await page.waitForTimeout(400);
 words=await lessonWords();
 assert.ok(words.length>=20,'full official pool still serves a lesson');
 assert.match(await page.locator('#word-pool-status').textContent(),/full pool/,'note explains the fallback');

 assert.deepEqual(errors,[],'no page errors');
 await browser.close();
 console.log('PASS: official word mode, pool honesty, slow-words drill, per-word stats, persistence, guided non-regression.');
})().catch(e=>{console.error(e);process.exit(1);});
