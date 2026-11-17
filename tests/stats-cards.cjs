// Test artifacts stay inside the checkout, including on CI.
require('node:fs').mkdirSync('test-results',{recursive:true});
const {chromium}=require('playwright'),assert=require('assert/strict'),path=require('path');
(async()=>{const b=await chromium.launch({headless:true}),p=await b.newPage({viewport:{width:1366,height:900}});await p.goto(process.env.TANKAN_TEST_URL||'file://'+path.resolve(__dirname,'../index.html'));await p.waitForFunction(()=>document.documentElement.dataset.fontReady==='1');
const values=()=>p.evaluate(()=>['metric-wpm','metric-accuracy','metric-wpm-avg','metric-accuracy-avg'].map(id=>document.getElementById(id).textContent));
await p.evaluate(()=>{lessonHistory=[];updateInsights()});assert.deepEqual(await values(),['–','–','–','–']);
await p.evaluate(()=>{lessonHistory=[{wpm:20,acc:90,score:100}];updateInsights()});assert.deepEqual(await values(),['20.0','90.0','20.0','90.0']);
await p.evaluate(()=>{lessonHistory=[{wpm:999,acc:1},...Array.from({length:9},()=>({wpm:30,acc:97,score:400})),{wpm:40,acc:99,score:620}];updateInsights()});assert.deepEqual(await values(),['40.0','99.0','31.0','97.2']);
await p.locator('#hidden-input').focus();await p.keyboard.type('x');await p.evaluate(()=>{sessionStartTime=Date.now()-60000;sessionCorrect=100;updateInsights()});assert.deepEqual(await values(),['40.0','99.0','31.0','97.2'],'unfinished session cannot change completed-result cards');
await p.evaluate(()=>{sessionErrors=0;recordCompletedLesson();updateInsights()});const v=await values();assert.notEqual(v[0],'40.0');assert.notEqual(v[2],'31.0');
for(const width of [1366,390,320]){await p.setViewportSize({width,height:900});assert.ok(await p.locator('#panel-practice > .stats-strip').evaluate(n=>n.scrollWidth<=n.clientWidth),'cards fit '+width);await p.screenshot({path:'test-results/stats-cards-'+width+'.png'});}
console.log('PASS: empty/one/>10 results, arithmetic recent10 averages, unfinished exclusion, completion refresh, desktop/mobile fit');await b.close()})().catch(e=>{console.error(e);process.exit(1)});
