'use strict';

        // 15. EVENT LISTENERS
        // ─────────────────────────────────────────────────────────────
        el.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            el.hiddenInput.focus();
        });

        document.addEventListener('keydown', (e) => {
            const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            if (tag !== 'select' && tag !== 'button' && tag !== 'input' && !e.ctrlKey && !e.metaKey) {
                el.hiddenInput.focus();
            }
        });

        el.hiddenInput.addEventListener('focus', () => el.canvas.classList.add('active-focus'));
        el.hiddenInput.addEventListener('blur', () => el.canvas.classList.remove('active-focus'));
        el.hiddenInput.addEventListener('input', (e) => {
            if (altCodeActive) commitMashAltCode();
            else if (Date.now() < altEchoUntil) altEchoUntil = 0;
            else if (e.data && e.data.length === 1 && e.data.charCodeAt(0) >= 160 && e.data.charCodeAt(0) <= 255) commitMashSymbol(e.data);
            el.hiddenInput.value = '';
        });

        el.hiddenInput.addEventListener('keydown', (e) => {
            if (e.key === 'Alt' && altCodeActive) commitMashAltCode();
            if (e.key === 'Tab') {
                // keybr has no Tab shortcut: never skip the paragraph,
                // just keep focus in the typing stream.
                e.preventDefault();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                loadSnippet(currentSnippet);
                return;
            }

            if (e.altKey && NUMPAD_DIGIT_MAP[e.code]) {
                e.preventDefault();
                altCodeActive = true;
                altCodeBuffer += NUMPAD_DIGIT_MAP[e.code];
                return;
            }

            if (altCodeActive && !MODIFIER_KEYS.includes(e.key)) commitMashAltCode();
            if (e.key.length === 1 && e.key.charCodeAt(0) > 127 && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (Date.now() < altEchoUntil) { altEchoUntil = 0; return; }
                if (altCodeActive) { commitMashAltCode(); return; }
                commitMashSymbol(e.key);
                return;
            }

            if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape',
                 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) {
                return;
            }
            if (e.key.length > 1 && e.key !== 'Backspace') return;
            if (e.ctrlKey || e.metaKey) return;

            e.preventDefault();

            if (e.key === 'Backspace') {
                if (cursorIndex > 0) {
                    cursorIndex--;
                    sound.click();
                    updateDisplay();
                    updateHUD();
                }
                return;
            }

            let pressed = e.key;
            if (e.code === 'Space') pressed = ' ';
            else if (e.code === 'Semicolon') pressed = e.shiftKey ? ':' : ';';
            else if (e.code === 'Quote') pressed = e.shiftKey ? '"' : "'";
            else if (e.code === 'Comma') pressed = e.shiftKey ? '<' : ',';
            else if (e.code === 'Period') pressed = e.shiftKey ? '>' : '.';
            else if (e.code === 'Slash') pressed = e.shiftKey ? '?' : '/';
            else if (e.code === 'BracketLeft') pressed = e.shiftKey ? '{' : '[';
            else if (e.code === 'BracketRight') pressed = e.shiftKey ? '}' : ']';
            else if (e.code === 'Backquote') pressed = e.shiftKey ? '~' : '`';
            else if (e.code === 'Equal') pressed = e.shiftKey ? '+' : '=';
            else if (e.code === 'Minus') pressed = e.shiftKey ? '_' : '-';

            handleKeystroke(pressed);
            el.hiddenInput.value = '';
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
                commitMashAltCode();
                return;
            }
        });

        el.matchLeaveBtn.addEventListener('click', () => {
            showLobby();
        });

        el.modalNextBtn.addEventListener('click', () => {
            loadSnippet(pickRaceSnippet());
        });

        el.modalRetryBtn.addEventListener('click', () => {
            loadSnippet(currentSnippet);
        });

        el.modalCopyBtn.addEventListener('click', () => {
            const shareText = '⚡ HiKeymash साहित्य टाइपिंग परिणाम:\n' +
                '📖 रचना: ' + currentSnippet.title + ' (' + currentSnippet.author + ')\n' +
                '🚀 गति: ' + el.statWpm.textContent + ' WPM\n' +
                '🎯 सटीकता: ' + el.statAcc.textContent + '\n' +
                '⏱️ समय: ' + el.statTime.textContent + '\n\n' +
                'हिंदी रेमिंगटन GAIL टाइपिंग मैच खेलें: ' + window.location.href;
            navigator.clipboard.writeText(shareText).then(() => {
                alert('✅ स्कोर कॉपी हो गया!');
            }).catch(() => {});
        });

        el.soundBtn.addEventListener('click', () => {
            soundEnabled = !soundEnabled;
            el.soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
            el.soundBtn.classList.toggle('active', soundEnabled);
            if (soundEnabled) sound.click();
        });

        el.keyboardToggleBtn.addEventListener('click', () => {
            isKeyboardVisible = !isKeyboardVisible;
            el.keyboardFrame.classList.toggle('hidden', !isKeyboardVisible);
            el.keyboardToggleBtn.classList.toggle('active', isKeyboardVisible);
        });

        const themes = ['light', 'sunshine', 'forest', 'dark', 'navy', 'amber', 'epaper', 'blackwhite'];
        el.themeBtn.addEventListener('click', () => {
            const nextIdx = (themes.indexOf(currentTheme) + 1) % themes.length;
            currentTheme = themes[nextIdx];
            document.documentElement.setAttribute('data-theme', currentTheme);
        });

        // ─────────────────────────────────────────────────────────────
