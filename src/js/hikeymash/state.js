'use strict';

        // 4. STATE & DOM ELEMENTS
        // ─────────────────────────────────────────────────────────────
        let currentSnippet = null;
        let targetKrutiText = '';
        let cursorIndex = 0;
        let sessionStartTime = null;
        let elapsedSeconds = 0;
        let timerInterval = null;
        let correctKeystrokes = 0;
        let errorKeystrokes = 0;
        let totalTyped = 0;
        let isFinished = false;
        let isKeyboardVisible = true;
        let currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

        // Advanced Diagnostics & Mistake tracking
        let mistakeWordIndices = new Set();
        let keystrokeLog = [];
        let botInterval = null;
        let botProgress = [0, 0];
        let botSpeed = [39, 34];

        // Alt Code buffer
        let altCodeActive = false;
        let altCodeBuffer = '';
        let altEchoUntil = 0;
        const MODIFIER_KEYS = ['Alt', 'AltGraph', 'Control', 'Shift', 'Meta', 'CapsLock'];

        const el = {
            canvas: document.getElementById('typing-canvas'),
            hiddenInput: document.getElementById('hidden-input'),
            textCorrect: document.getElementById('text-correct'),
            textError: document.getElementById('text-error'),
            textCurrent: document.getElementById('text-current'),
            textRemaining: document.getElementById('text-remaining'),
            liveHintKey: document.getElementById('live-hint-key'),
            liveHintChar: document.getElementById('live-hint-char'),
            liveHintDetail: document.getElementById('live-hint-detail'),
            altHelperPill: document.getElementById('alt-helper-pill'),
            altHelperGlyph: document.getElementById('alt-helper-glyph'),
            altHelperCode: document.getElementById('alt-helper-code'),
            altHelperGail: document.getElementById('alt-helper-gail'),
            keyboardFrame: document.getElementById('keyboard-frame'),
            soundBtn: document.getElementById('sound-btn'),
            soundIcon: document.getElementById('sound-icon'),
            keyboardToggleBtn: document.getElementById('keyboard-toggle-btn'),
            themeBtn: document.getElementById('theme-btn'),
            matchLeaveBtn: document.getElementById('match-leave-btn'),
            matchRefreshBtn: document.getElementById('match-refresh-btn'),
            lobbyScreen: document.getElementById('lobby-screen'),
            modeTabRace: document.getElementById('mode-tab-race'),
            modeTabBook: document.getElementById('mode-tab-book'),
            lobbyPanelRace: document.getElementById('lobby-panel-race'),
            lobbyPanelBook: document.getElementById('lobby-panel-book'),
            lobbyStartBtn: document.getElementById('lobby-start-btn'),
            lobbyFontSelect: document.getElementById('lobby-font-select'),
            lobbySoundSelect: document.getElementById('lobby-sound-select'),
            krutiStream: document.getElementById('kruti-stream'),
            replayTextStream: document.getElementById('replay-text-stream'),
            bookGrid: document.getElementById('book-grid'),
            bookBar: document.getElementById('book-bar'),
            bookBarTitle: document.getElementById('book-bar-title'),
            bookBarPos: document.getElementById('book-bar-pos'),
            bookPrevBtn: document.getElementById('book-prev-btn'),
            bookNextBtn: document.getElementById('book-next-btn'),
            countdownOverlay: document.getElementById('countdown-overlay'),
            countdownNum: document.getElementById('countdown-num'),
            countdownLights: document.getElementById('countdown-lights'),
            paraToast: document.getElementById('para-toast'),
            matchTitle: document.getElementById('match-title'),
            matchSubtitle: document.getElementById('match-subtitle'),
            matchPlayerCount: document.getElementById('match-player-count'),
            racersSection: document.getElementById('racers-section'),
            matchPingVal: document.getElementById('match-ping-val'),

            // Racers Section
            playerPill: document.getElementById('player-track-pill'),
            playerWpm: document.getElementById('player-track-wpm'),
            bot1Pill: document.getElementById('bot1-track-pill'),
            bot1Wpm: document.getElementById('bot1-track-wpm'),
            bot2Pill: document.getElementById('bot2-track-pill'),
            bot2Wpm: document.getElementById('bot2-track-wpm'),

            // Results Modal Elements
            resultsModal: document.getElementById('results-modal'),
            statWpm: document.getElementById('stat-wpm'),
            statAcc: document.getElementById('stat-acc'),
            statTime: document.getElementById('stat-time'),
            statMistakes: document.getElementById('stat-mistakes'),
            resQuoteTitle: document.getElementById('res-quote-title'),
            resQuoteAuthor: document.getElementById('res-quote-author'),
            resReviewText: document.getElementById('res-review-text'),
            modalCopyBtn: document.getElementById('modal-copy-btn'),
            modalRetryBtn: document.getElementById('modal-retry-btn'),
            modalNextBtn: document.getElementById('modal-next-btn'),
            bottomFinishWord: document.getElementById('bottom-finish-word'),
            bottomFinishWpm: document.getElementById('bottom-finish-wpm'),

            // Performance view
            perfPeakWpm: document.getElementById('perf-peak-wpm'),
            perfChartWrapper: document.getElementById('perf-chart-wrapper'),
            perfRawWpm: document.getElementById('perf-raw-wpm'),
            perfConsistency: document.getElementById('perf-consistency'),
            perfKeystrokes: document.getElementById('perf-keystrokes'),
            perfDiff: document.getElementById('perf-diff'),

            // Replay view
            replayText: document.getElementById('replay-text-stream'),
            replayPlayBtn: document.getElementById('replay-play-btn'),
            replayRestartBtn: document.getElementById('replay-restart-btn'),
            replayScrubberFill: document.getElementById('replay-scrubber-fill'),

            // Summary view
            sumTotalRaces: document.getElementById('sum-total-races'),
            sumBestWpm: document.getElementById('sum-best-wpm'),
            sumAvgWpm: document.getElementById('sum-avg-wpm'),
            sumAvgAcc: document.getElementById('sum-avg-acc'),
            historyTableBody: document.getElementById('history-table-body'),

            // Compatibility legacy elements
            snippetTitle: document.getElementById('snippet-title'),
            snippetAuthor: document.getElementById('snippet-author'),
            snippetGenre: document.getElementById('snippet-genre'),
            snippetWordCount: document.getElementById('snippet-word-count'),
            snippetCharCount: document.getElementById('snippet-char-count'),
            metricWpm: document.getElementById('metric-wpm'),
            metricAcc: document.getElementById('metric-acc'),
            metricTime: document.getElementById('metric-time'),
            metricProg: document.getElementById('metric-prog'),
            progressBarFill: document.getElementById('progress-bar-fill'),
            resWpm: document.getElementById('res-wpm'),
            resAcc: document.getElementById('res-acc'),
            resTime: document.getElementById('res-time'),
            resChars: document.getElementById('res-chars'),
            resErrors: document.getElementById('res-errors'),
            resRaw: document.getElementById('res-raw')
        };

        // ─────────────────────────────────────────────────────────────
