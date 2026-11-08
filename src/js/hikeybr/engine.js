'use strict';

        // 4.5 UNICODE TO KRUTIDEV ENGINE & HINT SYSTEM
        // ─────────────────────────────────────────────────────────────
        function unicodeToKrutiDev(text) {
            let s = text;

            // Nukta + halant conjuncts (ज़् etc.) have no KrutiDev
            // half-form; the converter used to drop a visible halant glyph that
            // hid the nukta (ज़्यादा rendered as "t+~;knk"). Strip the nukta in
            // that conjunct only, so ज़्यादा renders as ज्यादा. Standalone
            // nukta letters keep their own Alt-code glyphs (Alt-Codes Lab).
            s = s.replace(/([कखगजफ])़्/g, '$1्');

            // 0. Punctuation -> authentic KrutiDev bytes. On the Remington GAIL
            // layout the English punctuation keys type Hindi letters (',' key = ए,
            // '?' key = घ्, '.' key = ण्), so the real punctuation glyphs live on
            // other keys: comma = ] key, '?' = \ key, full stop = - key,
            // ';' = Shift+9, '-'/'–'/'—' = Shift+7, ':' = Shift+5 (visarga-shaped
            // glyph), '!' = Shift+1. KrutiDev has no ( ) [ ] { } glyphs, so those
            // are dropped from the text instead of rendering as wrong letters.
            s = s.replace(/"([^"]*)"/g, '‘$1’');
            const PUNCT_TO_KRUTI = {
                ',': ']', '?': '\\', '.': '-', ';': '(', '!': '!',
                ':': '%', '-': '&', '–': '&', '—': '&',
                '“': '^', '”': '*', '‘': '^', '’': '*',
                '"': '*', "'": '*',
                '(': '', ')': '', '[': '', ']': '', '{': '', '}': '',
                '॥': 'AA', '…': '---', '॰': ''
            };
            s = s.replace(/[,\.?;:!()\[\]{}\-–—…॰॥"'“”‘’]/g, ch => PUNCT_TO_KRUTI[ch] || '');

            // 1. Reph reordering: र् + consonant (+ matras) -> consonant (+ matras) + Z
            s = s.replace(/\u0930\u094D([\u0915-\u0939](\u093E|\u093F|\u0940|\u0941|\u0942|\u0947|\u0948|\u094B|\u094C|\u0902)?)/g, '$1Z');

            // 2. Chhoti 'i' matra reordering: consonant + \u093F (ि) -> f + consonant
            s = s.replace(/([\u0915-\u0939]\u094D)?([\u0915-\u0939]\u093C?)\u093F/g, (match, half, cons) => {
                return 'f' + (half || '') + cons;
            });

            // 3. Multi-character vowels
            s = s.replace(/ओ/g, 'vks');
            s = s.replace(/औ/g, 'vkS');
            s = s.replace(/आ/g, 'vk');
            s = s.replace(/ई/g, 'bZ');
            s = s.replace(/ऐ/g, ',s');

            // 4. Special conjuncts (real Remington keyboard keys)
            s = s.replace(/त्र/g, '=');
            s = s.replace(/ज्ञ/g, 'K');
            s = s.replace(/श्र/g, 'J');
            s = s.replace(/द्य/g, '|');
            s = s.replace(/द्ध/g, ')');
            s = s.replace(/द्व/g, '}');

            // 4.1 NEW ALT_BYTES: Single codepage bytes for Alt-code glyphs
            const ALT_BYTES = {
                'क्र': 216, 'फ्र': 221, 'ह्र': 235,
                'फ्': 182,
                'ँ': 161, 'ञ': 165, 'ऽ': 183, 'ऊ': 197
            };
            for (const [glyph, byte] of Object.entries(ALT_BYTES)) {
                s = s.split(glyph).join(String.fromCharCode(byte));
            }

            // 4.2 Catch all rakar combos with no Alt byte (प्र->iz, ग्रह->xzg, व्रत->ozr, द्र->nz)
            s = s.replace(/्र/g, 'z');

            // 4.3 Number-row Ru and Roo (Shift+3 and Shift+;)
            s = s.replace(/\u0930\u0941/g, '#');
            s = s.replace(/\u0930\u0942/g, ':');

            // 5. Half consonants followed by standing stem (9 consonants that are half-form + k).
            // Only when NOT followed by a halant: ख + ् must become the true half
            // form below ([, not [k~), otherwise the font shows a full letter with
            // a visible halant mark (the क ृ ष ् ण bug in कृष्णा).
            s = s.replace(/ख(?!्)/g, '[k');
            s = s.replace(/क्ष(?!्)/g, '{k');
            s = s.replace(/ण(?!्)/g, '.k');
            s = s.replace(/ध(?!्)/g, '/k');
            s = s.replace(/घ(?!्)/g, '?k');
            s = s.replace(/थ(?!्)/g, 'Fk');
            s = s.replace(/भ(?!्)/g, 'Hk');
            s = s.replace(/श(?!्)/g, "'k");
            s = s.replace(/ष(?!्)/g, '"k');

            // Half forms (halant):
            s = s.replace(/ख्/g, '[');
            s = s.replace(/क्ष्/g, '{');
            s = s.replace(/ण्/g, '.');
            s = s.replace(/ध्/g, '/');
            s = s.replace(/घ्/g, '?');
            s = s.replace(/थ्/g, 'F');
            s = s.replace(/भ्/g, 'H');
            s = s.replace(/श्/g, "'");
            s = s.replace(/ष्/g, '"');

            // Other half forms (Shift keys):
            s = s.replace(/क्/g, 'D');
            s = s.replace(/ग्/g, 'X');
            s = s.replace(/च्/g, 'P');
            s = s.replace(/ज्/g, 'T');
            s = s.replace(/त्/g, 'R');
            s = s.replace(/न्/g, 'U');
            s = s.replace(/प्/g, 'I');
            s = s.replace(/ब्/g, 'C');
            s = s.replace(/म्/g, 'E');
            s = s.replace(/ल्/g, 'Y');
            s = s.replace(/व्/g, 'O');
            s = s.replace(/स्/g, 'L');

            // 6. Remaining single vowels & consonants (with Devanagari digits)
            const singleMap = {
                'अ': 'v', 'इ': 'b', 'उ': 'm', 'ए': ',', 'ऋ': '_',
                'क': 'd', 'ग': 'x', 'च': 'p', 'ज': 't', 'ट': 'V', 'ठ': 'B', 'ड': 'M', 'ढ': '<',
                'त': 'r', 'द': 'n', 'न': 'u', 'प': 'i', 'फ': 'Q', 'ब': 'c', 'म': 'e', 'य': ';',
                'र': 'j', 'ल': 'y', 'व': 'o', 'स': 'l', 'ह': 'g', 'ळ': 'G', 'छ': 'N', 'झ': '>', 'ङ': 'a',
                'ा': 'k', 'ी': 'h', 'ु': 'q', 'ू': 'w', 'े': 's', 'ै': 'S', 'ो': 'ks', 'ौ': 'kS',
                'ं': 'a', 'ः': '%', 'ृ': '`', '्': '~', '़': '+',
                '।': 'A',
                '‘': '^', '’': '*',
                '\u2018': '^', '\u2019': '*',
                '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9', '०': '0'
            };

            for (const [k, v] of Object.entries(singleMap)) {
                s = s.split(k).join(v);
            }

            return s;
        }

        // Reverse lookup for Alt-byte hint system (Bug 1c)
        const KRUTI_BYTE_HINTS = {};
        for (const [code, glyph] of Object.entries(KRUTIDEV_ALT_CODES)) {
            const seq = unicodeToKrutiDev(glyph);
            if (seq.length === 1 && seq.charCodeAt(0) >= 128) {
                KRUTI_BYTE_HINTS[seq] = { glyph, code };
            }
        }

        const GLYPH_TO_ALT_CODE = {};
        for (const [code, glyph] of Object.entries(KRUTIDEV_ALT_CODES)) {
            GLYPH_TO_ALT_CODE[glyph] = code;
        }

        const KRUTI_HINT_DESCS = {
            "'": { hi: 'श्', name: 'Half-Sha', detail: "Press ' then complete with 'k'", key: "'", shift: false },
            "[": { hi: 'ख्', name: 'Half-Kha', detail: "Press [ then complete with 'k'", key: '[', shift: false },
            "/": { hi: 'ध्', name: 'Half-Dha', detail: "Press / then complete with 'k'", key: '/', shift: false },
            "?": { hi: 'घ्', name: 'Half-Gha', detail: "Shift + / then complete with 'k'", key: '/', shift: true },
            "F": { hi: 'थ्', name: 'Half-Tha', detail: "Shift + F then complete with 'k'", key: 'f', shift: true },
            "H": { hi: 'भ्', name: 'Half-Bha', detail: "Shift + H then complete with 'k'", key: 'h', shift: true },
            "{": { hi: 'क्ष्', name: 'Half-Ksha', detail: "Shift + [ then complete with 'k'", key: '[', shift: true },
            '"': { hi: 'ष्', name: 'Half-Shha', detail: "Shift + ' then complete with 'k'", key: "'", shift: true },
            ".": { hi: 'ण्', name: 'Half-Nna', detail: "Press . then complete with 'k'", key: '.', shift: false },
            "f": { hi: 'ि', name: 'Chhoti I matra', detail: 'Typed BEFORE consonant', key: 'f', shift: false },
            "Z": { hi: 'र्', name: 'Reph', detail: 'Shift + Z (typed AFTER consonant)', key: 'z', shift: true },
            " ": { hi: '␣', name: 'Space', detail: 'Space between words', key: ' ', shift: false },
            "d": { hi: 'क', name: 'Ka', detail: 'Left Middle', key: 'd', shift: false },
            "k": { hi: 'ा', name: 'Aa matra / Stem', detail: 'Right Middle', key: 'k', shift: false },
            "j": { hi: 'र', name: 'Ra', detail: 'Right Index', key: 'j', shift: false },
            "s": { hi: 'े', name: 'E matra', detail: 'Left Ring', key: 's', shift: false },
            "e": { hi: 'म', name: 'Ma', detail: 'Left Middle', key: 'e', shift: false },
            "r": { hi: 'त', name: 'Ta', detail: 'Left Index', key: 'r', shift: false },
            "u": { hi: 'न', name: 'Na', detail: 'Right Index', key: 'u', shift: false },
            "i": { hi: 'प', name: 'Pa', detail: 'Right Middle', key: 'i', shift: false },
            "o": { hi: 'व', name: 'Va', detail: 'Right Ring', key: 'o', shift: false },
            "p": { hi: 'च', name: 'Cha', detail: 'Right Pinky', key: 'p', shift: false },
            "x": { hi: 'ग', name: 'Ga', detail: 'Left Ring', key: 'x', shift: false },
            "c": { hi: 'ब', name: 'Ba', detail: 'Left Middle', key: 'c', shift: false },
            "v": { hi: 'अ', name: 'A vowel', detail: 'Left Index', key: 'v', shift: false },
            "b": { hi: 'इ', name: 'I vowel', detail: 'Left Index', key: 'b', shift: false },
            "m": { hi: 'उ', name: 'U vowel', detail: 'Right Index', key: 'm', shift: false },
            ",": { hi: 'ए', name: 'E vowel', detail: 'Right Middle', key: ',', shift: false },
            "l": { hi: 'स', name: 'Sa', detail: 'Right Ring', key: 'l', shift: false },
            ";": { hi: 'य', name: 'Ya', detail: 'Right Pinky', key: ';', shift: false },
            "g": { hi: 'ह', name: 'Ha', detail: 'Left Index', key: 'g', shift: false },
            "h": { hi: 'ी', name: 'Badi Ee matra', detail: 'Right Index', key: 'h', shift: false },
            "q": { hi: 'ु', name: 'Chhoti U matra', detail: 'Left Pinky', key: 'q', shift: false },
            "w": { hi: 'ू', name: 'Badi Oo matra', detail: 'Left Ring', key: 'w', shift: false },
            "a": { hi: 'ं', name: 'Anusvara', detail: 'Left Pinky', key: 'a', shift: false },
            "S": { hi: 'ै', name: 'Ai matra', detail: 'Shift + S', key: 's', shift: true },
            "N": { hi: 'छ', name: 'Chha', detail: 'Shift + N', key: 'n', shift: true },
            ">": { hi: 'झ', name: 'Jha', detail: 'Shift + .', key: '.', shift: true },
            "=": { hi: 'त्र', name: 'Tra', detail: 'Right Pinky', key: '=', shift: false },
            "K": { hi: 'ज्ञ', name: 'Gya', detail: 'Shift + K', key: 'k', shift: true },
            "J": { hi: 'श्र', name: 'Shra', detail: 'Shift + J', key: 'j', shift: true },
            // Number Row Hints (Feature A & Full Glyphs)
            "_": { hi: 'ऋ', name: 'Ri vowel', detail: 'Shift + -', key: '-', shift: true },
            "#": { hi: 'रु', name: 'Ru', detail: 'Shift + 3', key: '3', shift: true },
            "%": { hi: 'ः', name: 'Visarga', detail: 'Shift + 5', key: '5', shift: true },
            "^": { hi: '‘', name: 'Opening single quote', detail: 'Shift + 6', key: '6', shift: true },
            "*": { hi: '’', name: 'Closing single quote', detail: 'Shift + 8', key: '8', shift: true },
            ":": { hi: 'रू', name: 'Roo', detail: 'Shift + ;', key: ';', shift: true },
            // Remington punctuation keys: the English punctuation keys type Hindi letters in KrutiDev
            "]": { hi: ',', name: 'Comma (Alpviram)', detail: "Press ] for a comma — the ',' key types ए", key: ']', shift: false },
            "\\": { hi: '?', name: 'Question mark (Prashn-chinha)', detail: "Press \\ for '?' — the '?' key types घ्", key: '\\', shift: false },
            "-": { hi: '.', name: 'Full stop', detail: "Press - for '.' — the '.' key types ण्", key: '-', shift: false },
            "&": { hi: '-', name: 'Hyphen / dash', detail: 'Shift + 7', key: '7', shift: true },
            "(": { hi: ';', name: 'Semicolon', detail: 'Shift + 9', key: '9', shift: true },
            "A": { hi: '।', name: 'Danda (Purn Viram)', detail: 'Shift + A', key: 'a', shift: true },
            "1": { hi: '१', name: 'Digit 1', detail: 'Left Pinky', key: '1', shift: false },
            "2": { hi: '२', name: 'Digit 2', detail: 'Left Ring', key: '2', shift: false },
            "3": { hi: '३', name: 'Digit 3', detail: 'Left Middle', key: '3', shift: false },
            "4": { hi: '४', name: 'Digit 4', detail: 'Left Index', key: '4', shift: false },
            "5": { hi: '५', name: 'Digit 5', detail: 'Left Index', key: '5', shift: false },
            "6": { hi: '६', name: 'Digit 6', detail: 'Right Index', key: '6', shift: false },
            "7": { hi: '७', name: 'Digit 7', detail: 'Right Index', key: '7', shift: false },
            "8": { hi: '८', name: 'Digit 8', detail: 'Right Middle', key: '8', shift: false },
            "9": { hi: '९', name: 'Digit 9', detail: 'Right Ring', key: '9', shift: false },
            "0": { hi: '०', name: 'Digit 0', detail: 'Right Pinky', key: '0', shift: false }
        };

        function getKrutiKeystrokeHint(expected, prev) {
            // Check Alt-byte hint first (Bug 1c)
            if (KRUTI_BYTE_HINTS[expected]) {
                const { glyph, code } = KRUTI_BYTE_HINTS[expected];
                // A glyph with a multi-key alias (क्र -> dz) teaches the regular
                // keystrokes; the exam bans Alt. The Alt code stays as a note.
                const aliasRow = (typeof ALT_CODES_CATALOG !== 'undefined') ? ALT_CODES_CATALOG.find(x => x.glyph === glyph && x.gail && x.gail.length > 1) : null;
                if (aliasRow) {
                    const steps = [...aliasRow.gail].map(ch => ch.toUpperCase()).join(' then ');
                    return {
                        physicalKey: aliasRow.gail[0],
                        keyLabel: steps,
                        hindiChar: glyph,
                        detail: 'Type ' + aliasRow.gail.split('').join(', ') + ' (Alt + ' + code + ' also works)',
                        isShifted: false
                    };
                }
                return {
                    physicalKey: null,
                    keyLabel: 'Alt + ' + code,
                    hindiChar: glyph,
                    detail: 'Hold Alt, type ' + code + ' on the numpad, release Alt',
                    isShifted: false
                };
            }

            // Check stem completion after half-consonant
            if (expected === 'k' && ["'", '[', '/', '?', 'F', 'H', '{', '"', '.'].includes(prev)) {
                const parentMap = {
                    "'": 'श', '[': 'ख', '/': 'ध', '?': 'घ',
                    'F': 'थ', 'H': 'भ', '{': 'क्ष', '"': 'ष', '.': 'ण'
                };
                const fullLetter = parentMap[prev] || 'Letter';
                return {
                    physicalKey: 'k',
                    keyLabel: 'K',
                    hindiChar: fullLetter,
                    detail: `Press 'k' to complete ${fullLetter}`,
                    isShifted: false
                };
            }

            const hit = KRUTI_HINT_DESCS[expected];
            if (hit) {
                return {
                    physicalKey: hit.key,
                    keyLabel: hit.shift ? `Shift + ${hit.key.toUpperCase()}` : (hit.key === ' ' ? 'Spacebar' : hit.key.toUpperCase()),
                    hindiChar: hit.hi,
                    detail: hit.detail,
                    isShifted: hit.shift
                };
            }

            const SHIFT_BASE = { '~':'`', '!':'1', '@':'2', '#':'3', '$':'4', '%':'5', '^':'6', '&':'7', '*':'8', '(':'9', ')':'0', '_':'-', '+':'=', '{':'[', '}':']', '|':'\\', ':':';', '"':"'", '<':',', '>':'.', '?':'/' };
            const isShift = (expected !== expected.toLowerCase()) || Boolean(SHIFT_BASE[expected]);
            const baseKey = SHIFT_BASE[expected] || expected.toLowerCase();
            const hindiChar = (typeof engToHindi !== 'undefined' && engToHindi.krutidev) ? (engToHindi.krutidev[expected] || expected) : expected;
            return {
                physicalKey: baseKey,
                keyLabel: isShift ? ('Shift + ' + baseKey.toUpperCase()) : (expected === ' ' ? 'Spacebar' : expected.toUpperCase()),
                hindiChar: hindiChar,
                detail: '',
                isShifted: isShift
            };
        }

        function isVirtual(token) {
            return typeof token === 'string' && token.charCodeAt(0) === 0;
        }

        function resolveMapped(token, map) {
            return isVirtual(token) ? token.slice(1) : map[token];
        }

        function applyKrutiDevSequences(tokens) {
            const out = [];
            let i = 0;
            while (i < tokens.length) {
                let matched = false;
                if (!isVirtual(tokens[i])) {
                    for (const seq of KRUTIDEV_SEQ_KEYS) {
                        const len = seq.length;
                        if (i + len > tokens.length) continue;
                        const slice = tokens.slice(i, i + len);
                        if (slice.some(t => isVirtual(t))) continue;
                        if (slice.join('') === seq) {
                            out.push('\u0000' + KRUTIDEV_SEQUENCES[seq]);
                            i += len;
                            matched = true;
                            break;
                        }
                    }
                }
                if (!matched) {
                    out.push(tokens[i]);
                    i++;
                }
            }
            return out;
        }

        function reorderKrutiDev(tokens) {
            const map = engToHindi.krutidev;
            const pass1 = [];

            // Pass 1: Chhoti 'i' matra ('f' / ि)
            // Striking 'f' before a consonant maps to consonant + ि in Unicode
            for (let i = 0; i < tokens.length; i++) {
                const tok = tokens[i];
                if (tok === 'f') {
                    const next = tokens[i + 1];
                    const nextMapped = next !== undefined ? resolveMapped(next, map) : undefined;
                    if (next !== undefined && nextMapped && !MATRA_CHARS.has(nextMapped)) {
                        pass1.push(next, tok);
                        i++;
                        continue;
                    }
                    if (next === undefined) continue; // Dangling 'f' waits for consonant
                }
                pass1.push(tok);
            }

            // Pass 2: Reph ('Z' / र्)
            // Striking 'Z' after a consonant moves 'Z' before the consonant in Unicode
            const pass2 = [];
            for (let i = 0; i < pass1.length; i++) {
                const tok = pass1[i];
                if (tok === 'Z') {
                    let insertPos = pass2.length;
                    while (insertPos > 0) {
                        const mapped = resolveMapped(pass2[insertPos - 1], map);
                        if (mapped && MATRA_CHARS.has(mapped)) insertPos--;
                        else break;
                    }
                    if (insertPos > 0) insertPos--;
                    pass2.splice(insertPos, 0, 'Z');
                } else {
                    pass2.push(tok);
                }
            }

            return pass2;
        }

        function convertKrutiDevBuffer(rawTokens) {
            const map = engToHindi.krutidev;
            const tokens = applyKrutiDevSequences(rawTokens);
            const ordered = reorderKrutiDev(tokens);
            return ordered.map(token => {
                const mapped = resolveMapped(token, map);
                return mapped !== undefined ? mapped : token;
            }).join('');
        }

        function getKrutiDevDisplayValue(rawTokens) {
            if (!rawTokens.length) return '';
            let pendingCount = 0;
            let run = '';
            for (let i = rawTokens.length - 1; i >= 0; i--) {
                const tok = rawTokens[i];
                if (isVirtual(tok)) break;
                run = tok + run;
                if (KRUTIDEV_PENDING_PREFIXES.has(run)) {
                    pendingCount = run.length;
                } else if (KRUTIDEV_SEQUENCES[run]) {
                    pendingCount = 0;
                    break;
                } else if (run.length > 3) {
                    break;
                }
            }
            if (!pendingCount) return convertKrutiDevBuffer(rawTokens);
            return convertKrutiDevBuffer(rawTokens.slice(0, -pendingCount));
        }

        function getMatchLength(val, target) {
            let len = 0;
            while (len < val.length && len < target.length && val[len] === target[len]) {
                len++;
            }
            return len;
        }

        function getKrutiDevHint(target, position, lastRawKey) {
            const remaining = target.slice(position);
            if (!remaining) return null;

            // 1. Incomplete sequence prefix lookahead (e.g. 'v' in 'vk' -> 'आ')
            if (
                lastRawKey &&
                KRUTIDEV_PENDING_PREFIXES.has(lastRawKey) &&
                engToHindi.krutidev[lastRawKey] === remaining[0]
            ) {
                const nextHint = getKrutiDevHint(target, position + 1, null);
                if (nextHint) return nextHint;
            }

            // 2. Chhoti 'i' matra (ि, key 'f') lookahead:
            // In Remington, 'f' is struck BEFORE the consonant (e.g. 'fd' -> कि)
            if (
                lastRawKey !== 'f' &&
                remaining.length > 1 &&
                remaining[0] !== 'ि' &&
                remaining[1] === 'ि' &&
                !MATRA_CHARS.has(remaining[0])
            ) {
                return {
                    text: 'f',
                    length: 0,
                    displayTarget: 'ि',
                    desc: 'Chhoti I matra (typed before consonant)'
                };
            }

            // 3. Reph (र्, key 'Z') lookahead:
            // Consonant is struck FIRST, then 'Z' (e.g. 'eZ' -> र्म)
            if (remaining.startsWith('र्')) {
                const afterReph = remaining.slice(2);
                if (afterReph.length > 0) {
                    const consHint = getKrutiDevHint(afterReph, 0, null);
                    if (consHint) {
                        const consLastChar = consHint.text[consHint.text.length - 1];
                        if (lastRawKey === consLastChar) {
                            return {
                                text: 'Z',
                                length: 2,
                                displayTarget: 'र्',
                                desc: 'Reph (Shift + Z)'
                            };
                        }
                        return {
                            text: consHint.text,
                            length: 0,
                            displayTarget: afterReph[0],
                            desc: 'Base consonant for reph'
                        };
                    }
                }
            }

            // 4. Alt codes candidates
            const candidates = [];
            for (const [code, value] of Object.entries(KRUTIDEV_ALT_CODES)) {
                if (value && remaining.startsWith(value)) {
                    candidates.push({
                        text: 'Alt+' + code,
                        altCode: code,
                        glyph: value,
                        length: value.length,
                        priority: 1
                    });
                }
            }

            // 5. Multi-key sequences candidates
            for (const [seq, value] of Object.entries(KRUTIDEV_SEQUENCES)) {
                if (value && remaining.startsWith(value)) {
                    candidates.push({
                        text: seq,
                        glyph: value,
                        length: value.length,
                        priority: 2
                    });
                }
            }

            // 6. Direct single key candidates
            for (const [key, value] of Object.entries(engToHindi.krutidev)) {
                if (value && remaining.startsWith(value)) {
                    candidates.push({
                        text: key,
                        glyph: value,
                        length: value.length,
                        priority: 3
                    });
                }
            }

            candidates.sort((a, b) => b.length - a.length || b.priority - a.priority);
            return candidates[0] || null;
        }

        // ─────────────────────────────────────────────────────────────
