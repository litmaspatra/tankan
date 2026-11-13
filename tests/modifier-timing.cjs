const assert=require('node:assert/strict'),{chromium}=require('playwright'),path=require('node:path');
(async()=>{const browser=await chromium.launch();const page=await browser.newPage();await page.goto('file://'+path.resolve(__dirname,'../index.html'));
const results=await page.evaluate(()=>{
 const original=Date.now;let clock=1000;Date.now=()=>clock;
 const key=(type,key,code,repeat=false)=>el.hiddenInput.dispatchEvent(new KeyboardEvent(type,{key,code,repeat,bubbles:true,cancelable:true,shiftKey:key==='Shift'||pendingShiftTiming.size>0}));
 function reset(){regenerateLesson();unlockedIndex=KEY_PROGRESSION.findIndex(x=>x.k==='#');highestUnlocked=unlockedIndex;targetKrutiText='##########';currentLessonText='रुरुरुरुरुरुरुरुरुरु';sessionStartTime=1000;lastKeystrokeTime=1000;clock=1000;measurementEvents=[];cursorIndex=0;sessionErrors=0;sessionCorrect=0;pendingShiftTiming.clear();}
 function take(){return {ms:measurementEvents.at(-1)?.ms,errors:sessionErrors,elapsed:lessonElapsed(),pending:pendingShiftTiming.size};}
 const out={};
 reset();clock=1200;key('keydown','Shift','ShiftLeft');clock=1600;handleKeystroke('#');out.fresh=take();
 clock=2200;handleKeystroke('#');out.held=take();
 reset();clock=1200;key('keydown','Shift','ShiftLeft');key('keyup','Shift','ShiftLeft');clock=1600;handleKeystroke('#');out.released=take();
 reset();key('keydown','Shift','ShiftLeft');key('keydown','Shift','ShiftRight');clock=1600;handleKeystroke('#');out.both=take();
 reset();key('keydown','Shift','ShiftLeft');key('keydown','Shift','ShiftLeft',true);clock=1600;handleKeystroke('#');out.repeat=take();
 reset();key('keydown','Shift','ShiftLeft');clock=1600;handleKeystroke('d');out.errorPending=pendingShiftTiming.size;clock=2200;handleKeystroke('#');out.afterError=take();
 reset();key('keydown','Shift','ShiftLeft');pauseLesson();out.pausePending=pendingShiftTiming.size;resumeLesson();clock=1600;handleKeystroke('#');out.afterPause=take();
 reset();key('keydown','Shift','ShiftLeft');regenerateLesson();out.restartPending=pendingShiftTiming.size;
 reset();key('keydown','Shift','ShiftLeft');el.hiddenInput.dispatchEvent(new Event('blur'));out.blurPending=pendingShiftTiming.size;
 reset();key('keydown','Shift','ShiftLeft');clock=20000;handleKeystroke('#');out.idle=take();
 Date.now=original;return out;
});
assert.equal(results.fresh.ms,300);assert.equal(results.fresh.elapsed,600);assert.equal(results.fresh.errors,0);assert.equal(results.held.ms,600);assert.equal(results.released.ms,600);assert.equal(results.both.ms,200);assert.equal(results.repeat.ms,300);assert.equal(results.errorPending,0);assert.equal(results.afterError.ms,600);assert.equal(results.pausePending,0);assert.equal(results.afterPause.ms,0);assert.equal(results.restartPending,0);assert.equal(results.blurPending,0);assert.equal(results.idle.ms,0);
await browser.close();console.log('modifier timing ok: fresh/held/released/two Shift/repeat/error/pause/restart/blur/idle, raw elapsed unchanged');})().catch(e=>{console.error(e);process.exit(1)});
