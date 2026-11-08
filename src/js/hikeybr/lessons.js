'use strict';

        // 8. 25-WORD PHONOTACTIC HINDI LESSON GENERATOR
        // ─────────────────────────────────────────────────────────────
        // Book and poem text (public-domain texts in books.js). Lessons are read in order
        // and the position is remembered, like keybr's book lessons. Free practice: no unlocks.
        const bookWordCache={};
        const PUNCT_RE=/[।॥,;:!?"'“”‘’()\[\]\-–—.…॰]/g;
        function findBook(id){
            if(id==='custom')return opts.customText.trim()?{id:'custom',title:'Custom text',author:'You',kind:'custom',lines:opts.customText.split(/\n+/).filter(l=>l.trim())}:null;
            return (window.HIKEYBR_BOOKS||[]).find(b=>b.id===id);
        }
        // Paragraphs of typable words (Unicode) for a book, honoring "remove punctuation".
        function bookParagraphs(book){
            const key=book.id+(opts.removePunct?':np':':p')+(book.id==='custom'?':'+opts.customText.length:'');
            if(bookWordCache[key])return bookWordCache[key];
            const out=[];
            for(const line of book.lines){
                const ws=[];
                for(let w of line.split(/\s+/)){
                    if(opts.removePunct)w=w.replace(PUNCT_RE,'');
                    if(!w||!isSuitableWord(w))continue;
                    const seq=unicodeToKrutiDev(w);
                    if(/[\u0900-\u097f]/.test(seq)||!seq.length)continue;
                    ws.push(w);
                }
                if(ws.length)out.push(ws);
            }
            return bookWordCache[key]=out;
        }
        function bookStats(book){
            const paras=bookParagraphs(book),all=paras.flat();
            const chars=all.reduce((n,w)=>n+[...w].length,0);
            return {paragraphs:paras.length,words:all.length,unique:new Set(all).size,chars,avg:all.length?chars/all.length:0};
        }
        function bookLessonText(book,count){
            const paras=bookParagraphs(book);
            if(!paras.length)return '';
            let pos=Number.isInteger(bookPos[book.id])?((bookPos[book.id]%paras.length)+paras.length)%paras.length:0;
            const out=[];let n=0,used=0;
            while(out.length<count&&used<paras.length){
                out.push(...paras[(pos+n)%paras.length]);n++;used++;
            }
            if(out.length>count*2)out.length=count*2;
            bookPos[book.id]=(pos+n)%paras.length;
            lastLessonParaStart=pos;
            const st=document.getElementById('word-pool-status');
            if(st)st.textContent=`${book.title} · ${book.author} · paragraph ${pos+1}${n>1?'–'+(pos+n):''} of ${paras.length.toLocaleString()}`;
            updateBookStatCard(pos);
            return out.join(' ');
        }
        let lastLessonParaStart=0;
        let forceTab=null;
        function currentTab(){if(forceTab)return forceTab;if(textSource==='words')return 'words';if(textSource==='custom')return 'custom';const b=findBook(textSource);return (b&&b.kind==='essay')?'essays':'books';}
        function populateTextSources(){
            const books=window.HIKEYBR_BOOKS||[];
            const sel=document.getElementById('book-select');
            if(sel){
                sel.replaceChildren();
                const groups=[['novel','Novels'],['story','Stories'],['poem','Poems and dohas']];
                for(const [kind,label] of groups){
                    const bs=books.filter(b=>b.kind===kind);if(!bs.length)continue;
                    const og=document.createElement('optgroup');og.label=label;
                    bs.forEach(b=>og.appendChild(new Option(`${b.title} - ${b.author}`,b.id)));sel.appendChild(og);
                }
                const plain=books.filter(b=>b.kind!=='essay');
                if(!findBook(opts.lastBook)||opts.lastBook==='custom'||(findBook(opts.lastBook)||{}).kind==='essay')opts.lastBook=plain[0]?plain[0].id:'';
                const tb=findBook(textSource);
                if(textSource!=='words'&&textSource!=='custom'&&tb&&tb.kind!=='essay')opts.lastBook=textSource;
                sel.value=opts.lastBook;
            }
            const esel=document.getElementById('essay-select');
            if(esel){
                esel.replaceChildren();
                const essays=books.filter(b=>b.kind==='essay');
                essays.forEach(b=>esel.appendChild(new Option(`${b.title} - ${b.author}`,b.id)));
                const eb=findBook(textSource);
                if(eb&&eb.kind==='essay')opts.lastEssay=textSource;
                if(!findBook(opts.lastEssay)||(findBook(opts.lastEssay)||{}).kind!=='essay')opts.lastEssay=essays[0]?essays[0].id:'';
                esel.value=opts.lastEssay;
            }
            syncSettingsUI();
        }
        function syncSettingsUI(){
            const $=id=>document.getElementById(id);
            const tab=currentTab();
            document.querySelectorAll('.ls-tab').forEach(t=>t.classList.toggle('active',t.dataset.lstab===tab));
            document.querySelectorAll('.ls-pane').forEach(p=>p.hidden=p.dataset.pane!==tab);
            const bc=$('book-controls');if(bc)bc.hidden=!(tab==='books'||tab==='essays');
            $('opt-strict').checked=!!opts.strict;
            $('opt-repeat').value=opts.repeat;$('opt-repeat-val').textContent=opts.repeat;
            $('opt-punct').value=opts.punct;$('opt-punct-val').textContent=opts.punct+'%';
            $('opt-removepunct').checked=$('opt-removepunct2').checked=!!opts.removePunct;
            $('opt-stop').checked=!!opts.stopOnError;$('opt-skip').checked=!!opts.spaceSkips;
            $('opt-cursor').checked=opts.cursorHighlight!==false;
            document.querySelectorAll('input[name=snd]').forEach(r=>r.checked=r.value===opts.soundMode);
            $('opt-volume').value=opts.volume;$('opt-volume-val').textContent=opts.volume+'%';
            $('opt-theme').value=opts.soundTheme;
            if($('custom-text')&&$('custom-text').value!==opts.customText)$('custom-text').value=opts.customText;
            const of=$('opt-font');
            if(of&&!of.options.length){Object.entries(FONT_REGISTRY).forEach(([k,f])=>of.appendChild(new Option(f.label,k)));}
            if(of)of.value=displayFont;
            const ots=$('opt-text-size');if(ots){ots.value=opts.textSize||32;$('opt-text-size-val').textContent=(opts.textSize||32)+'px';}
            applyPracticeTextPrefs();
            updateTextSourceNote();updateBookPanel();
        }
        function updateBookPanel(){
            const _tab=currentTab();const book=(_tab==='books'||_tab==='essays')?findBook(textSource):null;
            const info=document.getElementById('book-info'),list=document.getElementById('para-list'),range=document.getElementById('para-range');
            if(!info)return;
            if(!book){info.replaceChildren();list.replaceChildren();return;}
            const st=bookStats(book),paras=bookParagraphs(book);
            info.innerHTML='';
            const t=document.createElement('div');t.className='bi-title';t.textContent=book.title+' - '+book.author;
            const m=document.createElement('div');m.className='bi-meta';
            m.textContent=`Paragraphs: ${st.paragraphs.toLocaleString()} · All words: ${st.words.toLocaleString()} · Unique words: ${st.unique.toLocaleString()} · Characters: ${st.chars.toLocaleString()} · Average word length: ${st.avg.toFixed(2)}`;
            info.append(t,m);
            range.max=Math.max(1,st.paragraphs);
            const cur=Number.isInteger(bookPos[book.id])?bookPos[book.id]:0;
            const shown=(lastLessonParaStart!=null&&currentLessonText)?lastLessonParaStart:cur;
            range.value=shown+1;
            document.getElementById('para-val').textContent='#'+(shown+1);
            list.replaceChildren();
            for(let i=shown;i<Math.min(paras.length,shown+3);i++){
                const row=document.createElement('div');row.className='para-row'+(i===shown?' cur':'');
                row.textContent=`#${i+1} ${i===shown?'▶ ':''}${paras[i].join(' ')}`;list.appendChild(row);
            }
        }
        function updateLessonPreview(){
            const keys=document.getElementById('lp-keys');if(!keys)return;
            keys.replaceChildren();
            const free=textSource!=='words';
            KEY_PROGRESSION.forEach((item,idx)=>{
                if(item.skip)return; // preview matches the strip: trainable keys only
                const c=document.createElement('span');
                c.className='lp-key'+((free||idx<=highestUnlocked)?' on':'')+(!free&&idx===unlockedIndex?' cur':'');
                c.textContent=item.h;c.title=item.d||'';keys.appendChild(c);
            });
            const cur=document.getElementById('lp-current');
            const item=KEY_PROGRESSION[unlockedIndex];
            cur.textContent=free?'All keys are unlocked (practice text, no unlocking).':'Current key: '+item.h+' ('+(item.alt?'Alt+'+item.alt:(item.conjunct?item.h:item.k.toUpperCase()))+')';
            const smp=document.getElementById('lp-sample');
            smp.textContent=(currentLessonText||'').split(' ').slice(0,8).join(' ')+' …';
        }
        // Books/custom mode shows book progress in place of the guided-only
        // "Keys Unlocked" stat. Guided stats stay untouched in words mode.
        function updateBookStatCard(paraPos,paraSpan){
            const paraEl=document.getElementById('metric-book-para');if(!paraEl)return;
            const b=textSource==='words'?null:findBook(textSource);
            if(!b)return;
            const paras=bookParagraphs(b),total=paras.length;
            let pos=(typeof paraPos==='number')?paraPos:(Number.isInteger(bookPos[b.id])?bookPos[b.id]:0);
            if(total)pos=((pos%total)+total)%total;
            paraEl.textContent=total?String(pos+1):'\u2013';
            document.getElementById('metric-book-total').textContent=total?total.toLocaleString():'\u2013';
            document.getElementById('metric-book-label').textContent=b.id==='custom'?'Custom Text Progress':(b.kind==='essay'?'Essay Progress':'Book Progress');
            document.getElementById('metric-book-title').textContent=b.id==='custom'?'your custom text':`${b.title} - ${b.author}`;
        }
        function updateTextSourceNote(){
            const note=document.getElementById('text-source-note');if(!note)return;
            const b=textSource==='words'?null:findBook(textSource);
            document.documentElement.classList.toggle('book-mode',!!b);
            note.textContent=b?(b.id==='custom'?'Custom text: lessons follow your text in order. Key unlocking is paused.':(b.died?`${b.title} by ${b.author} (d. ${b.died}, public domain). Practice mode: lessons follow the text in order, key unlocking is paused. Source: ${b.source}`:`${b.title} - original essay written for Tankan. Practice mode: lessons follow the text in order, key unlocking is paused.`)):'Guided lessons: every lesson is built from the keys you have unlocked.';
            updateBookStatCard();
        }
        function generateLessonText() {
            if(textSource!=='words'){const book=findBook(textSource);if(book){const t=bookLessonText(book,parseInt(el.wordsSelect.value,10)||25);if(t)return t;}textSource='words';syncSettingsUI();}
            const unlockedItems = KEY_PROGRESSION.slice(0, highestUnlocked + 1);
            const activeItem = KEY_PROGRESSION[unlockedIndex];
            const wordCount = Math.max(1,Math.ceil((parseInt(el.wordsSelect.value, 10) || 25)/Math.max(1,opts.repeat)));

            // BUG 4 FIX: Keystroke-based eligibility check
            const SHIFT_BASE = { '~':'`', '!':'1', '@':'2', '#':'3', '$':'4', '%':'5', '^':'6', '&':'7', '*':'8', '(':'9', ')':'0', '_':'-', '+':'=', '{':'[', '}':']', '|':'\\', ':':';', '"':"'", '<':',', '>':'.', '?':'/' };
            const unlockedKeySet = new Set(unlockedItems.map(x => x.k));
            const unlockedBytes = new Set();
            unlockedItems.forEach(x => {
                if (x.conjunct && (!x.skip || x.keepWords)) { // skipped Alt-only glyphs never appear in guided lessons; book/paragraph mode still shows them with the Alt hint. क्र keeps its words: typed d then z, regular keys
                    for (const c of unicodeToKrutiDev(x.h)) {
                        unlockedBytes.add(c);
                    }
                }
            });
            const physKey = c => unlockedKeySet.has(c) ? c : (unlockedKeySet.has(c.toLowerCase()) ? c.toLowerCase() : SHIFT_BASE[c]);

            if(!encodedWordBank){
                const all=[...new Set([...HINDI_WORD_BANK,...FREQUENCY_WORDS,...OFFICIAL_WORDS])].filter(w=>isSuitableWord(w)&&!hiddenWords.includes(w));
                encodedWordBank=all.map(word=>({word,seq:unicodeToKrutiDev(word)})).filter(item=>{
                    return !/[\u0900-\u097f]/.test(item.seq) && item.seq.length>0;
                });
            }
            if(!eligibleWordCache.has(highestUnlocked)){
                eligibleWordCache.set(highestUnlocked,encodedWordBank.filter(({seq})=>[...seq].every(c=>{
                    const pk=physKey(c);return unlockedBytes.has(c)||(pk!==undefined&&unlockedKeySet.has(pk));
                })).map(item=>item.word));
            }
            const eligibleRealWords=eligibleWordCache.get(highestUnlocked);

            const words = [];

            // Real-word-first lessons. Repeat familiar words rather than inventing
            // syllables. Reserve enough target strokes to avoid starving progression.
            const targetSequence = (!activeItem.conjunct&&!activeItem.alt&&activeItem.k.length===1)?activeItem.k:unicodeToKrutiDev(activeItem.h);
            const targetHits = word => {
                const seq = unicodeToKrutiDev(word);
                if (!targetSequence) return 0;
                return seq.split(targetSequence).length - 1;
            };
            // क्र words stay eligible (typed d then z) but surface only rarely -
            // Kartik 2026-11-08: "important alt key... but will come rarely".
            const KRA_SEQ = unicodeToKrutiDev('क्र');
            const kraPool = [];
            const realPool = [...new Set(eligibleRealWords)].filter(word => {
                if (unicodeToKrutiDev(word).includes(KRA_SEQ)) { kraPool.push(word); return false; }
                return true;
            });
            const focusedPool = realPool.filter(word => targetHits(word) > 0);
            const weak = reviewKey();
            const reviewSequence = weak ? ((!weak.conjunct&&!weak.alt&&weak.k.length===1)?weak.k:unicodeToKrutiDev(weak.h)) : '';
            let reviewPool = weak ? focusedPool.filter(word => unicodeToKrutiDev(word).includes(reviewSequence)) : [];
            const reviewQuota=reviewPool.length?Math.min(Math.ceil(wordCount*.60),wordCount):0;
            const mixedStarters=!reviewMode&&highestUnlocked===INITIAL_UNLOCKED_COUNT-1;
            // Every key unlocked (keybr-style): stop pinning lessons to the final
            // glyph. The whole lesson spreads across the weakest unlocked keys
            // instead (Kartik 2026-11-08). Top 5 by smoothed time-to-type, so a
            // lesson repairs several weak spots rather than hammering one.
            const allUnlocked=!reviewMode&&highestUnlocked>=LAST_TRAINABLE_INDEX;
            const weakRotation=allUnlocked?unlockedItems.filter(item=>!item.skip&&((keyStats[item.k]||{}).tttSamples||0)>=6)
                .sort((a,b)=>keyStats[b.k].ttt-keyStats[a.k].ttt).slice(0,5):[];
            let weakTurn=0;
            const starterCounts=Object.fromEntries(unlockedItems.map(item=>[item.k,0]));
            let reviewWords = 0;
            let previous = '';
            // Variety guard (early levels have tiny pools). Each pool is drawn
            // from a shuffled "deck" that cycles through all of its words, so
            // usage stays balanced across the pool; a card equal to the previous
            // word is swapped away while any other card remains, so identical
            // words never sit back-to-back when the pool has 2+ words.
            const recent=new Set(recentLessonWords);
            const decks=new Map();
            const shuffle=arr=>{for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;};
            const draw=pool=>{
                if(!pool||!pool.length)return null;
                let deck=decks.get(pool);
                if(!deck){
                    // First deck prefers words not seen in recent lessons.
                    let cards=pool.filter(word=>!recent.has(word));
                    if(!cards.length)cards=pool.slice();
                    deck={cards:shuffle(cards),i:0};decks.set(pool,deck);
                }
                if(deck.i>=deck.cards.length){deck.cards=shuffle(pool.slice());deck.i=0;}
                if(deck.cards[deck.i]===previous){
                    if(deck.i+1<deck.cards.length){const t=deck.cards[deck.i];deck.cards[deck.i]=deck.cards[deck.i+1];deck.cards[deck.i+1]=t;}
                    else return null; // only the repeated word left; caller may widen
                }
                return deck.cards[deck.i++];
            };
            // General-pool draw: a क्र word lands roughly once in twelve slots.
            const drawReal=()=>(kraPool.length&&Math.random()<0.08)?(draw(kraPool)||draw(realPool)):draw(realPool);
            // Arrange words so identical words are never adjacent whenever the
            // mix allows it (greedy most-frequent-first). Used for the final
            // mix and for each repeat cycle of the "repeat each word" option.
            const arrangeNoAdjacent=(arr,prev)=>{
                const counts={};arr.forEach(word=>counts[word]=(counts[word]||0)+1);
                const out=[];let p=prev||'';
                while(out.length<arr.length){
                    const remaining=Object.keys(counts).filter(word=>counts[word]>0);
                    const cand=remaining.filter(word=>word!==p);
                    const list=cand.length?cand:remaining;
                    list.sort((a,b)=>counts[b]-counts[a]||Math.random()-.5);
                    const word=list[0];out.push(word);counts[word]--;p=word;
                }
                return out;
            };
            const starterPools={};
            for (let w = 0; w < wordCount; w++) {
                let chosen;
                if (mixedStarters) {
                    // Cover every starter, including pre-base ि. A target-only
                    // pool can starve ि and leave the first unlock stuck. Force
                    // each starter only until it has a few hits this lesson -
                    // with a one-word key pool (ि), forcing it all lesson long
                    // floods the text with that single word.
                    const needy=unlockedItems.filter(item=>starterCounts[item.k]<3);
                    if(needy.length){
                        const least=needy.reduce((a,b)=>starterCounts[a.k]<=starterCounts[b.k]?a:b);
                        if(!starterPools[least.k])starterPools[least.k]=realPool.filter(word=>unicodeToKrutiDev(word).includes(least.k));
                        chosen=draw(starterPools[least.k])||draw(realPool)||least.h+KEY_PROGRESSION[0].h;
                    }else{
                        chosen=drawReal()||previous;
                    }
                    const seq=unicodeToKrutiDev(chosen);
                    unlockedItems.forEach(item=>{starterCounts[item.k]+=seq.split(item.k).length-1;});
                } else if (allUnlocked) {
                    if(weakRotation.length){
                        const item=weakRotation[weakTurn++%weakRotation.length];
                        const weakSeq=(!item.conjunct&&!item.alt&&item.k.length===1)?item.k:unicodeToKrutiDev(item.h);
                        if(!starterPools['weak:'+item.k])starterPools['weak:'+item.k]=realPool.filter(word=>unicodeToKrutiDev(word).includes(weakSeq));
                        chosen=draw(starterPools['weak:'+item.k])||drawReal()||previous;
                    }else{
                        chosen=drawReal()||previous;
                    }
                } else if (reviewWords < reviewQuota) {
                    chosen = draw(reviewPool)||draw(focusedPool)||drawReal();
                    if(chosen&&unicodeToKrutiDev(chosen).includes(reviewSequence))reviewWords++;
                } else if (focusedPool.length) {
                    // Target-key training: never widen past the focused pool -
                    // every lesson word keeps containing the current key. The
                    // deck balances the small pool's repeats instead.
                    chosen = draw(focusedPool)||previous;
                } else {
                    // No real word can teach this glyph yet (digits, rare Alt codes,
                    // or very early levels). Use only the minimum short glyph drill.
                    const count = 2;
                    const context=draw(realPool)||KEY_PROGRESSION[0].h;
                    chosen = activeItem.h.repeat(count)+' '+context;
                }
                words.push(chosen);
                previous = chosen;
            }
            // Mix drills and review words without changing their quotas, and
            // without landing identical words next to each other.
            const mixedOrder=arrangeNoAdjacent(words);words.length=0;words.push(...mixedOrder);
            recentLessonWords=recentLessonWords.concat(words).slice(-150);
            if(opts.repeat>1){
                // Spread each word's repeats across the lesson (shuffled cycles)
                // instead of identical words back-to-back: same repetition count
                // for muscle memory, without the repeated-word wall.
                const base=words.slice();words.length=0;
                for(let cycle=0;cycle<opts.repeat;cycle++){
                    words.push(...arrangeNoAdjacent(base,words.length?words[words.length-1]:''));
                }
            }
            if(opts.punct>0&&unlockedKeySet.has('a')){for(let i=0;i<words.length;i++)if(Math.random()*100<opts.punct&&!words[i].includes('।'))words[i]+='।';}
            document.getElementById('word-pool-status').textContent=`${focusedPool.length.toLocaleString()} target words / ${eligibleRealWords.length.toLocaleString()} usable at this level / ${encodedWordBank.length.toLocaleString()} total`+(mixedStarters?' · Mixed starter practice: क, ा, ि, र.':allUnlocked?(weakRotation.length?` · All keys unlocked: lessons target your weakest keys (${weakRotation.map(item=>item.h).join(', ')}).`:' · All keys unlocked: full-bank practice.'):focusedPool.length===0?' · New glyph plus unlocked-word practice.':focusedPool.length<wordCount?' · Small target pool: some repetition needed.':'');
            return words.join(' ');
        }

