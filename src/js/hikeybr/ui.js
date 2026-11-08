'use strict';

        // 11. EVENT LISTENERS & LIFECYCLE
        // ─────────────────────────────────────────────────────────────
        el.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            el.hiddenInput.focus({preventScroll:true});
        });

        document.addEventListener('keydown', (e) => {
            const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (tag !== 'select' && tag !== 'button' && tag !== 'input' && tag !== 'textarea' && !e.ctrlKey && !e.metaKey) {
                el.hiddenInput.focus({preventScroll:true});
            }
        });

        el.hiddenInput.addEventListener('input', () => {
            // Windows can deliver the OS-composed Alt-code symbol as a bare
            // insertion with no keydown and no Alt keyup: commit the buffer.
            if (altCodeActive) commitPracticeAltCode();
            el.hiddenInput.value = '';
        });
        el.hiddenInput.addEventListener('focus', () => el.canvas.classList.add('active-focus'));
        el.hiddenInput.addEventListener('blur', () => el.canvas.classList.remove('active-focus'));

        // Keystroke Dispatcher on hiddenInput
        el.hiddenInput.addEventListener('keydown', (e) => {
            // A fresh Alt press while a code is still pending means the previous
            // Alt release was swallowed by the OS: flush the old entry first.
            if (e.key === 'Alt' && altCodeActive) commitPracticeAltCode();

            // Alt + Numpad entry
            if (e.altKey && NUMPAD_DIGIT_MAP[e.code]) {
                e.preventDefault();
                if(!altCodeActive)altEntryStartedAt=Date.now();
                altCodeActive = true;
                altCodeBuffer += NUMPAD_DIGIT_MAP[e.code];
                return;
            }

            // A non-modifier key arriving while an Alt code is pending means
            // Windows swallowed the Alt keyup: commit the buffered code first.
            if (altCodeActive && !MODIFIER_KEYS.includes(e.key)) commitPracticeAltCode();

            // Swallow the OS-composed Alt-code symbol itself (always non-ASCII
            // for KrutiDev codes); the buffered code above already handled it.
            if (e.key.length === 1 && e.key.charCodeAt(0) > 127 && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                return;
            }

            // Ignored system keys
            if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape',
                 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) {
                return;
            }

            // BUG 2: Non-character keys (Enter, Arrow keys, Delete, Home, End, PageUp, PageDown, Insert, etc.)
            if (e.key.length > 1 && e.key !== 'Backspace') return;

            if (e.ctrlKey || e.metaKey) return;

            e.preventDefault();

            // Backspace handling
            if (e.key === 'Backspace') {
                if(lessonCompleted)return;
                if (cursorIndex > 0) {
                    cursorIndex--;
                    const removed=measurementEvents.pop();
                    const active=KEY_PROGRESSION[unlockedIndex];
                    if(removed?.key===active.k&&removed.ms>0&&!active.conjunct&&!active.alt)keyStats[active.k].targetSamples=Math.max(0,(keyStats[active.k].targetSamples||0)-1);
                    sessionCorrect=Math.max(0,sessionCorrect-1);
                    if (rawKeys.length > 0) rawKeys.pop();
                    sound.click();
                    updateDisplay();
                    updateMasteryCard();
                }
                return;
            }

            let pressed = e.key;
            if (e.code === 'Space') pressed = ' ';
            else if (e.code === 'Semicolon') pressed = e.shiftKey ? ':' : ';';
            else if (e.code === 'Quote') pressed = e.shiftKey ? '"' : "'";
            else if (e.code === 'Comma') pressed = e.shiftKey ? '<' : ',';
            else if (e.code === 'Period') pressed = e.shiftKey ? '>' : '.';
            else if (e.code === 'Slash') pressed = e.shiftKey ? '?' : '/';
            else if (e.code === 'BracketLeft') pressed = e.shiftKey ? '{' : '[';
            else if (e.code === 'BracketRight') pressed = e.shiftKey ? '}' : ']';
            else if (e.code === 'Backquote') pressed = e.shiftKey ? '~' : '`';
            else if (e.code === 'Equal') pressed = e.shiftKey ? '+' : '=';
            else if (e.code === 'Minus') pressed = e.shiftKey ? '_' : '-';

            const expectedByte=targetKrutiText[cursorIndex];
            const alias=ALT_CODES_CATALOG.find(x=>unicodeToKrutiDev(x.glyph)===expectedByte&&x.gail.length>1);
            if(alias&&(practiceAlias||pressed===alias.gail[0])){
                e.preventDefault();practiceAlias+=pressed;
                if(practiceAlias===alias.gail){practiceAlias='';handleKeystroke(expectedByte);}
                else if(!alias.gail.startsWith(practiceAlias)){practiceAlias='';handleKeystroke(pressed);}
                return;
            }
            handleKeystroke(pressed);
            el.hiddenInput.value = '';
        });

        // Commit a buffered Alt code as one input unit. Windows composes
        // Alt+numpad codes at the OS level: it can swallow the Alt keyup and
        // push the composed (non-ASCII) symbol into the field instead, so the
        // keyup below is only one of several commit signals (see the keydown
        // and input handlers on hiddenInput).
        function commitPracticeAltCode() {
            if (!altCodeActive) return;
            const code = altCodeBuffer;
            // Alt+numpad is one committed text action, not 4/5 fast synthetic keys.
            // Its duration includes the whole entry and preceding recognition time.
            altCodeBuffer = '';
            altCodeActive = false;
            altEntryStartedAt=null;

            const char = KRUTIDEV_ALT_CODES[code];
            if (char) {
                const krutiSeq = unicodeToKrutiDev(char);
                // One Alt-code glyph is ONE input unit (see Settings > How
                // measurements work). Run each expected byte through the
                // normal path so the cursor, error blocking, display and
                // sounds stay correct, then merge the synthetic per-byte
                // measurements and counters into a single unit. The first
                // byte's interval reaches back to the previous committed
                // key, so it already spans the whole Alt entry.
                const startCursor = cursorIndex;
                const typedBefore = totalTypedCount, correctBefore = sessionCorrect;
                for (const k of krutiSeq) {
                    if (cursorIndex >= targetKrutiText.length) break;
                    const matched = k === targetKrutiText.charAt(cursorIndex);
                    handleKeystroke(k);
                    if (!matched) break; // one wrong Alt glyph = one error; cursor stays blocked
                }
                const addedTyped = totalTypedCount - typedBefore, addedCorrect = sessionCorrect - correctBefore;
                if (addedTyped > 1) totalTypedCount -= addedTyped - 1;
                if (addedCorrect > 1) sessionCorrect -= addedCorrect - 1;
                const committed = cursorIndex - startCursor;
                if (committed > 1 && committed === krutiSeq.length) {
                    const added = measurementEvents.splice(measurementEvents.length - committed, committed);
                    const wholeMs = added.reduce((sum, ev) => sum + ev.ms, 0);
                    measurementEvents.push({ key: krutiSeq, ms: wholeMs, typo: added[0].typo });
                    if (wholeMs > 0) {
                        const lastBuf = targetKeyBuffer[targetKeyBuffer.length - 1];
                        if (lastBuf && lastBuf.isCorrect && !lastBuf.wpm && Date.now() - lastBuf.timestamp < 100) lastBuf.wpm = 12000 / wholeMs;
                    }
                }
                el.hiddenInput.value = '';
            }
        }

        // Keyup for Alt-code release (unreliable on Windows; see above).
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') commitPracticeAltCode();
        });

        window.addEventListener('blur',pauseLesson);
        document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseLesson();});
        const exportBtn=document.getElementById('export-progress-btn');
        if(exportBtn)exportBtn.onclick=()=>{
            let data={};
            try{data=JSON.parse(localStorage.getItem('hikeybr_store_v3')||'{}');}catch(_){}
            const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
            const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tankan-progress.json';a.click();
            setTimeout(()=>URL.revokeObjectURL(a.href),5000);
        };
        const importFile=document.getElementById('import-progress-file');
        if(importFile)importFile.addEventListener('change',e=>{
            const f=e.target.files&&e.target.files[0];if(!f)return;
            const r=new FileReader();
            r.onload=()=>{try{
                const data=JSON.parse(r.result);
                if(!data||typeof data!=='object'||Array.isArray(data))throw 0;
                localStorage.setItem('hikeybr_store_v3',JSON.stringify(data));
                location.reload();
            }catch(_){alert('That file is not a valid Tankan progress export.');}};
            r.readAsText(f);
        });
        // Navigation Tabs switching
        document.querySelectorAll('.nav-tab[data-target]').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.target;
                if(target!=='practice')pauseLesson();

                document.querySelectorAll('.nav-tab[data-target]').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                const targetPanel = document.getElementById(`panel-${target}`);
                if (targetPanel) targetPanel.classList.add('active');

                if (target === 'profile') {
                    updateProfileTable();
                    renderProfileCharts();
                }
                if (target === 'practice') {
                    setTimeout(() => el.hiddenInput.focus({preventScroll:true}), 60);
                }
            });
        });

        // Logo click -> Jump to Practice
        document.getElementById('logo-btn').addEventListener('click', () => {
            document.querySelector('.nav-tab[data-target="practice"]').click();
        });

        // Speed Goal Selector
        el.speedGoalSelect.addEventListener('change', (e) => {
            targetSpeedGoal = parseInt(e.target.value, 10);
            if (el.settingsSpeedGoal) el.settingsSpeedGoal.value = targetSpeedGoal;
            targetKeyBuffer = [];
            updateMasteryCard();
            saveStorage();
        });

        // Quick Controls
        el.jumpSelect.addEventListener('change', (e) => {
            reviewMode=e.target.value!=='auto';
            const selected=reviewMode?parseInt(e.target.value,10):highestUnlocked;
            if(!Number.isInteger(selected)||selected<0||selected>highestUnlocked)return;
            unlockedIndex=selected;
            targetKeyBuffer = [];
            saveStorage();
            regenerateLesson();
        });

        el.wordsSelect.addEventListener('change', ()=>{saveStorage();regenerateLesson();});
        // ---- Lessons panel (keybr-style) ----
        const $id=id=>document.getElementById(id);
        const refocus=()=>setTimeout(()=>el.hiddenInput.focus({preventScroll:true}),60);
        const applyOpts=(regen)=>{saveStorage();syncSettingsUI();if(regen)regenerateLesson();};
        document.querySelectorAll('.ls-tab').forEach(t=>t.addEventListener('click',()=>{
            const tab=t.dataset.lstab;
            const books=window.HIKEYBR_BOOKS||[];
            if(tab==='words')textSource='words';
            else if(tab==='books'){const lb=findBook(opts.lastBook);textSource=(lb&&lb.kind!=='essay')?opts.lastBook:((books.find(b=>b.kind!=='essay')||{}).id)||'words';}
            else if(tab==='essays'){const le=findBook(opts.lastEssay);textSource=(le&&le.kind==='essay')?opts.lastEssay:((books.find(b=>b.kind==='essay')||{}).id)||'words';}
            else textSource=opts.customText.trim()?'custom':'words';
            forceTab=(tab==='custom'&&!opts.customText.trim())?'custom':null;
            saveStorage();syncSettingsUI();regenerateLesson();
            if(forceTab)$id('custom-text').focus({preventScroll:true});else refocus();
        }));
        $id('book-select').addEventListener('change',e=>{opts.lastBook=e.target.value;textSource=e.target.value;applyOpts(true);refocus();});
        $id('essay-select').addEventListener('change',e=>{opts.lastEssay=e.target.value;textSource=e.target.value;applyOpts(true);refocus();});
        $id('para-range').addEventListener('change',e=>{const b=findBook(textSource);if(!b)return;bookPos[b.id]=parseInt(e.target.value,10)-1;applyOpts(true);refocus();});
        $id('para-range').addEventListener('input',e=>{$id('para-val').textContent='#'+e.target.value;});
        const stepPara=d=>{const b=findBook(textSource);if(!b)return;const n=bookParagraphs(b).length;if(!n)return;bookPos[b.id]=(((lastLessonParaStart+d)%n)+n)%n;applyOpts(true);refocus();};
        $id('para-prev').onclick=()=>stepPara(-1);$id('para-next').onclick=()=>stepPara(1);
        $id('opt-strict').onchange=e=>{opts.strict=e.target.checked;targetKeyBuffer=[];applyOpts(true);updateMasteryCard();};
        $id('opt-repeat').oninput=e=>{opts.repeat=parseInt(e.target.value,10);$id('opt-repeat-val').textContent=opts.repeat;};
        $id('opt-repeat').onchange=()=>{applyOpts(true);refocus();};
        $id('opt-punct').oninput=e=>{opts.punct=parseInt(e.target.value,10);$id('opt-punct-val').textContent=opts.punct+'%';};
        $id('opt-punct').onchange=()=>{applyOpts(true);refocus();};
        ['opt-removepunct','opt-removepunct2'].forEach(id=>$id(id).onchange=e=>{opts.removePunct=e.target.checked;applyOpts(true);});
        $id('opt-stop').onchange=e=>{opts.stopOnError=e.target.checked;applyOpts(false);};
        $id('opt-skip').onchange=e=>{opts.spaceSkips=e.target.checked;applyOpts(false);};
        $id('opt-cursor').onchange=e=>{opts.cursorHighlight=e.target.checked;applyOpts(false);};

        // Focus mode: the paragraph box glides from its current spot to fill
        // the screen (below the exit button), the rest of the UI fades out.
        // Esc or the corner button exits; everything animates back.
        let focusMode=false,focusRect=null;
        const FOCUS_TOP=54,FOCUS_SIDE=12,FOCUS_BOTTOM=12;
        const focusTargetRect=()=>{
            const w=window.innerWidth,width=Math.min(Math.max(280,w-2*FOCUS_SIDE),920); // comfortable reading width on desktop
            return {top:FOCUS_TOP,left:Math.round((w-width)/2),width,height:Math.max(160,window.innerHeight-FOCUS_TOP-FOCUS_BOTTOM)};
        };
        const applyCanvasRect=(cv,r)=>{cv.style.top=r.top+'px';cv.style.left=r.left+'px';cv.style.width=r.width+'px';cv.style.height=r.height+'px';};
        const focusFont=()=>{
            // Grow the text ~25% from its current rendered size (capped), so
            // the "come forward" is visible on phones too (the small-screen
            // CSS cap would otherwise pin the size and hide any bump).
            // Desktop: fixed 32px (user's choice). Phone: 25% above the small-screen
            // size, which the CSS cap would otherwise pin and hide.
            const fs=window.innerWidth>=640?32:Math.min(42,Math.round((parseFloat(getComputedStyle($id('text-stream-container')).fontSize)||28)*1.25));
            document.documentElement.style.setProperty('--focus-fs',fs+'px');
        };
        const setFocusMode=on=>{
            const cv=$id('typing-canvas'),b=$id('focus-toggle');
            if(on){
                focusMode=true;
                const r=cv.getBoundingClientRect();
                focusRect={top:r.top,left:r.left,width:r.width,height:r.height};
                cv.style.position='fixed';cv.style.margin='0';cv.style.zIndex='100';
                applyCanvasRect(cv,focusRect);
                cv.classList.add('focus-canvas');
                document.documentElement.classList.add('focus-mode');
                b.textContent='\u2715';b.title='Exit focus mode (Esc)';
                focusFont();
                requestAnimationFrame(()=>requestAnimationFrame(()=>{if(focusMode)applyCanvasRect(cv,focusTargetRect());}));
            }else{
                focusMode=false;
                document.documentElement.classList.remove('focus-mode');
                document.documentElement.style.removeProperty('--focus-fs');
                b.textContent='\u26F6';b.title='Focus mode: show only the typing text';
                if(focusRect)applyCanvasRect(cv,focusRect); // glides back; .focus-canvas still on
                setTimeout(()=>{
                    cv.classList.remove('focus-canvas');
                    cv.style.position='';cv.style.top='';cv.style.left='';cv.style.width='';cv.style.height='';cv.style.margin='';cv.style.zIndex='';
                },450);
            }
            el.hiddenInput.focus({preventScroll:true});
        };
        $id('focus-toggle').addEventListener('click',()=>setFocusMode(!focusMode));
        document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusMode){e.preventDefault();setFocusMode(false);}});
        window.addEventListener('resize',()=>{if(focusMode){applyCanvasRect($id('typing-canvas'),focusTargetRect());focusFont();}});
        document.querySelectorAll('input[name=snd]').forEach(r=>r.onchange=()=>{opts.soundMode=r.value;applyOpts(false);sound.click();});
        $id('opt-volume').oninput=e=>{opts.volume=parseInt(e.target.value,10);$id('opt-volume-val').textContent=opts.volume+'%';};
        $id('opt-volume').onchange=()=>{saveStorage();sound.click();};
        $id('opt-theme').onchange=e=>{opts.soundTheme=e.target.value;applyOpts(false);sound.click();};
        $id('opt-font').onchange=async e=>{
            const requested=e.target.value;
            await ensureFontLoaded(requested);
            document.documentElement.dataset.fontReady='1';
            displayFont=requested;if(document.getElementById('display-font-select'))document.getElementById('display-font-select').value=displayFont;saveStorage();applyDisplayPreferences();regenerateLesson();
        };
        $id('opt-text-size').oninput=e=>{opts.textSize=parseInt(e.target.value,10)||32;$id('opt-text-size-val').textContent=opts.textSize+'px';applyPracticeTextPrefs();saveStorage();};
        $id('custom-text').onchange=e=>{opts.customText=e.target.value;Object.keys(bookWordCache).forEach(k=>{if(k.startsWith('custom'))delete bookWordCache[k];});
            textSource=opts.customText.trim()?'custom':'words';forceTab=opts.customText.trim()?null:'custom';applyOpts(true);};
        el.speedGoalSelect.addEventListener('input',e=>{const v=parseInt(e.target.value,10);const l=$id('speed-goal-val');if(l)l.textContent=v.toFixed(1)+' wpm';});

        const dgl=document.getElementById('daily-goal-select-lesson');
        if(dgl){dgl.addEventListener('change',e=>{dailyGoalMinutes=Number(e.target.value);const d=document.getElementById('daily-goal-select');if(d)d.value=dailyGoalMinutes;saveStorage();updateInsights();});}

        // Sound Toggle
        el.soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            updateSoundUI();
            saveStorage();
            if (soundEnabled) sound.click();
        });

        // Theme Toggle
        const themes = ['dark', 'navy', 'amber', 'light', 'sunshine', 'forest'];
        el.themeBtn.addEventListener('click', () => {
            const nextIdx = (themes.indexOf(currentTheme) + 1) % themes.length;
            currentTheme = themes[nextIdx];
            document.documentElement.setAttribute('data-theme', currentTheme);
            if (el.themeSelect) el.themeSelect.value = currentTheme;
            saveStorage();
        });

        if (el.themeSelect) {
            el.themeSelect.addEventListener('change', (e) => {
                currentTheme = e.target.value;
                document.documentElement.setAttribute('data-theme', currentTheme);
                saveStorage();
            });
        }

        if (el.fingerHintSelect) {
            el.fingerHintSelect.addEventListener('change', (e) => {
                showFingerHint = e.target.value === 'show';
                el.leadFinger.style.display = showFingerHint ? 'block' : 'none';
                saveStorage();
            });
        }

        // Fullscreen toggle (Fullscreen API - the programmatic equivalent of F11).
        const fsBtn=document.getElementById('fullscreen-btn');
        if(fsBtn){
            const fsNote=document.getElementById('fullscreen-status');
            const reqFs=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
            const exitFs=document.exitFullscreen||document.webkitExitFullscreen;
            const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
            const fsLabel=()=>{fsBtn.textContent=fsEl()?'Exit Fullscreen':'Enter Fullscreen';};
            if(!reqFs){
                fsBtn.disabled=true;
                if(fsNote)fsNote.textContent='Fullscreen is not supported in this browser. On iPhone, use Safari\'s "Add to Home Screen" for a fullscreen app.';
            }else{
                fsBtn.addEventListener('click',()=>{
                    const p=fsEl()?exitFs.call(document):reqFs.call(document.documentElement);
                    if(p&&p.catch)p.catch(()=>{});
                });
                document.addEventListener('fullscreenchange',fsLabel);
                document.addEventListener('webkitfullscreenchange',fsLabel);
                fsLabel();
            }
        }

        // Practice-page Alt-sequence alias state (shared with the hint catalog).
        let practiceAlias='';

        document.getElementById('lesson-style-select').addEventListener('change',e=>{lessonStyle=e.target.value;applyDisplayPreferences();saveStorage();});
        document.getElementById('key-font-select').addEventListener('change',e=>{keyFont=e.target.value;applyDisplayPreferences();saveStorage();});
        const smoothSlider=document.getElementById('smoothness');
        if(smoothSlider)smoothSlider.addEventListener('input',renderSpeedChart);

        // Reset Modal Handlers
        function openResetModal() {
            el.confirmModal.classList.add('open');
        }
        function closeResetModal() {
            el.confirmModal.classList.remove('open');
        }

        if (el.resetSettingsBtn) el.resetSettingsBtn.addEventListener('click', openResetModal);
        el.modalCancelBtn.addEventListener('click', closeResetModal);
        el.confirmModal.addEventListener('click', (e) => {
            if (e.target === el.confirmModal) closeResetModal();
        });

        el.modalConfirmBtn.addEventListener('click', () => {
            // Clear only learning data; immediately save the retained preferences.
            reviewMode=false;
            unlockedIndex = INITIAL_UNLOCKED_COUNT - 1;
            highestUnlocked=unlockedIndex;
            totalTypedCount = 0;
            totalErrorsCount = 0;
            targetKeyBuffer = [];
            keyStats = {};
            recentLessonWords=[];
            lessonHistory = []; keyLearning = {}; dailyPractice = {day:'',seconds:0}; accuracyStreak=0;
            altCodeBuffer = '';
            altCodeActive = false;
            initKeyStats();
            populateJumpSelect();
            regenerateLesson();
            updateProfileTable();
            saveStorage();
            closeResetModal();
            setTimeout(() => el.hiddenInput.focus({preventScroll:true}), 60);
        });

        // ─────────────────────────────────────────────────────────────
