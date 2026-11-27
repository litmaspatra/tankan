'use strict';
/* Keyboard settings shared by both layouts: layout choice and finger-zone
   colouring (keybr-style). Zones come from the physical key position, so
   they are the same for every layout. */
(function(){
var ZONE={
 Backquote:'p',Digit1:'p',KeyQ:'p',KeyA:'p',KeyZ:'p',Tab:'p',CapsLock:'p',ShiftLeft:'p',
 Digit2:'r',KeyW:'r',KeyS:'r',KeyX:'r',
 Digit3:'m',KeyE:'m',KeyD:'m',KeyC:'m',
 Digit4:'i',Digit5:'i',KeyR:'i',KeyT:'i',KeyF:'i',KeyG:'i',KeyV:'i',KeyB:'i',
 Digit6:'i',Digit7:'i',KeyY:'i',KeyU:'i',KeyH:'i',KeyJ:'i',KeyN:'i',KeyM:'i',
 Digit8:'m',KeyI:'m',KeyK:'m',Comma:'m',
 Digit9:'r',KeyO:'r',KeyL:'r',Period:'r',
 Digit0:'p',Minus:'p',Equal:'p',KeyP:'p',BracketLeft:'p',BracketRight:'p',Backslash:'p',Semicolon:'p',Quote:'p',Slash:'p',ShiftRight:'p',
 Space:'t'
};
var KEY='tankan_zones';
function on(){try{return localStorage.getItem(KEY)!=='0';}catch(e){return true;}}
function tag(frame){
  if(!frame)return;
  frame.querySelectorAll('.k-key').forEach(function(k){
    var z=ZONE[k.dataset.code||''];
    if(z)k.dataset.zone=z;else if(k.classList.contains('w-space'))k.dataset.zone='t';
  });
}
function apply(){
  var f=document.getElementById('keyboard-frame');
  if(!f)return;
  f.classList.toggle('zones-on',on());
  tag(f);
}
function boot(){
  var f=document.getElementById('keyboard-frame');
  if(f){new MutationObserver(function(){tag(f);}).observe(f,{childList:true,subtree:true});}
  apply();
  var cb=document.getElementById('opt-zones');
  if(cb){cb.checked=on();cb.addEventListener('change',function(){try{localStorage.setItem(KEY,cb.checked?'1':'0');}catch(e){}apply();});}
  var sel=document.getElementById('opt-layout');
  if(sel){
    var cur=(window.TankanInscript&&TankanInscript.active)?'inscript':'kruti';
    sel.value=cur;
    sel.addEventListener('change',function(){
      var v=sel.value;
      if(window.TankanInscript&&v!==cur)TankanInscript.setLayout(v);
    });
  }
}
window.TankanZones={zone:function(code){return ZONE[code]||null;},apply:apply};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
