const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('file://'+path.resolve(__dirname,'../index.html'));
 await page.evaluate(()=>{localStorage.clear();localStorage.setItem('hikeybr_store_v3',JSON.stringify({theme:'epaper'}))});await page.reload();
 await page.click('#theme-menu-btn');
 assert.equal(await page.locator('#menu-theme-row button.active').getAttribute('data-theme'),'epaper','restored theme menu tick matches active e-paper');
 await page.screenshot({path:'/downloads/tankan-epaper-tick-fixed.png',fullPage:true});
 await page.click('#theme-menu-btn');await page.click('.lesson-settings summary');
 const read=()=>page.evaluate(()=>({text:HiKeybr.currentLessonText,cursor:HiKeybr.cursorIndex,correct:HiKeybr.sessionCorrect,errors:HiKeybr.sessionErrors,status:document.querySelector('#word-pool-status').textContent}));
 for(const tab of ['books','essays']){
  await page.click('[data-lstab="'+tab+'"]');await page.evaluate(()=>{const b=findBook(textSource);return b&&!Array.isArray(b.lines)?ensureBookLoaded(b.id):Promise.resolve(true);});let before=await read();
  await page.evaluate(()=>HiKeybr.handleKeystroke(HiKeybr.targetKrutiText[0]));before=await read();
  await page.click('[data-lstab="'+tab+'"]');assert.deepEqual(await read(),before,'clicking active '+tab+' must not advance/reset');
  await page.click('[data-lstab="words"]');await page.click('[data-lstab="'+tab+'"]');
  const returned=await read();assert.equal(returned.text,before.text,'returning to '+tab+' must not skip unfinished paragraph');
  await page.click('#para-next');const next=await read();assert.notEqual(next.text,before.text,'explicit next still advances');
  await page.click('#para-prev');assert.equal((await read()).text,before.text,'explicit previous still works');
  if(tab==='essays')await page.screenshot({path:'/downloads/tankan-lesson-mode-fixed.png',fullPage:true});
 }
 await page.click('#theme-menu-btn');await page.click('#menu-theme-row button[data-theme="dark"]');
 assert.equal(await page.locator('#menu-theme-row button.active').getAttribute('data-theme'),'dark');
 await page.reload();await page.click('#theme-menu-btn');assert.equal(await page.locator('#menu-theme-row button.active').getAttribute('data-theme'),'dark');
 await page.screenshot({path:'/downloads/tankan-theme-fix.png',fullPage:true});assert.deepEqual(errors,[]);await browser.close();console.log('PASS: restored theme tick, repeated active tabs, source-return paragraph, explicit paragraph navigation, theme change/reload');
})().catch(e=>{console.error(e);process.exit(1)});
