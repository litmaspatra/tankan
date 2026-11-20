'use strict';
// Legacy-byte renderer for Tankan Remington.
window.TankanLegacyRenderer=(()=>{
 const variants={";": "cv01", ">": "cv02", "K": "cv03", "Q": "cv04", "c": "cv05", "d": "cv06", "e": "cv07", "g": "cv08", "i": "cv09", "l": "cv10", "n": "cv11", "o": "cv12", "p": "cv13", "r": "cv14", "t": "cv15", "u": "cv16", "x": "cv17", "y": "cv18", "\u0090": "cv19", "\u00a5": "cv20", "\u00b4": "cv21", "\u00c4": "cv22", "\u00d2": "cv23", "\u00e4": "cv24", "Hk": "cv25", "[k": "cv26", "?k": "cv27", "/k": "cv28", "Fk": "cv29", "\"k": "cv30", "'k": "cv31", "V": "cv32", "B": "cv33", "M": "cv34", "<": "cv35", "\"V": "cv36"},states=new WeakMap();
 const enabled=key=>key==='tankan'||key==='tankanclean';
 function features(text,key){
  const map=new Map();
  for(let j=0;j<text.length;j++){
   if(text[j]!=='z')continue;
   let end=j;while(end>0&&text[end-1]==='Z')end--;
   const raw=variants[text.slice(end-2,end)]?text.slice(end-2,end):text[end-1],feature=variants[raw];
   if(feature)for(let k=end-raw.length;k<=j;k++)map.set(k,feature);
  }
  for(let j=0;j<text.length;j++){
   if(text[j]!=='a')continue;
   const prior=text.slice(Math.max(0,j-3),j);
   // Upper vowel marks and reph already occupy the normal bindu height.
   // Keep the original low placement for ordinary consonant+bindu pairs.
   if(/W$/.test(prior))map.set(j,'cv40');
   else if(/[ShZ]$/.test(prior))map.set(j,'cv39');
   else if(/s$/.test(prior)||/f[^\s]$/.test(prior)||/f[^\s]k$/.test(prior))map.set(j,'cv37');
  }
  // Keep all three input units visible as pieces of Mukta's native ञ्ज outline.
  for(const match of text.matchAll(/Hkk¥~tk/g)) {
   for(let j=match.index+3;j<=match.index+5;j++)map.set(j,'cv38');
  }
  return map;
 }
 function glyph(text,index,map,errors){const feature=map.get(index),error=errors?.has(index);if(!feature&&!error)return document.createTextNode(text[index]);const node=document.createElement('span');node.textContent=text[index];if(feature)node.style.fontFeatureSettings='"'+feature+'" 1';if(error)node.classList.add('typing-error');return node;}
 // Legacy bytes reuse ASCII punctuation codepoints as Hindi letters ('?' is घ,
 // '.' is ण्, '/' is ध्, ...). The Unicode line breaker treats those bytes as
 // break opportunities and was splitting words across lines (घ|बराता). Keep
 // every space-delimited word inside one no-wrap span; only spaces may wrap.
 // Bytes that join with what follows (half-form prefixes, i-matra prefix,
 // halant) and bytes that join with what precedes (matras, rakar, reph,
 // bindu, nukta, danda): a <wbr> may never split either kind of pair, and
 // never a feature-marked cluster (map). Long runs defer to the next safe
 // boundary instead of breaking a glyph apart.
 const FWD_JOIN="[{./?FH'\"DXPTRUICEYOLf~",BACK_JOIN='khqwsSWa%`~+zZ¥A';
 function fill(frag,text,start,end,map,errors){
  let word=null,len=0,nextBreak=24;
  for(let j=start;j<end;j++){
   if(text[j]===' '){word=null;len=0;nextBreak=24;frag.append(document.createTextNode(' '));continue;}
   // Exceptionally long unspaced runs (URLs, pasted gibberish) still need wrap
   // points: past 24 chars, offer a <wbr> every 12 so the line box can never
   // overflow and the cursor stays reachable. Ordinary Hindi words stay whole.
   if(word&&len>=nextBreak){
    if(!FWD_JOIN.includes(text[j-1])&&!BACK_JOIN.includes(text[j])&&!map.has(j-1)&&!map.has(j)){
     word=null;frag.append(document.createElement('wbr'));nextBreak=len+12;
    } else nextBreak=len+1;
   }
   if(!word){word=document.createElement('span');word.className='w';frag.append(word);}
   word.append(glyph(text,j,map,errors));len++;
  }
 }
 function stream(nodes,text,cursor,key,errors){
  const state=states.get(nodes[0]);
  // Move one character between nodes, keeping word spans whole: merge into a
  // sibling .w span of the same word, or wrap a lone char in a fresh .w span.
  // Top-level text nodes are spaces; word chars (even bare text nodes) live
  // inside .w spans, so a pulled char carries whether it needs a word span.
  const takeFirst=(src)=>{const f=src.firstChild;if(!f)return null;if(f.nodeType===3){f.remove();return{u:f,w:false};}const u=f.firstChild;if(!u)return null;u.remove();if(!f.firstChild)f.remove();return{u,w:true};};
  const takeLast=(src)=>{const l=src.lastChild;if(!l)return null;if(l.nodeType===3){l.remove();return{u:l,w:false};}const u=l.lastChild;if(!u)return null;u.remove();if(!l.firstChild)l.remove();return{u,w:true};};
  const putEnd=(dst,t)=>{if(!t)return;if(!t.w){dst.append(t.u);return;}const l=dst.lastChild;if(l&&l.nodeType===1){l.append(t.u);}else{const w=document.createElement('span');w.className='w';w.append(t.u);dst.append(w);}};
  const putStart=(dst,t)=>{if(!t)return;if(!t.w){dst.prepend(t.u);return;}const f=dst.firstChild;if(f&&f.nodeType===1){f.prepend(t.u);}else{const w=document.createElement('span');w.className='w';w.append(t.u);dst.prepend(w);}};
  if(state?.text===text&&state.key===key&&state.errors===errors&&state.errorCount===(errors?.size||0)){
   if(cursor===state.cursor)return true;
   if(cursor===state.cursor+1){putEnd(nodes[0],takeFirst(nodes[1]));putEnd(nodes[1],takeFirst(nodes[2]));state.cursor=cursor;return true;}
   if(cursor===state.cursor-1){putStart(nodes[2],takeFirst(nodes[1]));putEnd(nodes[1],takeLast(nodes[0]));state.cursor=cursor;return true;}
  }
  const map=enabled(key)?features(text,key):new Map(),frags=nodes.map(()=>document.createDocumentFragment());
  fill(frags[0],text,0,cursor,map,errors);
  fill(frags[1],text,cursor,Math.min(cursor+1,text.length),map,errors);
  fill(frags[2],text,Math.min(cursor+1,text.length),text.length,map,errors);
  nodes.forEach((node,i)=>node.replaceChildren(frags[i]));states.set(nodes[0],{text,cursor,key,errors,errorCount:errors?.size||0});return true;
 }
 function partial(node,text,end,key){if(!enabled(key))return false;const map=features(text,key),frag=document.createDocumentFragment();for(let j=0;j<end;j++)frag.append(glyph(text,j,map));node.replaceChildren(frag);return true;}
 let readiness;
 function ready(){
  if(!readiness)readiness=document.fonts.load('40px TankanRemington').then(faces=>{
   if(!faces.length)throw new Error('Practice font unavailable');
   document.documentElement.dataset.fontReady='1';
  }).catch(error=>{
   document.documentElement.dataset.fontError='1';
   if(!document.getElementById('tankan-font-error')){
    const notice=document.createElement('p');notice.id='tankan-font-error';notice.setAttribute('role','alert');notice.textContent='The practice font could not load. Reload to try again.';
    notice.style='padding:12px;text-align:center;background:#fff3cd;color:#5a4200';document.body.prepend(notice);
   }
   throw error;
  });
  return readiness;
 }
 return {enabled,stream,partial,ready};
})();
