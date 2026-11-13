const assert=require('node:assert/strict'),fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');
(async()=>{
 const {handle}=await import('../server/community/api.mjs');const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('server/community/schema.sql','utf8'));
 const db={prepare(query){return {bind(...args){return {first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args),_query:query,_args:args};}};},async batch(statements){sql.exec('BEGIN');try{for(const s of statements)sql.prepare(s._query).run(...s._args);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={COMMUNITY_DB:db};let now=Date.parse('2026-11-13T12:00:00Z'),uid='user-one';const auth=async()=>{if(!uid)throw Error('Sign in first.');return {uid,email:'never-public@example.com'};};
 async function call(body,query='',headers={}){const r=new Request('https://tankan.in/api/community'+query,body?{method:'POST',headers:{'content-type':'application/json',origin:'https://tankan.in',...headers},body:JSON.stringify(body)}:{});const response=await handle(r,env,{auth,now});return {status:response.status,data:await response.json()};}
 const lesson=(id,wpm=40,ts=now,chars=200,keys=10)=>{const seconds=chars/(wpm*5)*60;return {id,wpm,acc:100,chars,errors:0,seconds,distinctKeys:keys,ts,score:Math.round(wpm*5*keys*(chars/50))};};
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
 assert.equal((await call({action:'sync',lessons:[{id:'legacy_unknown_keys',wpm:40,acc:100,score:9000,ts:now}]})).status,400);
 let p=(await call(null,'?view=profile&id='+publicId)).data;assert.equal(p.sharedLessons,1);assert.equal(p.best.score,8000);assert.deepEqual(Object.keys(p.best),['score','wpm','accuracy']);
 assert.ok(!JSON.stringify(p).includes('user-one'));assert.ok(!JSON.stringify(p).includes('never-public'));
 await call({action:'sync',lessons:[lesson('lesson_lower_score_123',30)]});assert.equal((await call(null)).data.rows[0].score,8000);
 await call({action:'sync',lessons:[lesson('lesson_higher_score12',50)]});assert.equal((await call(null)).data.rows[0].score,10000);assert.equal((await call(null)).data.rows.length,1);
 assert.deepEqual(Object.keys((await call(null)).data.rows[0]),['displayName','id','score']);
 // Expiry is enforced on every read, even with no new submission. No fallback
 // to a lower score is invented after the retained best expires.
 now+=15*86400000;assert.equal((await call(null)).data.rows.length,0);assert.equal((await call(null,'?view=profile&id='+publicId)).data.best,null);
 await call({action:'sync',lessons:[lesson('lesson_after_expiry12',25)]});assert.equal((await call(null)).data.rows[0].score,5000);
 // Top20 and one result per user, matching the selected public model.
 for(let i=0;i<22;i++){uid='other-'+i;await call({action:'profile',displayName:'Student '+String.fromCharCode(65+i)});await call({action:'participation',joined:true});await call({action:'sync',lessons:[lesson('student_lesson_identifier_'+i,30+i)]});}
 const ranking=(await call(null)).data.rows;assert.equal(ranking.length,20);assert.equal(new Set(ranking.map(r=>r.id)).size,20);assert.ok(ranking.every((r,i)=>i===0||ranking[i-1].score>=r.score));
 uid='user-one';assert.equal((await call({action:'profile',displayName:'Renamed User',email:'leak'})).status,400);await call({action:'profile',displayName:'Renamed User'});
 assert.equal((await call(null,'?view=profile&id='+publicId)).data.displayName,'Renamed User');await call({action:'participation',joined:false});assert.equal((await call(null,'?view=profile&id='+publicId)).status,404);
 assert.equal((await call({action:'participation',joined:true},'',{origin:'https://elsewhere.invalid'})).status,403);
 uid='user-two';assert.equal((await call(null,'?view=me')).data.account.displayName,'Other User');uid=null;assert.equal((await call({action:'profile',displayName:'Attacker Name'})).status,401);assert.equal((await call(null)).status,200);
 console.log('community API ok: real SQLite, opt-in/opt-out, duplicate-name identity/ownership, public allowlist, 50-unit/10-key eligibility, top20, one best/user, expiry, deduplication, invalid/legacy rejection, auth');
})().catch(e=>{console.error(e);process.exit(1)});
