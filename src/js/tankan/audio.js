'use strict';

        // 3. SOUND SYNTHESIS
        // ─────────────────────────────────────────────────────────────
        function playTone(frequency, duration, type = 'sine', volume = 0.14) {
            if (!soundEnabled) return;
            volume = volume * (opts.volume/70);
            if (volume<=0) return;
            try {
                if (!audioCtx) {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
                gain.gain.setValueAtTime(volume, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + duration);
            } catch (err) {}
        }

        let noiseBuf = null;
        function noiseBurst(duration, filterFreq, type, volume) {
            if (!soundEnabled) return;
            volume = volume * (opts.volume/70);
            if (volume <= 0) return;
            try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') audioCtx.resume();
                if (!noiseBuf) {
                    noiseBuf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.12), audioCtx.sampleRate);
                    const d = noiseBuf.getChannelData(0);
                    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
                }
                const src = audioCtx.createBufferSource(); src.buffer = noiseBuf;
                const f = audioCtx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = 1.1;
                const g = audioCtx.createGain();
                g.gain.setValueAtTime(volume, audioCtx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
                src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start();
            } catch (err) {}
        }

        const SOUND_THEMES = {
            mechanical: { click() { noiseBurst(0.028, 3400, 'bandpass', 0.22); playTone(185, 0.022, 'square', 0.05); } },
            typewriter: { click() { noiseBurst(0.045, 1300, 'lowpass', 0.3); playTone(210, 0.03, 'triangle', 0.09); setTimeout(() => noiseBurst(0.02, 850, 'lowpass', 0.12), 26); } },
            soft:       { click() { playTone(420, 0.035, 'sine', 0.1); } },
            click:      { click() { noiseBurst(0.014, 5400, 'highpass', 0.17); } },
            retro:      { click() { playTone(660, 0.03, 'square', 0.07); playTone(880, 0.02, 'square', 0.045); } },
            thock:      { click() { playTone(120, 0.075, 'sine', 0.26); noiseBurst(0.018, 750, 'lowpass', 0.1); } }
        };

        const sound = {
            click: () => { if(opts.soundMode==='all'||opts.soundMode==='key'){(SOUND_THEMES[opts.soundTheme]||SOUND_THEMES.mechanical).click();} },
            error: () => { if(opts.soundMode==='all'||opts.soundMode==='error')playTone(160, 0.12, 'sawtooth', 0.16); },
            unlock: () => {
                const notes = [440, 554, 659, 880];
                notes.forEach((f, i) => setTimeout(() => playTone(f, 0.12, 'sine', 0.15), i * 90));
            }
        };

        // ─────────────────────────────────────────────────────────────
