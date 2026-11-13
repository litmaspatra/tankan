'use strict';

        // 10. TYPING INPUT ENGINE (STRICT ERROR BLOCKING & METRICS)
        // ─────────────────────────────────────────────────────────────
        function lessonElapsed(){return sessionStartTime?Math.max(0,(lessonEndedAt||pausedAt||Date.now())-sessionStartTime-pausedTotal):0;}
        function pauseLesson(){if(sessionStartTime&&!lessonCompleted&&!pausedAt){pausedAt=Date.now();activityAt=null;lastKeystrokeTime=null;pendingShiftTiming.clear();const ht=document.getElementById('canvas-hint-text');if(ht)ht.textContent='Paused';}}
        function resumeLesson(){if(pausedAt){pausedTotal+=Date.now()-pausedAt;pausedAt=null;lastKeystrokeTime=null;activityAt=null;pendingShiftTiming.clear();const ht=document.getElementById('canvas-hint-text');if(ht)ht.textContent='Typing…';}el.hiddenInput.focus({preventScroll:true});}
        function handleKeystroke(keyString) {
            if(pausedAt)resumeLesson();
            if (cursorIndex >= targetKrutiText.length) return;

            const expected = targetKrutiText.charAt(cursorIndex);
            const now = Date.now();
            const day = new Date(now).toLocaleDateString('en-CA');
            if(dailyPractice.day!==day)dailyPractice={day,seconds:0};
            if(activityAt!==null && now-activityAt<=5000)dailyPractice.seconds+=(now-activityAt)/1000;
            activityAt=now;
            if (!sessionStartTime) { sessionStartTime = now; const ht=document.getElementById('canvas-hint-text'); if(ht) ht.textContent='Typing\u2026'; }

            totalTypedCount++;

            // Visual feedback on virtual keyboard
            const domKey = keyDOMMap.get(keyString) || keyDOMMap.get(keyString.toLowerCase());
            if (domKey) {
                domKey.classList.add('pressed');
                setTimeout(() => domKey.classList.remove('pressed'), 90);
            }

            const activeItem = KEY_PROGRESSION[unlockedIndex];
            const interval=lastKeystrokeTime===null?0:now-lastKeystrokeTime;
            const timingActions=1+pendingShiftTiming.size;
            pendingShiftTiming.clear(); // consumed even by an incorrect attempt
            lastKeystrokeTime=now;
            // Keep the existing raw-gap filter. A modifier must not turn an
            // idle gap into a clean sample or change overall elapsed WPM.
            const validInterval=interval>=40&&interval<=12000?interval/timingActions:0;

            // ─────────────────────────────────────────────────────────
            // STRICT ERROR BLOCKING:
            // If pressed key does NOT match expected, DO NOT ADVANCE!
            // ─────────────────────────────────────────────────────────
            if (opts.spaceSkips && keyString === ' ' && expected !== ' ') {
                let j = targetKrutiText.indexOf(' ', cursorIndex);
                cursorIndex = j < 0 ? targetKrutiText.length : j + 1;
                rawKeys.push(' ');
                updateDisplay(); updateLiveStats();
                return;
            }
            if (keyString !== expected) {
                previousAttemptWrong=true;
                sound.error();
                sessionErrors++;
                totalErrorsCount++;

                const errorStats = keyStats[expected] || keyStats[expected.toLowerCase()];
                if (errorStats) errorStats.errors++;

                saveStorage();
                // Penalize sliding confidence buffer for active learning key or conjunct
                if (activeItem.conjunct) {
                    const seq = unicodeToKrutiDev(activeItem.h);
                    let insideSeq = false;
                    const minStart = Math.max(0, cursorIndex - seq.length + 1);
                    const maxStart = cursorIndex;
                    for (let s = minStart; s <= maxStart; s++) {
                        if (s + seq.length <= targetKrutiText.length && targetKrutiText.substring(s, s + seq.length) === seq) {
                            insideSeq = true;
                            break;
                        }
                    }
                    if (insideSeq) {
                        targetKeyBuffer.push({
                            wpm: 5,
                            isCorrect: false,
                            timestamp: now
                        });
                        if (targetKeyBuffer.length > 15) {
                            targetKeyBuffer.shift();
                        }
                    }
                } else if (expected === activeItem.k) {
                    targetKeyBuffer.push({
                        wpm: 5,
                        isCorrect: false,
                        timestamp: now
                    });
                    if (targetKeyBuffer.length > 15) {
                        targetKeyBuffer.shift();
                    }
                }

                // Red error shake animation on the active cursor
                if (el.textCurrent) {
                    el.textCurrent.classList.remove('error-flash');
                    void el.textCurrent.offsetWidth; // Trigger DOM reflow
                    el.textCurrent.classList.add('error-flash');
                    setTimeout(() => {
                        if (el.textCurrent) el.textCurrent.classList.remove('error-flash');
                    }, 220);
                }

                if (!opts.stopOnError) { cursorIndex++; rawKeys.push(keyString); updateDisplay(); }
                updateLiveStats();
                updateMasteryCard();
                return; // with 'Stop cursor on error' (default) the cursor does not advance
            }

            // ─────────────────────────────────────────────────────────
            // CORRECT KEY: Advance cursor
            // ─────────────────────────────────────────────────────────
            sound.click();
            sessionCorrect++;
            const hitStats = keyStats[keyString] || keyStats[keyString.toLowerCase()];
            if (hitStats) hitStats.hits++;

            // Latency measurement for instantaneous speed
            const latencyMs=validInterval;
            if(latencyMs>0)(lessonKeyTimes[keyString]||(lessonKeyTimes[keyString]=[])).push(latencyMs);
            measurementEvents.push({key:keyString,ms:latencyMs,typo:previousAttemptWrong});
            previousAttemptWrong=false;
            const instantWpm=latencyMs>0?12000/latencyMs:0;

            // Only exact target-key hits feed unlock timing. Review keys still
            // populate their own heat map, never this key's unlock evidence.
            if (latencyMs>0 && !activeItem.conjunct && !activeItem.alt && keyString === activeItem.k) {
                const targetStats = keyStats[activeItem.k];
                targetStats.targetTtt = (targetStats.targetSamples || 0) === 0
                    ? latencyMs : 0.2 * latencyMs + 0.8 * targetStats.targetTtt;
                targetStats.targetSamples = (targetStats.targetSamples || 0) + 1;
                targetStats.targetRecent = (targetStats.targetRecent || []).concat(latencyMs).slice(-12);
            }

            cursorIndex++;
            rawKeys.push(keyString);
            // Hit crediting for active learning key or conjunct
            if (activeItem.conjunct) {
                const seq = unicodeToKrutiDev(activeItem.h);
                if (cursorIndex >= seq.length && targetKrutiText.substring(cursorIndex - seq.length, cursorIndex) === seq) {
                    targetKeyBuffer.push({
                        wpm: instantWpm,
                        isCorrect: true,
                        timestamp: now
                    });
                    if (targetKeyBuffer.length > 15) {
                        targetKeyBuffer.shift();
                    }
                }
            } else if (keyString === activeItem.k) {
                targetKeyBuffer.push({
                    wpm: instantWpm,
                    isCorrect: true,
                    timestamp: now
                });
                if (targetKeyBuffer.length > 15) {
                    targetKeyBuffer.shift();
                }
            }

            saveStorage();
            updateDisplay();
            updateLiveStats();
            if (!lessonCompleted) updateMasteryCard();
        }

