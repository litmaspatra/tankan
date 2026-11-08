'use strict';

        // 15a. LOBBY, RACE MODES & BOOK READER
        // ─────────────────────────────────────────────────────────────
        let appMode = 'lobby'; // 'lobby' | 'race' | 'book'
        const raceConfig = { cat: 'mixed' };
        const bookState = { bookId: null, paraIndex: 0 };
        let inputLocked = false;
        let paraToastTimer = null;

        function allBooks() { return (Array.isArray(window.HIKEYBR_BOOKS) ? window.HIKEYBR_BOOKS : []).filter(b => b.kind !== 'essay'); }
        function currentBook() { return allBooks().find(b => b.id === bookState.bookId) || null; }
        function bookProgress(id) {
            const v = parseInt(localStorage.getItem('hikeybr_book_progress_' + id) || '0', 10);
            return isNaN(v) ? 0 : v;
        }
        function kindLabel(kind) {
            return kind === 'novel' ? 'उपन्यास' : kind === 'story' ? 'कहानी' : kind === 'poem' ? 'कविता' : (kind || '');
        }

        function showParaToast(text) {
            el.paraToast.textContent = text;
            el.paraToast.classList.add('show');
            if (paraToastTimer) clearTimeout(paraToastTimer);
            paraToastTimer = setTimeout(() => el.paraToast.classList.remove('show'), 1500);
        }

        function showMatch() {
            document.body.classList.remove('showing-lobby');
            const isBook = appMode === 'book';
            el.bookBar.style.display = isBook ? 'flex' : 'none';
            el.racersSection.style.display = isBook ? 'none' : '';
            if (isBook) {
                const book = currentBook();
                el.matchTitle.textContent = 'BOOK READER';
                el.matchSubtitle.textContent = book ? book.author : '';
                el.matchPlayerCount.textContent = 'SOLO';
            } else {
                el.matchTitle.textContent = 'FREE FOR ALL';
                el.matchSubtitle.textContent = 'PUBLIC';
                el.matchPlayerCount.textContent = '3 PLAYERS';
            }
        }

        function showLobby() {
            appMode = 'lobby';
            stopBots();
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            inputLocked = false;
            el.countdownOverlay.classList.remove('show');
            el.resultsModal.classList.remove('open');
            document.body.classList.remove('showing-results');
            renderBookCards();
            document.body.classList.add('showing-lobby');
        }

        function runCountdown(done) {
            inputLocked = true;
            const seq = ['3', '2', '1', 'GO!'];
            let i = 0;
            const lights = el.countdownLights ? Array.from(el.countdownLights.querySelectorAll('i')) : [];
            el.countdownOverlay.classList.add('show');
            el.countdownNum.classList.remove('go');
            lights.forEach(li => li.classList.remove('lit'));
            el.countdownNum.textContent = seq[0];
            el.countdownNum.classList.add('pop');
            if (lights[0]) lights[0].classList.add('lit');
            if (soundEnabled) sound.countdown(0);
            const step = () => {
                i++;
                if (i < seq.length) {
                    const isGo = i === seq.length - 1;
                    el.countdownNum.textContent = seq[i];
                    el.countdownNum.classList.remove('pop');
                    void el.countdownNum.offsetWidth;
                    el.countdownNum.classList.add('pop');
                    if (isGo) {
                        // Lights out, away we go: the start lights extinguish and GO turns green.
                        lights.forEach(li => li.classList.remove('lit'));
                        el.countdownNum.classList.add('go');
                        if (soundEnabled) sound.go();
                    } else {
                        if (lights[i]) lights[i].classList.add('lit');
                        if (soundEnabled) sound.countdown(i);
                    }
                    setTimeout(step, isGo ? 550 : 750);
                } else {
                    el.countdownOverlay.classList.remove('show');
                    el.countdownNum.classList.remove('go');
                    inputLocked = false;
                    done();
                }
            };
            setTimeout(step, 750);
        }

        function startRace() {
            appMode = 'race';
            showMatch();
            loadSnippet(pickRaceSnippet());
            runCountdown(() => {
                sessionStartTime = Date.now();
                elapsedSeconds = 0;
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(updateHUD, 200);
                startBots();
                el.hiddenInput.focus();
            });
        }

        function renderBookCards() {
            if (!el.bookGrid) return;
            el.bookGrid.innerHTML = '';
            allBooks().forEach(b => {
                const total = b.lines.length;
                const saved = bookProgress(b.id);
                const done = saved >= total;
                const pct = Math.min(100, Math.round((saved / total) * 100));
                const card = document.createElement('div');
                card.className = 'book-card';
                card.innerHTML =
                    '<div class="book-cover"></div>' +
                    '<div class="book-title"></div>' +
                    '<div class="book-author"></div>' +
                    '<div class="book-progress"><div class="book-progress-fill" style="width:' + pct + '%"></div></div>' +
                    '<div class="book-progress-label"></div>' +
                    '<button class="book-read-btn" type="button"></button>';
                card.querySelector('.book-cover').textContent = b.title.trim().charAt(0);
                card.querySelector('.book-title').textContent = b.title;
                card.querySelector('.book-author').textContent = b.author + ' • ' + kindLabel(b.kind);
                card.querySelector('.book-progress-label').textContent =
                    done ? 'पूर्ण ✓ (' + total + ' पैरा)' :
                    saved > 0 ? 'पैरा ' + (saved + 1) + '/' + total + ' (' + pct + '%)' :
                    total + ' पैरा';
                const btn = card.querySelector('.book-read-btn');
                btn.textContent = done ? '↺ फिर से पढ़ें' : (saved > 0 ? '📖 जारी रखें' : '📖 READ & TYPE');
                btn.addEventListener('click', () => openBook(b.id));
                el.bookGrid.appendChild(card);
            });
        }

        function openBook(bookId) {
            const book = allBooks().find(b => b.id === bookId);
            if (!book) return;
            let idx = bookProgress(bookId);
            if (idx >= book.lines.length) idx = 0; // finished before: start over
            appMode = 'book';
            bookState.bookId = bookId;
            bookState.paraIndex = idx;
            showMatch();
            loadBookPara();
            setTimeout(() => el.hiddenInput.focus(), 80);
        }

        function loadBookPara() {
            const book = currentBook();
            if (!book) return;
            const idx = Math.max(0, Math.min(bookState.paraIndex, book.lines.length - 1));
            bookState.paraIndex = idx;
            try { localStorage.setItem('hikeybr_book_progress_' + book.id, String(idx)); } catch (e) {}
            updateBookBar();
            loadSnippet({
                id: book.id + '_p' + idx,
                title: book.title,
                author: book.author,
                category: 'book',
                genre: kindLabel(book.kind),
                difficulty: 'moderate',
                text: book.lines[idx]
            });
        }

        function updateBookBar() {
            const book = currentBook();
            if (!book) return;
            el.bookBarTitle.textContent = book.title;
            el.bookBarPos.textContent = 'पैरा ' + (bookState.paraIndex + 1) + ' / ' + book.lines.length;
            el.bookPrevBtn.disabled = bookState.paraIndex <= 0;
            el.bookNextBtn.disabled = bookState.paraIndex >= book.lines.length - 1;
        }

        function advanceBookPara(delta) {
            const book = currentBook();
            if (!book) return;
            const next = bookState.paraIndex + (delta || 1);
            if (next >= book.lines.length) {
                try { localStorage.setItem('hikeybr_book_progress_' + book.id, String(book.lines.length)); } catch (e) {}
                showParaToast('पुस्तक पूर्ण हुई! 🎉 ' + book.title);
                setTimeout(showLobby, 1700);
                return;
            }
            if (next < 0) return;
            bookState.paraIndex = next;
            loadBookPara();
        }

        // Lobby wiring
        el.modeTabRace.addEventListener('click', () => {
            el.modeTabRace.classList.add('active');
            el.modeTabBook.classList.remove('active');
            el.lobbyPanelRace.style.display = 'flex';
            el.lobbyPanelBook.style.display = 'none';
        });
        el.modeTabBook.addEventListener('click', () => {
            el.modeTabBook.classList.add('active');
            el.modeTabRace.classList.remove('active');
            el.lobbyPanelBook.style.display = 'block';
            el.lobbyPanelRace.style.display = 'none';
            renderBookCards();
        });
        el.lobbyStartBtn.addEventListener('click', startRace);
        el.bookPrevBtn.addEventListener('click', () => advanceBookPara(-1));
        el.bookNextBtn.addEventListener('click', () => advanceBookPara(1));

        // Race display font + sound theme pickers (persisted).
        const MASH_FONTS = {
            devlys010: 'DevLys010Web',
            krutidev: 'KrutiDev010',
            devlys040: 'DevLys040',
            devlys040bold: 'DevLys040Bold',
            krutidev021: 'KrutiDev021',
            krutidev070: 'KrutiDev070'
        };
        function applyRaceFont(key) {
            const fam = MASH_FONTS[key] || MASH_FONTS.devlys010;
            const stack = "'" + fam + "', 'DevLys010Web', 'KrutiDev010', sans-serif";
            if (el.krutiStream) el.krutiStream.style.fontFamily = stack;
            if (el.replayTextStream) el.replayTextStream.style.fontFamily = stack;
            try { localStorage.setItem('hikeymash_font', key); } catch (e) {}
        }
        if (el.lobbyFontSelect) {
            let savedFont = 'devlys010';
            try { savedFont = localStorage.getItem('hikeymash_font') || 'devlys010'; } catch (e) {}
            if (!MASH_FONTS[savedFont]) savedFont = 'devlys010';
            el.lobbyFontSelect.value = savedFont;
            applyRaceFont(savedFont);
            el.lobbyFontSelect.addEventListener('change', () => {
                applyRaceFont(el.lobbyFontSelect.value);
                if (soundEnabled) sound.click();
            });
        }
        if (el.lobbySoundSelect) {
            let savedTheme = 'mechanical';
            try { savedTheme = localStorage.getItem('hikeymash_sound_theme') || 'mechanical'; } catch (e) {}
            if (!SOUND_THEMES[savedTheme]) savedTheme = 'mechanical';
            soundTheme = savedTheme;
            el.lobbySoundSelect.value = savedTheme;
            el.lobbySoundSelect.addEventListener('change', () => {
                soundTheme = el.lobbySoundSelect.value;
                try { localStorage.setItem('hikeymash_sound_theme', soundTheme); } catch (e) {}
                if (soundEnabled) sound.click();
            });
        }
        window.addEventListener('load', () => { renderBookCards(); });

        // Enter in the lobby starts the match (race tab only).
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && document.body.classList.contains('showing-lobby') &&
                el.lobbyPanelRace.style.display !== 'none') {
                e.preventDefault();
                startRace();
            }
        });

        // ─────────────────────────────────────────────────────────────
