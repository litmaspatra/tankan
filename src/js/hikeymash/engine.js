'use strict';

        function unicodeToKrutiDev(text) {
            let s = text;

            // Nukta + halant conjuncts (ज़् etc.) have no KrutiDev
            // half-form; the converter used to drop a visible halant glyph that
            // hid the nukta (ज़्यादा rendered as "t+~;knk"). Strip the nukta in
            // that conjunct only, so ज़्यादा renders as ज्यादा. Standalone
            // nukta letters keep their own Alt-code glyphs (Alt-Codes Lab).
            s = s.replace(/([कखगजफ])़्/g, '$1्');

            // 0. Punctuation -> authentic KrutiDev bytes. On the Remington (Kruti Dev)
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
        function getKrutiKeystrokeHint(expected, prev) {
            if (KRUTI_BYTE_HINTS[expected]) {
                const { glyph, code } = KRUTI_BYTE_HINTS[expected];
                return {
                    physicalKey: null,
                    keyLabel: 'Alt + ' + code,
                    hindiChar: glyph,
                    detail: 'Alt दबाए रखें और नंबर पैड पर ' + code + ' टाइप करें',
                    isShifted: false
                };
            }

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
                    detail: "'k' दबाकर " + fullLetter + " पूरा करें",
                    isShifted: false
                };
            }

            const hit = KRUTI_HINT_DESCS[expected];
            if (hit) {
                return {
                    physicalKey: hit.key,
                    keyLabel: hit.shift ? ('Shift + ' + hit.key.toUpperCase()) : (hit.key === ' ' ? 'स्पेसबार' : hit.key.toUpperCase()),
                    hindiChar: hit.hi,
                    detail: hit.detail,
                    isShifted: hit.shift
                };
            }

            const SHIFT_BASE = { '~':'\x60', '!':'1', '@':'2', '#':'3', '$':'4', '%':'5', '^':'6', '&':'7', '*':'8', '(':'9', ')':'0', '_':'-', '+':'=', '{':'[', '}':']', '|':'\\', ':':';', '"':"'", '<':',', '>':'.', '?':'/' };
            const isShift = (expected !== expected.toLowerCase()) || Boolean(SHIFT_BASE[expected]);
            const baseKey = SHIFT_BASE[expected] || expected.toLowerCase();
            return {
                physicalKey: baseKey,
                keyLabel: isShift ? ('Shift + ' + baseKey.toUpperCase()) : (expected === ' ' ? 'स्पेसबार' : expected.toUpperCase()),
                hindiChar: expected,
                detail: '',
                isShifted: isShift
            };
        }

        // Reverse lookup for Alt-byte hint system
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

        // ─────────────────────────────────────────────────────────────
