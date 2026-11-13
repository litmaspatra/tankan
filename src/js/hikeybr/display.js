'use strict';

        // 9. DISPLAY & CURSOR UPDATER (KRUTIDEV 010 ENGINE)
        // ─────────────────────────────────────────────────────────────
        function renderLessonFont() {
            const font=FONT_REGISTRY[displayFont]||FONT_REGISTRY.krutidev;
            el.textStreamContainer.style.fontFamily=`'${font.family}', 'Noto Sans Devanagari', sans-serif`;
            if(font.encoding!=='unicode')return;
            // Split at grapheme-cluster boundaries only: Indic shaping never crosses
            // a cluster, so the exact cluster being typed (base + its matra) is
            // highlighted without breaking glyphs in any Unicode font (Mangal, Noto).
            const text=currentLessonText||'';
            const segs=segmenter?Array.from(segmenter.segment(text),s=>s.segment):Array.from(text);
            const ends=[];let off=0;
            for(const g of segs){off+=(g===' '?1:unicodeToKrutiDev(g).length);ends.push(off);}
            let idx=segs.length;
            for(let i=0;i<segs.length;i++){if(cursorIndex<ends[i]){idx=i;break;}}
            el.textCorrect.textContent=segs.slice(0,idx).join('');
            el.textCurrent.textContent=idx<segs.length?segs[idx]:'';
            el.textCurrent.className='text-current'+(idx<segs.length&&segs[idx]===' '?' space-cursor':'');
            el.textRemaining.textContent=idx<segs.length?segs.slice(idx+1).join(''):'';
        }

        function updateDisplay() {
            if (el.srLesson && el.srLesson.dataset.text !== currentLessonText) {
                el.srLesson.dataset.text = currentLessonText;
                el.srLesson.textContent = currentLessonText;
            }
            const lessonPct=targetKrutiText.length?Math.min(100,Math.round(cursorIndex/targetKrutiText.length*100)):0;
            document.getElementById('lesson-completion-pct').textContent=lessonPct+'%';
            document.getElementById('lesson-completion-fill').style.width=lessonPct+'%';
            if (!targetKrutiText) {
                targetKrutiText = unicodeToKrutiDev(currentLessonText || generateLessonText());
            }

            // 1. Correct portion: KrutiDev font renders complete green Hindi glyphs!
            // When a half-letter like "'" (श्) is typed, ONLY the half-letter is sliced in textCorrect!
            el.textCorrect.textContent = targetKrutiText.substring(0, cursorIndex);

            // 2. Error portion is always empty because cursor never advances on error
            if (el.textError) el.textError.textContent = '';

            // 3. Current character & Remaining text
            if (document.getElementById('live-hint-prefix')) document.getElementById('live-hint-prefix').textContent = cursorIndex < targetKrutiText.length ? 'Next key: Press ' : '';
            if (document.getElementById('live-hint-for')) document.getElementById('live-hint-for').textContent = cursorIndex < targetKrutiText.length ? ' for ' : ' ';
            if (cursorIndex < targetKrutiText.length) {
                const currChar = targetKrutiText.charAt(cursorIndex);
                el.textCurrent.textContent = currChar;
                el.textCurrent.className = 'text-current' + (currChar === ' ' ? ' space-cursor' : '');
                el.textRemaining.textContent = targetKrutiText.substring(cursorIndex + 1);
            } else {
                el.textCurrent.textContent = '';
                el.textCurrent.className = 'text-current';
                el.textRemaining.textContent = '';
            }

            renderLessonFont();

            // Keep cursor smoothly scrolled in view
            if (el.textCurrent && el.textCurrent.textContent) {
                // Keep the cursor visible inside the stream container only;
                // never move the page (settings changes must not jump the view).
                const cont = el.textStreamContainer;
                const r = el.textCurrent.getBoundingClientRect(), c = cont.getBoundingClientRect();
                if (r.bottom > c.bottom - 4) cont.scrollTop += r.bottom - c.bottom + 16;
                else if (r.top < c.top + 4) cont.scrollTop -= c.top - r.top + 16;
            }

            // 4. Keyboard highlight & live hint strip
            if (cursorIndex < targetKrutiText.length) {
                const expected = targetKrutiText.charAt(cursorIndex);
                const prev = cursorIndex > 0 ? targetKrutiText.charAt(cursorIndex - 1) : null;
                const hint = getKrutiKeystrokeHint(expected, prev);

                el.liveHintKey.textContent = hint.keyLabel;
                el.liveHintChar.textContent = hint.hindiChar;
                el.liveHintDetail.textContent = hint.detail ? `(${hint.detail})` : '';

                updateKeyboardHighlights({
                    targetKey: hint.physicalKey,
                    isShifted: hint.isShifted
                });

                // Alt code: folded into the fixed-height hint strip so the
                // page layout never shifts when a conjunct comes up.
                const altCode = GLYPH_TO_ALT_CODE[hint.hindiChar];
                if (altCode) {
                    const catalogRow = ALT_CODES_CATALOG.find(x => x.glyph === hint.hindiChar);
                    el.liveHintDetail.textContent = (hint.detail ? '(' + hint.detail + ') ' : '') + '• Alt + ' + altCode + ' on Numpad' + (catalogRow ? ' • ' + catalogRow.gail : '');
                }
            } else {
                el.liveHintKey.textContent = '✓';
                el.liveHintChar.textContent = 'Lesson Complete!';
                el.liveHintDetail.textContent = '';
                el.altHelperBar.classList.remove('active');
                updateKeyboardHighlights(null);

                // Complete once, and introduce any queued key only afterward.
                if (!lessonCompleted) {
                    lessonCompleted = true;
                    lessonEndedAt=Date.now();
                    recordCompletedLesson();
                    updateMasteryCard();
                    const item = KEY_PROGRESSION[unlockedIndex];
                    const ks = keyStats[item.k];
                    ks.targetLessons = (ks.targetLessons || 0) + 1;
                    const state = currentUnlockState();
                    if (state.ready) pendingUnlockIndex = unlockedIndex;
                    const cleared = !reviewMode && textSource==='words' && unlockedIndex === highestUnlocked && pendingUnlockIndex === unlockedIndex &&
                        sessionCorrect/Math.max(1,sessionCorrect+sessionErrors)>=.95 && unlockedIndex < KEY_PROGRESSION.length - 1;
                    if (cleared) {
                        unlockedIndex=advancePastSkipped(unlockedIndex+1);
                        highestUnlocked=Math.max(highestUnlocked,unlockedIndex);
                        pendingUnlockIndex = null;
                        targetKeyBuffer = [];
                        populateJumpSelect();
                        updateAlphabetStrip();
                        el.metricUnlocked.textContent = KEY_PROGRESSION.filter((it,i)=>i<=highestUnlocked&&!it.skip).length;
                        el.leadSamplesStatus.textContent = 'Key cleared - the next lesson has begun';
                        el.liveHintChar.textContent = `Key cleared: ${item.h}!`;
                        el.liveHintDetail.textContent = `Next lesson introduces ${KEY_PROGRESSION[unlockedIndex].h}`;
                    }
                    if(cleared)sound.unlock();
                    saveStorage();
                    const last=lessonHistory.at(-1);
                    // keybr-style everywhere: the finished lesson's stats fold into
                    // the metrics and history, and a freshly generated lesson
                    // REPLACES the text instantly - a separate lesson, not appended
                    // text, and no Enter/Continue/toast.
                    const guidance=textSource!=='words'?'':cleared?'Key cleared. Next: '+KEY_PROGRESSION[unlockedIndex].h:state.ready?'Ready. Continue to practice.':!state.recentAccuracy?'Reach 95% accuracy in a completed lesson.':state.samples<10?'Need 10 clean target timings.':!state.starterReady?'Calibrate each starter key at goal speed.':'Best target speed is below your '+targetSpeedGoal+' WPM goal.';
                    if(textSource==='words')flashPracticeEvent('Lesson: '+last.wpm.toFixed(1)+' WPM · '+last.acc.toFixed(1)+'% accuracy'+(pendingLessonEvents.length?' · '+pendingLessonEvents.join(' · '):'')+(guidance?' · '+guidance:''));
                    pendingLessonEvents=[];
                    regenerateLesson();
                }
            }
        }

        function regenerateLesson() {
            lessonCompleted = false;
            pausedAt=null;pausedTotal=0;lessonEndedAt=null;
            pendingUnlockIndex = null;
            lessonKeyTimes = {}; measurementEvents=[]; previousAttemptWrong=false; lessonActiveSeconds = 0; activityAt = null;
            currentLessonText = generateLessonText();
            targetKrutiText = unicodeToKrutiDev(currentLessonText);
            cursorIndex = 0;
            rawKeys = [];practiceAlias='';
            sessionCorrect = 0;
            sessionErrors = 0;
            sessionStartTime = null;
            lastKeystrokeTime = null;
            pendingShiftTiming.clear();
            { const ht=document.getElementById('canvas-hint-text'); if(ht) ht.textContent='Start typing'; }

            updateDisplay();
            updateAlphabetStrip();
            updateMasteryCard();
            updateLiveStats();
            updateLessonPreview();updateBookPanel();
        }

        // ─────────────────────────────────────────────────────────────
