/* Inscript (Devanagari, Mangal) practice layout with keybr-style guided
   progression. Mirrors the Remington Kruti Dev engine's mechanics, with a
   measurement model re-derived for Unicode typing ("measurements differ"):
   - the trained unit is one keystroke producing one Unicode codepoint in
     logical (phonetic) order: matras, halant and nukta are keystrokes of
     their own, unlike Kruti Dev bytes;
   - per-key speed = trimmed mean of clean time-to-type samples, with the
     extra Shift press discounted keybr-style, and the conjunct shortcuts
     (Shift+5..8) split evenly across the codepoints they produce;
   - a key unlocks when its banked best (95%+ accuracy lessons only) reaches
     the goal, with 10+ cumulative clean samples and a recent 95%+ lesson;
     keys that already meet the bar advance automatically (at load and at
     lesson end), so a migrated store walks straight to its real frontier;
   - WPM = correct codepoints / 5 / minutes: honestly lower than Kruti Dev
     for the same fluency, because Inscript needs more keystrokes per word.
   Progress lives in a separate store: each layout keeps its own stats.
   Key positions: xkeyboard-config "in(deva)" InScript table. */
(function(){
'use strict';
var KEY='tankan_layout';
var layout=localStorage.getItem(KEY)==='inscript'?'inscript':'kruti';

/* code: [unshifted, shifted] */
var MAP={
Backquote:['ौ','ऒ'],
Digit1:['१','ऍ'],Digit2:['२','ॅ'],Digit3:['३','#'],Digit4:['४','$'],
Digit5:['५','%'],Digit6:['६','^'],Digit7:['७','&'],Digit8:['८','*'],
Digit9:['९','('],Digit0:['०',')'],
Minus:['-','ः'],Equal:['ृ','ऋ'],
KeyQ:['ौ','औ'],KeyW:['ै','ऐ'],KeyE:['ा','आ'],KeyR:['ी','ई'],
KeyT:['ू','ऊ'],KeyY:['ब','भ'],KeyU:['ह','ङ'],KeyI:['ग','घ'],
KeyO:['द','ध'],KeyP:['ज','झ'],BracketLeft:['ड','ढ'],BracketRight:['़','ञ'],
Backslash:['ॉ','ऑ'],
KeyA:['ो','ओ'],KeyS:['े','ए'],KeyD:['्','अ'],KeyF:['ि','इ'],
KeyG:['ु','उ'],KeyH:['प','फ'],KeyJ:['र','ऱ'],KeyK:['क','ख'],
KeyL:['त','थ'],Semicolon:['च','छ'],Quote:['ट','ठ'],
KeyZ:['ॆ','ऎ'],KeyX:['ं','ँ'],KeyC:['म','ण'],KeyV:['न','ऩ'],
KeyB:['व','ऴ'],KeyN:['ल','ळ'],KeyM:['स','श'],Comma:[',','ष'],
Period:['.','।'],Slash:['य','य़'],Space:[' ',' ']
};
/* Shift+5..8 type conjuncts as a shortcut (Inscript standard) */
var SHORT={Digit5:'ज्ञ',Digit6:'त्र',Digit7:'क्ष',Digit8:'श्र'};
var SHORTLBL={Digit5:'ज्ञ',Digit6:'त्र',Digit7:'क्ष',Digit8:'श्र'};
var LATIN_DIG={'०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'};
var ROWS=[
 ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'],
 ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight','Backslash'],
 ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'],
 ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash']
];
var QLBL=function(c){return c.replace('Key','').replace('Digit','').replace('Backquote','`').replace('Minus','-').replace('Equal','=').replace('BracketLeft','[').replace('BracketRight',']').replace('Backslash','\\').replace('Semicolon',';').replace('Quote',"'").replace('Comma',',').replace('Period','.').replace('Slash','/');};
var FINGERS={Backquote:'Left Pinky',Digit1:'Left Pinky',KeyQ:'Left Pinky',KeyA:'Left Pinky',KeyZ:'Left Pinky',
Digit2:'Left Ring',KeyW:'Left Ring',KeyS:'Left Ring',KeyX:'Left Ring',
Digit3:'Left Middle',KeyE:'Left Middle',KeyD:'Left Middle',KeyC:'Left Middle',
Digit4:'Left Index',Digit5:'Left Index',KeyR:'Left Index',KeyT:'Left Index',KeyF:'Left Index',KeyG:'Left Index',KeyV:'Left Index',KeyB:'Left Index',
Digit6:'Right Index',Digit7:'Right Index',KeyY:'Right Index',KeyU:'Right Index',KeyH:'Right Index',KeyJ:'Right Index',KeyN:'Right Index',KeyM:'Right Index',
Digit8:'Right Middle',KeyI:'Right Middle',KeyK:'Right Middle',Comma:'Right Middle',
Digit9:'Right Ring',KeyO:'Right Ring',KeyL:'Right Ring',Period:'Right Ring',
Digit0:'Right Pinky',Minus:'Right Pinky',Equal:'Right Pinky',KeyP:'Right Pinky',BracketLeft:'Right Pinky',BracketRight:'Right Pinky',Backslash:'Right Pinky',Semicolon:'Right Pinky',Quote:'Right Pinky',Slash:'Right Pinky'};

/* reverse: codepoint -> {code, shift}. ौ prefers Q over the backquote key. */
var REV={};
Object.keys(MAP).forEach(function(c){
  [0,1].forEach(function(s){var ch=MAP[c][s];if(!(ch in REV))REV[ch]={code:c,shift:!!s};});
});
Object.keys(LATIN_DIG).forEach(function(d){REV[LATIN_DIG[d]]=REV[d];});
REV['ौ']={code:'KeyQ',shift:false};

/* ── Progression: Hindi letter-frequency order (Kartik's 2026-11-06 design:
   क र ा ि त े स न म ल ह य प ी द …, then the rest by commonness). Each entry
   trains one Unicode codepoint; the physical key comes from REV. Rare
   glyphs no modern word needs (ऒ ॆ ऎ ऍ ङ ऴ ऱ ऩ य़) and Latin punctuation
   stay out of the progression entirely. Digits train last, as number
   drills. ── */
var PROGRESSION=[
 ['क','Ka'],['र','Ra'],['ा','Aa matra'],['ि','Chhoti I matra'],
 ['त','Ta'],['े','E matra'],['स','Sa'],['न','Na'],['म','Ma'],['ल','La'],
 ['ह','Ha'],['य','Ya'],['प','Pa'],['ी','Badi Ee matra'],['द','Da'],
 ['ु','Chhoti U matra'],['ब','Ba'],['ग','Ga'],['व','Va'],['्','Halant'],
 ['अ','A vowel'],['ं','Anusvara (bindu)'],['ज','Ja'],['ख','Kha'],['फ','Pha'],
 ['ो','O matra'],['ौ','Au matra'],['ू','Badi Oo matra'],['ट','Tta'],['च','Cha'],
 ['श','Sha'],['भ','Bha'],['आ','Aa vowel'],['ध','Dha'],['ण','Retroflex Na'],
 ['ए','E vowel'],['इ','I vowel'],['थ','Tha'],['घ','Gha'],['ष','Retroflex Sha'],
 ['ै','Ai matra'],['ई','Badi Ee vowel'],['उ','U vowel'],['ँ','Chandrabindu'],
 ['़','Nukta'],['ड','Dda'],['ठ','Ttha'],['ढ','Ddha'],['छ','Chha'],['झ','Jha'],
 ['औ','Au vowel'],['ऊ','Badi Oo vowel'],['ऐ','Ai vowel'],['ओ','O vowel'],
 ['ृ','Ri matra'],['ॅ','Candra E'],['ॉ','Candra O'],['।','Danda'],['ः','Visarga'],
 ['ऋ','Ri vowel'],['ऑ','Candra O vowel'],['ळ','Retroflex La'],['ञ','Nya (for ज्ञ)'],
 ['१','Digit 1'],['२','Digit 2'],['३','Digit 3'],['४','Digit 4'],['५','Digit 5'],
 ['६','Digit 6'],['७','Digit 7'],['८','Digit 8'],['९','Digit 9'],['०','Digit 0']
];
/* ── Inscript unlock order (2026-11-27, Kartik: "home row keys will unlock
   first"). Keys follow the keyboard, not Kruti Dev's frequency order: home
   row first (the two index/middle consonants र क lead), then the top row,
   then the bottom row, then Shift letters row by row, then rare marks and
   digits. Within a row, the commoner letter comes first. ── */
var OLD_ORDER=PROGRESSION.map(function(p){return p[0];});
/* order shipped as ord:2 (home row led by र क त ु, three keys on one hand) */
var ORD2=['र','क','त','ु','ि','्','प','च','े','ो','ट'];
var NEW_ORDER=[
 'र','ि','क','ु','त','्','प','े','च','ो','ट',                    /* home row, hands alternate (right, left, ...), commoner keys first */
 'ा','ब','ज','ह','ी','ग','द','ू','ै','ौ','ड','़',                /* top row */
 'ल','न','म','स','य','व','ं',                                    /* bottom row */
 'अ','ख','उ','थ','ए','फ','इ','ठ','छ','ओ',                      /* Shift: home row */
 'आ','ई','ऊ','ऐ','औ','भ','घ','ध','झ','ढ','ञ',                  /* Shift: top row */
 'ण','ष','श','ळ','ँ',                                            /* Shift: bottom row */
 'ृ','ॅ','ॉ','।','ः','ऋ','ऑ',                                    /* rare marks */
 '१','२','३','४','५','६','७','८','९','०'
];
(function(){
  var by={};PROGRESSION.forEach(function(p){by[p[0]]=p;});
  var out=NEW_ORDER.map(function(c){return by[c];});
  /* never drop an entry by accident */
  PROGRESSION.forEach(function(p){if(out.indexOf(p)<0)out.push(p);});
  PROGRESSION=out;
})();
PROGRESSION=PROGRESSION.map(function(p,i){
  var r=REV[p[0]];
  return {cp:p[0],d:p[1],code:r?r.code:null,shift:r?r.shift:false,finger:r?(FINGERS[r.code]||''):'',i:i};
});
var LAST=PROGRESSION.length-1, INITIAL=4;
var NEEDS_DOT=/^[ऀ-ः़-्]/; // combining marks shown on a dotted circle
function disp(cp){return NEEDS_DOT.test(cp)?'◌'+cp:cp;}
function isDigitCp(cp){return cp>='०'&&cp<='९';}

/* ── separate store: layout progress never mixes ──
   The key carries the hikeybr_ prefix so the backup sweep and account sync
   collect it together with the Remington store. The launch-day name
   (tankan_inscript_v1) is migrated on first load. */
/* practice-text fonts for Unicode Hindi (the Kruti Dev fonts only draw Kruti-encoded text) */
var INS_FONTS={
  sans:{label:'Noto Sans Devanagari',stack:"'Noto Sans Devanagari','Mangal',sans-serif"},
  serif:{label:'Noto Serif Devanagari',stack:"'Noto Serif Devanagari','Mangal',serif"},
  mangal:{label:'Mangal',stack:"'Mangal','Nirmala UI','Kohinoor Devanagari','Noto Sans Devanagari',sans-serif"},
  system:{label:'System default',stack:"system-ui,'Nirmala UI','Kohinoor Devanagari','Noto Sans Devanagari',sans-serif"}
};
function fontStack(){return (INS_FONTS[S&&S.font]||INS_FONTS.sans).stack;}
var STORE='hikeybr_inscript_v1', OLD_STORE='tankan_inscript_v1';
var S;
function freshState(){return {ord:3,font:'sans',u:INITIAL-1,h:INITIAL-1,goal:25,ks:{},kl:{},lessons:[],bestWpm:0,bestAcc:0,bestScore:0,streak:0,bestStreak:0,total:0,secs:0,typed:0,terr:0,daily:{}};}
function save(){try{localStorage.setItem(STORE,JSON.stringify(S));}catch(e){}
  try{window.dispatchEvent(new Event('tankan-progress-changed'));}catch(e){}}
function load(){
  S=freshState();
  try{
    var raw=localStorage.getItem(STORE),migrated=false;
    if(raw===null){
      var old=localStorage.getItem(OLD_STORE);
      if(old!==null){raw=old;migrated=true;}
    }
    var d=JSON.parse(raw||'null');
    if(d){
      if(d.ord!==3&&Number.isInteger(d.h)){
        /* store from an older unlock order: keep every unlocked key unlocked.
           ord 2 only reordered the home row (ORD2 first, rest unchanged), anything
           older used the frequency order. New h = last position in the new order of
           any key unlocked before. */
        var prev=d.ord===2?ORD2.concat(NEW_ORDER.filter(function(c){return ORD2.indexOf(c)<0;})):OLD_ORDER;
        var newIdx={};PROGRESSION.forEach(function(it,i){newIdx[it.cp]=i;});
        var hi=INITIAL-1;
        for(var oi=0;oi<=Math.min(d.h,prev.length-1);oi++){var ni=newIdx[prev[oi]];if(ni>hi)hi=ni;}
        var cur=Number.isInteger(d.u)?newIdx[prev[d.u]]:undefined;
        d.h=hi;d.u=cur===undefined?hi:Math.min(cur,hi);migrated=true;
      }
      if(Number.isInteger(d.u))S.u=Math.max(0,Math.min(d.u,LAST));
      if(Number.isInteger(d.h))S.h=Math.max(INITIAL-1,Math.min(d.h,LAST));
      if(S.u>S.h)S.u=S.h;
      if(typeof d.goal==='number'&&d.goal>=10&&d.goal<=100)S.goal=d.goal;
      if(typeof d.font==='string'&&INS_FONTS[d.font])S.font=d.font;
      if(d.ks&&typeof d.ks==='object')S.ks=d.ks;
      if(d.kl&&typeof d.kl==='object')S.kl=d.kl;
      if(Array.isArray(d.lessons))S.lessons=d.lessons.slice(-400);
      S.bestWpm=d.bestWpm||0;S.bestAcc=d.bestAcc||0;S.bestScore=d.bestScore||0;
      S.streak=d.streak||0;S.bestStreak=d.bestStreak||0;S.total=d.total||0;
      S.secs=typeof d.secs==='number'?d.secs:0;
      S.typed=d.typed||0;S.terr=d.terr||0;
      if(d.daily&&typeof d.daily==='object')S.daily=d.daily;
    }
    /* auto-advance keys that already meet the unlock bar (see advanceFrontier):
       fixes migrated stores whose target sat below already-mastered keys */
    var walked=advanceFrontier();
    if(migrated||walked.length){save();try{if(migrated)localStorage.removeItem(OLD_STORE);}catch(e){}}
  }catch(e){}
}
load(); /* load at boot in both layouts: Profile shows Inscript stats either way */
function ks(cp){return S.ks[cp]||(S.ks[cp]={hits:0,errors:0,modelSamples:0,modelTtt:0,modelBest:0,accurateBest:0,lastAccuracy:0,recentLessonAccuracy:0,lastLessonWpm:0,targetLessons:0});}
function targetMs(){return 12000/S.goal;}
function target(){return PROGRESSION[review?reviewIdx:S.u];}
var review=false, reviewIdx=0, showAll=false;

/* unlock state of the current target key */
function unlockState(){
  var it=target(),st=ks(it.cp),tm=targetMs();
  var samples=st.modelSamples||0;
  var measuredBest=[st.accurateBest,st.modelBest,st.modelTtt].filter(function(v){return v>0&&isFinite(v);}).reduce(function(a,b){return Math.min(a,b);},Infinity);
  var bank=st.accurateBest>0?tm/st.accurateBest:0;
  var recentAcc=(st.recentLessonAccuracy||st.lastAccuracy||0)>=95;
  var starterReady=S.u>=INITIAL||PROGRESSION.slice(0,INITIAL).every(function(x){
    var z=S.ks[x.cp];return z&&(z.modelSamples||0)>=10&&(z.lastAccuracy||0)>=95&&z.accurateBest>0&&z.accurateBest<=tm;
  });
  var ready=bank>=1&&samples>=10&&recentAcc&&starterReady;
  var pct=ready?100:Math.min(99,Math.round(Math.min(samples/10,isFinite(measuredBest)?tm/measuredBest:0)*100));
  return {samples:samples,bank:bank,measuredBest:measuredBest,recentAccuracy:recentAcc,starterReady:starterReady,ready:ready,pct:pct};
}
/* walk past consecutive already-qualified keys: an order migration can leave
   the target below keys the user has already mastered; each one still has to
   meet the full bar (banked best at goal, 10+ clean samples, recent 95%+
   accuracy, starters calibrated) */
function advanceFrontier(){
  var moved=[];
  while(S.u<LAST&&unlockState().ready){moved.push(target().cp);S.u++;S.h=Math.max(S.h,S.u);}
  return moved;
}
/* live readiness: banked + this lesson's clean timings for the target */
var lessonEvents=[];
function livePreview(st){
  var cp=target().cp,times=lessonEvents.filter(function(e){return e.cp===cp&&e.ms>0&&!e.typo;}).map(function(e){return e.ms;});
  if(!times.length)return {pct:st.ready?100:Math.min(99,Math.round(Math.min(st.samples/10,st.measuredBest===Infinity?0:targetMs()/st.measuredBest)*100)),live:0};
  var mean=trimMean(times);
  return {pct:Math.min(99,Math.round(Math.min((st.samples+times.length)/10,targetMs()/mean)*100)),live:times.length};
}
function trimMean(times){
  var sorted=times.slice().sort(function(a,b){return a-b;}),trim=sorted.length>=10?Math.floor(sorted.length*.1):0;
  var f=sorted.slice(trim,sorted.length-trim);
  return f.reduce(function(a,b){return a+b;},0)/Math.max(1,f.length);
}
/* keybr heat level 0..3 from smoothed time-to-type vs goal */
function heatOf(cp){
  var st=S.ks[cp];
  if(!st||!st.modelTtt||(st.modelSamples||0)<6)return 0;
  var conf=targetMs()/st.modelTtt;
  if(conf>=1&&(st.lastAccuracy||0)>=95)return 3;
  if(conf>=.8)return 2;
  return 1;
}
/* weakest unlocked key below 80% of goal (practice focus), target excluded */
function weakKey(){
  var tm=targetMs(),cur=target().cp,best=null;
  PROGRESSION.slice(0,S.h+1).forEach(function(it){
    if(it.cp===cur)return;
    var st=S.ks[it.cp];
    if(!st||!st.modelTtt||(st.modelSamples||0)<6)return;
    if(st.modelTtt<=tm/0.8)return;
    if(!best||st.modelTtt>S.ks[best.cp].modelTtt)best=it;
  });
  return best;
}

/* ── word pool ── */
var POOL=null;
function norm(w){return w.normalize('NFD').replace(/[‌‍]/g,'');}
function pool(){
  if(POOL)return POOL;
  var src=[].concat(typeof FREQUENCY_WORDS!=='undefined'?FREQUENCY_WORDS:[],typeof OFFICIAL_WORDS!=='undefined'?OFFICIAL_WORDS:[]);
  var seen={},out=[];
  src.forEach(function(w){
    if(seen[w])return;seen[w]=1;
    if(typeof isSuitableWord==='function'&&!isSuitableWord(w))return;
    if(/[A-Za-z]/.test(w))return;
    var s=norm(w);
    if(!s.length)return;
    var ok=true;
    Array.from(s).forEach(function(c){if(!(c in REV)&&c!==' ')ok=false;});
    if(ok)out.push(w);
  });
  POOL=out;return out;
}
function unlockedSet(){
  var set={};
  PROGRESSION.slice(0,S.h+1).forEach(function(it){set[it.cp]=1;});
  return set;
}
var eligCache={};
function eligibleWords(){
  var key=S.h;
  if(eligCache[key])return eligCache[key];
  var set=unlockedSet();
  var out=pool().filter(function(w){
    var s=norm(w),ok=true;
    Array.from(s).forEach(function(c){if(!set[c])ok=false;});
    return ok;
  });
  eligCache[key]=out;return out;
}
function unlockedDigits(){return PROGRESSION.slice(0,S.h+1).map(function(it){return it.cp;}).filter(isDigitCp);}

/* ── lesson generation (real words first; every word carries the target key
   when the pool allows; weak unlocked keys get a review quota; after the
   final key is trained, lessons rotate over the five slowest keys) ── */
var recentWords=[];
function drawFactory(){
  var decks=new Map(),recent=new Set(recentWords);
  var shuffle=function(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}return a;};
  return function draw(poolArr,previous){
    if(!poolArr||!poolArr.length)return null;
    var deck=decks.get(poolArr);
    if(!deck){var cards=poolArr.filter(function(w){return !recent.has(w);});deck={cards:shuffle(cards.length?cards:poolArr.slice()),i:0};decks.set(poolArr,deck);}
    if(deck.i>=deck.cards.length){deck.cards=shuffle(poolArr.slice());deck.i=0;}
    if(deck.cards[deck.i]===previous){
      if(deck.i+1<deck.cards.length){var t=deck.cards[deck.i];deck.cards[deck.i]=deck.cards[deck.i+1];deck.cards[deck.i+1]=t;}
      else return null;
    }
    return deck.cards[deck.i++];
  };
}
function numToken(mustCp,digits){
  var len=1+Math.floor(Math.random()*2),out='';
  for(var i=0;i<len;i++)out+=digits[Math.floor(Math.random()*digits.length)];
  if(out.indexOf(mustCp)<0)out=out.slice(0,len-1)+mustCp;
  return out;
}
function lessonText(count){
  count=count||20;
  var it=target(),tcp=it.cp;
  var eligible=eligibleWords();
  var focused=eligible.filter(function(w){return norm(w).indexOf(tcp)>=0;});
  var context=eligible.filter(function(w){return norm(w).indexOf(tcp)<0;});
  var draw=drawFactory();
  var weak=review?null:weakKey();
  var reviewPool=weak?focused.filter(function(w){return norm(w).indexOf(weak.cp)>=0;}):[];
  var reviewQuota=reviewPool.length?Math.ceil(count*.6):0;
  var mixedStarters=!review&&S.h===INITIAL-1;
  var finalTrained=(S.ks[PROGRESSION[LAST].cp]||{}).targetLessons>=3;
  var allUnlocked=!review&&S.h>=LAST&&finalTrained;
  var weakRotation=allUnlocked?PROGRESSION.slice(0,S.h+1).filter(function(x){var st=S.ks[x.cp];return st&&(st.modelSamples||0)>=6;}).sort(function(a,b){return (S.ks[b.cp].modelTtt||0)-(S.ks[a.cp].modelTtt||0);}).slice(0,5):[];
  var weakTurn=0,reviewWords=0;
  var digits=unlockedDigits();
  var starterCounts={};PROGRESSION.slice(0,S.h+1).forEach(function(x){starterCounts[x.cp]=0;});
  var starterPools={};
  var words=[],previous='';
  for(var w=0;w<count;w++){
    var chosen=null;
    if(mixedStarters){
      var needy=PROGRESSION.slice(0,S.h+1).filter(function(x){return (starterCounts[x.cp]||0)<3;});
      if(needy.length){
        var least=needy.reduce(function(a,b){return (starterCounts[a.cp]||0)<=(starterCounts[b.cp]||0)?a:b;});
        if(!starterPools[least.cp])starterPools[least.cp]=eligible.filter(function(word){return norm(word).indexOf(least.cp)>=0;});
        /* Inscript is typed in logical order: a starving matra drills AFTER a
           base consonant (कि, का), never as a leading mark (िक, ाक). */
        chosen=draw(starterPools[least.cp],previous)||draw(eligible,previous)||(NEEDS_DOT.test(least.cp)?PROGRESSION[0].cp+least.cp:least.cp+PROGRESSION[0].cp);
      }else chosen=draw(eligible,previous)||previous;
      if(chosen)Array.from(norm(chosen)).forEach(function(c){if(c in starterCounts)starterCounts[c]++;});
    }else if(allUnlocked){
      if(weakRotation.length){
        var wk=weakRotation[weakTurn++%weakRotation.length];
        if(!starterPools['w:'+wk.cp])starterPools['w:'+wk.cp]=isDigitCp(wk.cp)?[]:eligible.filter(function(word){return norm(word).indexOf(wk.cp)>=0;});
        chosen=isDigitCp(wk.cp)?numToken(wk.cp,digits):(draw(starterPools['w:'+wk.cp],previous)||draw(eligible,previous)||previous);
      }else chosen=draw(eligible,previous)||previous;
    }else if(isDigitCp(tcp)){
      chosen=digits.length?numToken(tcp,digits):tcp+tcp;
      if(w%3===2){var c2=draw(eligible,previous);if(c2&&c2!==previous)chosen=c2;}
    }else if(reviewWords<reviewQuota){
      chosen=draw(reviewPool,previous)||draw(focused,previous)||draw(eligible,previous);
      if(chosen&&norm(chosen).indexOf(weak.cp)>=0)reviewWords++;
    }else if(focused.length){
      chosen=draw(focused,previous)||previous;
    }else{
      var ctx=draw(eligible,previous)||PROGRESSION[0].cp;
      chosen=(NEEDS_DOT.test(tcp)?PROGRESSION[0].cp+tcp:tcp+tcp)+' '+ctx;
    }
    if(chosen===null)chosen=previous||tcp;
    words.push(chosen);previous=chosen;
  }
  /* variety for tiny pools: a context word every fourth slot */
  if(!mixedStarters&&focused.length>0&&focused.length<4&&context.length>0){
    for(var i=3;i<words.length;i+=4){
      var c=draw(context,words[i-1]),tries=0;
      while(c&&(c===words[i-1]||c===words[i+1])&&tries++<3)c=draw(context,words[i-1]);
      if(c&&c!==words[i-1]&&c!==words[i+1])words[i]=c;
    }
  }
  recentWords=recentWords.concat(words).slice(-150);
  var st=document.getElementById('word-pool-status');
  if(st){
    var note=focused.length.toLocaleString()+' target words / '+eligible.length.toLocaleString()+' usable at this level';
    if(mixedStarters)note+=' · Mixed starter practice: क, र, ा, ि.';
    else if(allUnlocked)note+=weakRotation.length?' · All keys unlocked: lessons target your weakest keys ('+weakRotation.map(function(x){return disp(x.cp);}).join(', ')+').':' · All keys unlocked: full-bank practice.';
    else if(isDigitCp(tcp))note+=' · Number drill.';
    else if(!focused.length)note+=' · New key plus unlocked-word practice.';
    else if(focused.length<4)note+=' · Tiny target pool: context words mixed in for variety.';
    else if(focused.length<count)note+=' · Small target pool: some repetition needed.';
    if(review)note+=' · Reviewing '+disp(tcp)+'.';
    st.textContent=note;
  }
  lastFocus=(reviewWords>0&&weak)?weak.cp:null;
  return words.join(' ');
}
var lastFocus=null;

/* Normalized stats for the Profile tab, same shape the Remington source
   produces (see adaptive.js krutiProfileSource). Available in both layout
   modes because load() ran at boot. */
function profileSource(){
  var keys=PROGRESSION.map(function(it,idx){
    var st=S.ks[it.cp]||{};
    var kh=(S.kl||{})[it.cp]||{};
    return {
      id:it.cp, label:disp(it.cp),
      sub:it.code?((it.shift?'Shift+':'')+QLBL(it.code).toUpperCase()):'',
      finger:it.finger||'',
      hits:st.hits||0, errors:st.errors||0,
      modelTtt:st.modelTtt||0, modelSamples:st.modelSamples||0,
      speeds:kh.speeds||[],
      locked:idx>S.h, current:idx===S.u, mastered:heatOf(it.cp)===3,
      measured:(st.modelSamples||0)>=1
    };
  });
  return {
    id:'inscript', label:'Inscript (Mangal)', goal:S.goal,
    lessons:S.lessons.map(function(r){return {wpm:r.w,acc:r.a,keys:r.keys||0,ts:r.ts,seconds:r.secs||0};}),
    totals:{lessons:S.total,seconds:S.secs||0,bestWpm:S.bestWpm||0,bestAcc:S.bestAcc||0,streak:S.streak||0,bestStreak:S.bestStreak||0},
    daily:S.daily||{},
    typed:S.typed||0, terr:S.terr||0, trainableCount:PROGRESSION.length,
    keys:keys
  };
}

window.TankanInscript={
  active:layout==='inscript', MAP:MAP, SHORT:SHORT, REV:REV, PROGRESSION:PROGRESSION,
  getLayout:function(){return layout;},
  setLayout:function(v){localStorage.setItem(KEY,v==='inscript'?'inscript':'kruti');location.reload();},
  profileSource:profileSource,
  popupData:function(){
    return {ks:S.ks,kl:S.kl||{},goal:S.goal,hi:S.h,
      items:PROGRESSION.map(function(it){return {k:it.cp,h:disp(it.cp),sub:(it.code?((it.shift?'Shift+':'')+QLBL(it.code).toUpperCase()):''),finger:it.finger||''};}),
      practice:function(idx){window.TankanInscript._practice(idx);}};
  },
  reset:function(){S=freshState();save();}
};

/* ---------- header layout dropdown (index.html only) ---------- */
function buildChip(){
  var badge=document.querySelector('.brand-badge');
  if(!badge||!document.getElementById('panel-practice'))return;
  var wrap=document.createElement('div');wrap.className='layout-picker';
  var btn=document.createElement('button');btn.type='button';btn.className='brand-badge layout-chip';btn.setAttribute('aria-haspopup','listbox');btn.setAttribute('aria-expanded','false');
  btn.textContent=(layout==='inscript'?'Inscript (Mangal)':'Remington Kruti Dev')+' ▾';
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
  /* stop the Remington engine from touching the screen; the key-history
     popup reads Remington stats, so it is suppressed here too */
  ['updateDisplay','renderVirtualKeyboard','updateKeyboardHighlights','updateLiveStats','updateMasteryCard','updateAlphabetStrip'].forEach(function(n){
    if(typeof window[n]==='function')window[n]=function(){};
  });
  var canvas=el.canvas, input=el.hiddenInput;
  var seg=(typeof Intl!=='undefined'&&Intl.Segmenter)?new Intl.Segmenter('hi',{granularity:'grapheme'}):null;

  /* per-lesson runtime */
  var cps=[],pos=0,errs=0,correct=0,t0=0,done=false,clusters=[],lastKeyTime=null,prevWrong=false,pendingShift=new Set();

  function setTextFromLesson(text){
    text=norm(text);
    cps=Array.from(text);pos=0;errs=0;correct=0;t0=0;done=false;lastKeyTime=null;prevWrong=false;pendingShift.clear();lessonEvents=[];
    clusters=[];var idx=0;
    var parts=seg?Array.from(seg.segment(text),function(s){return s.segment;}):cps;
    parts.forEach(function(p){var l=Array.from(p).length;clusters.push([idx,idx+l]);idx+=l;});
  }
  /* ── text sources (lesson settings tabs): guided words, official words,
     books, essays and custom text, all typed as Unicode on Inscript ── */
  var LESSON_WORDS=function(){return parseInt(el.wordsSelect&&el.wordsSelect.value,10)||25;};
  /* keep a word only if every character can be typed; strip stray punctuation */
  function typableWord(w,removePunct){
    var out='';
    var chars=Array.from(w);
    for(var i=0;i<chars.length;i++){
      var c=chars[i];
      if(c==='\u200c'||c==='\u200d')continue;
      var d=Array.from(c.normalize('NFD')),ok=true;
      for(var j=0;j<d.length;j++)if(!(d[j] in REV))ok=false;
      if(ok){
        if(removePunct&&(c==='।'||c==='.'||c===','||c==='॥'))continue;
        out+=c;continue;
      }
      if(/[\u0900-\u097f]/.test(c)&&!/[।॥]/.test(c))return '';
      if(/[A-Za-z]/.test(c))return '';
    }
    return out;
  }
  var paraCache={};
  function inscriptParagraphs(book){
    var rp=!!(opts&&opts.removePunct);
    var key=book.id+(rp?':np':':p')+(book.id==='custom'?':'+opts.customText.length+':'+opts.customText.slice(0,40):'');
    if(paraCache[key])return paraCache[key];
    var out=[];
    (book.lines||[]).forEach(function(line){
      var ws=[];
      line.split(/\s+/).forEach(function(w){
        if(!w)return;
        var t=typableWord(w,rp);
        if(t)ws.push(t);
      });
      if(ws.length){ws.endsSentence=/[।॥.!?][\s"'”’»\)\]]*$/.test(line.trim());out.push(ws);}
    });
    return paraCache[key]=out;
  }
  function bookText(book,count){
    var paras=inscriptParagraphs(book);
    if(!paras.length)return '';
    var posB=Number.isInteger(bookPos[book.id])?((bookPos[book.id]%paras.length)+paras.length)%paras.length:0;
    var out=[],n=0,used=0,ended=false,continuous=book.id!=='custom';
    while((out.length<count||(continuous&&!ended))&&used<(continuous?paras.length-posB:paras.length)){
      var para=paras[(posB+n)%paras.length];
      out.push.apply(out,para);ended=para.endsSentence;n++;used++;
    }
    if(!continuous&&out.length>count*2)out.length=count*2;
    bookPos[book.id]=(posB+n)%paras.length;
    try{lastLessonParaStart=posB;}catch(e){}
    var st=document.getElementById('word-pool-status');
    if(st)st.textContent=book.title+' · '+book.author+' · paragraph '+(posB+1)+(n>1?'–'+(posB+n):'')+' of '+paras.length.toLocaleString();
    try{if(typeof updateBookStatCard==='function')updateBookStatCard(posB);}catch(e){}
    return out.join(' ');
  }
  function officialText(count){
    var set=unlockedSet(),src=typeof OFFICIAL_WORDS!=='undefined'?OFFICIAL_WORDS:[],ok=[];
    src.forEach(function(w){
      var t=typableWord(w,true);if(!t)return;
      var good=true;Array.from(norm(t)).forEach(function(c){if(!set[c])good=false;});
      if(good&&ok.indexOf(t)<0)ok.push(t);
    });
    if(ok.length<8)return '';
    var draw=drawFactory(),words=[],prev='';
    for(var i=0;i<count;i++){var wd=draw(ok,prev)||prev;words.push(wd);prev=wd;}
    return words.join(' ');
  }
  function sourceText(){
    if(typeof textSource==='undefined'||textSource==='words')return '';
    var count=LESSON_WORDS();
    if(textSource==='official'){
      var t=officialText(count);
      if(t)return t;
      textSource='words';
      if(typeof syncSettingsUI==='function')syncSettingsUI();
      if(typeof flashPracticeEvent==='function')flashPracticeEvent('Official words need a few more unlocked keys - too few fit your keys so far.');
      return '';
    }
    var book=typeof findBook==='function'?findBook(textSource):null;
    if(!book)return '';
    if(typeof bookIsReady==='function'&&!bookIsReady(book)){
      var id=book.id;
      if(typeof ensureBookLoaded==='function')ensureBookLoaded(id).then(function(ok){
        if(ok&&textSource===id){if(typeof populateTextSources==='function')populateTextSources();newLesson();}
        else if(!ok&&textSource===id){textSource='words';if(typeof syncSettingsUI==='function')syncSettingsUI();newLesson();}
      });
      return 'लोड हो रहा है';
    }
    return bookText(book,count)||'';
  }
  window.regenerateLesson=function(){newLesson();};
  /* tell the user up front how many official words fit their unlocked keys (this tab needs a few more keys early on) */
  function officialInfo(){
    var n=document.getElementById('official-info');if(!n)return;
    var set=unlockedSet(),src=typeof OFFICIAL_WORDS!=='undefined'?OFFICIAL_WORDS:[],c=0,seen={};
    src.forEach(function(w){var t=typableWord(w,true);if(!t||seen[t])return;seen[t]=1;var good=true;Array.from(norm(t)).forEach(function(x){if(!set[x])good=false;});if(good)c++;});
    n.textContent='Formal words from government and office writing, filtered to the keys you have unlocked. '+(c>=8?c+' words fit your keys now.':'Needs at least 8 words that fit your unlocked keys; '+c+' fit so far. Unlock more keys to use this tab.');
  }
  window.__insOfficialInfo=officialInfo;
  function newLesson(){
    officialInfo();
    setTextFromLesson(sourceText()||lessonText(LESSON_WORDS()));
    render();stats();hint();mastery();strip();kbd();
  }

  /* ── metrics + mastery card ── */
  function lessonWpm(){var ms=done&&window.__insDur?window.__insDur:(t0?Date.now()-t0:0);var min=ms/60000;return min>0&&(correct>=3||done)?Math.min((correct/5)/min,300):0;}
  function acc(){var t=correct+errs;return t?correct/t*100:100;}
  function avg10(key){
    var last=S.lessons.slice(-10);
    if(!last.length)return null;
    return last.reduce(function(a,r){return a+r[key];},0)/last.length;
  }
  function stats(){
    var wl=document.getElementById('metric-wpm-label'),al=document.getElementById('metric-accuracy-label');
    var live=!!t0;
    if(wl)wl.textContent=live?'Speed · live':'Speed · last lesson';
    if(al)al.textContent=live?'Accuracy · live':'Accuracy · last lesson';
    var w=document.getElementById('metric-wpm'),a=document.getElementById('metric-accuracy');
    if(live){if(w)w.textContent=lessonWpm().toFixed(1);if(a)a.textContent=acc().toFixed(1);}
    else{
      var lastL=S.lessons[S.lessons.length-1];
      if(w)w.textContent=lastL?lastL.w.toFixed(1):'–';
      if(a)a.textContent=lastL?lastL.a.toFixed(1):'–';
    }
    var wa=avg10('w'),aa=avg10('a');
    var we=document.getElementById('metric-wpm-avg'),ae=document.getElementById('metric-accuracy-avg');
    if(we)we.textContent=wa===null?'–':wa.toFixed(1);
    if(ae)ae.textContent=aa===null?'–':aa.toFixed(1);
    var sc=document.getElementById('metric-score');if(sc)sc.textContent=S.lessons.length?S.lessons[S.lessons.length-1].s:0;
    var sb=document.getElementById('metric-score-best');if(sb)sb.textContent='best: '+S.bestScore;
    var mu=document.getElementById('metric-unlocked');if(mu)mu.textContent=String(S.h+1);
    var mt=document.getElementById('metric-total-keys');if(mt)mt.textContent=String(PROGRESSION.length);
    var th=document.getElementById('total-keys-header');if(th)th.textContent=String(PROGRESSION.length);
    var bars=document.getElementById('ins-history');
    if(bars){bars.replaceChildren();S.lessons.slice(-12).forEach(function(r){var bar=document.createElement('i');bar.style.height=Math.max(3,Math.min(24,r.w/S.goal*16))+'px';bar.title=r.w.toFixed(1)+' wpm, '+r.a.toFixed(1)+'% accuracy';bars.appendChild(bar);});}
    var ps=document.getElementById('p-streak');
    if(ps)ps.textContent=S.streak>0?'Accuracy streak: '+S.streak+' lesson'+(S.streak===1?'':'s')+' at 95%+.':'No accuracy streaks.';
  }
  function mastery(){
    var it=target();
    el.leadChar.textContent=disp(it.cp);
    el.leadKey.textContent='Learning: '+(it.shift?'Shift + ':'')+QLBL(it.code).toUpperCase();
    el.leadFinger.textContent='👉 '+it.finger+' finger';
    el.leadGoalSpeed.textContent=S.goal+' WPM';
    var st=unlockState(),pv=livePreview(st);
    el.progressFill.style.width=pv.pct+'%';
    el.progressPct.textContent='Key readiness'+(pv.live?' (live)':'')+': '+pv.pct+'%';
    el.leadSamplesStatus.textContent=pv.live
      ?'Clean timings: '+(st.samples+pv.live)+' / 10 ('+pv.live+' this lesson, not banked) - qualification checked at lesson end'
      :'Clean timings: '+st.samples+' / 10 - qualification checked at lesson end';
    if(st.ready&&!review&&S.u<LAST)el.leadSamplesStatus.textContent+=' - goal reached; finish the lesson';
    if(lastFocus&&!done)el.leadSamplesStatus.textContent+=' - practice focus: '+disp(lastFocus);
    if(!st.ready){
      var cur=ks(it.cp),unmet=[];
      var lastAcc=(cur.recentLessonAccuracy||cur.lastAccuracy||0);
      if(lastAcc<95)unmet.push('need 95% lesson accuracy');
      if((cur.accurateBest||Infinity)>targetMs())unmet.push(disp(it.cp)+' banked best '+(cur.accurateBest>0?(12000/cur.accurateBest).toFixed(1):'none yet')+' / '+S.goal+' WPM');
      if(!st.starterReady)unmet.push('calibrating starter keys');
      if(unmet.length)el.leadSamplesStatus.textContent+=' · '+unmet.join(' · ');
    }
    if(el.reviewBanner){
      el.reviewBanner.hidden=!review;
      if(review)el.reviewBannerText.textContent='Reviewing '+disp(it.cp)+' (key '+(reviewIdx+1)+') - key unlocking is paused.';
    }
    var ps=document.getElementById('progression-summary');if(ps)ps.textContent=review?('Reviewing key '+(reviewIdx+1)):'Automatic progression';
  }
  /* ── progression strip ── */
  function strip(){
    el.alphabetContainer.innerHTML='';
    PROGRESSION.forEach(function(it,idx){
      if(!showAll&&idx>S.h)return;
      var badge=document.createElement('div');
      badge.className='ak-badge';badge.dataset.key=it.cp;badge.dataset.insIdx=idx;
      if(idx<=S.h){
        var lvl=heatOf(it.cp);
        if(lvl>0)badge.classList.add('heat-'+lvl);
        if(idx===(review?reviewIdx:S.u))badge.classList.add('current');
      }else badge.classList.add('locked');
      var bar='';
      if(idx<=S.h){
        var st=S.ks[it.cp];
        if(st&&st.modelTtt>0&&(st.modelSamples||0)>=1){
          var ratio=Math.min(1,(12000/st.modelTtt)/S.goal);
          var color=ratio>=1?'var(--correct)':ratio>=.8?'#eab308':'var(--error)';
          bar='<i class="ak-bar" style="height:'+Math.max(6,Math.round(ratio*100))+'%;background:'+color+'"></i>';
        }
      }
      badge.innerHTML=bar+'<span class="ak-char">'+disp(it.cp)+'</span><span class="ak-key">'+(it.shift?'⇧':'')+QLBL(it.code).toUpperCase()+'</span>';
      if(idx<=S.h)badge.addEventListener('click',function(){
        review=idx!==S.h;reviewIdx=idx;
        save();newLesson();
        input.focus({preventScroll:true});
      });
      el.alphabetContainer.appendChild(badge);
    });
  }
  /* ── keyboard ── */
  var keyEls={};
  function drawKb(){
    var f=el.keyboardFrame;f.innerHTML='';keyEls={};
    ROWS.forEach(function(r,ri){
      var row=document.createElement('div');row.className='k-row';
      if(ri===3){var sl=document.createElement('div');sl.className='k-key label-key w-shift-l';sl.dataset.code='ShiftLeft';sl.innerHTML='<span class="hi-main">⇧ Shift</span>';row.appendChild(sl);keyEls.ShiftLeft=sl;}
      r.forEach(function(c){
        var k=document.createElement('div');k.className='k-key';k.dataset.code=c;
        var lbl=SHORTLBL[c]||MAP[c][1];
        k.innerHTML='<span class="hi-shift">'+(/[ऀ-ॿ]/.test(MAP[c][1])||SHORTLBL[c]?lbl:'')+'</span><span class="hi-main">'+(MAP[c][0]==='्'?'◌्':(/[ा-ॏऀ-ः़ु-ै]/.test(MAP[c][0])&&MAP[c][0]!=='र'?'◌'+MAP[c][0]:MAP[c][0]))+'</span><span class="en-sub">'+QLBL(c)+'</span>';
        if(c==='KeyF'||c==='KeyJ')k.classList.add('bump');
        row.appendChild(k);keyEls[c]=k;
      });
      if(ri===3){var sr=document.createElement('div');sr.className='k-key label-key w-shift-r';sr.dataset.code='ShiftRight';sr.innerHTML='<span class="hi-main">⇧ Shift</span>';row.appendChild(sr);keyEls.ShiftRight=sr;}
      f.appendChild(row);
    });
    var sp=document.createElement('div');sp.className='k-row';
    sp.innerHTML='<div class="k-spacer" style="flex-grow:1.9"></div><div class="k-key label-key w-space"><span class="hi-main">Space</span></div><div class="k-spacer" style="flex-grow:1.9"></div>';
    f.appendChild(sp);keyEls.Space=sp.querySelector('.w-space');
  }
  function kbd(){
    var set=unlockedSet();
    Object.keys(keyEls).forEach(function(c){
      var k=keyEls[c],m=MAP[c];if(!m)return;
      k.classList.remove('unlocked','heat-1','heat-2','heat-3');
      var u=set[m[0]]||set[m[1]];
      if(u){
        k.classList.add('unlocked');
        var lvl=Math.max(set[m[0]]?heatOf(m[0]):0,set[m[1]]?heatOf(m[1]):0);
        if(lvl>0)k.classList.add('heat-'+lvl);
      }
    });
  }
  function hint(){
    Object.keys(keyEls).forEach(function(c){keyEls[c].classList.remove('target','shift-needed');});
    if(done||pos>=cps.length){if(el.liveHintKey)el.liveHintKey.textContent='↵';if(el.liveHintChar)el.liveHintChar.textContent='next lesson';if(el.liveHintDetail)el.liveHintDetail.textContent='';return;}
    var ch=cps[pos],r=REV[ch];
    if(!r)return;
    var ke=keyEls[r.code];if(ke)ke.classList.add('target');
    if(r.shift&&keyEls.ShiftLeft){keyEls.ShiftLeft.classList.add('shift-needed');keyEls.ShiftRight.classList.add('shift-needed');}
    if(el.liveHintKey)el.liveHintKey.textContent=(r.shift?'Shift+':'')+QLBL(r.code);
    var it=PROGRESSION.filter(function(p){return p.cp===ch;})[0];
    if(el.liveHintChar)el.liveHintChar.textContent=ch===' '?'space':disp(ch);
    if(el.liveHintDetail)el.liveHintDetail.textContent=it?it.d:(ch==='्'?'halant':'');
  }
  /* Screen-reader keystroke progress. The visible stream is aria-hidden and
     #sr-lesson holds the whole (static) lesson for orientation, so progress
     speaks through this polite live region instead: after each keystroke it
     names the next physical key - the highlighted key on the on-screen
     keyboard is invisible to a blind user. Lesson end is already announced
     by flashPracticeEvent. The position counter keeps repeats unique so the
     announcement re-fires when the same key comes twice in a row. */
  var errStreak=0;
  function announce(kind){
    if(!el.srAnnounce||done||pos>=cps.length)return;
    var ch=cps[pos],r=REV[ch];
    var charLbl=ch===' '?'space':disp(ch);
    var keyLbl=r?((r.shift?'Shift+':'')+QLBL(r.code).toUpperCase()):charLbl;
    var lbl=keyLbl+(keyLbl!==charLbl?' ('+charLbl+')':'');
    el.srAnnounce.textContent=kind==='error'
      ?'Expected '+lbl+(errStreak>1?' - error '+errStreak:'')
      :'Next '+(pos+1)+' of '+cps.length+': '+lbl;
  }
  /* ── rendering ── */
  /* One keystroke is highlighted at a time (the way TypingBaba does it). Typed text is drawn as normal shaped
     Hindi, and so is all text the cursor has not reached. Only the syllable under the cursor is split into
     its pieces: the key to press next, and the rest of that syllable, one code point at a time, with a dotted
     circle in front of any matra, halant or nukta so the mark can be seen on its own. */
  var COMBINING=/[\u0900-\u0903\u093A-\u094F\u0951-\u0957\u0962\u0963]/;
  function lone(ch){return COMBINING.test(ch)?'\u25CC'+ch:ch;}
  function render(flash){
    /* screen readers get the same Unicode lesson that is drawn on screen (the visible stream is aria-hidden) */
    var srTxt=cps.join('');
    if(el.srLesson&&el.srLesson.dataset.text!==srTxt){el.srLesson.dataset.text=srTxt;el.srLesson.textContent=srTxt;}
    var ci=0;for(var i=0;i<clusters.length;i++){if(pos>=clusters[i][0]&&pos<clusters[i][1]){ci=i;break;}if(pos>=clusters[i][1])ci=i+1;}
    var ce=ci<clusters.length?clusters[ci][1]:cps.length;
    el.textCorrect.textContent=cps.slice(0,pos).join('');
    el.textError.textContent='';
    ['backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat'].forEach(function(k){el.textCurrent.style[k]='';});
    el.textCurrent.classList.remove('ins-split');
    var ch=pos<cps.length?cps[pos]:'';
    el.textCurrent.textContent=ch===' '?' ':lone(ch);
    el.textCurrent.classList.toggle('space-cursor',ch===' ');
    el.textCurrent.classList.toggle('error-flash',!!flash);
    var rem=el.textRemaining;rem.textContent='';
    if(ch!==' '&&pos<cps.length){
      var fr=document.createDocumentFragment();
      for(var k=pos+1;k<ce;k++){var sp=document.createElement('span');sp.textContent=lone(cps[k]);fr.appendChild(sp);}
      rem.appendChild(fr);
    }
    rem.appendChild(document.createTextNode(cps.slice(Math.min(Math.max(ce,pos+1),cps.length)).join('')));
    [el.textCorrect,el.textCurrent,el.textRemaining].forEach(function(e){e.style.fontFamily=fontStack();});
    if(done){el.textCurrent.textContent='';}
  }
  /* ── lesson end: commit measurements, record, maybe unlock ── */
  function commitMeasurements(){
    var lessonAcc=acc();
    var byKey={};
    lessonEvents.forEach(function(e){
      if(e.cp===' ')return;
      if(!(e.ms>0)||e.typo)return;
      (byKey[e.cp]||(byKey[e.cp]=[])).push(e.ms);
    });
    Object.keys(byKey).forEach(function(cp){
      var st=ks(cp),times=byKey[cp],mean=trimMean(times);
      st.modelTtt=st.modelTtt?.1*mean+.9*st.modelTtt:mean;
      st.modelBest=st.modelBest?Math.min(st.modelBest,st.modelTtt):st.modelTtt;
      st.lastLessonWpm=12000/mean;
      st.lastAccuracy=lessonAcc;
      if(cp===target().cp)st.recentLessonAccuracy=lessonAcc;
      /* banked best: only 95%+ lessons, cumulative clean samples >= 10 */
      if(lessonAcc>=95&&times.length>=3&&(st.modelSamples||0)+times.length>=10)st.accurateBest=st.accurateBest?Math.min(st.accurateBest,mean):mean;
      st.modelSamples=(st.modelSamples||0)+times.length;
      /* per-key speed history for the Profile charts (same shape as the
         Remington store's keyLearning records) */
      var kh=S.kl||(S.kl={});
      var hrec=kh[cp]||(kh[cp]={speeds:[],lessons:[]});
      var keyWpm=+(12000/mean).toFixed(2);
      hrec.speeds.push(keyWpm);if(hrec.speeds.length>30)hrec.speeds.shift();
      hrec.lessons.push([keyWpm,+lessonAcc.toFixed(1),times.length,Date.now(),S.total+1]);
      if(hrec.lessons.length>120)hrec.lessons.shift();
    });
    if(target().cp)ks(target().cp).targetLessons=(ks(target().cp).targetLessons||0)+1;
  }
  function recordLesson(){
    var ms=window.__insDur||1,min=ms/60000;
    var wpm=min>0?(correct/5)/min:0,a=acc();
    var complexity=new Set(lessonEvents.map(function(e){return e.cp;})).size;
    var cpm=min>0?correct/min:0;
    var score=complexity?Math.round(cpm*complexity/(errs+1)*(correct/50)):0;
    var secs=ms/1000;
    S.lessons.push({w:+wpm.toFixed(2),a:+a.toFixed(2),s:score,keys:complexity,secs:+secs.toFixed(1),ts:Date.now()});
    if(S.lessons.length>400)S.lessons.shift();
    S.total++;S.secs=(S.secs||0)+secs;
    S.typed=(S.typed||0)+correct;S.terr=(S.terr||0)+errs;
    S.bestWpm=Math.max(S.bestWpm,wpm);S.bestAcc=Math.max(S.bestAcc||0,a);S.bestScore=Math.max(S.bestScore,score);
    S.streak=a>=95?S.streak+1:0;S.bestStreak=Math.max(S.bestStreak||0,S.streak);
    var day=new Date().toLocaleDateString('en-CA');
    var dd=S.daily||(S.daily={});
    var rec=dd[day]||(dd[day]={seconds:0,lessons:0,typed:0,errors:0});
    rec.seconds+=secs;rec.lessons+=1;rec.typed+=correct;rec.errors+=errs;
  }
  function finishLesson(){
    done=true;window.__insDur=Date.now()-t0;
    commitMeasurements();recordLesson();
    var st=unlockState();
    /* S.u can sit below S.h after an order migration (keys already unlocked): clearing still moves to the next key */
    var cleared=!review&&st.ready&&acc()>=95&&S.u<LAST;
    var clearedCps=[];
    if(cleared){
      clearedCps.push(target().cp);S.u++;S.h=Math.max(S.h,S.u);
      clearedCps=clearedCps.concat(advanceFrontier());
      if(typeof sound==='object'&&sound.unlock)sound.unlock();
    }
    save();
    var guidance=cleared?(clearedCps.length>1?'Keys cleared: '+clearedCps.map(disp).join(', '):'Key cleared: '+disp(clearedCps[0])+'!')+' Next: '+disp(target().cp)
      :st.ready?'Ready. Continue to practice.'
      :!st.recentAccuracy?'Reach 95% accuracy in a completed lesson.'
      :st.samples<10?'Need 10 clean target timings.'
      :!st.starterReady?'Calibrate each starter key at goal speed.'
      :'Best target speed is below your '+S.goal+' WPM goal.';
    if(!review&&typeof flashPracticeEvent==='function')flashPracticeEvent(guidance);
    if(typeof window.TankanProfileRefresh==='function')window.TankanProfileRefresh();
    /* keybr-style: the next lesson replaces the text instantly */
    newLesson();
  }
  /* ── input ── */
  function produce(code,shiftKey){
    var m=MAP[code];if(!m)return null;
    if(shiftKey&&SHORT[code])return [SHORT[code],m[1]];
    return [m[shiftKey?1:0]];
  }
  function type(code,shiftKey){
    if(done)return;
    var opts=produce(code,shiftKey);
    if(!opts)return;
    var now=Date.now();
    if(!t0)t0=now;
    var interval=lastKeyTime===null?0:now-lastKeyTime;
    var actions=1+(shiftKey?pendingShift.size||1:pendingShift.size);
    pendingShift.clear();
    lastKeyTime=now;
    var valid=interval>=40&&interval<=12000?interval/actions:0;
    var ok=false,matched=0,matchedCps=[];
    for(var i=0;i<opts.length&&!ok;i++){
      var s=opts[i],variants=[s];
      if(LATIN_DIG[s])variants.push(LATIN_DIG[s]);
      for(var j=0;j<variants.length;j++){
        var v=variants[j],a=Array.from(v);
        if(cps.slice(pos,pos+a.length).join('')===v){matched=a.length;matchedCps=a;ok=true;break;}
      }
    }
    if(!ok){
      prevWrong=true;errs++;
      var exp=cps[pos],st=ks(exp);st.errors++;
      if(typeof sound==='object'&&sound.error)sound.error();
      render(true);setTimeout(function(){el.textCurrent.classList.remove('error-flash');},250);
      errStreak++;announce('error');stats();mastery();save();
      return;
    }
    if(typeof sound==='object'&&sound.click)sound.click();
    correct+=matched;
    var per=valid>0?valid/matched:0;
    matchedCps.forEach(function(cp){
      lessonEvents.push({cp:cp,ms:per,typo:prevWrong,t:t0?now-t0:0});
      if(cp!==' ')ks(cp).hits++;
    });
    prevWrong=false;errStreak=0;
    pos+=matched;
    if(pos>=cps.length){render();finishLesson();}
    else{render();stats();hint();mastery();announce('next');}
    var k=keyEls[code];if(k){k.classList.add('pressed');setTimeout(function(){k.classList.remove('pressed');},100);}
  }
  function onKey(e){
    if(e.key==='Shift'){if(!e.repeat)pendingShift.add(e.code||'Shift');return;}
    if(e.key==='CapsLock'||e.key==='Tab')return;
    if(e.getModifierState&&e.getModifierState('CapsLock')){if(e.key.length===1)e.preventDefault();return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Backspace'){e.preventDefault();return;}
    if(e.key==='Escape'){e.preventDefault();newLesson();return;}
    if(e.key==='Enter'){e.preventDefault();return;}
    if(e.key.length>1)return;
    e.preventDefault();
    type(e.code,e.shiftKey);
  }
  input.addEventListener('keydown',function(e){e.stopImmediatePropagation();onKey(e);},true);
  input.addEventListener('keyup',function(e){if(e.key==='Shift')pendingShift.delete(e.code||'Shift');},true);
  input.addEventListener('input',function(e){e.stopImmediatePropagation();input.value='';},true);
  input.addEventListener('blur',function(){pendingShift.clear();lastKeyTime=null;});
  window.addEventListener('blur',function(){lastKeyTime=null;pendingShift.clear();});

  /* review banner + show-all toggle + goal control */
  if(el.reviewResumeBtn)el.reviewResumeBtn.addEventListener('click',function(){review=false;save();newLesson();input.focus({preventScroll:true});});
  var toggleBtn=document.getElementById('toggle-locked-keys-btn');
  if(toggleBtn){
    toggleBtn.textContent='Show All '+PROGRESSION.length+' Keys';
    toggleBtn.onclick=function(){
      showAll=!showAll;
      toggleBtn.textContent=showAll?'Hide Locked Keys':'Show All '+PROGRESSION.length+' Keys';
      strip();
    };
  }
  var head=document.querySelector('.alphabet-header > span:first-child');
  if(head)head.innerHTML='Inscript (Mangal) Progression (<span id="total-keys-header">'+PROGRESSION.length+'</span> Keys)';
  var tm=document.querySelector('.target-metrics');
  if(tm){
    var chip=document.createElement('div');chip.className='metric-chip';
    var lab=document.createElement('span');lab.textContent='Goal: ';
    var sel=document.createElement('select');sel.id='ins-goal-select';sel.setAttribute('aria-label','Inscript target typing speed');
    [10,15,20,25,30,35,40,45,50,60,70,80,100].forEach(function(v){var o=document.createElement('option');o.value=v;o.textContent=v+' WPM';if(v===S.goal)o.selected=true;sel.appendChild(o);});
    sel.addEventListener('change',function(){S.goal=parseInt(sel.value,10)||25;save();stats();mastery();strip();kbd();});
    chip.appendChild(lab);chip.appendChild(sel);tm.appendChild(chip);
  }
  /* hide Remington-only daily-goal bits in the substats row */
  var pg=document.getElementById('p-goal');if(pg&&pg.parentNode)pg.parentNode.style.display='none';
  var gt=document.querySelector('.practice-substats .goal-track');if(gt)gt.style.display='none';
  /* the goal select above is the single goal control in Inscript mode */
  var lg=document.getElementById('lead-goal-speed');if(lg){var lc=lg.closest('.metric-chip');if(lc)lc.style.display='none';}

  /* lesson settings: the panel is shared with Kruti Dev. Rows that only the
     Kruti engine implements are hidden here. */
  (function(){
    /* Font: in Inscript the select lists Unicode fonts and changes the practice text */
    (function(){
      var sel=document.getElementById('opt-font');if(!sel)return;
      sel.textContent='';
      Object.keys(INS_FONTS).forEach(function(k){sel.appendChild(new Option(INS_FONTS[k].label,k));});
      var desc=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
      /* the shared panel code writes the Kruti font key into this select; ignore keys that are not Inscript fonts */
      Object.defineProperty(sel,'value',{configurable:true,get:function(){return desc.get.call(sel);},set:function(v){if(INS_FONTS[v])desc.set.call(sel,v);}});
      sel.value=S.font;
      sel.addEventListener('change',function(e){
        e.stopImmediatePropagation();e.stopPropagation();
        if(INS_FONTS[sel.value]){S.font=sel.value;save();render();}
      },true);
    })();
    var hideRow=function(id){var e=document.getElementById(id);if(!e)return;var r=e.closest('.ls-row,.ls-check');(r||e).classList.add('ins-hide');};
    ['jump-select','opt-strict','opt-repeat','opt-punct','opt-no-alt','no-alt-note','opt-stop','opt-skip','daily-goal-select-lesson','lp-keys','lp-current','lp-sample'].forEach(hideRow);
    Array.prototype.forEach.call(document.querySelectorAll('#lesson-settings h4'),function(h){if(/Lesson preview/.test(h.textContent))h.classList.add('ins-hide');});
    var slider=document.getElementById('speed-goal-select'),ls=document.getElementById('lesson-settings');
    var syncGoal=function(){
      if(slider)slider.value=String(S.goal);
      var gv=document.getElementById('speed-goal-val');if(gv)gv.textContent=S.goal.toFixed(1)+' wpm';
      var gs=document.getElementById('ins-goal-select');
      if(gs){if(!Array.prototype.some.call(gs.options,function(o){return o.value===String(S.goal);})){var o=document.createElement('option');o.value=S.goal;o.textContent=S.goal+' WPM';gs.appendChild(o);}gs.value=String(S.goal);}
    };
    if(ls&&slider){
      ['input','change'].forEach(function(ev){ls.addEventListener(ev,function(e){
        if(e.target!==slider)return;
        e.stopPropagation();
        var v=parseInt(slider.value,10)||25;
        var gv=document.getElementById('speed-goal-val');if(gv)gv.textContent=v.toFixed(1)+' wpm';
        if(ev==='change'){S.goal=v;save();stats();mastery();strip();kbd();syncGoal();}
      },true);});
      ls.addEventListener('toggle',syncGoal);
      var gs0=document.getElementById('ins-goal-select');
      if(gs0)gs0.addEventListener('change',function(){setTimeout(syncGoal,0);});
      syncGoal();
    }
  })();
  var hs=document.getElementById('live-hint-strip');if(hs)hs.hidden=false;
  drawKb();newLesson();
  /* the first Inscript render is on screen: lift the boot veil */
  document.documentElement.setAttribute('data-ins-ready','1');
  var ch=document.getElementById('canvas-hint-text');if(ch)ch.textContent='Start typing';

  /* test/introspection API */
  window.TankanInscript._state=function(){return {pos:pos,len:cps.length,errs:errs,correct:correct,done:done,text:cps.join(''),lessons:S.total};};
  window.TankanInscript._setText=function(t){setTextFromLesson(t);render();hint();stats();mastery();};
  window.TankanInscript._practice=function(idx){review=idx!==S.h;reviewIdx=idx;save();newLesson();input.focus({preventScroll:true});};
  window.TankanInscript.type=type;
  window.TankanInscript.newLesson=function(){newLesson();};
  window.TankanInscript.eligibleWords=eligibleWords;
  window.TankanInscript.lessonText=function(){return lessonText();};
  Object.defineProperty(window.TankanInscript,'progress',{get:function(){return {unlockedIndex:S.u,highestUnlocked:S.h,goal:S.goal,keyStats:S.ks,lessons:S.lessons,reviewMode:review,total:S.total};}});
}
/* The script sits at the end of <body>, so the DOM it needs already exists:
   boot immediately. Waiting for DOMContentLoaded let the browser paint the
   Remington lesson first on slow loads (the layout flash Kartik reported). */
if(document.getElementById('panel-practice'))start();
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
else start();
})();
