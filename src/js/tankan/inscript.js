/* Inscript (Devanagari, Mangal) practice layout. Isolated from the Remington
   Kruti Dev engine: switching layout reloads the page, and while Inscript is
   active this module owns the keyboard, the lesson text and the stats line.
   Key positions: xkeyboard-config "in(deva)" InScript table. */
(function(){
'use strict';
var KEY='tankan_layout';
var layout=localStorage.getItem(KEY)==='inscript'?'inscript':'kruti';

/* code: [unshifted, shifted] */
var MAP={
Backquote:['\u094a','\u0912'],
Digit1:['\u0967','\u090d'],Digit2:['\u0968','\u0945'],Digit3:['\u0969','#'],Digit4:['\u096a','$'],
Digit5:['\u096b','%'],Digit6:['\u096c','^'],Digit7:['\u096d','&'],Digit8:['\u096e','*'],
Digit9:['\u096f','('],Digit0:['\u0966',')'],
Minus:['-','\u0903'],Equal:['\u0943','\u090b'],
KeyQ:['\u094c','\u0914'],KeyW:['\u0948','\u0910'],KeyE:['\u093e','\u0906'],KeyR:['\u0940','\u0908'],
KeyT:['\u0942','\u090a'],KeyY:['\u092c','\u092d'],KeyU:['\u0939','\u0919'],KeyI:['\u0917','\u0918'],
KeyO:['\u0926','\u0927'],KeyP:['\u091c','\u091d'],BracketLeft:['\u0921','\u0922'],BracketRight:['\u093c','\u091e'],
Backslash:['\u0949','\u0911'],
KeyA:['\u094b','\u0913'],KeyS:['\u0947','\u090f'],KeyD:['\u094d','\u0905'],KeyF:['\u093f','\u0907'],
KeyG:['\u0941','\u0909'],KeyH:['\u092a','\u092b'],KeyJ:['\u0930','\u0931'],KeyK:['\u0915','\u0916'],
KeyL:['\u0924','\u0925'],Semicolon:['\u091a','\u091b'],Quote:['\u091f','\u0920'],
KeyZ:['\u0946','\u090e'],KeyX:['\u0902','\u0901'],KeyC:['\u092e','\u0923'],KeyV:['\u0928','\u0929'],
KeyB:['\u0935','\u0934'],KeyN:['\u0932','\u0933'],KeyM:['\u0938','\u0936'],Comma:[',','\u0937'],
Period:['.','\u0964'],Slash:['\u092f','\u095f'],Space:[' ',' ']
};
/* Shift+5..8 type conjuncts as a shortcut (Inscript standard) */
var SHORT={Digit5:'\u091c\u094d\u091e',Digit6:'\u0924\u094d\u0930',Digit7:'\u0915\u094d\u0937',Digit8:'\u0936\u094d\u0930'};
var SHORTLBL={Digit5:'\u091c\u094d\u091e',Digit6:'\u0924\u094d\u0930',Digit7:'\u0915\u094d\u0937',Digit8:'\u0936\u094d\u0930'};
var LATIN_DIG={'\u0966':'0','\u0967':'1','\u0968':'2','\u0969':'3','\u096a':'4','\u096b':'5','\u096c':'6','\u096d':'7','\u096e':'8','\u096f':'9'};
var ROWS=[
 ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'],
 ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash'],
 ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'],
 ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash']
];
var QLBL=function(c){return c.replace('Key','').replace('Digit','').replace('Backquote','`').replace('Minus','-').replace('Equal','=').replace('BracketLeft','[').replace('BracketRight',']').replace('Backslash','\\').replace('Semicolon',';').replace('Quote',"'").replace('Comma',',').replace('Period','.').replace('Slash','/');};

/* reverse: codepoint string -> {code, shift} (first match wins) */
var REV={};
Object.keys(MAP).forEach(function(c){
  [0,1].forEach(function(s){var ch=MAP[c][s];if(!(ch in REV))REV[ch]={code:c,shift:!!s};});
});
Object.keys(LATIN_DIG).forEach(function(d){REV[LATIN_DIG[d]]=REV[d];});

window.TankanInscript={
  active:layout==='inscript', MAP:MAP, SHORT:SHORT, REV:REV,
  getLayout:function(){return layout;},
  setLayout:function(v){localStorage.setItem(KEY,v==='inscript'?'inscript':'kruti');location.reload();}
};

/* ---------- header layout dropdown (index.html only) ---------- */
function buildChip(){
  var badge=document.querySelector('.brand-badge');
  if(!badge||!document.getElementById('panel-practice'))return;
  var wrap=document.createElement('div');wrap.className='layout-picker';
  var btn=document.createElement('button');btn.type='button';btn.className='brand-badge layout-chip';btn.setAttribute('aria-haspopup','listbox');btn.setAttribute('aria-expanded','false');
  btn.textContent=(layout==='inscript'?'Inscript (Mangal)':'Remington Kruti Dev')+' \u25be';
  var menu=document.createElement('div');menu.className='layout-menu';menu.hidden=true;menu.setAttribute('role','listbox');
  var h=document.createElement('div');h.className='layout-menu-head';h.textContent='Typing layout';menu.appendChild(h);
  [['kruti','Remington Kruti Dev'],['inscript','Inscript (Mangal)']].forEach(function(o){
    var b=document.createElement('button');b.type='button';b.className='layout-opt'+(o[0]===layout?' sel':'');b.setAttribute('role','option');b.textContent=o[1];
    b.addEventListener('click',function(e){e.stopPropagation();if(o[0]!==layout)window.TankanInscript.setLayout(o[0]);else{menu.hidden=true;}});
    menu.appendChild(b);
  });
  var n=document.createElement('div');n.className='layout-menu-note';n.textContent='Each layout keeps its own lesson progress and speed history.';menu.appendChild(n);
  btn.addEventListener('click',function(e){e.stopPropagation();menu.hidden=!menu.hidden;btn.setAttribute('aria-expanded',String(!menu.hidden));});
  menu.addEventListener('click',function(e){e.stopPropagation();});
  document.addEventListener('click',function(){menu.hidden=true;btn.setAttribute('aria-expanded','false');});
  wrap.appendChild(btn);wrap.appendChild(menu);
  badge.parentNode.replaceChild(wrap,badge);
}

/* ---------- Inscript engine ---------- */
function start(){
  buildChip();
  if(layout!=='inscript'||!document.getElementById('panel-practice'))return;
  document.body.classList.add('layout-inscript');
  /* stop the Remington engine from touching the screen */
  ['updateDisplay','renderVirtualKeyboard','updateKeyboardHighlights','regenerateLesson','updateLiveStats','updateMasteryCard','updateAlphabetStrip'].forEach(function(n){
    if(typeof window[n]==='function')window[n]=function(){};
  });
  var canvas=el.canvas, input=el.hiddenInput;
  var statsEl=document.createElement('div');statsEl.className='ins-stats';
  statsEl.innerHTML='<span><b id="ins-wpm">0.0</b> WPM</span><span><b id="ins-acc">100</b>% accuracy</span><span><b id="ins-time">0:00</b> time</span><span class="ins-note">Inscript practice: all keys open. Progress tracking comes later.</span>';
  canvas.parentNode.insertBefore(statsEl,canvas);
  var cps=[],pos=0,errs=0,correct=0,t0=0,done=false,clusters=[],shiftDown=false;
  var seg=(typeof Intl!=='undefined'&&Intl.Segmenter)?new Intl.Segmenter('hi',{granularity:'grapheme'}):null;
  var timer=null;

  function typeable(w){
    var s=w.normalize('NFD').replace(/[\u200c\u200d]/g,'');
    return s.length>0&&[].every.call(s,function(c){return c in REV;});
  }
  function pool(){
    var src=[].concat(typeof FREQUENCY_WORDS!=='undefined'?FREQUENCY_WORDS:[],typeof OFFICIAL_WORDS!=='undefined'?OFFICIAL_WORDS:[]);
    var seen={},out=[];
    src.forEach(function(w){
      if(seen[w])return;seen[w]=1;
      if(typeof isSuitableWord==='function'&&!isSuitableWord(w))return;
      if(/[A-Za-z]/.test(w)||!typeable(w))return;
      out.push(w);
    });
    return out;
  }
  var POOL=null;
  function newLesson(){
    if(!POOL)POOL=pool();
    var n=20,words=[];
    for(var i=0;i<n;i++)words.push(POOL[Math.floor(Math.random()*POOL.length)]);
    var text=words.join(' ').normalize('NFD').replace(/[\u200c\u200d]/g,'');
    cps=Array.from(text);pos=0;errs=0;correct=0;t0=0;done=false;window.__insDur=0;
    clusters=[];
    var idx=0,str=text;
    var parts=seg?Array.from(seg.segment(str),function(s){return s.segment;}):cps;
    parts.forEach(function(p){var l=Array.from(p).length;clusters.push([idx,idx+l]);idx+=l;});
    clearInterval(timer);timer=setInterval(stats,500);
    render();stats();hint();
  }
  function stats(){
    var s=t0&&!done?(Date.now()-t0):(window.__insDur||0);
    if(!t0)s=0;
    var min=s/60000,w=(s>=1500&&correct>=3)?Math.min((correct/5)/min,300):0,tot=correct+errs;
    document.getElementById('ins-wpm').textContent=w.toFixed(1);
    document.getElementById('ins-acc').textContent=tot?(correct/tot*100).toFixed(0):'100';
    var sec=Math.floor(s/1000);document.getElementById('ins-time').textContent=Math.floor(sec/60)+':'+('0'+sec%60).slice(-2);
  }
  function render(flash){
    var ci=0;for(var i=0;i<clusters.length;i++){if(pos>=clusters[i][0]&&pos<clusters[i][1]){ci=i;break;}if(pos>=clusters[i][1])ci=i+1;}
    var cs=ci<clusters.length?clusters[ci][0]:cps.length,ce=ci<clusters.length?clusters[ci][1]:cps.length;
    el.textCorrect.textContent=cps.slice(0,cs).join('');
    el.textError.textContent='';
    el.textCurrent.textContent=cps.slice(cs,ce).join('');
    el.textCurrent.classList.toggle('space-cursor',cps[cs]===' ');
    el.textCurrent.classList.toggle('error-flash',!!flash);
    el.textRemaining.textContent=cps.slice(ce).join('');
    [el.textCorrect,el.textCurrent,el.textRemaining].forEach(function(e){e.style.fontFamily="'Noto Sans Devanagari','Mangal',sans-serif";});
    if(done){el.textCurrent.textContent='';}
  }
  /* keyboard */
  var keyEls={};
  function drawKb(){
    var f=el.keyboardFrame;f.innerHTML='';keyEls={};
    var widths=[null,'w-tab',null,null];
    ROWS.forEach(function(r,ri){
      var row=document.createElement('div');row.className='k-row';
      if(ri===3){var sl=document.createElement('div');sl.className='k-key label-key w-shift-l';sl.innerHTML='<span class="hi-main">\u21e7 Shift</span>';row.appendChild(sl);keyEls.ShiftLeft=sl;}
      r.forEach(function(c){
        var k=document.createElement('div');k.className='k-key';
        var lbl=SHORTLBL[c]||MAP[c][1];
        k.innerHTML='<span class="hi-shift">'+(/[\u0900-\u097f]/.test(MAP[c][1])||SHORTLBL[c]?lbl:'')+'</span><span class="hi-main">'+(MAP[c][0]==='\u094d'?'\u25cc\u094d':(/[\u093e-\u094f\u0900-\u0903\u093c\u0941-\u0948]/.test(MAP[c][0])&&MAP[c][0]!=='\u0930'?'\u25cc'+MAP[c][0]:MAP[c][0]))+'</span><span class="en-sub">'+QLBL(c)+'</span>';
        if(c==='KeyF'||c==='KeyJ')k.classList.add('bump');
        row.appendChild(k);keyEls[c]=k;
      });
      if(ri===3){var sr=document.createElement('div');sr.className='k-key label-key w-shift-r';sr.innerHTML='<span class="hi-main">\u21e7 Shift</span>';row.appendChild(sr);keyEls.ShiftRight=sr;}
      f.appendChild(row);
    });
    var sp=document.createElement('div');sp.className='k-row';
    sp.innerHTML='<div class="k-spacer" style="flex-grow:1.9"></div><div class="k-key label-key w-space"><span class="hi-main">Space</span></div><div class="k-spacer" style="flex-grow:1.9"></div>';
    f.appendChild(sp);keyEls.Space=sp.querySelector('.w-space');
  }
  function hint(){
    Object.keys(keyEls).forEach(function(c){keyEls[c].classList.remove('target','shift-needed');});
    if(done||pos>=cps.length){if(el.liveHintKey)el.liveHintKey.textContent='\u21b5';if(el.liveHintChar)el.liveHintChar.textContent='next lesson';if(el.liveHintDetail)el.liveHintDetail.textContent='Press Enter';return;}
    var ch=cps[pos],r=REV[ch];
    if(!r)return;
    var ke=keyEls[r.code];if(ke)ke.classList.add('target');
    if(r.shift&&keyEls.ShiftLeft){keyEls.ShiftLeft.classList.add('shift-needed');keyEls.ShiftRight.classList.add('shift-needed');}
    if(el.liveHintKey)el.liveHintKey.textContent=(r.shift?'Shift+':'')+QLBL(r.code);
    if(el.liveHintChar)el.liveHintChar.textContent=ch===' '?'space':(ch==='\u094d'?'\u25cc\u094d (halant)':ch==='\u093c'?'\u25cc\u093c (nukta)':ch);
    if(el.liveHintDetail)el.liveHintDetail.textContent='';
  }
  function produce(e){
    var m=MAP[e.code];if(!m)return null;
    if(e.shiftKey&&SHORT[e.code])return [SHORT[e.code],m[1]];
    var out=m[e.shiftKey?1:0];
    return [out];
  }
  function onKey(e){
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Shift'||e.key==='CapsLock'||e.key==='Tab')return;
    if(e.key==='Enter'){e.preventDefault();if(done||pos>=cps.length){newLesson();}return;}
    if(e.key==='Backspace'){e.preventDefault();return;}
    if(e.key==='Escape'){e.preventDefault();newLesson();return;}
    var opts=produce(e);
    if(!opts)return;
    e.preventDefault();
    if(done)return;
    if(!t0)t0=Date.now();
    var ok=false;
    for(var i=0;i<opts.length&&!ok;i++){
      var s=opts[i],variants=[s];
      if(LATIN_DIG[s])variants.push(LATIN_DIG[s]);
      for(var j=0;j<variants.length;j++){
        var v=variants[j],a=Array.from(v);
        if(cps.slice(pos,pos+a.length).join('')===v){pos+=a.length;correct+=a.length;ok=true;break;}
      }
    }
    if(!ok){errs++;render(true);setTimeout(function(){el.textCurrent.classList.remove('error-flash');},250);stats();return;}
    if(pos>=cps.length){done=true;window.__insDur=Date.now()-t0;clearInterval(timer);}
    render();stats();hint();
    var k=keyEls[e.code];if(k){k.classList.add('pressed');setTimeout(function(){k.classList.remove('pressed');},100);}
  }
  /* capture so the Kruti Dev dispatcher never sees the key */
  input.addEventListener('keydown',function(e){e.stopImmediatePropagation();onKey(e);},true);
  input.addEventListener('input',function(e){e.stopImmediatePropagation();input.value='';},true);
  /* hide Remington-only hint text */
  var hs=document.getElementById('live-hint-strip');if(hs)hs.hidden=false;
  drawKb();newLesson();
  var ch=document.getElementById('canvas-hint-text');if(ch)ch.textContent='Start typing';
  window.TankanInscript._state=function(){return {pos:pos,len:cps.length,errs:errs,correct:correct,done:done,text:cps.join('')};};
  window.TankanInscript._setText=function(t){cps=Array.from(t.normalize('NFD'));clusters=[];var seg2=seg?Array.from(seg.segment(cps.join('')),function(s){return s.segment;}):cps;var i=0;seg2.forEach(function(p){var l=Array.from(p).length;clusters.push([i,i+l]);i+=l;});pos=0;errs=0;correct=0;t0=0;done=false;window.__insDur=0;render();hint();stats();};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
