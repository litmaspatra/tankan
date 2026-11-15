const assert=require('node:assert/strict'),fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {handle}=await import('../server/community/api.mjs');const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('server/community/schema.sql','utf8'));
 const db={prepare(query){return {bind(...args){return {first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args),_query:query,_args:args};}};},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)sql.prepare(s._query).run(...s._args);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={COMMUNITY_DB:db};let now=Date.parse('2026-11-13T12:00:00Z'),uid='user-one';const auth=async()=>{if(!uid)throw Error('Sign in first.');return {uid,email:'never-public@example.com'};};
 async function call(body,query='',headers={}){const r=new Request('https://tankan.in/api/community'+query,body?{method:'POST',headers:{'content-type':'application/json',origin:'https://tankan.in',...headers},body:JSON.stringify(body)}:{});const response=await handle(r,env,{auth,now});return {status:response.status,data:await response.json()};}
 const lesson=(id,wpm=40,ts=now,chars=200,keys=10,acc=100)=>{const seconds=chars/(wpm*5)*60;const errors=Math.round(chars*(100-acc)/acc);const cpm=chars/(seconds/60);return {id,wpm,acc:100*chars/(chars+errors),chars,errors,seconds,distinctKeys:keys,ts,score:Math.round(cpm*keys/(errors+1)*(chars/50))};};
 assert.equal((await handle(new Request('https://tankan.in/api/community'),{})).status,503);
 assert.equal((await call({action:'sync',lessons:[]})).status,409);
 await call({action:'profile',displayName:'Kartik Nama'});const publicId=sql.prepare('SELECT public_id FROM community_accounts WHERE uid=?').get(uid).public_id;assert.equal((await call(null,'?view=me')).data.account.joined,false);
 assert.equal((await call({action:'sync',lessons:[]})).status,403);assert.equal((await call(null,'?view=profile&id='+publicId)).status,404);
 uid='user-two';assert.equal((await call({action:'profile',displayName:'Kartik Nama'})).status,200);const duplicateId=sql.prepare('SELECT public_id FROM community_accounts WHERE uid=?').get(uid).public_id;assert.notEqual(duplicateId,publicId);await call({action:'profile',displayName:'Other User'});
 uid='user-one';await call({action:'participation',joined:true});const one=lesson('lesson_identifier_one');
 assert.equal((await call({action:'sync',lessons:[one]})).data.shared,1);assert.equal((await call({action:'sync',lessons:[one]})).data.shared,0);
 assert.equal((await call({action:'sync',lessons:[{...one,id:'lesson_identifier_bad',score:9000}]})).status,400);
 assert.equal((await call({action:'sync',lessons:[lesson('lesson_too_short_123',40,now,49)]})).data.ineligible,1);
 assert.equal((await call({action:'sync',lessons:[lesson('lesson_few_keys_1234',40,now,200,9)]})).data.ineligible,1);
 assert.equal((await call({action:'sync',lessons:[lesson('lesson_expired_12345',80,now-15*86400000)]})).data.ineligible,1);
 assert.equal((await call({action:'sync',lessons:[lesson('lesson_sloppy_123456',60,now,200,10,94)]})).data.ineligible,1,'below 95% accuracy must not qualify');
 assert.equal((await call({action:'sync',lessons:[{id:'legacy_unknown_keys',wpm:40,acc:100,score:9000,ts:now}]})).status,400);
 let p=(await call(null,'?view=profile&id='+publicId)).data;assert.equal(p.sharedLessons,1);assert.equal(p.best.wpm,40);assert.equal(p.best.keysUsed,10);assert.deepEqual(Object.keys(p.best),['wpm','accuracy','keysUsed']);
 assert.ok(!JSON.stringify(p).includes('user-one'));assert.ok(!JSON.stringify(p).includes('never-public'));
 await call({action:'sync',lessons:[lesson('lesson_lower_score_123',30)]});assert.equal((await call(null)).data.rows[0].wpm,40);
 await call({action:'sync',lessons:[lesson('lesson_higher_score12',50)]});assert.equal((await call(null)).data.rows[0].wpm,50);assert.equal((await call(null)).data.rows.length,1);
 assert.deepEqual(Object.keys((await call(null)).data.rows[0]),['displayName','id','wpm','accuracy','keysUsed']);
 // Expiry is enforced on every read, even with no new submission. No fallback
 // to a lower score is invented after the retained best expires.
 now+=15*86400000;assert.equal((await call(null)).data.rows.length,0);assert.equal((await call(null,'?view=profile&id='+publicId)).data.best,null);
 await call({action:'sync',lessons:[lesson('lesson_after_expiry12',25)]});assert.equal((await call(null)).data.rows[0].wpm,25);
 // Top20 and one result per user, matching the selected public model.
 for(let i=0;i<22;i++){uid='other-'+i;await call({action:'profile',displayName:'Student '+String.fromCharCode(65+i)});await call({action:'participation',joined:true});await call({action:'sync',lessons:[lesson('student_lesson_identifier_'+i,30+i)]});}
 const ranking=(await call(null)).data.rows;assert.equal(ranking.length,20);assert.equal(new Set(ranking.map(r=>r.id)).size,20);assert.ok(ranking.every((r,i)=>i===0||ranking[i-1].wpm>=r.wpm));
 uid='user-one';assert.equal((await call({action:'profile',displayName:'Renamed User',email:'leak'})).status,400);await call({action:'profile',displayName:'Renamed User'});
 assert.equal((await call(null,'?view=profile&id='+publicId)).data.displayName,'Renamed User');await call({action:'participation',joined:false});assert.equal((await call(null,'?view=profile&id='+publicId)).status,404);
 assert.equal((await call({action:'participation',joined:true},'',{origin:'https://elsewhere.invalid'})).status,403);
 uid='user-two';assert.equal((await call(null,'?view=me')).data.account.displayName,'Other User');uid=null;assert.equal((await call({action:'profile',displayName:'Attacker Name'})).status,401);assert.equal((await call(null)).status,200);
 // Daily board: only lessons from the current India-time day (UTC+5:30, no
 // DST) rank; yesterday's higher score does not carry over.
 uid='daily-user';await call({action:'profile',displayName:'Daily Player'});await call({action:'participation',joined:true});
 now=Date.parse('2026-12-01T18:30:30Z'); // 00:00:30 IST on Dec 2
 await call({action:'sync',lessons:[lesson('daily_yesterday_hi',60,now-61000)]}); // 23:59:29 IST Dec 1 - yesterday
 assert.equal((await call(null)).data.rows.length,0,'yesterday (IST) score must not rank today');
 await call({action:'sync',lessons:[lesson('daily_today_low_12',20,now)]});
 const daily=(await call(null)).data;assert.equal(daily.rows.length,1);assert.equal(daily.rows[0].wpm,20);assert.equal(daily.rows[0].displayName,'Daily Player');
 assert.equal(daily.day,'Asia/Kolkata');assert.equal(daily.windowDays,undefined);
 // Same-day lessons keep only the person's best on the board.
 await call({action:'sync',lessons:[lesson('daily_today_better',30,now)]});
 assert.equal((await call(null)).data.rows[0].wpm,30);assert.equal((await call(null)).data.rows.length,1);
 // Speed ranks, not the composite score: a longer, more varied but slower
 // lesson (higher old-style score) must not beat a faster clean lesson.
 await call({action:'sync',lessons:[lesson('daily_long_varied12',35,now+1000,400,20)]}); // old score 28000, wpm 35
 assert.equal((await call(null)).data.rows[0].wpm,35);assert.equal((await call(null)).data.rows[0].keysUsed,20,'key variety is shown, not scored');
 await call({action:'sync',lessons:[lesson('daily_fast_plain123',45,now+2000,200,10)]}); // old score 9000, wpm 45
 assert.equal((await call(null)).data.rows[0].wpm,45,'faster lesson ranks above a higher composite score');
 assert.equal((await call(null)).data.rows[0].keysUsed,10);
 // Accuracy breaks a speed tie; below-95% lessons never reach the board.
 uid='tie-user';await call({action:'profile',displayName:'Tie Player'});await call({action:'participation',joined:true});
 await call({action:'sync',lessons:[lesson('tie_lesson_clean_12',45,now+3000,200,10,96)]});
 const ties=(await call(null)).data.rows;assert.equal(ties.length,2);assert.equal(ties[0].displayName,'Daily Player','accuracy breaks a WPM tie');assert.equal(ties[0].accuracy,100);assert.ok(Math.abs(ties[1].accuracy-96.15)<0.1);
 console.log('community API ok: real SQLite, opt-in/opt-out, duplicate-name identity/ownership, public allowlist, 95%-accuracy/50-unit/10-key eligibility, speed ranking with accuracy tie-break, key-variety shown not scored, top20, one best/user, expiry, deduplication, invalid/legacy rejection, auth, daily India-time board');
})().catch(e=>{console.error(e);process.exit(1)});
