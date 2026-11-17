'use strict';

        // 9. KEYSTROKE ENGINE & MISTAKE TRACKING
        // ─────────────────────────────────────────────────────────────
        function handleKeystroke(keyString) {
            if (inputLocked) return;
            if (isFinished || cursorIndex >= targetKrutiText.length) return;

            const expected = targetKrutiText.charAt(cursorIndex);
            const now = Date.now();

            if (!sessionStartTime) {
                sessionStartTime = now;
                timerInterval = setInterval(updateHUD, 200);
                if (appMode !== 'book') startBots();
            }

            totalTyped++;
            const timeOffset = now - sessionStartTime;

            // Find current word index
            const textUpToNow = targetKrutiText.substring(0, cursorIndex);
            const currentWordIdx = (textUpToNow.match(/ /g) || []).length;

            // Keyboard visual feedback
            const domKey = keyDOMMap.get(keyString) || keyDOMMap.get(keyString.toLowerCase());
            if (domKey) {
                domKey.classList.add('pressed');
                setTimeout(() => domKey.classList.remove('pressed'), 80);
            }

            // Mismatched keystroke: strict error blocking
            if (keyString !== expected) {
                sound.error();
                errorKeystrokes++;
                mistakeWordIndices.add(currentWordIdx);

                keystrokeLog.push({
                    t: timeOffset,
                    expected,
                    typed: keyString,
                    isErr: true,
                    idx: cursorIndex
                });

                if (el.textCurrent) {
                    el.textCurrent.classList.remove('error-flash');
                    void el.textCurrent.offsetWidth;
                    el.textCurrent.classList.add('error-flash');
                    setTimeout(() => {
                        if (el.textCurrent) el.textCurrent.classList.remove('error-flash');
                    }, 220);
                }

                updateHUD();
                return;
            }

            // Correct keystroke
            sound.click();
            correctKeystrokes++;
            cursorIndex++;

            keystrokeLog.push({
                t: timeOffset,
                expected,
                typed: keyString,
                isErr: false,
                idx: cursorIndex
            });

            if (cursorIndex >= targetKrutiText.length) {
                finishTest();
                return;
            }

            updateDisplay();
            updateHUD();
        }

        // Alt Code Helpers for Remington Kruti Dev
        function commitMashSymbol(sym) {
            const converted = unicodeToKrutiDev(sym);
            if (!converted) return;
            for (let i = 0; i < converted.length; i++) {
                handleKeystroke(converted.charAt(i));
            }
        }

        function commitMashAltCode() {
            if (!altCodeActive) return;
            altCodeActive = false;
            const code = altCodeBuffer;
            altCodeBuffer = '';
            altEchoUntil = Date.now() + 80;
            const glyph = KRUTIDEV_ALT_CODES[code] || KRUTIDEV_ALT_CODES['0' + code];
            if (!glyph) return;
            commitMashSymbol(glyph);
        }

        // ─────────────────────────────────────────────────────────────
