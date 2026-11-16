'use strict';
// Legacy-byte renderer for Tankan Remington.
window.TankanLegacyRenderer=(()=>{
 const variants={";": "cv01", ">": "cv02", "K": "cv03", "Q": "cv04", "c": "cv05", "d": "cv06", "e": "cv07", "g": "cv08", "i": "cv09", "l": "cv10", "n": "cv11", "o": "cv12", "p": "cv13", "r": "cv14", "t": "cv15", "u": "cv16", "x": "cv17", "y": "cv18", "\u0090": "cv19", "\u00a5": "cv20", "\u00b4": "cv21", "\u00c4": "cv22", "\u00d2": "cv23", "\u00e4": "cv24", "Hk": "cv25", "[k": "cv26", "?k": "cv27", "/k": "cv28", "Fk": "cv29", "\"k": "cv30", "'k": "cv31", "V": "cv32", "B": "cv33", "M": "cv34", "<": "cv35", "\"V": "cv36"},states=new WeakMap();
 const enabled=key=>key==='krutidev';
 function features(text){
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
 function glyph(text,index,map){const feature=map.get(index);if(!feature)return document.createTextNode(text[index]);const node=document.createElement('span');node.textContent=text[index];node.style.fontFeatureSettings='"'+feature+'" 1';return node;}
 function stream(nodes,text,cursor,key){
  if(!enabled(key)){states.delete(nodes[0]);return false;}
  const state=states.get(nodes[0]);
  if(state?.text===text){
   if(cursor===state.cursor)return true;
   if(cursor===state.cursor+1){if(nodes[1].firstChild)nodes[0].append(nodes[1].firstChild);if(nodes[2].firstChild)nodes[1].append(nodes[2].firstChild);state.cursor=cursor;return true;}
   if(cursor===state.cursor-1){if(nodes[1].firstChild)nodes[2].prepend(nodes[1].firstChild);if(nodes[0].lastChild)nodes[1].append(nodes[0].lastChild);state.cursor=cursor;return true;}
  }
  const map=features(text),frags=nodes.map(()=>document.createDocumentFragment());
  for(let j=0;j<text.length;j++)frags[j<cursor?0:j===cursor?1:2].append(glyph(text,j,map));
  nodes.forEach((node,i)=>node.replaceChildren(frags[i]));states.set(nodes[0],{text,cursor});return true;
 }
 function partial(node,text,end,key){if(!enabled(key))return false;const map=features(text),frag=document.createDocumentFragment();for(let j=0;j<end;j++)frag.append(glyph(text,j,map));node.replaceChildren(frag);return true;}
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
