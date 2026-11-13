import {authenticate} from './auth.mjs';
import {validateDisplayName,validateLesson} from './model.mjs';
const AGE=14*86400000;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const fields=row=>row?{score:row.score,wpm:row.wpm,accuracy:row.accuracy}:null;
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
export async function handle(request,env,{auth=authenticate,now=Date.now()}={}){
 if(!env?.COMMUNITY_DB)return json({error:'Community setup is not complete yet.'},503);
 const db=env.COMMUNITY_DB,url=new URL(request.url),cutoff=now-AGE;
 try{
  if(request.method==='GET'){
   const view=url.searchParams.get('view')||'rankings';
   if(view==='rankings'){
    const result=await db.prepare('SELECT a.display_name,a.public_id,b.score FROM community_bests b JOIN community_accounts a ON a.uid=b.uid WHERE a.joined=1 AND b.completed_at>=? ORDER BY b.score DESC,b.completed_at DESC,a.public_id ASC LIMIT 20').bind(cutoff).all();
    return json({windowDays:14,maxEntries:20,rows:result.results.map(row=>({displayName:row.display_name,id:row.public_id,score:row.score}))});
   }
   if(view==='profile'){
    const id=url.searchParams.get('id');if(!/^[a-f0-9]{32}$/.test(id||''))return json({error:'Public profile not found.'},404);
    const account=await db.prepare('SELECT uid,display_name FROM community_accounts WHERE public_id=? AND joined=1').bind(id).first();
    if(!account)return json({error:'Public profile not found.'},404);
    const best=await db.prepare('SELECT score,wpm,accuracy FROM community_bests WHERE uid=? AND completed_at>=?').bind(account.uid,cutoff).first();
    const count=await db.prepare("SELECT COUNT(*) AS n FROM community_lessons WHERE uid=? AND completed_at>=? AND review_status='accepted'").bind(account.uid,cutoff).first();
    return json({displayName:account.display_name,best:fields(best),sharedLessons:count.n});
   }
   if(view==='me'){
    const {uid}=await auth(request);
    const row=await db.prepare('SELECT display_name,joined FROM community_accounts WHERE uid=?').bind(uid).first();
    const pending=await db.prepare("SELECT COUNT(*) AS n FROM community_lessons WHERE uid=? AND review_status='pending' AND completed_at>=?").bind(uid,cutoff).first();
    return json({account:row?{displayName:row.display_name,joined:row.joined===1}:null,pending:pending.n});
   }
   return json({error:'Not found.'},404);
  }
  if(request.method!=='POST')return json({error:'Method not allowed.'},405);
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Use the Tankan page to make changes.'},403);
  if(!(request.headers.get('content-type')||'').startsWith('application/json'))return json({error:'JSON required.'},415);
  const {uid}=await auth(request);
  const text=await request.text();if(text.length>40000)return json({error:'Too much data in one request.'},413);
  let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid JSON.'},400);}
  if(!plain(body))return json({error:'Invalid request.'},400);
  if(body.action==='profile'){
   if(Object.keys(body).some(k=>!['action','displayName'].includes(k)))return json({error:'Unexpected profile field.'},400);
   const name=validateDisplayName(body.displayName),id=crypto.randomUUID().replace(/-/g,'');
   await db.prepare('INSERT INTO community_accounts(uid,display_name,public_id,joined,created_at,updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(uid) DO UPDATE SET display_name=excluded.display_name,updated_at=excluded.updated_at').bind(uid,name,id,now,now).run();
   return json({displayName:name});
  }
  const account=await db.prepare('SELECT display_name,joined FROM community_accounts WHERE uid=?').bind(uid).first();
  if(!account)return json({error:'Save a display name first.'},409);
  if(body.action==='participation'){
   if(typeof body.joined!=='boolean'||Object.keys(body).some(k=>!['action','joined'].includes(k)))return json({error:'Choose whether to join.'},400);
   await db.prepare('UPDATE community_accounts SET joined=?,updated_at=? WHERE uid=?').bind(body.joined?1:0,now,uid).run();
   return json({joined:body.joined});
  }
  if(body.action!=='sync')return json({error:'Not found.'},404);
  if(account.joined!==1)return json({error:'Join the leaderboard before sharing scores.'},403);
  if(Object.keys(body).some(k=>!['action','lessons'].includes(k))||!Array.isArray(body.lessons)||body.lessons.length>10)return json({error:'Invalid score batch.'},400);
  const lessons=[];let ineligible=0;
  // Entire batch is validated before any write. Old records with unknown
  // complexity are deliberately not imported as qualified results.
  for(const value of body.lessons){
   const lesson=validateLesson(value);
   if(lesson.ts>now+60000)throw Error('Invalid saved lesson date.');
   if(lesson.ts<cutoff||lesson.chars<50||lesson.distinctKeys<10){ineligible++;continue;}
   const existing=await db.prepare('SELECT lesson_id FROM community_lessons WHERE uid=? AND lesson_id=?').bind(uid,lesson.id).first();
   if(!existing&&!lessons.some(l=>l.id===lesson.id))lessons.push(lesson);
  }
  const statements=[];
  for(const lesson of lessons){
   statements.push(db.prepare("INSERT OR IGNORE INTO community_lessons(uid,lesson_id,received_at,completed_at,score,wpm,accuracy,chars,distinct_keys,review_status,review_reason) VALUES(?,?,?,?,?,?,?,?,?,'accepted',NULL)").bind(uid,lesson.id,now,Math.min(now,lesson.ts),lesson.score,lesson.wpm,lesson.acc,lesson.chars,lesson.distinctKeys));
   // Reads the stored row, so racing duplicates cannot substitute other
   // totals for the already stored lesson. Batch is a D1 transaction.
   statements.push(db.prepare("INSERT INTO community_bests(uid,lesson_id,completed_at,score,wpm,accuracy) SELECT uid,lesson_id,completed_at,score,wpm,accuracy FROM community_lessons WHERE uid=? AND lesson_id=? AND review_status='accepted' ON CONFLICT(uid) DO UPDATE SET lesson_id=excluded.lesson_id,completed_at=excluded.completed_at,score=excluded.score,wpm=excluded.wpm,accuracy=excluded.accuracy WHERE excluded.score>=community_bests.score OR community_bests.completed_at<?").bind(uid,lesson.id,cutoff));
  }
  // Active users have expired private summaries cleaned up. Rankings
  // are filtered on every read, so expiry needs no external paid scheduler.
  statements.push(db.prepare('DELETE FROM community_lessons WHERE uid=? AND completed_at<?').bind(uid,cutoff));
  await db.batch(statements);
  return json({shared:lessons.length,ineligible,pending:0});
 }catch(e){
  if(/Sign in/.test(e.message))return json({error:e.message},401);
  if(/Invalid|Use a display name|Use 2-40|Use a name|Lesson|Unexpected/.test(e.message))return json({error:e.message},400);
  return json({error:'Community is unavailable right now. Your private progress is unchanged.'},503);
 }
}
