'use strict';

        // 4. STORAGE & PERSISTENCE
        // ─────────────────────────────────────────────────────────────
        function initKeyStats() {
            KEY_PROGRESSION.forEach(item => {
                keyStats[item.k] = { hits: 0, errors: 0, ttt: 0, tttSamples: 0 };
            });
            targetKeyBuffer = [];
        }

        function showStorageWarning(payload) {
            let banner = document.getElementById('storage-warning');
            if (!payload) { if (banner) banner.remove(); return; }
            if (banner) return;
            banner = document.createElement('div');
            banner.id = 'storage-warning';
            banner.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);background:#7f1d1d;color:#fff;padding:10px 14px;border-radius:8px;z-index:9999;font-size:.85rem;display:flex;gap:12px;align-items:center;max-width:92%;box-shadow:0 4px 16px rgba(0,0,0,.35)';
            const msg = document.createElement('span');
            msg.textContent = 'Progress could not be saved in this browser (storage full or blocked). It will be lost on reload.';
            const exportBtn = document.createElement('button');
            exportBtn.type = 'button';
            exportBtn.textContent = 'Export progress';
            exportBtn.style.cssText = 'background:#fff;color:#7f1d1d;border:0;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit;white-space:nowrap';
            exportBtn.onclick = () => {
                try {
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'tankan-progress-backup.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                } catch (_) {}
            };
            banner.append(msg, exportBtn);
            document.body.appendChild(banner);
        }

        function saveStorage() {
            const payload = {
                unlockedIndex, highestUnlocked, hiddenWords,
                targetSpeedGoal, textSource, bookPos, opts, wordsPerLesson:el.wordsSelect&&el.wordsSelect.value,
                totalTypedCount,
                totalErrorsCount,
                keyStats, lessonHistory, keyLearning, dailyPractice, accuracyStreak, dailyGoalMinutes, lessonStyle, keyFont, displayFont, measurementVersion:2,
                dailyStats, totalLessons, totalPracticeSeconds, bestLessonWpm, bestLessonAcc, bestStreak, bestScore,
                theme: currentTheme,
                soundEnabled,
                showFingerHint
            };
            try {
                localStorage.setItem('hikeybr_store_v3', JSON.stringify(payload));
                showStorageWarning(null);
            } catch (e) {
                showStorageWarning(payload);
            }
        }

        function loadStorage() {
            initKeyStats();
            try {
                const raw = localStorage.getItem('hikeybr_store_v3');
                if (!raw) return;
                const data = JSON.parse(raw);
                if (typeof data.unlockedIndex === 'number') {
                    unlockedIndex = Math.max(0, Math.min(data.unlockedIndex, KEY_PROGRESSION.length - 1));
                }
                highestUnlocked=Math.max(INITIAL_UNLOCKED_COUNT-1,Math.min(69,data.highestUnlocked??unlockedIndex));
                highestUnlocked=advancePastSkipped(highestUnlocked); // Saves from before a level was skipped land on the next real key.
                unlockedIndex=highestUnlocked; // Recover old saves stuck on a manually selected starter key.
                hiddenWords=Array.isArray(data.hiddenWords)?data.hiddenWords:[];
                bookPos=(data.bookPos&&typeof data.bookPos==='object')?data.bookPos:{};
                if(data.opts&&typeof data.opts==='object')opts=Object.assign({},DEFAULT_OPTS,data.opts);
                delete opts.practiceLines; // Remove the retired paragraph-lines setting from existing saves.
                textSource=(typeof data.textSource==='string'&&(data.textSource==='words'||(data.textSource==='custom'&&opts.customText.trim())||findBook(data.textSource)))?data.textSource:'words';
                if(el.wordsSelect&&data.wordsPerLesson&&[...el.wordsSelect.options].some(o=>o.value===String(data.wordsPerLesson)))el.wordsSelect.value=String(data.wordsPerLesson);
                if (typeof data.targetSpeedGoal === 'number') {
                    targetSpeedGoal = data.targetSpeedGoal;
                    if (el.speedGoalSelect) el.speedGoalSelect.value = targetSpeedGoal;
                    if (el.settingsSpeedGoal) el.settingsSpeedGoal.value = targetSpeedGoal;
                }
                totalTypedCount = data.totalTypedCount || 0;
                totalErrorsCount = data.totalErrorsCount || 0;
                if (data.keyStats) {
                    for (const k in data.keyStats) {
                        if (Object.prototype.hasOwnProperty.call(keyStats, k)) {
                            keyStats[k] = Object.assign(keyStats[k] || {}, data.keyStats[k]);
                        }
                    }
                }
                lessonHistory = Array.isArray(data.lessonHistory) ? data.lessonHistory.slice(-400) : [];
                dailyStats=(data.dailyStats&&typeof data.dailyStats==='object')?data.dailyStats:{};
                totalLessons=typeof data.totalLessons==='number'?data.totalLessons:0;
                totalPracticeSeconds=typeof data.totalPracticeSeconds==='number'?data.totalPracticeSeconds:0;
                bestLessonWpm=data.bestLessonWpm||0;bestLessonAcc=data.bestLessonAcc||0;
                bestStreak=data.bestStreak||0;bestScore=data.bestScore||0;
                if(!data.dailyStats&&!data.totalLessons&&lessonHistory.length){
                    // One-time migration for older saves: rebuild daily and lifetime
                    // aggregates from the stored per-lesson history.
                    lessonHistory.forEach(r=>{
                        if(!r||!r.ts)return;
                        const day=new Date(r.ts).toLocaleDateString('en-CA');
                        const d=dailyStats[day]||(dailyStats[day]={seconds:0,lessons:0,typed:0,errors:0});
                        const seconds=typeof r.seconds==='number'?r.seconds:(r.wpm>0?(r.chars||0)/(5*r.wpm)*60:0);
                        const errors=typeof r.errors==='number'?r.errors:Math.round((r.chars||0)*(100/Math.max(1,r.acc||100)-1));
                        d.seconds+=seconds;d.lessons+=1;d.typed+=r.chars||0;d.errors+=errors;
                        totalLessons+=1;totalPracticeSeconds+=seconds;
                        bestLessonWpm=Math.max(bestLessonWpm,r.wpm||0);
                        bestLessonAcc=Math.max(bestLessonAcc,r.acc||0);
                        bestScore=Math.max(bestScore,r.score||0);
                    });
                    bestStreak=accuracyStreak;
                }
                keyLearning = data.keyLearning || {};
                dailyPractice = data.dailyPractice || {day:'', seconds:0};
                accuracyStreak = data.accuracyStreak || 0;
                dailyGoalMinutes = [10,15,30,45,60].includes(data.dailyGoalMinutes) ? data.dailyGoalMinutes : 30;
                lessonStyle = ['classic','bold','spaced','large'].includes(data.lessonStyle) ? data.lessonStyle : 'classic';
                keyFont = ['sans','serif','system'].includes(data.keyFont) ? data.keyFont : 'sans';
                displayFont = FONT_REGISTRY[data.displayFont] ? data.displayFont : 'krutidev';
                applyDisplayPreferences();
                if (data.theme) {
                    currentTheme = data.theme;
                    document.documentElement.setAttribute('data-theme', currentTheme);
                    if (el.themeSelect) el.themeSelect.value = currentTheme;
                }
                if (typeof data.soundEnabled === 'boolean') {
                    soundEnabled = data.soundEnabled;
                    updateSoundUI();
                }
                if (typeof data.showFingerHint === 'boolean') {
                    showFingerHint = data.showFingerHint;
                    if (el.fingerHintSelect) el.fingerHintSelect.value = showFingerHint ? 'show' : 'hide';
                }
            } catch (e) {}
        }

        function updateSoundUI() {
            el.soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
            el.soundBtn.classList.toggle('active', soundEnabled);
            if (el.soundSelect) el.soundSelect.value = soundEnabled ? 'on' : 'off';
        }

        
        // ─────────────────────────────────────────────────────────────
