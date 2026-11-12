'use strict';

        // 11. PERFORMANCE VIEW (SVG WPM CHART)
        // ─────────────────────────────────────────────────────────────
        function renderPerformanceView(netWpm, rawWpm) {
            el.perfRawWpm.textContent = rawWpm.toFixed(2);
            el.perfKeystrokes.textContent = totalTyped;
            el.perfDiff.textContent = currentSnippet.genre || 'उपन्यास';

            // Calculate consistency
            let consistency = 95;
            if (keystrokeLog.length > 10) {
                const intervals = [];
                for (let i = 1; i < keystrokeLog.length; i++) {
                    intervals.push(keystrokeLog[i].t - keystrokeLog[i - 1].t);
                }
                const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
                const sd = Math.sqrt(variance);
                consistency = Math.max(65, Math.min(99, Math.round(100 - (sd / mean) * 20)));
            }
            el.perfConsistency.textContent = consistency + '%';

            // Generate time slices for WPM curve
            const totalDurationSec = Math.max(2, elapsedSeconds);
            const samples = 12;
            const points = [];
            let peakWpm = netWpm;

            for (let i = 0; i <= samples; i++) {
                const tSec = (totalDurationSec / samples) * i;
                const charsAtT = keystrokeLog.filter(k => (k.t / 1000) <= tSec && !k.isErr).length;
                const w = tSec > 0.5 ? ((charsAtT / 5) / (tSec / 60)) : 0;
                if (w > peakWpm) peakWpm = w;
                points.push({ t: tSec, w: Math.min(200, w) });
            }
            el.perfPeakWpm.textContent = 'Peak: ' + peakWpm.toFixed(2) + ' WPM';

            // Draw SVG Line Chart
            const w = 700;
            const h = 160;
            const padX = 30;
            const padY = 20;

            const maxW = Math.max(30, peakWpm * 1.15);
            const getX = (t) => padX + (t / totalDurationSec) * (w - padX * 2);
            const getY = (wpm) => h - padY - (wpm / maxW) * (h - padY * 2);

            let pathD = 'M ' + getX(points[0].t) + ' ' + getY(points[0].w);
            let areaD = 'M ' + getX(points[0].t) + ' ' + (h - padY);
            areaD += ' L ' + getX(points[0].t) + ' ' + getY(points[0].w);

            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const cur = points[i];
                const cx1 = getX(prev.t + (cur.t - prev.t) / 2);
                const cy1 = getY(prev.w);
                const cx2 = cx1;
                const cy2 = getY(cur.w);
                pathD += ' C ' + cx1 + ' ' + cy1 + ', ' + cx2 + ' ' + cy2 + ', ' + getX(cur.t) + ' ' + getY(cur.w);
                areaD += ' C ' + cx1 + ' ' + cy1 + ', ' + cx2 + ' ' + cy2 + ', ' + getX(cur.t) + ' ' + getY(cur.w);
            }
            areaD += ' L ' + getX(points[points.length - 1].t) + ' ' + (h - padY) + ' Z';

            el.perfChartWrapper.innerHTML = `
                <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stop-color="#ff7849" stop-opacity="0.35"/>
                            <stop offset="100%" stop-color="#ff7849" stop-opacity="0.0"/>
                        </linearGradient>
                    </defs>
                    <path d="${areaD}" fill="url(#chartGrad)"/>
                    <path d="${pathD}" fill="none" stroke="#ff7849" stroke-width="3" stroke-linecap="round"/>
                </svg>
            `;
        }

        // ─────────────────────────────────────────────────────────────
        // 12. REPLAY VIEW
        // ─────────────────────────────────────────────────────────────
        let replayTimer = null;
        let replayIdx = 0;
        let replaySpeed = 1;
        let isReplaying = false;

        function initReplayView() {
            if (replayTimer) clearInterval(replayTimer);
            replayIdx = 0;
            isReplaying = false;
            el.replayPlayBtn.textContent = '▶ Play';
            el.replayText.textContent = '';
            el.replayScrubberFill.style.width = '0%';
        }

        function playReplay() {
            if (keystrokeLog.length === 0) return;
            isReplaying = true;
            el.replayPlayBtn.textContent = '⏸ Pause';

            const step = () => {
                if (!isReplaying || replayIdx >= keystrokeLog.length) {
                    isReplaying = false;
                    el.replayPlayBtn.textContent = '▶ Play';
                    return;
                }
                const logItem = keystrokeLog[replayIdx];
                replayIdx++;
                el.replayText.textContent = targetKrutiText.substring(0, logItem.idx);
                el.replayScrubberFill.style.width = ((replayIdx / keystrokeLog.length) * 100) + '%';

                const nextItem = keystrokeLog[replayIdx];
                const delay = nextItem ? Math.max(10, (nextItem.t - logItem.t) / replaySpeed) : 30;
                replayTimer = setTimeout(step, Math.min(250, delay));
            };
            step();
        }

        function pauseReplay() {
            isReplaying = false;
            if (replayTimer) clearTimeout(replayTimer);
            el.replayPlayBtn.textContent = '▶ Play';
        }

        // ─────────────────────────────────────────────────────────────
        // 13. SUMMARY VIEW & LOCALSTORAGE PERSISTENCE
        // ─────────────────────────────────────────────────────────────
        const STORAGE_KEY = 'hikeymash_history_v1';
        function saveRaceRecord(wpm, acc, timeSec) {
            try {
                const rec = {
                    date: new Date().toLocaleDateString('hi-IN', { month: 'short', day: 'numeric' }),
                    title: currentSnippet.title,
                    wpm: parseFloat(wpm.toFixed(2)),
                    acc,
                    time: parseFloat(timeSec.toFixed(1))
                };
                const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                existing.unshift(rec);
                if (existing.length > 50) existing.pop();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
            } catch (e) {
                console.warn('localStorage save failed', e);
            }
        }

        function renderSummaryView() {
            try {
                const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
                el.sumTotalRaces.textContent = records.length;
                if (records.length === 0) return;

                const bestWpm = Math.max(...records.map(r => r.wpm));
                const avgWpm = records.reduce((a, b) => a + b.wpm, 0) / records.length;
                const avgAcc = records.reduce((a, b) => a + b.acc, 0) / records.length;

                el.sumBestWpm.textContent = bestWpm.toFixed(2) + ' WPM';
                el.sumAvgWpm.textContent = avgWpm.toFixed(2) + ' WPM';
                el.sumAvgAcc.textContent = Math.round(avgAcc) + '%';

                // History is importable data (backup files restore hikeymash_
                // keys verbatim), so escape text fields and coerce numbers:
                // a crafted record must never inject markup here.
                const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
                el.historyTableBody.innerHTML = '';
                records.slice(0, 15).forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${esc(r && r.date)}</td>
                        <td><strong>${esc(r && r.title)}</strong></td>
                        <td style="color:var(--km-accent); font-weight:700;">${num(r && r.wpm)}</td>
                        <td>${num(r && r.acc)}%</td>
                        <td>${num(r && r.time)}s</td>
                    `;
                    el.historyTableBody.appendChild(tr);
                });
            } catch (e) {
                console.warn('Summary render error', e);
            }
        }

        // ─────────────────────────────────────────────────────────────
        // 14. TAB & SUBTAB SWITCHING
        // ─────────────────────────────────────────────────────────────
        function activateTopTab(panelId) {
            document.querySelectorAll('.res-top-tab').forEach(b => {
                b.classList.toggle('active', b.dataset.panel === panelId);
            });
            document.querySelectorAll('.res-panel').forEach(p => {
                p.classList.toggle('active', p.id === panelId);
            });
        }

        function activateSubtab(subviewId) {
            document.querySelectorAll('.res-subtab').forEach(b => {
                b.classList.toggle('active', b.dataset.sub === subviewId);
            });
            document.querySelectorAll('.res-subview').forEach(v => {
                v.classList.toggle('active', v.id === subviewId);
            });
            if (subviewId === 'view-replay') {
                initReplayView();
            }
        }

        document.querySelectorAll('.res-top-tab').forEach(btn => {
            btn.addEventListener('click', () => activateTopTab(btn.dataset.panel));
        });

        document.querySelectorAll('.res-subtab').forEach(btn => {
            btn.addEventListener('click', () => activateSubtab(btn.dataset.sub));
        });

        el.replayPlayBtn.addEventListener('click', () => {
            if (isReplaying) pauseReplay();
            else playReplay();
        });

        el.replayRestartBtn.addEventListener('click', () => {
            pauseReplay();
            initReplayView();
        });

        document.querySelectorAll('.replay-speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.replay-speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                replaySpeed = parseFloat(btn.dataset.speed) || 1;
            });
        });

        // ─────────────────────────────────────────────────────────────
