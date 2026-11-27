/* Caps Lock indicator: a visible notice while Caps Lock is on, in both layouts.
   The state is read from real key events (getModifierState), so it is correct
   as soon as any key is pressed or the window gets focus back. */
(function(){
  var bar=document.createElement('div');
  bar.id='capslock-notice';bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');bar.hidden=true;
  bar.innerHTML='<b>⇪ Caps Lock is on.</b> Turn it off to type. <span lang="hi">कैप्स लॉक चालू है, इसे बंद करें।</span>';
  function mount(){if(!bar.parentNode)document.body.appendChild(bar);}
  function set(on){mount();bar.hidden=!on;document.documentElement.classList.toggle('caps-on',!!on);}
  function read(e){if(e&&typeof e.getModifierState==='function')set(e.getModifierState('CapsLock'));}
  window.addEventListener('keydown',read,true);
  window.addEventListener('keyup',read,true);
  window.addEventListener('mousedown',read,true);
  window.addEventListener('blur',function(){set(false);});
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
  window.TankanCaps={set:set};
})();
