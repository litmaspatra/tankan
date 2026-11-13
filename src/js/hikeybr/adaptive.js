'use strict';

        // 7. KEYBR SPEED-MAINTENANCE ADAPTIVE ENGINE
        // ─────────────────────────────────────────────────────────────
        function calculateConfidence() {
            const buffer = targetKeyBuffer;
            const count = buffer.length;

            if (count < 6) {
                return {
                    confidence: Math.round((count / 12) * 30),
                    curSpeed: 0,
                    consistency: 0,
                    samplesCount: count
                };
            }

            const avgWpm = Math.round(buffer.reduce((s, x) => s + x.wpm, 0) / count);
            const speedRatio = Math.min(1.0, avgWpm / targetSpeedGoal);

            // Speed Maintenance: samples that sustained at least 85% of target speed goal
            const maintainedHits = buffer.filter(x => x.isCorrect && x.wpm >= (targetSpeedGoal * 0.85)).length;
            const consistencyRatio = maintainedHits / count;
            const accuracyRatio = buffer.filter(x => x.isCorrect).length / count;

            let score;
            if (count < 10) {
                score = (speedRatio * 0.35 + consistencyRatio * 0.35 + accuracyRatio * 0.3) * (count / 10) * 100;
            } else {
                score = (speedRatio * 0.40 + consistencyRatio * 0.40 + accuracyRatio * 0.20) * 100;
            }

            const confidence = Math.min(100, Math.round(score));
            return {
                confidence,
                curSpeed: avgWpm,
                consistency: Math.round(consistencyRatio * 100),
                samplesCount: count
            };
        }

        // Readiness banks a robust completed-lesson mean, not an EMA dragged by old lessons.
        // Ten clean timings in one accurate lesson prevent a lucky individual hit unlocking.
        function keyAboveTarget(item){
            // Strict mode only: every earlier key must have a recent measured
            // speed at the target. No measurement yet, or only an old banked
            // best, is not evidence of being above target.
            const st=keyStats[item.k]||{},ms=12000/targetSpeedGoal;
            return (st.modelSamples||0)>=6 && !!st.modelTtt && st.modelTtt<=ms;
        }
        function previousKeysAboveTarget(){return KEY_PROGRESSION.slice(0,unlockedIndex).every(keyAboveTarget);}
        function currentUnlockState() {
            const item=KEY_PROGRESSION[unlockedIndex];
            if(!item)return {pct:0,ready:false,samples:0,minimum:10};
            const ks=keyStats[item.k]||{},targetMs=12000/targetSpeedGoal;
            const samples=ks.modelSamples||0,bank=ks.accurateBest?targetMs/ks.accurateBest:0;
            // The bar shows the best speed actually measured, banked or not.
            // accurateBest only fills after a 95%-accuracy lesson with enough
            // clean timings, so gating the display on it pinned the bar at 0%
            // (and "best 0.0 WPM") even after many measured lessons.
            const measuredBest=[ks.accurateBest,ks.modelBest,ks.modelTtt].filter(v=>v&&isFinite(v)).reduce((a,b)=>Math.min(a,b),Infinity);
            const displayBank=isFinite(measuredBest)?targetMs/measuredBest:0;
            const recentAccuracy=(ks.recentLessonAccuracy||ks.lastAccuracy||0)>=95;
            const starterReady=unlockedIndex>=INITIAL_UNLOCKED_COUNT||KEY_PROGRESSION.slice(0,INITIAL_UNLOCKED_COUNT).every(x=>{
                const stats=keyStats[x.k];return (stats.modelSamples||0)>=10&&(stats.lastAccuracy||0)>=95&&stats.accurateBest&&stats.accurateBest<=targetMs;
            });
            const strictOk=!opts.strict||previousKeysAboveTarget();
            const ready=bank>=1&&samples>=10&&recentAccuracy&&starterReady&&strictOk;
            const pct=ready?100:Math.min(99,Math.round(Math.min(samples/10,displayBank)*100));
            return {pct,ready,samples,minimum:10,starterReady,bank,recentAccuracy,strictOk,measuredBest:isFinite(measuredBest)?measuredBest:null};
        }

        function updateMasteryCard() {
            const currentItem = KEY_PROGRESSION[unlockedIndex];
            if (!currentItem) return;

            el.leadChar.textContent = currentItem.h;
            el.leadKey.textContent = currentItem.alt ? (()=>{const row=ALT_CODES_CATALOG.find(x=>x.code===currentItem.alt);return row&&row.gail?`Alt + ${currentItem.alt} or type: ${row.gail}`:`Alt Code: ${currentItem.alt}`;})() : (currentItem.conjunct ? (currentItem.k === '#' ? 'Key: Shift + 3' : (()=>{const row=ALT_CODES_CATALOG.find(x=>x.glyph===currentItem.h);return row&&row.gail?`Type: ${row.gail}`:`Key: ${currentItem.finger||currentItem.h}`;})()) : `Key: ${currentItem.k.toUpperCase()}`);
            el.leadFinger.style.display = showFingerHint ? 'block' : 'none';
            el.leadFinger.textContent = currentItem.alt ? `👉 ${currentItem.finger}` : `👉 ${currentItem.finger} finger`;
            el.leadGoalSpeed.textContent = `${targetSpeedGoal} WPM`;
            { const v=document.getElementById('speed-goal-val'); if(v)v.textContent=targetSpeedGoal.toFixed(1)+' wpm'; if(el.speedGoalSelect&&el.speedGoalSelect.value!==String(targetSpeedGoal))el.speedGoalSelect.value=targetSpeedGoal; }

            const { curSpeed, consistency } = calculateConfidence();
            const unlockState = currentUnlockState();

            el.leadCurSpeed.textContent = `${curSpeed} WPM`;
            el.leadConsistency.textContent = `${consistency}%`;
            el.progressFill.style.width = `${unlockState.pct}%`;
            el.progressPct.textContent = `Key readiness: ${unlockState.pct}%`;
            el.leadSamplesStatus.textContent = `Clean timings: ${unlockState.samples} / ${unlockState.minimum || 10} (updated at lesson end)`;

            // Queue only. Never replace the lesson while it is being typed.
            if (!reviewMode && textSource==='words' && unlockState.ready && unlockedIndex < KEY_PROGRESSION.length - 1) {
                pendingUnlockIndex = unlockedIndex;
                el.leadSamplesStatus.textContent += ' - goal reached; finish the lesson';
            }

            el.metricUnlocked.textContent = KEY_PROGRESSION.filter((it,i)=>i<=highestUnlocked&&!it.skip).length;
            const activeTotal=TRAINABLE_KEY_COUNT;
            if (document.getElementById('metric-total-keys')) document.getElementById('metric-total-keys').textContent = activeTotal;
            if (document.getElementById('total-keys-header')) document.getElementById('total-keys-header').textContent = activeTotal;
            el.jumpSelect.value = reviewMode ? String(unlockedIndex) : 'auto';
            // Review pauses unlocking - say so loudly. A quiet review session
            // looks exactly like a stuck unlock (readiness can read 100% on a
            // mastered key while nothing ever advances).
            if (el.reviewBanner) {
                el.reviewBanner.hidden = !reviewMode;
                if (reviewMode) el.reviewBannerText.textContent = `Reviewing ${currentItem.h} (key ${unlockedIndex + 1}) - key unlocking is paused.`;
            }
            // Name a focus key only when the current lesson actually contains
            // it: a weakest key with no dual-key words can't appear, and
            // labelling it "practice focus" while every word targets the
            // current key reads like a stuck unlock (Kartik 2026-11-11).
            if (lastPracticeFocus && !lessonCompleted) el.leadSamplesStatus.textContent += ` - practice focus: ${lastPracticeFocus}`;
            if(!unlockState.ready){
                const current=keyStats[currentItem.k],unmet=[];
                const lastAcc=(current.recentLessonAccuracy||current.lastAccuracy||0);
                if(lastAcc<95)unmet.push('need 95% lesson accuracy'+(lastAcc>0?' (last: '+lastAcc.toFixed(1)+'%)':''));
                if((current.modelSamples||0)<10)unmet.push('need '+(10-(current.modelSamples||0))+' more clean timings');
                // The gate checks the BANKED accurateBest (95%+ lessons), which
                // can differ from the readiness bar's measuredBest (any lesson).
                // Quote the banked figure here or the line contradicts itself
                // after a fast-but-sloppy lesson.
                if((current.accurateBest||Infinity)>12000/targetSpeedGoal)unmet.push(currentItem.h+" banked best "+(current.accurateBest?(12000/current.accurateBest).toFixed(1):'none yet')+' / '+targetSpeedGoal+" WPM (banks only on 95%+ accuracy lessons, key's own pace)");
                if(!unlockState.starterReady)unmet.push('calibrating starter keys');
                if(!unlockState.strictOk)unmet.push('earlier keys must also reach the target speed');
                if(current.lastLessonWpm)unmet.push(currentItem.h+' last lesson: '+current.lastLessonWpm.toFixed(1)+' WPM own pace');
                if(unmet.length)el.leadSamplesStatus.textContent+=' · '+unmet.join(' · ');
            }

            // Keep the per-key confidence heat map live as stats change
            updateAlphabetStrip();
        }

        // Keybr-style per-key confidence heat level, from each key's smoothed
        // time-to-type vs the target speed goal:
        // 0 = not enough data (neutral), 1 = not yet good (yellow),
        // 2 = improving (yellow-green), 3 = learnt (green)
        // Review never changes unlockedIndex. Practice focus = the weakest
        // already-unlocked key by current smoothed speed: below 80% of goal
        // (below 100% in strict mode) with at least 6 samples (the same trust
        // threshold as the key colours, so the focus always matches a key the
        // user can see is red/amber). Starter keys compete on equal footing -
        // the old starter pre-emption could pin the focus on a green starter
        // that was only short of a calibration sample count, masking genuinely
        // weak keys. The current key is excluded: the lesson already targets it.
        function reviewKey() {
            const targetMs = 12000 / targetSpeedGoal;
            const currentKey = KEY_PROGRESSION[unlockedIndex] && KEY_PROGRESSION[unlockedIndex].k;
            return KEY_PROGRESSION.slice(0, unlockedIndex + 1).filter(item => {
                if (item.k === currentKey) return false;
                const stats = keyStats[item.k];
                return stats && (stats.tttSamples || 0) >= 6 && stats.ttt > (opts.strict ? targetMs : targetMs / 0.8);
            }).sort((a, b) => keyStats[b.k].ttt - keyStats[a.k].ttt)[0] || null;
        }

        function keyHeatLevel(item) {
            if (!item) return 0;
            const s = keyStats[item.k];
            if (!s || typeof s.ttt !== 'number' || !s.ttt || (s.tttSamples || 0) < 6) return 0;
            const targetMs = 12000 / targetSpeedGoal; // WPM -> ms per char (5 chars per word)
            const conf = targetMs / s.ttt;
            if (conf >= 1 && (s.lastAccuracy || 0)>=95) return 3;
            if (conf >= 0.8) return 2;
            return 1;
        }

        function updateAlphabetStrip() {
            el.alphabetContainer.innerHTML = '';

            KEY_PROGRESSION.forEach((item, idx) => {
                if (item.skip) return; // skipped keys stay in the Alt-Codes Lab reference only
                if (!showAllKeys && idx > highestUnlocked) return;
                const badge = document.createElement('div');
                badge.className = 'ak-badge';
                badge.title = `${item.h} (Key ${item.k.toUpperCase()}) — ${item.d}\nFinger: ${item.finger}`;

                if (idx <= highestUnlocked) {
                    const lvl = keyHeatLevel(item);
                    if (lvl > 0) badge.classList.add('heat-' + lvl);
                    if (idx === unlockedIndex) badge.classList.add('current');
                    const hs = keyStats[item.k];
                    if(idx<INITIAL_UNLOCKED_COUNT)badge.title += '\nStarter key: available from the first lesson, not automatically mastered';
                    if(hs?.ttt)badge.title += `\nSpeed goal: ${Math.round((12000/targetSpeedGoal)/hs.ttt*100)}%`;
                    if (hs && (hs.tttSamples || 0) >= 6 && typeof hs.ttt === 'number' && hs.ttt > 0) {
                        badge.title += `\nSmoothed speed: ~${Math.max(1, Math.round(12000 / hs.ttt))} WPM`;
                        if (hs.lastLessonWpm) badge.title += `\nLast lesson: ${hs.lastLessonWpm.toFixed(1)} WPM (key's own pace, ${(hs.lastAccuracy||0).toFixed(1)}% lesson accuracy)`;
                        if (hs.accurateBest && isFinite(hs.accurateBest)) badge.title += `\nBanked best: ${(12000/hs.accurateBest).toFixed(1)} / ${targetSpeedGoal} WPM`;
                        if (idx < unlockedIndex && hs.ttt > (12000 / targetSpeedGoal) / 0.8) {
                            badge.title += '\nNeeds practice - extra mixed-word review';
                            badge.style.outline = '1px dashed #eab308';
                        }
                    }
                } else {
                    badge.classList.add('locked');
                }

                let bar='';
                if (idx <= highestUnlocked) {
                    const hs2 = keyStats[item.k];
                    if (hs2 && hs2.modelTtt > 0 && (hs2.modelSamples||0) >= 1) {
                        // Full bar = goal reached (matches the legend "bar = key
                        // speed vs your target"); faster than goal stays full.
                        const wpm = 12000/hs2.modelTtt, ratio = Math.min(1, wpm/targetSpeedGoal);
                        const color = ratio>=1?'var(--correct)':ratio>=.8?'#eab308':'var(--error)';
                        bar = `<i class="ak-bar" style="height:${Math.max(6,Math.round(ratio*100))}%;background:${color}"></i>`;
                        badge.title += '\nBar: fills to the top at your goal speed';
                    }
                }
                badge.innerHTML = bar+`<span class="ak-char">${item.h}</span><span class="ak-key">${item.alt ? item.alt : (item.conjunct ? item.h : item.k.toUpperCase())}</span>`;

                badge.addEventListener('click', () => {
                    if (idx <= highestUnlocked) {
                        reviewMode = idx !== highestUnlocked;
                        unlockedIndex = idx;
                        targetKeyBuffer = [];
                        populateJumpSelect();
                        saveStorage();
                        regenerateLesson();
                    }
                });

                el.alphabetContainer.appendChild(badge);
            });

            const availableCount=KEY_PROGRESSION.filter((it,i)=>i<=highestUnlocked&&!it.skip).length;
            el.progressionSummary.textContent = reviewMode ? `Reviewing key ${unlockedIndex+1}` : "Automatic progression";
        }

        function applyPracticeTextPrefs() {
            document.documentElement.style.setProperty('--practice-fs', (opts.textSize || 32) + 'px');
            // Saves from before the max-size cap can hold kbScale>1: render them at 1.
            const kbScaleEff=Math.min(1,Math.max(0.5,opts.kbScale||1));
            document.documentElement.style.setProperty('--kb-scale', String(kbScaleEff));
            document.documentElement.classList.toggle('cur-off', opts.cursorHighlight === false);
            // transform: scale() keeps the frame's original layout box; pull the
            // space below up (shrink) or push it down (grow) to compensate.
            const kbf=document.getElementById('keyboard-frame');
            if(kbf)kbf.style.marginBottom=Math.round((kbScaleEff-1)*kbf.offsetHeight)+'px';
        }
        function applyDisplayPreferences() {
            document.documentElement.dataset.keyFont = keyFont;
            const kfs=document.getElementById('key-font-select'); if(kfs)kfs.value=keyFont;
            const dglv=document.getElementById('daily-goal-select-lesson');if(dglv)dglv.value=dailyGoalMinutes;
        }
        /* Measurement model v2, independently implemented after studying keybr.
           Input units are Remington text actions, NOT Unicode UTF-16 length or
           visual graphemes. ि may precede its base in the input stream; क्र via
           Alt is one action. Display encoding/font NEVER changes measurement.
           First trigger has no fabricated 400ms sample. Correct key timing is
           measured from the preceding attempt, errors are recorded separately.
           Lesson averages are smoothed alpha=.1; best filtered mean is banked.
           Unlock only at lesson end, after ten clean timings and 95% accuracy. */
        function commitKeyMeasurements() {
            KEY_PROGRESSION.slice(0,highestUnlocked+1).forEach(item=>{
                const sequence=(!item.conjunct&&!item.alt&&item.k.length===1)?item.k:unicodeToKrutiDev(item.h), times=[];
                // Match either per-byte events or one merged multi-byte event
                // (an Alt-code glyph committed as a single input unit).
                for(let end=0;end<measurementEvents.length;end++){
                    let acc='';
                    for(let start=end;start>=0;start--){
                        acc=measurementEvents[start].key+acc;
                        if(acc===sequence){
                            const group=measurementEvents.slice(start,end+1);
                            if(group.every(e=>e.ms>0&&!e.typo))times.push(group.reduce((sum,e)=>sum+e.ms,0));
                            break;
                        }
                        if(acc.length>sequence.length)break;
                    }
                }
                if(!times.length)return;
                const stats=keyStats[item.k];
                const sorted=[...times].sort((a,b)=>a-b),trim=sorted.length>=10?Math.floor(sorted.length*.1):0;
                const filtered=sorted.slice(trim,sorted.length-trim),mean=filtered.reduce((a,b)=>a+b,0)/filtered.length;
                stats.modelTtt=stats.modelTtt ? .1*mean+.9*stats.modelTtt : mean;
                stats.modelBest=Math.min(stats.modelBest||Infinity,stats.modelTtt);
                // This lesson's own pace for the key, kept beside the smoothed
                // figure so "last lesson" never has to mean the EMA (Kartik
                // 2026-11-13: "i should be able to see the last lesson tra key
                // speed too").
                stats.lastLessonWpm=12000/mean;
                stats.lastLessonSamples=times.length;
                stats.lastLessonAt=Date.now();
                const lessonAccuracy=sessionCorrect/Math.max(1,sessionCorrect+sessionErrors)*100;
                stats.lastAccuracy=lessonAccuracy;
                if(item.k===KEY_PROGRESSION[unlockedIndex].k)stats.recentLessonAccuracy=lessonAccuracy;
                // Bank from cumulative clean timings, not one lesson's worth: tiny
                // pools or short lessons can keep a single lesson under 10 clean
                // timings forever, which used to make accurateBest unreachable.
                if(lessonAccuracy>=95&&times.length>=3&&(stats.modelSamples||0)+times.length>=10)stats.accurateBest=Math.min(stats.accurateBest||Infinity,mean);
                stats.modelSamples=(stats.modelSamples||0)+times.length;
                if(item.k===KEY_PROGRESSION[unlockedIndex].k&&(item.conjunct||item.alt))stats.targetSamples=(stats.targetSamples||0)+times.length;
                stats.ttt=stats.modelTtt;stats.tttSamples=stats.modelSamples;
                const history=keyLearning[item.k]||{speeds:[],best:0,times:[],timestamps:[]};
                history.times=(history.times||[]).concat(stats.modelTtt).slice(-30);
                history.timestamps=(history.timestamps||[]).concat(Date.now()).slice(-30);
                let start=0;
                for(let i=history.times.length-1;i>0;i--){
                    if(history.timestamps[i]-history.timestamps[i-1]>3600000 || (history.times[i]>history.times[i-1]&&history.times.length-i+1>=5)){start=i;break;}
                }
                history.speeds=history.times.slice(start).map(ms=>12000/ms);
                history.best=12000/stats.modelBest;keyLearning[item.k]=history;
            });
        }
        function recordCompletedLesson() {
            commitKeyMeasurements();
            // Per-word clean timings for the official-mode slow-words drill:
            // group accepted input units by spaces, aligned with display words.
            try{
                const displayWords=currentLessonText.trim().split(/\s+/);
                const groups=[[]];
                for(const e of measurementEvents){if(e.key===' ')groups.push([]);else groups[groups.length-1].push(e);}
                if(groups.length===displayWords.length){
                    groups.forEach((g,i)=>{
                        if(!g.length||g.some(e=>e.typo||e.ms<=0||e.ms>12000))return;
                        const w=displayWords[i].replace(/।+$/,'');if(!w)return;
                        const ws=wordStats[w]||(wordStats[w]={n:0,ms:0,last:0});
                        ws.n++;ws.ms+=g.reduce((s,e)=>s+e.ms,0);ws.last=Date.now();
                    });
                    const keys=Object.keys(wordStats);
                    if(keys.length>800)keys.sort((a,b)=>(wordStats[a].n-wordStats[b].n)||(wordStats[a].last-wordStats[b].last)).slice(0,keys.length-800).forEach(k=>delete wordStats[k]);
                }
            }catch(_){/* word stats are best-effort; never block a lesson */}
            const elapsedMs=sessionStartTime?Math.max(1,lessonElapsed()):0;
            const elapsed=Math.max(.001,elapsedMs/60000);
            const acc=sessionCorrect/Math.max(1,sessionCorrect+sessionErrors)*100;
            const cpm=elapsed>0?sessionCorrect/elapsed:0;
            const complexity=new Set(measurementEvents.map(e=>e.key)).size;
            const score=complexity?Math.round(cpm*complexity/(sessionErrors+1)*(sessionCorrect/50)):0;
            const words=currentLessonText.trim().split(/\s+/).length;
            const prevBestWpm=bestLessonWpm, prevBestScore=bestScore;
            // keybr Result analog: one durable record per completed lesson.
            lessonHistory.push({wpm:cpm/5,acc,chars:sessionCorrect,errors:sessionErrors,seconds:elapsedMs/1000,keys:highestUnlocked+1,score,wordsPerMinute:elapsed?words/elapsed:0,ts:Date.now(),model:3});
            lessonHistory=lessonHistory.slice(-400);
            accuracyStreak=acc>=95?accuracyStreak+1:0;
            bestStreak=Math.max(bestStreak,accuracyStreak);
            bestLessonWpm=Math.max(bestLessonWpm,cpm/5);
            bestLessonAcc=Math.max(bestLessonAcc,acc);
            bestScore=Math.max(bestScore,score);
            totalLessons+=1;
            totalPracticeSeconds+=elapsedMs/1000;
            const day=new Date().toLocaleDateString('en-CA');
            const d=dailyStats[day]||(dailyStats[day]={seconds:0,lessons:0,typed:0,errors:0});
            d.seconds+=elapsedMs/1000;d.lessons+=1;d.typed+=sessionCorrect;d.errors+=sessionErrors;
            pendingLessonEvents=[];
            if(totalLessons>1&&prevBestWpm>0&&cpm/5>prevBestWpm)pendingLessonEvents.push('New top speed!');
            if(totalLessons>1&&prevBestScore>0&&score>prevBestScore)pendingLessonEvents.push('New top score!');
            renderProfileCharts();
        }
        let practiceEventTimer=null;
        function flashPracticeEvent(text){
            const n=document.getElementById('practice-event');
            if(!n)return;
            n.textContent=text;
            n.hidden=false;
            clearTimeout(practiceEventTimer);
            practiceEventTimer=setTimeout(()=>{n.hidden=true;},5000);
        }
        // Fit recent lesson speeds independently: degree 1/2/3 at 3/11/21
        // samples, R² >= .5, derivative at latest lesson; otherwise Uncertain.
        function learningTrend(speeds) {
            if(!speeds||speeds.length<3)return null;
            const y=speeds.slice(-30),n=y.length,d=n>20?3:n>10?2:1;
            const x=y.map((_,i)=>i/(n-1));
            const matrix=Array.from({length:d+1},(_,r)=>Array.from({length:d+2},(_,c)=>c<=d?x.reduce((sum,t)=>sum+t**(r+c),0):x.reduce((sum,t,i)=>sum+y[i]*t**r,0)));
            for(let c=0;c<=d;c++){
                let pivot=c;for(let r=c+1;r<=d;r++)if(Math.abs(matrix[r][c])>Math.abs(matrix[pivot][c]))pivot=r;
                [matrix[c],matrix[pivot]]=[matrix[pivot],matrix[c]];
                const div=matrix[c][c];if(Math.abs(div)<1e-12)return null;
                for(let k=c;k<=d+1;k++)matrix[c][k]/=div;
                for(let r=0;r<=d;r++)if(r!==c){const factor=matrix[r][c];for(let k=c;k<=d+1;k++)matrix[r][k]-=factor*matrix[c][k];}
            }
            const coef=matrix.map(row=>row[d+1]),mean=y.reduce((a,b)=>a+b,0)/n;
            const total=y.reduce((sum,v)=>sum+(v-mean)**2,0),res=y.reduce((sum,v,i)=>sum+(v-coef.reduce((acc,c,k)=>acc+c*x[i]**k,0))**2,0);
            return total>1e-9&&1-res/total>=.5?coef.reduce((sum,c,k)=>sum+k*c,0)/(n-1):null;
        }
        function updateInsights() {
            const put=(id,text)=>{const n=document.getElementById(id);if(n)n.textContent=text;};
            const last=lessonHistory.at(-1);
            const elapsed=sessionStartTime?lessonElapsed()/60000:0;
            // A brand-new session has too little data for a meaningful speed:
            // a few fast keystrokes inside the first seconds otherwise flash
            // absurd readings (thousands of WPM). Show the last finished
            // lesson's speed until 8s and 12+ accepted keystrokes are in.
            const sessionWarmed=sessionStartTime&&elapsed>=8/60&&sessionCorrect>=12;
            const liveSpeed=sessionWarmed?sessionCorrect/5/elapsed:(last?last.wpm:0);
            const liveAcc=sessionCorrect+sessionErrors?sessionCorrect/(sessionCorrect+sessionErrors)*100:(last?last.acc:100);
            el.metricWpm.textContent=Math.max(0,liveSpeed).toFixed(1);
            el.metricAccuracy.textContent=Math.round(liveAcc);
            const recent=lessonHistory.slice(-10);
            const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
            const avgWpm=avg(recent.map(r=>r.wpm)), avgAcc=avg(recent.map(r=>r.acc));
            put('metric-wpm-avg',avgWpm==null?'avg of last lessons: -':'avg of last lessons: '+avgWpm.toFixed(1)+' wpm');
            put('metric-accuracy-avg',avgAcc==null?'avg of last lessons: -':'avg of last lessons: '+avgAcc.toFixed(1)+'%');
            el.metricScore.textContent=Math.round(last?last.score||0:0).toLocaleString();
            put('metric-score-best','best: '+Math.round(bestScore).toLocaleString());
            put('p-last',last?last.wpm.toFixed(1)+' wpm · '+last.acc.toFixed(1)+'% accuracy':'none yet');
            put('p-streak',accuracyStreak?accuracyStreak+' lesson(s) at 95%+ accuracy'+(bestStreak>accuracyStreak?' (best '+bestStreak+')':''):'No accuracy streaks.');
            const day=new Date().toLocaleDateString('en-CA');
            const seconds=dailyPractice.day===day?dailyPractice.seconds:0;
            const percent=Math.floor(seconds/(dailyGoalMinutes*60)*100);
            put('p-goal',percent+'% / '+dailyGoalMinutes+' min');
            const fill=document.getElementById('p-goal-fill');if(fill)fill.style.width=Math.min(100,percent)+'%';
            if(percent>=100&&goalFlashedDay!==day){goalFlashedDay=day;flashPracticeEvent('Daily goal reached: '+dailyGoalMinutes+' minutes of practice today.');}
            const bars=document.getElementById('ins-history');
            if(bars){bars.replaceChildren();lessonHistory.slice(-12).forEach(result=>{const bar=document.createElement('i');bar.style.height=Math.max(3,Math.min(24,result.wpm/targetSpeedGoal*16))+'px';bar.title=result.wpm.toFixed(1)+' wpm, '+result.acc.toFixed(1)+'% accuracy';bars.appendChild(bar);});}
        }

        function updateLiveStats() {
            updateInsights();
        }

        function populateJumpSelect() {
            el.jumpSelect.innerHTML = '';
            el.jumpSelect.add(new Option('Auto: learn '+KEY_PROGRESSION[highestUnlocked].h+' (next key unlocks at goal)', 'auto'));
            KEY_PROGRESSION.forEach((item, idx) => {
                if(idx>highestUnlocked||item.skip)return;
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = `Review L${idx + 1}: ${item.h} (${item.alt ? ('Alt+' + item.alt) : (item.conjunct ? item.h : item.k.toUpperCase())}) — ${item.d}`;
                if (reviewMode && idx === unlockedIndex) opt.selected = true;
                el.jumpSelect.appendChild(opt);
            });
        }

        // ─────────────────────────────────────────────────────────────
        // PROFILE ANALYTICS - keybr-style charts computed from the real
        // stored records: lessonHistory (one record per completed lesson),
        // dailyStats, keyStats and keyLearning. Nothing here invents data.
        // ─────────────────────────────────────────────────────────────
        const ChartMath = {
            // keybr.com's exponential smoothing: alpha = 1 / 10^(smoothness*3)
            alpha(smoothness){ return 1/Math.pow(10, smoothness*3); },
            smooth(values, alpha){
                const out=[]; let v;
                for(const x of values){ v = v===undefined ? x : alpha*x+(1-alpha)*v; out.push(v); }
                return out;
            },
            // Least-squares trend over sample index: y = a + b*i
            linRegress(ys){
                const n=ys.length; if(n<2) return {a:ys[0]||0, b:0};
                let sx=0,sy=0,sxx=0,sxy=0;
                for(let i=0;i<n;i++){sx+=i;sy+=ys[i];sxx+=i*i;sxy+=i*ys[i];}
                const d=n*sxx-sx*sx, b=d?(n*sxy-sx*sy)/d:0;
                return {a:(sy-b*sx)/n, b};
            },
            niceCeil(v){
                if(!(v>0)) return 1;
                const p=Math.pow(10,Math.floor(Math.log10(v)));
                for(const m of [1,2,2.5,5,10]) if(v<=m*p) return m*p;
                return 10*p;
            },
            bucketWidth(range, target){
                if(!(range>0)) return 1;
                const raw=range/(target||20), p=Math.pow(10,Math.floor(Math.log10(raw)));
                for(const m of [1,2,5,10]) if(raw<=m*p) return m*p;
                return 10*p;
            },
            histogram(values, width){
                const buckets=new Map();
                for(const v of values){ const b=Math.floor(v/width)*width; buckets.set(b,(buckets.get(b)||0)+1); }
                return [...buckets.entries()].sort((a,b)=>a[0]-b[0]).map(([x0,n])=>({x0,n}));
            }
        };

        function svgWrap(width,height,inner){
            return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" style="display:block;max-width:100%">${inner}</svg>`;
        }
        function speedColor(ratio){
            // 0 = far below target (red), 0.8 = close (amber), >=1 = at target (green)
            const r=Math.max(0,Math.min(1.25,ratio))/1.25;
            const hue=r<0.64?4+(r/0.64)*41:45+((r-0.64)/0.36)*95;
            return `hsl(${hue.toFixed(0)} 70% 48%)`;
        }
        function fmtTime(totalSeconds){
            const sec=Math.max(0,Math.round(totalSeconds));
            const h=Math.floor(sec/3600), m=Math.floor(sec%3600/60), s=sec%60;
            return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
        }
        function profTile(label,value){
            return `<div class="stat-card"><span class="s-label">${label}</span><div class="s-value" style="font-size:1.12rem">${value}</div></div>`;
        }
        function renderSummaryTiles(){
            const all=document.getElementById('prof-tiles-all'); if(!all) return;
            const valid=lessonHistory.filter(r=>r&&typeof r.wpm==='number'&&r.wpm>0);
            const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
            all.innerHTML=
                profTile('Time',fmtTime(totalPracticeSeconds))+
                profTile('Lessons',totalLessons)+
                profTile('Top speed',valid.length?bestLessonWpm.toFixed(1)+' wpm':'N/A')+
                profTile('Average speed',valid.length?avg(valid.map(r=>r.wpm)).toFixed(1)+' wpm':'N/A')+
                profTile('Top accuracy',valid.length?bestLessonAcc.toFixed(1)+'%':'N/A')+
                profTile('Average accuracy',valid.length?avg(valid.map(r=>r.acc)).toFixed(1)+'%':'N/A');
            const day=new Date().toLocaleDateString('en-CA');
            const today=(dailyStats&&dailyStats[day])||{seconds:0,lessons:0,typed:0,errors:0};
            const todayLessons=valid.filter(r=>r.ts&&new Date(r.ts).toLocaleDateString('en-CA')===day);
            document.getElementById('prof-tiles-today').innerHTML=
                profTile('Time',fmtTime(today.seconds))+
                profTile('Lessons',today.lessons)+
                profTile('Top speed',todayLessons.length?Math.max(...todayLessons.map(r=>r.wpm)).toFixed(1)+' wpm':'N/A')+
                profTile('Average speed',todayLessons.length?avg(todayLessons.map(r=>r.wpm)).toFixed(1)+' wpm':'N/A')+
                profTile('Top accuracy',todayLessons.length?Math.max(...todayLessons.map(r=>r.acc)).toFixed(1)+'%':'N/A')+
                profTile('Average accuracy',todayLessons.length?avg(todayLessons.map(r=>r.acc)).toFixed(1)+'%':'N/A');
            const line=document.getElementById('prof-streak-line');
            if(line)line.textContent=(accuracyStreak||bestStreak)
                ?`Accuracy streaks: current ${accuracyStreak} lesson(s) at 95%+ accuracy · longest ${bestStreak}.`
                :'No accuracy streaks yet - finish a lesson at 95%+ accuracy to start one.';
        }

        function renderSpeedChart(){
            const box=document.getElementById('chart-speed'); if(!box) return;
            const legend=document.getElementById('chart-speed-legend');
            const data=lessonHistory.filter(r=>r&&typeof r.wpm==='number'&&r.wpm>0).slice(-150);
            if(data.length<2){
                box.innerHTML='<div class="chart-empty">Not enough data yet - complete a couple of lessons and this chart draws itself.</div>';
                if(legend)legend.textContent='';
                return;
            }
            const slider=document.getElementById('smoothness');
            const s=(slider?Number(slider.value):50)/100;
            const alpha=ChartMath.alpha(s);
            const speed=ChartMath.smooth(data.map(r=>r.wpm),alpha);
            const acc=ChartMath.smooth(data.map(r=>typeof r.acc==='number'?r.acc:100),alpha);
            const keys=ChartMath.smooth(data.map(r=>r.keys||0),alpha);
            const W=720,H=300,padL=46,padR=12,padT=14,padB=30;
            const iw=W-padL-padR, ih=H-padT-padB;
            const maxSpeed=ChartMath.niceCeil(Math.max(...speed,1)*1.1);
            let accMin=Math.floor((Math.min(...acc)-1)/5)*5, accMax=Math.ceil((Math.max(...acc)+1)/5)*5;
            if(accMax-accMin<5){accMin=Math.max(0,Math.min(accMin,97.5));accMax=Math.min(100,accMin+5);accMin=accMax-5;}
            const keyMax=Math.max(3,ChartMath.niceCeil(Math.max(...keys,0)));
            const n=data.length;
            const X=i=>padL+(n===1?iw/2:i/(n-1)*iw);
            const Ys=v=>padT+ih*(1-v/maxSpeed);
            const Ya=v=>padT+ih*(1-(v-accMin)/(accMax-accMin));
            const Yk=v=>padT+ih*(1-Math.min(v,keyMax)/keyMax);
            let g='';
            for(let t=0;t<=5;t++){
                const y=padT+ih*t/5, val=maxSpeed*(1-t/5);
                g+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border-subtle)" stroke-width="1"/>`;
                g+=`<text x="${padL-6}" y="${(y+4).toFixed(1)}" font-size="11" text-anchor="end">${val%1?val.toFixed(1):val}</text>`;
            }
            g+=`<text x="${padL}" y="${padT-5}" font-size="10">WPM</text>`;
            const step=Math.max(1,Math.ceil(n/12));
            for(let i=0;i<n;i+=step)g+=`<text x="${X(i).toFixed(1)}" y="${H-8}" font-size="10" text-anchor="middle">${i+1}</text>`;
            const dots=(ys,Y,color,r)=>ys.map((v,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="${r}" fill="${color}"/>`).join('');
            g+=dots(keys,Yk,'#a78bfa',2.5);
            g+=dots(acc,Ya,'var(--accent)',2.5);
            g+=dots(speed,Ys,'var(--correct)',3);
            const reg=ChartMath.linRegress(speed);
            g+=`<line x1="${X(0).toFixed(1)}" y1="${Ys(Math.max(0,reg.a)).toFixed(1)}" x2="${X(n-1).toFixed(1)}" y2="${Ys(Math.max(0,reg.a+reg.b*(n-1))).toFixed(1)}" stroke="var(--correct)" stroke-width="1.6" stroke-dasharray="6 4" opacity=".85"/>`;
            box.innerHTML=svgWrap(W,H,g);
            if(legend)legend.innerHTML=
                `<span><i class="lg-dot" style="background:var(--correct)"></i>typing speed in WPM (left axis; dashed trend ${reg.b>=0?'+':''}${reg.b.toFixed(2)} wpm/lesson)</span>`+
                `<span><i class="lg-dot" style="background:var(--accent)"></i>typing accuracy (scaled ${accMin}-${accMax}%)</span>`+
                `<span><i class="lg-dot" style="background:#a78bfa"></i>keys in lesson (scaled 0-${keyMax})</span>`+
                `<span>horizontal axis: lesson number · smoothing α=${alpha.toFixed(4)}</span>`;
        }

        function renderSpeedDist(){
            const box=document.getElementById('chart-speed-dist'); if(!box) return;
            const values=lessonHistory.filter(r=>r&&r.wpm>0).map(r=>r.wpm);
            if(values.length<3){box.innerHTML='<div class="chart-empty">Not enough data yet - finish a few lessons.</div>';return;}
            const min=Math.min(...values), max=Math.max(...values);
            const width=ChartMath.bucketWidth(max-min||max||1);
            const buckets=ChartMath.histogram(values,width);
            const maxN=Math.max(...buckets.map(b=>b.n));
            const W=720,H=230,padL=40,padR=14,padT=14,padB=34;
            const iw=W-padL-padR, ih=H-padT-padB;
            const x0min=buckets[0].x0, x1max=buckets[buckets.length-1].x0+width;
            const X=v=>padL+(v-x0min)/(x1max-x0min)*iw;
            const bw=Math.max(2.5,iw*width/(x1max-x0min)-3);
            let g='';
            for(let t=0;t<=4;t++){
                const y=padT+ih*t/4, val=Math.round(maxN*(1-t/4));
                g+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border-subtle)"/>`;
                g+=`<text x="${padL-6}" y="${(y+4).toFixed(1)}" font-size="11" text-anchor="end">${val}</text>`;
            }
            g+=`<text x="${padL}" y="${padT-5}" font-size="10">lessons</text>`;
            const labelEvery=Math.max(1,Math.ceil(buckets.length/9));
            buckets.forEach((b,i)=>{
                const h=ih*b.n/maxN;
                g+=`<rect x="${X(b.x0).toFixed(1)}" y="${(padT+ih-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--correct)" opacity=".8"><title>${b.n} lesson(s) at ${b.x0.toFixed(1)}-${(b.x0+width).toFixed(1)} wpm</title></rect>`;
                if(i%labelEvery===0)g+=`<text x="${(X(b.x0)+bw/2).toFixed(1)}" y="${H-16}" font-size="10" text-anchor="middle">${b.x0%1?b.x0.toFixed(1):b.x0}</text>`;
            });
            g+=`<text x="${W/2}" y="${H-2}" font-size="10" text-anchor="middle">lesson speed (wpm), bucket width ${width%1?width.toFixed(1):width}</text>`;
            const avg=values.reduce((a,b)=>a+b,0)/values.length;
            g+=`<line x1="${X(avg).toFixed(1)}" y1="${padT}" x2="${X(avg).toFixed(1)}" y2="${padT+ih}" stroke="var(--error)" stroke-width="1.6" stroke-dasharray="6 4"/>`;
            g+=`<text x="${Math.min(X(avg)+6,W-110).toFixed(1)}" y="${padT+12}" font-size="11" fill="var(--error)">avg ${avg.toFixed(1)} wpm</text>`;
            box.innerHTML=svgWrap(W,H,g);
        }

        function renderKeySpeedChart(){
            const box=document.getElementById('chart-key-speed'); if(!box) return;
            const rows=KEY_PROGRESSION
                .filter(item=>{const s=keyStats[item.k];return s&&s.modelTtt>0&&(s.modelSamples||0)>=1;})
                .map(item=>({k:item.k,h:item.h,wpm:12000/keyStats[item.k].modelTtt,samples:keyStats[item.k].modelSamples||0}));
            if(!rows.length){box.innerHTML='<div class="chart-empty">No per-key timings yet - they appear after your first measured lesson.</div>';return;}
            const W=720,H=260,padL=42,padR=12,padT=16,padB=42;
            const iw=W-padL-padR, ih=H-padT-padB;
            const maxV=ChartMath.niceCeil(Math.max(targetSpeedGoal*1.2,...rows.map(r=>r.wpm)));
            const bw=Math.min(34,iw/rows.length-4);
            let g='';
            for(let t=0;t<=4;t++){
                const y=padT+ih*t/4, val=maxV*(1-t/4);
                g+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border-subtle)"/>`;
                g+=`<text x="${padL-6}" y="${(y+4).toFixed(1)}" font-size="11" text-anchor="end">${val%1?val.toFixed(1):val}</text>`;
            }
            g+=`<text x="8" y="${padT+2}" font-size="10">WPM</text>`;
            const ty=padT+ih*(1-targetSpeedGoal/maxV);
            rows.forEach((r,i)=>{
                const cx=padL+(i+.5)*iw/rows.length;
                const h=ih*Math.min(r.wpm,maxV)/maxV;
                const ratio=r.wpm/targetSpeedGoal;
                const color=ratio>=1?'var(--correct)':ratio>=.8?'#eab308':'var(--error)';
                g+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${(padT+ih-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}"><title>${r.h}: ${r.wpm.toFixed(1)} wpm over ${r.samples} clean hit(s)</title></rect>`;
                // Full-column transparent hit area for the per-key popup
                g+=`<rect class="key-hit" data-key="${r.k}" x="${(cx-iw/rows.length/2).toFixed(1)}" y="${padT}" width="${(iw/rows.length).toFixed(1)}" height="${ih}" fill="transparent"/>`;
                g+=`<text x="${cx.toFixed(1)}" y="${(padT+ih+16).toFixed(1)}" font-size="12" text-anchor="middle" style="font-family:'Noto Sans Devanagari'">${r.h}</text>`;
                g+=`<text x="${cx.toFixed(1)}" y="${(padT+ih+29).toFixed(1)}" font-size="9" text-anchor="middle" fill="var(--text-faint)">${r.wpm.toFixed(0)}</text>`;
            });
            // Target line and label drawn last: SVG paints in document order, so
            // drawing them before the bars hid the line behind any bar that tall.
            // The label gets a solid backing so it stays legible over the bars.
            g+=`<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${W-padR}" y2="${ty.toFixed(1)}" stroke="var(--error)" stroke-dasharray="6 4" stroke-width="1.5"/>`;
            const tLabel=`target ${targetSpeedGoal} wpm`, tW=tLabel.length*6.6+12;
            g+=`<rect class="target-label-bg" x="${(W-padR-tW-2).toFixed(1)}" y="${(ty-19).toFixed(1)}" width="${tW}" height="16" fill="var(--surface-card)" stroke="var(--error)" stroke-width="0.75"/>`;
            g+=`<text x="${(W-padR-tW/2-2).toFixed(1)}" y="${(ty-7).toFixed(1)}" font-size="11" text-anchor="middle" fill="var(--error)">${tLabel}</text>`;
            box.innerHTML=svgWrap(W,H,g);
            const nat=box.querySelector('svg'); if(nat){ nat.style.minWidth=W+'px'; }
        }

        function renderKeyFreqChart(){
            const box=document.getElementById('chart-key-freq'); if(!box) return;
            const rows=KEY_PROGRESSION
                .map(item=>({h:item.h,hits:(keyStats[item.k]&&keyStats[item.k].hits)||0,errors:(keyStats[item.k]&&keyStats[item.k].errors)||0}))
                .filter(r=>r.hits+r.errors>0);
            if(!rows.length){box.innerHTML='<div class="chart-empty">No keystrokes recorded yet.</div>';return;}
            // Fixed column width per key: the key glyph and its numbers always
            // sit directly under their own bars; the chart scrolls sideways.
            const colW=36;
            const W=Math.max(720,46+12+rows.length*colW),H=250,padL=46,padR=12,padT=16,padB=42;
            const iw=W-padL-padR, ih=H-padT-padB;
            const maxC=ChartMath.niceCeil(Math.max(...rows.map(r=>Math.max(r.hits,r.errors))));
            const group=colW, bw=Math.min(13,group/2-3);
            let g='';
            for(let t=0;t<=4;t++){
                const y=padT+ih*t/4, val=Math.round(maxC*(1-t/4));
                g+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border-subtle)"/>`;
                g+=`<text x="${padL-6}" y="${(y+4).toFixed(1)}" font-size="11" text-anchor="end">${val}</text>`;
            }
            g+=`<text x="${padL}" y="${padT-5}" font-size="10">count</text>`;
            rows.forEach((r,i)=>{
                const cx=padL+(i+.5)*group;
                const hh=ih*r.hits/maxC, eh=ih*r.errors/maxC;
                g+=`<rect x="${(cx-bw-1).toFixed(1)}" y="${(padT+ih-hh).toFixed(1)}" width="${bw}" height="${hh.toFixed(1)}" fill="var(--correct)"><title>${r.h}: ${r.hits} hits</title></rect>`;
                
                g+=`<rect x="${(cx+1).toFixed(1)}" y="${(padT+ih-eh).toFixed(1)}" width="${bw}" height="${eh.toFixed(1)}" fill="var(--error)"><title>${r.h}: ${r.errors} misses (${Math.round(r.errors/(r.hits+r.errors)*100)}% miss ratio)</title></rect>`;
                g+=`<text x="${cx.toFixed(1)}" y="${(padT+ih+15).toFixed(1)}" font-size="11" text-anchor="middle" style="font-family:'Noto Sans Devanagari'">${r.h}</text>`;
                const miss=Math.round(r.errors/(r.hits+r.errors)*100);
                // Miss ratio directly under its own key, in the same red as the
                // miss bar, so there is no doubt which key it belongs to.
                g+=`<text x="${cx.toFixed(1)}" y="${(padT+ih+28).toFixed(1)}" font-size="9" text-anchor="middle" fill="var(--error)">${miss}%</text>`;
            });
            box.innerHTML=svgWrap(W,H,g);
            const nat=box.querySelector('svg'); if(nat){ nat.style.minWidth=W+'px'; }
        }

        /* ── keybr-style per-key popup ───────────────────────────────────
           Hover (desktop) / tap (phone) on a Key Typing Speed bar or a Key
           details row: last/top speed, accuracy, learning rate, lessons-to-
           goal prediction, and a speed-per-lesson scatter with fitted curve.
           LearningRate is a faithful port of keybr's learningrate.ts: last 30
           session samples (keyLearning is already session-trimmed), polynomial
           degree 3/2/1 by sample count, R² >= 0.5 gate, rate = derivative at
           the latest sample, scan <= 50 lessons forward for the prediction. */
        function polyFit(ys,degree){
            const n=ys.length, d=Math.min(degree,n-1), m=d+1, A=[], b=[];
            for(let r=0;r<m;r++){A.push([]);for(let c=0;c<m;c++){let s=0;for(let i=0;i<n;i++)s+=Math.pow(i,r+c);A[r].push(s);}let s=0;for(let i=0;i<n;i++)s+=ys[i]*Math.pow(i,r);b.push(s);}
            for(let col=0;col<m;col++){
                let piv=col;for(let r=col+1;r<m;r++)if(Math.abs(A[r][col])>Math.abs(A[piv][col]))piv=r;
                if(Math.abs(A[piv][col])<1e-9)return null;
                const ta=A[col];A[col]=A[piv];A[piv]=ta;const tb=b[col];b[col]=b[piv];b[piv]=tb;
                for(let r=0;r<m;r++){if(r===col)continue;const f=A[r][col]/A[col][col];for(let c=col;c<m;c++)A[r][c]-=f*A[col][c];b[r]-=f*b[col];}
            }
            return b.map((v,i)=>v/A[i][i]);
        }
        function keyLearningRate(keyId){
            const hist=keyLearning[keyId], speeds=(hist&&hist.speeds)||[];
            const n=speeds.length;
            const out={speeds,fit:null,degree:0,rate:NaN,certainty:0,remaining:NaN};
            if(n<2)return out;
            const degree=n>20?3:n>10?2:1;
            const fit=polyFit(speeds,degree);
            if(!fit)return out;
            const evalFit=x=>fit.reduce((a,c,k)=>a+c*Math.pow(x,k),0);
            const mean=speeds.reduce((a,b)=>a+b,0)/n;
            let ssRes=0,ssTot=0;
            for(let i=0;i<n;i++){ssRes+=Math.pow(speeds[i]-evalFit(i),2);ssTot+=Math.pow(speeds[i]-mean,2);}
            const certainty=ssTot>0?Math.max(0,1-ssRes/ssTot):0;
            const x=n-1;
            const rate=fit.reduce((a,c,k)=>k>=1?a+c*k*Math.pow(x,k-1):a,0);
            let remaining=NaN;
            if(certainty>=0.5){
                if(speeds[x]>=targetSpeedGoal)remaining=0;
                else for(let i=1;i<=50;i++){if(evalFit(x+i)>=targetSpeedGoal){remaining=i;break;}}
            }
            return{speeds,fit,degree,rate,certainty,remaining};
        }
        let keyPopupEl=null,keyPopupTimer=0;
        function hideKeyPopup(){keyPopupTimer=0;if(keyPopupEl)keyPopupEl.hidden=true;}
        function showKeyPopup(keyId,anchorRect){
            const item=KEY_PROGRESSION.find(it=>it.k===keyId);
            if(!item)return;
            const s=keyStats[keyId]||{hits:0,errors:0};
            const total=(s.hits||0)+(s.errors||0);
            const pop=ensureKeyPopup();
            const phys=item.alt?('Alt+'+item.alt):(item.conjunct?(item.finger||item.h):item.k.toUpperCase());
            let lines='';
            const measured=s.modelTtt>0&&(s.modelSamples||0)>=1;
            const accStr=total>0?Math.round(s.hits/total*100)+'%':'—';
            let chartSvg='';
            if(measured){
                const smoothWpm=12000/s.modelTtt;
                const topWpm=s.modelBest>0&&s.modelBest<Infinity?12000/s.modelBest:smoothWpm;
                const conf=Math.round(smoothWpm/targetSpeedGoal*100);
                const lr=keyLearningRate(keyId);
                if(s.lastLessonWpm)lines+=`<div class="kp-line"><span>Last lesson</span><b>${s.lastLessonWpm.toFixed(1)} wpm (key's own pace)</b></div>`;
                lines+=`<div class="kp-line"><span>Smoothed speed</span><b>${smoothWpm.toFixed(1)} wpm (${conf}% of goal)</b></div>`;
                lines+=`<div class="kp-line"><span>Top speed</span><b>${topWpm.toFixed(1)} wpm</b></div>`;
                if(s.accurateBest&&s.accurateBest<Infinity)lines+=`<div class="kp-line"><span>Banked best</span><b>${(12000/s.accurateBest).toFixed(1)} / ${targetSpeedGoal} wpm (95%+ lessons)</b></div>`;
                lines+=`<div class="kp-line"><span>Accuracy</span><b>${accStr}</b></div>`;
                if(lr.certainty>=0.5){
                    const sign=lr.rate>=0?'+':'';
                    lines+=`<div class="kp-line kp-rate ${lr.rate>=0?'pos':'neg'}"><span>Learning rate</span><b>${sign}${lr.rate.toFixed(1)} wpm/lesson</b></div>`;
                    if(lr.remaining===0)lines+=`<div class="kp-line"><span>Goal ${targetSpeedGoal} wpm</span><b>reached</b></div>`;
                    else if(lr.remaining>0)lines+=`<div class="kp-line"><span>Goal ${targetSpeedGoal} wpm</span><b>about ${lr.remaining} lesson${lr.remaining===1?'':'s'} away</b></div>`;
                    else lines+=`<div class="kp-line"><span>Goal ${targetSpeedGoal} wpm</span><b>not within 50 lessons at this rate</b></div>`;
                }else{
                    lines+=`<div class="kp-line"><span>Learning rate</span><b>not enough stable history</b></div>`;
                }
                // Scatter of stored per-lesson speeds + fitted curve + goal line
                if(lr.speeds.length>=2){
                    const W=258,H=104,padL=30,padR=6,padT=8,padB=16;
                    const iw=W-padL-padR, ih=H-padT-padB;
                    const speeds=lr.speeds, n=speeds.length;
                    const project=lr.certainty>=0.5&&lr.remaining>0?Math.min(lr.remaining,50):0;
                    const xMax=n-1+project;
                    const maxV=ChartMath.niceCeil(Math.max(targetSpeedGoal*1.15,...speeds));
                    const X=i=>padL+iw*(xMax>0?i/xMax:0), Y=v=>padT+ih*(1-Math.min(v,maxV)/maxV);
                    let g='';
                    for(let t=0;t<=2;t++){const y=padT+ih*t/2;g+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--border-subtle)"/>`;g+=`<text x="${padL-4}" y="${(y+3).toFixed(1)}" font-size="8" text-anchor="end">${(maxV*(1-t/2)).toFixed(0)}</text>`;}
                    g+=`<line x1="${padL}" y1="${Y(targetSpeedGoal).toFixed(1)}" x2="${W-padR}" y2="${Y(targetSpeedGoal).toFixed(1)}" stroke="var(--error)" stroke-dasharray="5 3" stroke-width="1"/>`;
                    g+=`<text x="${W-padR-2}" y="${(Y(targetSpeedGoal)-3).toFixed(1)}" font-size="7.5" text-anchor="end" fill="var(--error)">${targetSpeedGoal} wpm</text>`;
                    if(lr.fit&&lr.certainty>=0.5){
                        let path='';
                        const steps=Math.max(24,xMax*2);
                        for(let s2=0;s2<=steps;s2++){const xi=xMax*s2/steps;path+=(s2?'L':'M')+X(xi).toFixed(1)+','+Y(evalFitSafe(lr.fit,xi)).toFixed(1);}
                        g+=`<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="1.4" opacity=".9"/>`;
                    }
                    g+=speeds.map((v,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.2" fill="var(--accent)"/>`).join('');
                    g+=`<text x="${padL}" y="${H-3}" font-size="7.5">older lessons</text><text x="${W-padR}" y="${H-3}" font-size="7.5" text-anchor="end">latest${project?' + projection':''}</text>`;
                    chartSvg=`<div class="kp-chart"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}</svg><div class="kp-note">Speed per lesson (last ${n} sample${n===1?'':'s'})${lr.certainty>=0.5?', fitted curve':''} · dashed = your ${targetSpeedGoal} wpm goal</div></div>`;
                }
            }else if(total>0){
                lines+=`<div class="kp-line"><span>Accuracy</span><b>${accStr}</b></div>`;
                lines+=`<div class="kp-line"><span>Hits / misses</span><b>${s.hits} / ${s.errors}</b></div>`;
                lines+=`<div class="kp-note">No timing samples yet - finish a lesson that uses this key.</div>`;
            }else{
                lines+=`<div class="kp-note">No measurements for this key yet.</div>`;
            }
            pop.innerHTML=`<div class="kp-head"><span class="kp-glyph">${item.h}</span><span class="kp-sub">Key: ${phys} · ${item.finger}</span></div>${lines}${chartSvg}`;
            pop.hidden=false;
            // Position next to the anchor, clamped into the viewport
            const pw=pop.offsetWidth, ph=pop.offsetHeight, m=8;
            let left=anchorRect.left+anchorRect.width/2-pw/2;
            left=Math.max(m,Math.min(left,window.innerWidth-pw-m));
            let top=anchorRect.top-ph-8;
            if(top<m)top=Math.min(anchorRect.bottom+8,window.innerHeight-ph-m);
            pop.style.left=left+'px';pop.style.top=top+'px';
        }
        function evalFitSafe(fit,x){return fit.reduce((a,c,k)=>a+c*Math.pow(x,k),0);}
        function ensureKeyPopup(){
            if(keyPopupEl)return keyPopupEl;
            keyPopupEl=document.createElement('div');
            keyPopupEl.id='key-popup';
            keyPopupEl.hidden=true;
            document.body.appendChild(keyPopupEl);
            keyPopupEl.addEventListener('mouseenter',()=>{clearTimeout(keyPopupTimer);keyPopupTimer=0;});
            keyPopupEl.addEventListener('mouseleave',hideKeyPopup);
            return keyPopupEl;
        }
        function popupAnchorKey(t){
            if(!t)return null;
            const hit=t.closest?t.closest('#chart-key-speed rect.key-hit'):null;
            if(hit)return{key:hit.getAttribute('data-key'),rect:hit.getBoundingClientRect()};
            const tr=t.closest?t.closest('#profile-table-body tr[data-key]'):null;
            if(tr)return{key:tr.getAttribute('data-key'),rect:tr.getBoundingClientRect()};
            return null;
        }
        let keyPopupWired=false;
        function initKeyPopup(){
            if(keyPopupWired)return;keyPopupWired=true;
            document.addEventListener('mouseover',e=>{
                const a=popupAnchorKey(e.target);
                if(a){clearTimeout(keyPopupTimer);keyPopupTimer=0;showKeyPopup(a.key,a.rect);}
            });
            document.addEventListener('mouseout',e=>{
                const a=popupAnchorKey(e.target);
                if(a){clearTimeout(keyPopupTimer);keyPopupTimer=setTimeout(()=>{keyPopupTimer=0;hideKeyPopup();},180);}
            });
            document.addEventListener('click',e=>{
                if(keyPopupEl&&!keyPopupEl.hidden&&keyPopupEl.contains(e.target))return;
                const a=popupAnchorKey(e.target);
                if(a){clearTimeout(keyPopupTimer);keyPopupTimer=0;showKeyPopup(a.key,a.rect);}
                else hideKeyPopup();
            });
            document.addEventListener('keydown',e=>{if(e.key==='Escape')hideKeyPopup();});
            window.addEventListener('scroll',hideKeyPopup,true);
        }

        function renderProgressOverview(){
            const box=document.getElementById('chart-progress'); if(!box) return;
            box.replaceChildren();
            const rows=KEY_PROGRESSION
                .map(item=>({item,samples:((keyLearning[item.k]||{}).speeds)||[]}))
                .filter(r=>r.samples.length>=2);
            if(!rows.length){box.innerHTML='<div class="chart-empty">Not enough per-key history yet - each key needs two measured lessons.</div>';return;}
            for(const r of rows){
                const row=document.createElement('div');row.className='pg-row';
                const label=document.createElement('span');label.className='pg-key';label.textContent=r.item.h;row.appendChild(label);
                const cells=document.createElement('span');cells.className='pg-cells';
                r.samples.slice(-24).forEach(wpm=>{
                    const c=document.createElement('i');
                    c.style.background=speedColor(wpm/targetSpeedGoal);
                    c.title=`${r.item.h}: ${wpm.toFixed(1)} wpm (target ${targetSpeedGoal})`;
                    cells.appendChild(c);
                });
                row.appendChild(cells);box.appendChild(row);
            }
        }

        function renderCalendar(){
            const box=document.getElementById('chart-calendar'); if(!box) return;
            box.replaceChildren();
            const days=Object.keys(dailyStats||{}).filter(d=>dailyStats[d]&&dailyStats[d].lessons>0);
            if(!days.length){box.innerHTML='<div class="chart-empty">No practice days recorded yet.</div>';return;}
            const goalSeconds=dailyGoalMinutes*60;
            const now=new Date();
            const months=[];
            for(let back=3;back>=0;back--)months.push(new Date(now.getFullYear(),now.getMonth()-back,1));
            months.forEach(m=>{
                const y=m.getFullYear(), mo=m.getMonth();
                const wrap=document.createElement('div');wrap.className='cal-month';
                const title=document.createElement('h4');title.textContent=m.toLocaleDateString('en-GB',{month:'long',year:'numeric'});wrap.appendChild(title);
                const grid=document.createElement('div');grid.className='cal-grid';
                ['M','T','W','T','F','S','S'].forEach(d=>{const b=document.createElement('b');b.textContent=d;grid.appendChild(b);});
                const first=new Date(y,mo,1);
                const lead=(first.getDay()+6)%7; // Monday-first offset
                for(let i=0;i<lead;i++)grid.appendChild(document.createElement('span'));
                const daysIn=new Date(y,mo+1,0).getDate();
                for(let d=1;d<=daysIn;d++){
                    const key=`${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const cell=document.createElement('span');cell.className='cal-cell';
                    const rec=dailyStats[key];
                    if(rec&&rec.lessons>0){
                        const frac=goalSeconds?rec.seconds/goalSeconds:0;
                        const op=frac>=1?1:frac>=.5?.6:frac>0?.3:0;
                        if(op>0)cell.style.background=`color-mix(in srgb, var(--correct) ${Math.round(op*100)}%, transparent)`;
                        cell.title=`${key}: ${Math.round(rec.seconds/60)} min, ${rec.lessons} lesson(s)`;
                    }else{
                        cell.title=key+': no practice';
                    }
                    grid.appendChild(cell);
                }
                wrap.appendChild(grid);
                box.appendChild(wrap);
            });
            const legend=document.createElement('div');legend.className='cal-legend';
            legend.append('Less ');
            [0.3,0.6,1].forEach(op=>{const c=document.createElement('span');c.className='cal-cell';c.style.background=`color-mix(in srgb, var(--correct) ${op*100}%, transparent)`;legend.appendChild(c);});
            legend.append(' More of your daily goal');
            box.appendChild(legend);
        }

        function renderProfileCharts(){
            initKeyPopup();
            renderSummaryTiles();
            renderSpeedChart();
            renderSpeedDist();
            renderKeySpeedChart();
            renderKeyFreqChart();
            renderProgressOverview();
            renderCalendar();
        }

        let showAllKeys = false;
        {
            const toggleBtn = document.getElementById('toggle-locked-keys-btn');
            if (toggleBtn) toggleBtn.onclick = () => {
                showAllKeys = !showAllKeys;
                toggleBtn.textContent = showAllKeys ? 'Hide Locked Keys' : `Show All ${TRAINABLE_KEY_COUNT} Keys`;
                updateAlphabetStrip();
                updateProfileTable();
            };
        }
        function updateProfileTable() {
            if (!el.profileTableBody) return;
            el.profileTableBody.innerHTML = '';

            let masteredCount = 0;

            KEY_PROGRESSION.forEach((item, idx) => {
                const s = keyStats[item.k] || { hits: 0, errors: 0 };
                if (item.skip) return;
                if (!showAllKeys && idx > unlockedIndex && (s.hits || 0) === 0) return;
                const total = s.hits + s.errors;
                const acc = total > 0 ? Math.round((s.hits / total) * 100) + '%' : '—';
                // Learned = currently green (recent speed at/above goal and a
                // recent 95%+ lesson), the same rule as the key colour, so the
                // tag can never contradict a green key. keybr behaves the same:
                // a key that later slows down turns red again and needs review.
                const isMastered = keyHeatLevel(item)===3;
                const isLearning = idx === unlockedIndex;
                if (isMastered) masteredCount++;

                const tr = document.createElement('tr');
                tr.dataset.key = item.k;
                tr.innerHTML = `
                    <td style="font-family:'Noto Sans Devanagari'; font-size:1.15rem; font-weight:700; color:var(--text);">${item.h}</td>
                    <td><span class="key-chip">${item.alt ? ('Alt+' + item.alt) : (item.conjunct ? item.h : item.k.toUpperCase())}</span></td>
                    <td style="color:var(--text-dim); font-size:0.78rem;">${item.finger}</td>
                    <td style="font-weight:700; color:var(--correct);">${s.hits}</td>
                    <td style="color:var(--error);">${s.errors}</td>
                    <td style="font-weight:700;">${acc}</td>
                    <td>
                        <span class="badge-status ${isMastered ? 'mastered' : isLearning ? 'learning' : 'locked'}">
                            ${isMastered ? '✓ Learned' : idx>highestUnlocked ? 'Locked' : !(s.modelSamples||s.tttSamples||0) ? 'Unmeasured' : isLearning ? 'Learning' : 'Needs review'}
                        </span>
                    </td>
                `;
                el.profileTableBody.appendChild(tr);
            });

            const masteredLine=document.getElementById('prof-mastered-line');
            if(masteredLine)masteredLine.textContent=`${masteredCount} / ${TRAINABLE_KEY_COUNT} keys learned · ${totalTypedCount.toLocaleString()} lifetime keystrokes · ${totalTypedCount>0?Math.round((1-totalErrorsCount/totalTypedCount)*100)+'%':'N/A'} lifetime accuracy`;
            refreshTableScrollHint();
        }

        // Show/hide the right-edge fade signalling the table scrolls sideways.
        function refreshTableScrollHint(){
            document.querySelectorAll('.table-wrap').forEach(wrap=>{
                const scroller=wrap.querySelector('.table-scroll');
                if(!scroller)return;
                const can=scroller.scrollWidth>scroller.clientWidth+2;
                wrap.classList.toggle('can-scroll',can);
                wrap.classList.toggle('at-end',!can||scroller.scrollLeft>=scroller.scrollWidth-scroller.clientWidth-2);
            });
        }
        window.addEventListener('resize',refreshTableScrollHint);
        document.querySelectorAll('.table-scroll').forEach(s=>s.addEventListener('scroll',refreshTableScrollHint,{passive:true}));

        // ─────────────────────────────────────────────────────────────
