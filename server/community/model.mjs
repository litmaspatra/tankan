// Community leaderboard helpers. Not used by the live site until its API and
// database are explicitly configured. Existing lesson score is never changed.
export function validateDisplayName(value) {
    if(typeof value!=='string')throw Error('Use a display name with 2-40 letters.');
    const name=value.normalize('NFC').trim().replace(/\s+/g,' ');
    // No digits, email/URL punctuation, control characters, markup or handles.
    if(name.length<2||name.length>40||!/^\p{L}[\p{L}\p{M} '\-]*$/u.test(name))throw Error('Use 2-40 letters, spaces, apostrophes or hyphens. No contact details.');
    const compact=name.toLowerCase().replace(/[ '\-]/g,'');
    if(/gmail|hotmail|outlook|yahoo|whatsapp|telegram|instagram|snapchat|discord|mailto|https?|www|dotcom|contactme|emailme/.test(compact)||/^(admin|administrator|moderator|tankan|support|system)$/i.test(name))throw Error('Use a name without contact details or official-role claims.');
    return name;
}
export function validateLesson(input) {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('Invalid lesson.');
    const allowed=['id','wpm','acc','chars','errors','seconds','distinctKeys','ts','score'];
    if(Object.keys(input).some(k=>!allowed.includes(k)))throw new Error('Unexpected lesson field.');
    if(typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.id))throw new Error('Invalid lesson identifier.');
    for(const key of ['wpm','acc','chars','errors','seconds','distinctKeys','ts','score']){
        if(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<0)throw new Error('Invalid lesson number.');
    }
    if(!Number.isInteger(input.chars)||!Number.isInteger(input.errors)||!Number.isInteger(input.distinctKeys)||!Number.isSafeInteger(input.score))throw new Error('Invalid lesson counts.');
    if(input.chars<1||input.chars>100000||input.errors>100000||input.distinctKeys<1||input.distinctKeys>100||input.distinctKeys>input.chars||input.seconds<.06||input.seconds>86400||input.acc>100)throw new Error('Lesson is outside supported bounds.');
    // Equivalent to the existing app formula, not a replacement score system.
    const cpm=input.chars/Math.max(.001,input.seconds/60);
    const expected=Math.round(cpm*input.distinctKeys/(input.errors+1)*(input.chars/50));
    if(input.score!==expected||Math.abs(input.wpm-cpm/5)>.05||Math.abs(input.acc-100*input.chars/(input.chars+input.errors))>.1)throw new Error('Lesson totals do not agree.');
    return {...input};
}
