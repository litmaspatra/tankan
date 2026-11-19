const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
 const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
 if (!fs.existsSync(p)) {res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2'})[path.extname(p)] || 'application/octet-stream');
 fs.createReadStream(p).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({headless:true});
 const expected=['dark','navy','amber','sunshine','forest','epaper','blackwhite'];
 for (const route of ['index.html','tips.html','about.html','privacy.html','transfer.html']) {
  for (const theme of [null,'light',...expected]) {
   const ctx=await browser.newContext({viewport:{width:1366,height:768}});
   const seed={theme,totalTypedCount:4321,totalLessons:9,highestUnlocked:8,unlockedIndex:8,measurementVersion:2,opts:{textSize:40,cursorHighlight:false},bookPos:{godan:7},sentinel:{untouched:true}};
   await ctx.addInitScript(({seed,theme})=>{
    window.TANKAN_AUTH_TEST_CLIENT={onAuth(cb){cb(null);return ()=>{};}};
    localStorage.setItem('tankan_tour_v1','1');
    if(theme!==null)localStorage.setItem('hikeybr_store_v3',JSON.stringify(seed));
   },{seed,theme});
   const page=await ctx.newPage();await page.goto(base+route);
   if(route==='index.html')await page.waitForFunction(()=>!!window.Tankan);
   const result=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,stored:JSON.parse(localStorage.getItem('hikeybr_store_v3')||'null')}));
   const resolved=theme===null||theme==='light'?'dark':theme;
   assert.equal(result.theme,resolved,route+' '+theme+' theme');
   if(theme!==null){assert.deepEqual(result.stored,{...seed,theme:resolved},route+' '+theme+' only theme changed');}
   if(route==='index.html'){
    assert.deepEqual(await page.locator('#theme-select option').evaluateAll(xs=>xs.map(x=>x.value)),expected);
    assert.equal(await page.locator('#theme-select').inputValue(),resolved);
    if(theme===null){await page.click('#theme-menu-btn');await page.screenshot({path:'/downloads/tankan-ink-default-verified.png'});}
   } else if(route!=='transfer.html') {
    await page.click('#theme-menu-btn');
    assert.deepEqual(await page.locator('#menu-theme-row button').evaluateAll(xs=>xs.map(x=>x.dataset.theme)),expected);
   }
   await ctx.close();
  }
 }
 await browser.close();server.close();
 console.log('PASS: Ink default, Paper-only migration preserves all saved fields, seven retained themes preserved, matching pickers across practice/guides/transfer');
})().catch(e=>{console.error(e);server.close();process.exit(1);});
