'use strict';

        // 6. KEYBOARD RENDERING & REAL-TIME HIGHLIGHTS
        // ─────────────────────────────────────────────────────────────
        function renderVirtualKeyboard() {
            el.keyboardFrame.innerHTML = '';
            keyDOMMap.clear();

            KB_MATRIX.forEach(row => {
                const rowEl = document.createElement('div');
                rowEl.className = 'k-row';

                row.forEach(item => {
                    if (item.sp) {
                        const spacerEl = document.createElement('div');
                        spacerEl.className = 'k-spacer';
                        spacerEl.style.flexGrow = String(item.sp);
                        rowEl.appendChild(spacerEl);
                        return;
                    }
                    const keyEl = document.createElement('div');
                    const classes = ['k-key'];
                    if (item.w) classes.push(item.w);
                    if (item.label) classes.push('label-key');
                    if (item.bump) classes.push('bump');
                    keyEl.className = classes.join(' ');

                    if (item.label) {
                        keyEl.innerHTML = `<span class="hi-main">${item.h}</span>`;
                    } else {
                        const shiftHtml = item.sh ? `<span class="hi-shift">${item.sh}</span>` : '';
                        const enLabel = (item.k.length === 1 && item.k !== ' ') ? item.k.toUpperCase() : '';
                        keyEl.innerHTML = `${shiftHtml}<span class="hi-main">${item.h}</span><span class="en-sub">${enLabel}</span>`;
                    }

                    rowEl.appendChild(keyEl);
                    keyDOMMap.set(item.k, keyEl);
                    if (item.k.length === 1) {
                        keyDOMMap.set(item.k.toLowerCase(), keyEl);
                    }
                });

                el.keyboardFrame.appendChild(rowEl);
            });
        }

        function updateKeyboardHighlights(hintInfo) {
            // Unlocked/heat colouring is guided-lesson state. In Books/Custom
            // every key is available, so the keyboard stays neutral (the
            // current-target hint below still highlights the next key).
            const unlockedSet = textSource==='words' ? new Set(KEY_PROGRESSION.slice(0, highestUnlocked + 1).map(x => x.k.toLowerCase())) : new Set();

            keyDOMMap.forEach((keyEl, k) => {
                keyEl.classList.remove('target', 'shift-needed', 'unlocked', 'heat-1', 'heat-2', 'heat-3');
                if (unlockedSet.has(k.toLowerCase()) || unlockedSet.has(k)) {
                    keyEl.classList.add('unlocked');
                    const progItem = KEY_PROGRESSION.find(x => x.k.toLowerCase() === k.toLowerCase() || x.k === k);
                    const lvl = keyHeatLevel(progItem);
                    if (lvl > 0) keyEl.classList.add('heat-' + lvl);
                }
            });

            if (!hintInfo || !hintInfo.targetKey) return;

            const targetKey = hintInfo.targetKey;
            const isShifted = hintInfo.isShifted;

            const domKey = keyDOMMap.get(targetKey.toLowerCase()) || keyDOMMap.get(targetKey);
            if (domKey) {
                domKey.classList.add('target');
            }

            if (isShifted) {
                const shiftL = keyDOMMap.get('ShiftLeft');
                const shiftR = keyDOMMap.get('ShiftRight');
                if (shiftL) shiftL.classList.add('shift-needed');
                if (shiftR) shiftR.classList.add('shift-needed');
            }
        }

        // ─────────────────────────────────────────────────────────────
