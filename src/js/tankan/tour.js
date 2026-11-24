// Original guided tour for Tankan. It reads learning state, never rewrites it.
(() => {
    const SEEN='tankan_tour_v1', LANG='tankan_tour_language';
    const $=s=>document.querySelector(s);
    const read=k=>{try{return localStorage.getItem(k);}catch(_){return 'unavailable';}};
    const put=(k,v)=>{try{localStorage.setItem(k,v);}catch(_){}};
    const copy=[
      ['Learn Hindi touch typing','Practise Remington Kruti Dev 010. Build muscle memory while keeping your eyes on the text, not your physical keyboard.','हिंदी टच टाइपिंग सीखें','Remington Kruti Dev 010 का अभ्यास करें। कीबोर्ड के बजाय पाठ पर नज़र रखते हुए उँगलियों को कुंजियों का अभ्यास कराएँ।'],
      ['Practice that adapts to you','Lessons use your unlocked keys, with more practice for the keys that need it. Learn through Hindi words rather than endless key drills.','आपके अनुसार अभ्यास','पाठ आपकी खुली हुई कुंजियों से बनते हैं। जिन कुंजियों में अभ्यास चाहिए, उन पर अधिक ध्यान दिया जाता है।'],
      ['Start with a few keys','Begin with four keys. New keys unlock one at a time after a lesson when key-speed, accuracy and clean-practice requirements are met. The starter keys must all qualify first.','कुछ कुंजियों से शुरुआत','शुरुआत चार कुंजियों से होती है। कुंजी की गति, शुद्धता और पर्याप्त सही अभ्यास की शर्तें पूरी होने पर पाठ के बाद एक नई कुंजी खुलती है। पहले चारों शुरुआती कुंजियाँ तैयार होनी चाहिए।'],
      ['Give weaker keys more practice','New and slower keys get extra attention. Your lesson speed and the speed of an individual key are different measurements.','कमज़ोर कुंजियों का अधिक अभ्यास','नई और धीमी कुंजियों पर अधिक ध्यान दिया जाता है। पूरे पाठ की गति और किसी एक कुंजी की गति अलग-अलग माप हैं।'],
      ['Your lesson text','Type the highlighted part next. Use the key hint below when you need help. The next lesson loads automatically.','अभ्यास का पाठ','अगला चिह्नित भाग टाइप करें। ज़रूरत होने पर नीचे दिया कुंजी संकेत देखें। अगला पाठ अपने आप आता है।'],
      ['Lesson settings','The ⚙ Lessons button opens your lesson settings: choose guided lessons, books, essays, official words or custom text, and set your target speed. Change them any time; your progress is kept.','पाठ सेटिंग','⚙ Lessons बटन से पाठ सेटिंग खुलती हैं: गाइडेड पाठ, किताबें, निबंध, कार्यालयी शब्द या अपना पाठ चुनें, और लक्ष्य गति तय करें। इन्हें कभी भी बदलें; आपकी प्रगति सहेजी रहती है।'],
      ['Speed and accuracy','These show your last completed lesson. The smaller figures average your latest 10 completed lessons. Aim for accurate typing as well as speed.','गति और शुद्धता','यहाँ पिछले पूरे किए गए पाठ के परिणाम हैं। छोटे आँकड़े पिछले 10 पूरे पाठों का औसत हैं। गति के साथ शुद्धता पर भी ध्यान दें।'],
      ['Your learning keys','The colours and bars show how each key is progressing toward your speed goal. Hover or tap a key to see its details.','आपकी अभ्यास कुंजियाँ','रंग और पट्टियाँ बताती हैं कि प्रत्येक कुंजी गति के लक्ष्य की ओर कितनी बढ़ी है। विवरण के लिए कुंजी पर माउस ले जाएँ या टैप करें।'],
      ['A key\'s progress','Each dot records this key\'s pace in a lesson. The dashed line is your target. Dots appear after practice. A lessons-to-goal estimate appears only with a usable trend; it is not an unlock promise.','कुंजी की प्रगति','हर बिंदु एक पाठ में इस कुंजी की गति है। टूटी रेखा लक्ष्य है। अभ्यास के बाद बिंदु दिखेंगे। पर्याप्त रुझान होने पर ही बचे पाठों का अनुमान दिखता है; यह कुंजी खुलने का वादा नहीं है।'],
      ['Understand this key','Last, Best and Average describe this key\'s own pace, not the whole lesson. Best is its best recorded pace; unlocking also requires qualifying accuracy and enough clean timings.','इस कुंजी के आँकड़े','Last, Best और Average इस कुंजी की गति हैं, पूरे पाठ की नहीं। Best सबसे अच्छी दर्ज गति है; नई कुंजी खुलने के लिए आवश्यक शुद्धता और पर्याप्त सही टाइमिंग भी चाहिए।'],
      ['Your profile menu','This photo button opens a menu: your Profile, Settings, Tips, About, Contact, and this Introduction, which you can replay any time. Sign in from Profile to save progress to your account and choose an avatar. Signing in is optional.','प्रोफ़ाइल मेनू','यह फ़ोटो बटन एक मेनू खोलता है: आपका Profile, Settings, Tips, About, Contact और यह परिचय, जिसे कभी भी फिर से देखा जा सकता है। Profile से साइन इन करके प्रगति अपने खाते में सहेजें और अवतार चुनें। साइन इन करना वैकल्पिक है।']
    ];
    let previousPanel,root,card,spot,index=0,lang=read(LANG)==='hi'?'hi':'en',active=false,previousFocus,originalScroll,wasPaused,originalPopup;
    const button=(id,fn)=>{card.querySelector(id).onclick=fn;};
    function popup(){
        const badge=$('#alphabet-container .ak-badge');
        if(badge&&typeof showKeyPopup==='function'){clearTimeout(keyPopupTimer);keyPopupPinned=true;showKeyPopup(badge.dataset.key,badge.getBoundingClientRect());}
    }
    function targets(){
        if(index===4)return [$('#text-stream-container')];
        if(index===5)return [$('#lesson-settings')];
        if(index===6)return [$('#metric-wpm')?.closest('.stat-card'),$('#metric-accuracy')?.closest('.stat-card')];
        if(index===7)return [$('.alphabet-strip')];
        if(index===8)return [$('#key-popup .kp-chart')];
        if(index===9)return [$('#key-popup .kp-speeds')];
        if(index===10)return [$('#avatar-corner')];
        return [];
    }
    function position(){
        if(!active)return;
        const rects=targets().filter(x=>x&&x.getClientRects().length).map(x=>x.getBoundingClientRect());
        const w=innerWidth,h=innerHeight,gap=14,pad=8;
        if(!rects.length){spot.hidden=true;root.classList.add('tour-centered');card.style.left=Math.max(pad,(w-card.offsetWidth)/2)+'px';card.style.top=Math.max(pad,(h-card.offsetHeight)/2)+'px';return;}
        root.classList.remove('tour-centered');spot.hidden=false;
        const r={left:Math.max(4,Math.min(...rects.map(r=>r.left))-5),right:Math.min(w-4,Math.max(...rects.map(r=>r.right))+5),top:Math.max(4,Math.min(...rects.map(r=>r.top))-5),bottom:Math.min(h-4,Math.max(...rects.map(r=>r.bottom))+5)};
        Object.assign(spot.style,{left:r.left+'px',top:r.top+'px',width:(r.right-r.left)+'px',height:(r.bottom-r.top)+'px'});
        const cw=card.offsetWidth,ch=card.offsetHeight;
        let left=Math.max(pad,Math.min(r.left,w-cw-pad)),top;
        if(h-r.bottom>=ch+gap)top=r.bottom+gap;
        else if(r.top>=ch+gap)top=r.top-ch-gap;
        else if(w-r.right>=cw+gap){left=r.right+gap;top=Math.max(pad,Math.min(r.top,h-ch-pad));}
        else if(r.left>=cw+gap){left=r.left-cw-gap;top=Math.max(pad,Math.min(r.top,h-ch-pad));}
        else {top=Math.max(pad,h-ch-pad);}
        card.style.left=left+'px';card.style.top=top+'px';
    }
    function paint(){
        if(index===8||index===9)popup();else if(typeof hideKeyPopup==='function')hideKeyPopup();
        const c=copy[index],hi=lang==='hi';
        card.lang=lang;
        card.innerHTML='<div class="tour-top"><span>टंकण · '+(index+1)+' / '+copy.length+'</span><button type="button" id="tour-language">'+(hi?'English':'हिंदी')+'</button><button type="button" id="tour-close" aria-label="'+(hi?'परिचय बंद करें':'Close tour')+'">×</button></div><h2 id="tour-title"></h2><p id="tour-copy"></p><div class="tour-actions"><button type="button" id="tour-skip">'+(hi?'छोड़ें':'Skip tour')+'</button><span></span><button type="button" id="tour-back" '+(index?'':'disabled')+'>'+(hi?'पीछे':'Back')+'</button><button type="button" class="tour-primary" id="tour-next">'+(index===copy.length-1?(hi?'अभ्यास शुरू करें':'Start practising'):(hi?'आगे':'Next'))+'</button></div>';
        $('#tour-title').textContent=c[hi?2:0];$('#tour-copy').textContent=c[hi?3:1];
        button('#tour-close',close);button('#tour-skip',close);button('#tour-back',()=>move(-1));button('#tour-next',()=>index===copy.length-1?close():move(1));button('#tour-language',()=>{lang=hi?'en':'hi';put(LANG,lang);paint();});
        const target=targets().find(x=>x&&x.getClientRects().length);
        if(target&&index!==8&&index!==9)target.scrollIntoView({block:'center',behavior:'instant'});
        position();requestAnimationFrame(position);$('#tour-next').focus({preventScroll:true});
    }
    function move(delta){index=Math.max(0,Math.min(copy.length-1,index+delta));paint();}
    function start(){
        if(active)return;
        previousPanel=$('.panel.active')?.id;const practice=$('#panel-practice');
        // Never switch another panel or regenerate its lesson behind the user.
        if(!practice?.classList.contains('active')){document.querySelector('.nav-tab[data-target="practice"]').click();}
        previousFocus=document.activeElement;originalScroll=scrollY;wasPaused=!!pausedAt;
        originalPopup=typeof keyPopupPinned!=='undefined'&&keyPopupPinned&&keyPopupAnchor?keyPopupAnchor:null;
        pauseLesson();active=true;index=0;put(SEEN,'1');
        root=document.createElement('div');root.id='tankan-tour';
        root.innerHTML='<div class="tour-spot" aria-hidden="true"></div><section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"></section>';
        document.body.append(root);root.addEventListener('click',e=>e.stopPropagation());card=root.querySelector('.tour-card');spot=root.querySelector('.tour-spot');paint();
    }
    function close(){
        if(!active)return;active=false;root.remove();hideKeyPopup();
        // Do not mutate lesson data or run regeneration on replay/close.
        if(!wasPaused&&pausedAt)resumeLesson();
        if(previousPanel&&previousPanel!=='panel-practice')document.querySelector('.nav-tab[data-target="'+previousPanel.replace('panel-','')+'"]')?.click();
        if(originalPopup?.isConnected){keyPopupPinned=true;showKeyPopup(originalPopup.dataset.key,originalPopup.getBoundingClientRect());}
        scrollTo(0,originalScroll);
        if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
    }
    document.addEventListener('keydown',e=>{
        if(!active)return;
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();return;}
        if(e.key==='Tab'){
            const f=[...card.querySelectorAll('button:not(:disabled)')],i=f.indexOf(document.activeElement);
            e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus();
        }else if(e.key==='ArrowRight'&&e.target.id!=='tour-language'){e.preventDefault();index===copy.length-1?close():move(1);}
        else if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
        e.stopImmediatePropagation();
    },true);
    document.addEventListener('focusin',e=>{if(active&&!card.contains(e.target))card.querySelector('#tour-next').focus({preventScroll:true});});
    window.addEventListener('resize',()=>{if(active&&(index===8||index===9))popup();position();});window.addEventListener('scroll',position,true);
    $('#tour-replay')?.addEventListener('click',()=>{$('#avatar-menu').hidden=true;start();});
    window.TankanTour={start,close,get active(){return active;},get step(){return index;}};
    // Check the pre-initialization snapshot, not a default save generated later.
    // Signed-in visitors may be awaiting account restore; never auto-interrupt them.
    let interacted=false;
    ['keydown','pointerdown','touchstart'].forEach(type=>document.addEventListener(type,()=>{interacted=true;},{once:true,capture:true}));
    const eligible=()=>!read(SEEN)&&!window.__tankanHadLocalProgress&&!interacted&&!totalTypedCount&&!totalLessons&&!sessionStartTime&&cursorIndex===0&&$('#panel-practice')?.classList.contains('active');
    if(window.__tankanAuthClient){
        window.__tankanAuthClient.then(client=>client.onAuth(user=>{if(!user&&eligible())setTimeout(()=>{if(eligible())start();},600);})).catch(()=>{});
    }
})();
