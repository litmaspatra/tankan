'use strict';

        // 2. STATE MANAGEMENT
        // ─────────────────────────────────────────────────────────────
        const INITIAL_UNLOCKED_COUNT = 4;
        let unlockedIndex = INITIAL_UNLOCKED_COUNT - 1;
        let reviewMode=false; // Review is temporary. Reload always resumes automatic progression.
        let highestUnlocked=unlockedIndex, pausedAt=null, pausedTotal=0, lessonEndedAt=null, hiddenWords=[],lastHiddenWord=null;
        let keyStats = {}; // { key: { hits: 0, errors: 0, ttt: 0, tttSamples: 0 } }
        let pendingUnlockIndex = null;
        let lessonCompleted = false;
        let targetKeyBuffer = []; // Rolling sliding window of recent hits on target key
        let targetSpeedGoal = 25; // WPM required to advance
        let textSource='words', bookPos={};
        const DEFAULT_OPTS={strict:false,repeat:1,punct:0,removePunct:false,stopOnError:true,cursorHighlight:true,spaceSkips:false,soundMode:'all',volume:70,soundTheme:'mechanical',lastBook:'',lastEssay:'',customText:'',textSize:32};
        let opts=Object.assign({},DEFAULT_OPTS);
        let currentLessonText = ''; // Continuous string of ~25 words
        let targetKrutiText = ''; // Keystroke sequence in KrutiDev 010 mapping
        let cursorIndex = 0; // Current typing position in targetKrutiText
        let rawKeys = []; // Array of physical keys typed for current lesson
        let lastKeystrokeTime = null;
        let sessionStartTime = null;
        let sessionCorrect = 0;
        let sessionErrors = 0;
        let totalTypedCount = 0;
        let totalErrorsCount = 0;
        let soundEnabled = true;
        let showFingerHint = true;
        let currentTheme = 'light';
        let lessonHistory = [], keyLearning = {}, dailyPractice = {day:'', seconds:0};
        let accuracyStreak = 0, dailyGoalMinutes = 30, lessonStyle = 'classic', keyFont = 'sans';
        // Per-day and lifetime aggregates backing the profile charts (persisted).
        let dailyStats = {}; // {'YYYY-MM-DD': {seconds, lessons, typed, errors}}
        let totalLessons = 0, totalPracticeSeconds = 0;
        let bestLessonWpm = 0, bestLessonAcc = 0, bestStreak = 0, bestScore = 0;
        let pendingLessonEvents = [], goalFlashedDay = '';
        let lessonKeyTimes = {}, lessonActiveSeconds = 0, activityAt = null;
        let previousAttemptWrong=false, measurementEvents = [], displayFont = 'krutidev', altEntryStartedAt = null;
        // Gate font switches on real load so legacy-encoded text never flashes
        // as Latin gibberish while a .ttf is still downloading.
        const FONT_LOAD_PROMISES = {};
        function ensureFontLoaded(key) {
            const f = FONT_REGISTRY[key];
            if (!f || f.family === 'KrutiDev010' || f.family === 'DevLys010Web' || !document.fonts || !document.fonts.load) return Promise.resolve();
            if (!FONT_LOAD_PROMISES[key]) {
                FONT_LOAD_PROMISES[key] = Promise.all([
                    document.fonts.load('32px "' + f.family + '"'),
                    document.fonts.load('700 32px "' + f.family + '"')
                ]).catch(() => {});
            }
            return FONT_LOAD_PROMISES[key];
        }
        const FONT_REGISTRY = {krutidev:{label:'KrutiDev 010',encoding:'krutidev',family:'KrutiDev010'},devlys010:{label:'DevLys 010',encoding:'krutidev-compatible',family:'DevLys010Web'},devlys040:{label:'DevLys 040',encoding:'krutidev-compatible',family:'DevLys040'},devlys040bold:{label:'DevLys 040 Bold',encoding:'krutidev-compatible',family:'DevLys040Bold'},krutidev021:{label:'KrutiDev 021 Italic',encoding:'krutidev',family:'KrutiDev021'},krutidev070:{label:'KrutiDev 070 Bold',encoding:'krutidev',family:'KrutiDev070'}};
        let audioCtx = null;
        let altCodeBuffer = '';
        let altCodeActive = false;

        const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter
            ? new Intl.Segmenter('hi', { granularity: 'grapheme' })
            : null;

        // DOM Element Cache
        const el = {
            canvas: document.getElementById('typing-canvas'),
            textStreamContainer: document.getElementById('text-stream-container'),
            srLesson: document.getElementById('sr-lesson'),
            textCorrect: document.getElementById('text-correct'),
            textError: document.getElementById('text-error'),
            textCurrent: document.getElementById('text-current'),
            textRemaining: document.getElementById('text-remaining'),
            hiddenInput: document.getElementById('hidden-input'),
            alphabetContainer: document.getElementById('alphabet-container'),
            keyboardFrame: document.getElementById('keyboard-frame'),
            leadChar: document.getElementById('lead-char'),
            leadKey: document.getElementById('lead-key'),
            leadFinger: document.getElementById('lead-finger'),
            leadGoalSpeed: document.getElementById('lead-goal-speed'),
            leadCurSpeed: document.getElementById('lead-cur-speed'),
            leadConsistency: document.getElementById('lead-consistency'),
            leadSamplesStatus: document.getElementById('lead-samples-status'),
            progressFill: document.getElementById('progress-fill-bar'),
            progressPct: document.getElementById('progress-stat-pct'),
            progressionSummary: document.getElementById('progression-summary'),
            altHelperBar: document.getElementById('alt-helper-bar'),
            altHelperGlyph: document.getElementById('alt-helper-glyph'),
            altHelperCode: document.getElementById('alt-helper-code'),
            altHelperGail: document.getElementById('alt-helper-gail'),
            liveHintKey: document.getElementById('live-hint-key'),
            liveHintChar: document.getElementById('live-hint-char'),
            liveHintDetail: document.getElementById('live-hint-detail'),
            metricWpm: document.getElementById('metric-wpm'),
            metricAccuracy: document.getElementById('metric-accuracy'),
            metricUnlocked: document.getElementById('metric-unlocked'),
            metricScore: document.getElementById('metric-score'),
            jumpSelect: document.getElementById('jump-select'),
            speedGoalSelect: document.getElementById('speed-goal-select'),
            wordsSelect: document.getElementById('words-select'),
            soundBtn: document.getElementById('sound-toggle-btn'),
            soundIcon: document.getElementById('sound-icon'),
            themeBtn: document.getElementById('theme-toggle-btn'),
            themeSelect: document.getElementById('theme-select'),
            fingerHintSelect: document.getElementById('finger-hint-select'),
            confirmModal: document.getElementById('confirm-modal'),
            modalCancelBtn: document.getElementById('modal-cancel-btn'),
            modalConfirmBtn: document.getElementById('modal-confirm-btn'),
            resetSettingsBtn: document.getElementById('reset-settings-btn'),
            profileTableBody: document.getElementById('profile-table-body')
        };

        const keyDOMMap = new Map();

        // ─────────────────────────────────────────────────────────────
