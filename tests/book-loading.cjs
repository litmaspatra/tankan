const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const path=require('node:path'),http=require('node:http'),fs=require('node:fs');
const ROOT=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0])==='/'?'index.html':decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');fs.createReadStream(f).pipe(res);});
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({headless:true});
    const p=await browser.newPage();
    const errors=[],requests=[];
    p.on('pageerror',e=>errors.push(e.message));
    p.on('request',r=>requests.push(r.url()));
    await p.goto('http://127.0.0.1:'+server.address().port+'/index.html');
    assert.equal(requests.filter(u=>/\/books\/(nirmala|godan)\.js/.test(u)).length,0,'no novel text on initial practice load');
    // Hold Nirmala's response, ask for the lesson twice, then switch away
    // and back. Only the newest request may consume a paragraph.
    let release;
    const held=new Promise(r=>release=r);
    await p.route('**/data/books/nirmala.js*',async route=>{await held;await route.continue();});
    await p.evaluate(()=>{bookPos.nirmala=7;textSource='nirmala';regenerateLesson();regenerateLesson();});
    const before=await p.evaluate(()=>({cursor:cursorIndex,correct:sessionCorrect,errors:sessionErrors,pos:bookPos.nirmala}));
    await p.evaluate(()=>handleKeystroke(targetKrutiText[0]));
    assert.deepEqual(await p.evaluate(()=>({cursor:cursorIndex,correct:sessionCorrect,errors:sessionErrors,pos:bookPos.nirmala})),before,'loading ignores typing and preserves resume position');
    await p.click('.lesson-settings summary');await p.click('[data-lstab="words"]');
    assert.equal(await p.evaluate(()=>bookPos.nirmala),7,'leaving loading book must not overwrite resume point');
    await p.click('[data-lstab="books"]');release();
    await p.waitForFunction(()=>Array.isArray(findBook('nirmala').lines)&&textSource==='nirmala'&&!currentLessonText.includes('लोड हो रहा है'));
    assert.equal(await p.evaluate(()=>lastLessonParaStart),7,'newest loading request resumes exactly once');
    assert.equal(await p.evaluate(()=>window.HIKEYBR_BOOKS.filter(b=>b.id==='nirmala').length),1,'loaded entry replaces stub');
    const once=await p.evaluate(()=>({text:currentLessonText,pos:bookPos.nirmala}));
    await p.evaluate(()=>ensureBookLoaded('nirmala'));
    assert.deepEqual(await p.evaluate(()=>({text:currentLessonText,pos:bookPos.nirmala})),once,'cache lookup does not advance');
    // Network failure returns to guided practice; selecting the book again
    // retries and succeeds instead of leaving a permanently stuck promise.
    await p.route('**/data/books/godan.js*',route=>route.abort());
    await p.selectOption('#book-select','godan');
    await p.waitForFunction(()=>textSource==='words');
    await p.unroute('**/data/books/godan.js*');
    await p.click('[data-lstab="books"]');
    await p.waitForFunction(()=>Array.isArray(findBook('godan').lines)&&textSource==='godan');
    assert.deepEqual(errors,[]);
    await browser.close();server.close();console.log('PASS: lazy initial load, delayed input guard, latest request wins, resume preservation, deduplication, retry after failure');
})().catch(e=>{console.error(e);server.close();process.exit(1)});
