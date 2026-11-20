'use strict';

        // 8. DISPLAY & RACER TRACK UPDATER
        // ─────────────────────────────────────────────────────────────
        function updateDisplay() {
            if (el.textError) el.textError.textContent = '';
            const painted = window.TankanLegacyRenderer
                ? window.TankanLegacyRenderer.stream([el.textCorrect, el.textCurrent, el.textRemaining], targetKrutiText, cursorIndex, window.__hikeymashFont || 'tankan')
                : false;
            if (!painted) el.textCorrect.textContent = targetKrutiText.substring(0, cursorIndex);

            if (cursorIndex < targetKrutiText.length) {
                const currChar = targetKrutiText.charAt(cursorIndex);
                if (!painted) {
                    el.textCurrent.textContent = currChar;
                    el.textRemaining.textContent = targetKrutiText.substring(cursorIndex + 1);
                }
                el.textCurrent.className = 'text-current' + (currChar === ' ' ? ' space-cursor' : '');

                el.textCurrent.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });

                // Hint strip & Keyboard highlights
                const expected = currChar;
                const prev = cursorIndex > 0 ? targetKrutiText.charAt(cursorIndex - 1) : null;
                const hint = getKrutiKeystrokeHint(expected, prev);

                el.liveHintKey.textContent = hint.keyLabel;
                el.liveHintChar.textContent = hint.hindiChar;
                el.liveHintDetail.textContent = hint.detail ? ('(' + hint.detail + ')') : '';

                updateKeyboardHighlights({
                    targetKey: hint.physicalKey,
                    isShifted: hint.isShifted
                });

                // Alt Code helper pill
                const altCode = GLYPH_TO_ALT_CODE[hint.hindiChar];
                if (altCode) {
                    const catalogRow = ALT_CODES_CATALOG.find(x => x.glyph === hint.hindiChar);
                    el.altHelperPill.classList.add('active');
                    el.altHelperGlyph.textContent = hint.hindiChar;
                    el.altHelperCode.textContent = 'Alt + ' + altCode;
                    el.altHelperGail.textContent = catalogRow ? catalogRow.gail : ('Alt + ' + altCode);
                } else {
                    el.altHelperPill.classList.remove('active');
                }

                // Update Player Racer Pill & Track position
                const progressPct = targetKrutiText.length > 0 ? (cursorIndex / targetKrutiText.length) : 0;
                el.playerPill.style.left = (progressPct * 90 + 5) + '%';

                // Find active word in snippet text
                const textUpToNow = targetKrutiText.substring(0, cursorIndex);
                const currentWordIdx = (textUpToNow.match(/ /g) || []).length;
                const words = currentSnippet.text.trim().split(/\s+/);
                if (words[currentWordIdx]) {
                    el.playerPill.textContent = words[currentWordIdx];
                }
            } else {
                el.textCurrent.textContent = '';
                el.textCurrent.className = 'text-current';
                el.textRemaining.textContent = '';
                el.altHelperPill.classList.remove('active');
                updateKeyboardHighlights(null);
                finishTest();
            }
        }

        function updateHUD() {
            const now = Date.now();
            if (sessionStartTime) {
                const elapsedMs = now - sessionStartTime;
                const seconds = Math.max(1, elapsedMs / 1000);
                elapsedSeconds = seconds;

                const mins = seconds / 60;
                let curWpm = 0;
                if (elapsedMs >= 1000 && correctKeystrokes >= 3) {
                    curWpm = Math.min(250, ((correctKeystrokes / 5) / mins));
                }
                const formattedWpm = curWpm.toFixed(2);
                el.playerWpm.textContent = formattedWpm + ' WPM';
                el.metricWpm.textContent = Math.round(curWpm);
                el.metricTime.textContent = Math.round(seconds);
            }

            const total = correctKeystrokes + errorKeystrokes;
            const acc = total > 0 ? Math.round((correctKeystrokes / total) * 100) : 100;
            el.metricAcc.textContent = acc;
        }

        // ─────────────────────────────────────────────────────────────
