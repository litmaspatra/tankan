'use strict';

        // 2. STARTER BASELINE & EXTERNAL QUOTE LIBRARY (1,443 PUBLIC-DOMAIN QUOTES)
        // ─────────────────────────────────────────────────────────────
        const BASELINE_STARTER_SNIPPETS = [
            {
                id: 'godan_1',
                title: 'गोदान',
                author: 'मुंशी प्रेमचंद',
                category: 'prose',
                genre: 'उपन्यास',
                difficulty: 'moderate',
                text: 'होरी अपने खेत की मेड़ पर खड़ा दूर तक फैले हुए खलिहानों को देख रहा था। जीवन भर हल की मूठ पकड़े रहने के बाद भी उसकी झोली में दुख के सिवा कुछ न था। महाजन का कर्ज, जमींदार का लगान और घर की तंगी, यही उसकी नियति बन चुकी थी। फिर भी उसके मन में एक गाय पालने की साध बनी रहती थी, मानो वह गाय उसके सारे दुखों का हल बन जाएगी।'
            },
            {
                id: 'idgah_1',
                title: 'ईदगाह',
                author: 'मुंशी प्रेमचंद',
                category: 'prose',
                genre: 'कहानी',
                difficulty: 'easy',
                text: 'मेले में सब बच्चे खिलौने और मिठाइयां खरीद रहे थे, परंतु हामिद के मन में केवल एक ही विचार था कि उसकी बूढ़ी दादी अमीना रोटियां सेंकते समय अपनी उंगलियां जलाती हैं। उसने अपने सारे पैसों से खिलौने की जगह एक चिमटा खरीद लिया। बचपन की मासूमियत में भी इतनी गहरी समझदारी और प्रेम छुपा हो सकता है, यह कहानी हर पाठक के हृदय को छू जाती है।'
            },
            {
                id: 'nirmala_1',
                title: 'निर्मला',
                author: 'मुंशी प्रेमचंद',
                category: 'prose',
                genre: 'उपन्यास',
                difficulty: 'moderate',
                text: 'निर्मला की बड़ी-बड़ी आंखों में एक ऐसी उदासी छाई रहती थी जिसे केवल वही समझ सकती थी। अनमेल विवाह की त्रासदी ने उसके जीवन के सारे रंगों को छीन लिया था। वह हर घड़ी कर्तव्य और तिरस्कार के दो पाटों के बीच पिसती रही, मानो उसका जन्म केवल आंसुओं की धारा बहाने के लिए हुआ हो।'
            },
            {
                id: 'gaban_1',
                title: 'गबन',
                author: 'मुंशी प्रेमचंद',
                category: 'prose',
                genre: 'उपन्यास',
                difficulty: 'moderate',
                text: 'रमानाथ का मन आज बहुत चंचल था। जालपा के आभूषणों की लालसा ने उसे एक ऐसे भंवर में डाल दिया था जहाँ से निकलने का कोई मार्ग नहीं सूझ रहा था। मनुष्य का पतन एक दिन में नहीं होता, परिस्थितियां उसे धीरे-धीरे उस अंधकार की ओर धकेल देती हैं जहाँ से वापसी कठिन हो जाती है।'
            },
            {
                id: 'rangbhoomi_1',
                title: 'रंगभूमि',
                author: 'मुंशी प्रेमचंद',
                category: 'prose',
                genre: 'उपन्यास',
                difficulty: 'moderate',
                text: 'सूरदास एक अंधा भिखारी था, पर उसकी आत्मा में असीम तेज था। जब उसकी पूर्वजों की जमीन पर सिगरेट का कारखाना लगाने की बात आई, तो उसने अकेले ही पूरे तंत्र के विरुद्ध खड़े होने का संकल्प ले लिया। सत्य और न्याय की लड़ाई में आंखें नहीं, अंतरात्मा का बल काम आता है।'
            },
            {
                id: 'sevasadan_1',
                title: 'सेवासदन',
                author: 'मुंशी प्रेमचंद',
                category: 'prose',
                genre: 'उपन्यास',
                difficulty: 'moderate',
                text: 'सुमन का मन विलास की ओर आकर्षित अवश्य हुआ था, परंतु समाज की कठोर उपेक्षा ने उसे यह सिखा दिया कि सम्मान के बिना धन का कोई मोल नहीं। उसने अपने जीवन को पीड़ित और बेसहारा नारियों के उद्धार में समर्पित कर दिया, जहाँ उसे आत्मिक संतोष प्राप्त हुआ।'
            },
            {
                id: 'chandrakanta_1',
                title: 'चंद्रकांता',
                author: 'देवकीनंदन खत्री',
                category: 'prose',
                genre: 'उपन्यास',
                difficulty: 'moderate',
                text: 'विजयगढ़ के राजकुमार वीरेंद्रसिंह और नौगढ़ की राजकुमारी चंद्रकांता की प्रेम कहानी रहस्य और रोमांच से भरी थी। ऐयारों की चतुराई, गुप्त सुरंगों और तिलिस्मी महलों के बीच यह कथा पाठकों को एक अद्भुत संसार में ले जाती थी।'
            },
            {
                id: 'rahim_1',
                title: 'दोहावली (प्रेम व संबंध)',
                author: 'रहीम',
                category: 'dohe',
                genre: 'दोहे',
                difficulty: 'easy',
                text: 'रहिमन धागा प्रेम का, मत तोड़ो चटकाय। टूटे से फिर ना जुड़े, जुड़े गांठ पड़ि जाय। बिगड़ी बात बने नहीं, लाख करो किन कोय। रहिमन फाटे दूध को, मथे न माखन होय। जो रहीम ओछो बढ़े, तो अति ही इतराय। प्यादे सौ फरजी भयो, टेढ़ो टेढ़ो जाय।'
            },
            {
                id: 'tulsidas_1',
                title: 'रामचरितमानस (नीति व धर्म)',
                author: 'गोस्वामी तुलसीदास',
                category: 'dohe',
                genre: 'चौपाई व दोहा',
                difficulty: 'moderate',
                text: 'श्री गुरु चरन सरोज रज, निज मनु मुकुरु सुधारि। बरनउं रघुबर बिमल जसु, जो दायकु फल चारि। बुद्धिहीन तनु जानिके, सुमिरौं पवन कुमार। बल बुधि विद्या देहु मोहिं, हरहु कलेश विकार। परहित सरिस धर्म नहिं भाई, परपीड़ा सम नहिं अधमाई। दया धर्म का मूल है, पाप मूल अभिमान।'
            },
            {
                id: 'kabirg_q1',
                title: 'कबीर ग्रंथावली',
                author: 'संत कबीर',
                category: 'dohe',
                genre: 'दोहे',
                difficulty: 'easy',
                text: 'विरहणी थी तौ क्यूँ रही, जली न पिठ के नालि। रहु रहु मुगध गहेलडी, प्रेम न लाजूँ मारि।'
            }
        ];

        let LITERATURE_SNIPPETS = [...BASELINE_STARTER_SNIPPETS];

        // Hydrate from external library (data/quotes.js or data/quotes.json)
        function syncExternalQuotes() {
            if (window.__HIKEYMASH_LIBRARY__ && Array.isArray(window.__HIKEYMASH_LIBRARY__) && window.__HIKEYMASH_LIBRARY__.length >= 100) {
                LITERATURE_SNIPPETS = window.__HIKEYMASH_LIBRARY__;
            }
        }
        syncExternalQuotes();
        window.addEventListener('load', syncExternalQuotes);

        // Asynchronously fetch external JSON data (works on HTTP/HTTPS hosts and GitHub Pages)
        async function fetchQuotesJSON() {
            if (LITERATURE_SNIPPETS.length >= 1000) return;
            try {
                const res = await fetch('data/quotes.json');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length >= 100) {
                        LITERATURE_SNIPPETS = data;
                        return;
                    }
                }
            } catch (e) {
                // file:// protocol or offline
            }

            // Remote CDN fallback
            try {
                const remoteRes = await fetch('https://raw.githubusercontent.com/litmaspatra/tankan/main/data/quotes.json');
                if (remoteRes.ok) {
                    const remoteData = await remoteRes.json();
                    if (Array.isArray(remoteData) && remoteData.length >= 100) {
                        LITERATURE_SNIPPETS = remoteData;
                    }
                }
            } catch (e) {}
        }
        fetchQuotesJSON();

        // ─────────────────────────────────────────────────────────────
