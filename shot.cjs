const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 await page.goto('file:///tmp/tankan/index.html');
 await page.evaluate(()=>{localStorage.clear();
   const KP=HiKeybr.KEY_PROGRESSION;const idx=KP.findIndex(it=>it.h==='त्र');const k=KP[idx].k;
   const ks={};ks[k]={modelSamples:458,modelBest:352,modelTtt:352,lastAccuracy:85.3,recentLessonAccuracy:85.3};
   localStorage.setItem('hikeybr_store_v3',JSON.stringify({unlockedIndex:idx,highestUnlocked:idx,targetSpeedGoal:40,keyStats:ks}));
 });
 await page.reload();await page.waitForTimeout(600);
 await page.screenshot({path:'/downloads/tankan-banked-label.png',clip:{x:0,y:0,width:1366,height:170}});
 await browser.close();
})();
