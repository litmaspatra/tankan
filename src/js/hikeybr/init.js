'use strict';

        // 12. INITIALIZATION
        // ─────────────────────────────────────────────────────────────
        initKeyPopup();
        renderVirtualKeyboard();

        loadStorage();
        ensureFontLoaded(displayFont).catch(() => {});
        applyDisplayPreferences();
        populateTextSources();
        populateJumpSelect();
        regenerateLesson();

        window.HiKeybr = {
            get currentLessonText() { return currentLessonText; },
            set currentLessonText(v) { currentLessonText = v; },
            get targetKrutiText() { return targetKrutiText; },
            set targetKrutiText(v) { targetKrutiText = v; },
            get cursorIndex() { return cursorIndex; },
            set cursorIndex(v) { cursorIndex = v; },
            get sessionErrors() { return sessionErrors; },
            get sessionCorrect() { return sessionCorrect; },
            get unlockedIndex() { return unlockedIndex; },
            set unlockedIndex(v) { unlockedIndex = v; },
            get targetKeyBuffer() { return targetKeyBuffer; },
            get KEY_PROGRESSION() { return KEY_PROGRESSION; },
            get ALT_CODES_CATALOG() { return ALT_CODES_CATALOG; },
            getKrutiKeystrokeHint,
            generateLessonText,
            handleKeystroke,
            regenerateLesson,
            unicodeToKrutiDev,
            updateDisplay,
            calculateConfidence,
            get lessonHistory() { return lessonHistory; },
            get dailyStats() { return dailyStats; },
            get keyLearning() { return keyLearning; },
            get keyStats() { return keyStats; },
            flashPracticeEvent,
            renderProfileCharts,
            ChartMath
        };

        setTimeout(() => el.hiddenInput.focus({preventScroll:true}), 120);

