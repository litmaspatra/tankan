(function(){
 'use strict';
 const $=id=>document.getElementById(id),box=$('community-account');if(!box)return;
 let user=null,account=null,authVersion=0,profileVersion=0,busy=false;
 const message=text=>{$('community-status').textContent=text;};
 async function api(body,query='',owner=user){
  const headers={};if(body||query==='?view=me'){
   if(!owner||typeof owner.getIdToken!=='function')throw Error('Sign in to use your community profile.');
   headers.authorization='Bearer '+await owner.getIdToken();
  }
  if(body)headers['content-type']='application/json';
  const response=await fetch('/api/community'+query,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
  let data;try{data=await response.json();}catch{throw Error('Community is not available on this connection yet.');}
  if(!response.ok)throw Error(data.error||'Community is unavailable right now.');return data;
 }
 function render(){
  box.hidden=!user;
  $('community-signed-out').hidden=!!user;
  $('community-username').value=account?.displayName||'';
  $('community-participation').hidden=!account;
  $('community-joined').textContent=account?.joined?'Your profile is public.':'Your display name is saved privately. You have not joined the leaderboard.';
  $('community-join').hidden=!!account?.joined;
  $('community-leave').hidden=!account?.joined;
  $('community-share-history').hidden=!account?.joined;
  $('community-public-consent').checked=false;
  $('community-public-consent').closest('label').hidden=!!account?.joined;
 }
 async function loadAccount(){
  const version=authVersion;
  if(!user)return;
  try{const data=await api(null,'?view=me');if(version!==authVersion)return;account=data.account;render();message(data.pending?`${data.pending} result(s) are waiting for review.`:'');}
  catch(e){if(version===authVersion)message(e.message);}
 }
 const score=value=>Number(value||0).toLocaleString();
 async function loadRankings(){
  const status=$('leaderboard-status');status.textContent='Loading scores…';
  try{
   const data=await api(null,'?view=rankings');
   const list=$('leaderboard-rows');list.replaceChildren();
   data.rows.forEach((row,index)=>{const tr=document.createElement('tr');
    const rank=document.createElement('td');rank.textContent=String(index+1);
    const name=document.createElement('td'),button=document.createElement('button');button.className='community-name';button.textContent=row.displayName;button.addEventListener('click',()=>openProfile(row.id,row.displayName));name.append(button);
    const points=document.createElement('td');points.textContent=score(row.score);tr.append(rank,name,points);list.append(tr);
   });
   status.textContent=data.rows.length?'Top '+data.rows.length+' shared scores.':'No shared scores yet. Sign in, choose a display name and join to take part.';
  }catch(e){$('leaderboard-rows').replaceChildren();status.textContent=e.message;}
 }
 async function openProfile(id,name){
  const version=++profileVersion;const dialog=$('community-profile-dialog');$('community-profile-name').textContent=name;$('community-profile-body').replaceChildren();dialog.showModal();
  try{const data=await api(null,'?view=profile&id='+encodeURIComponent(id));
   if(!dialog.open||version!==profileVersion)return;
   const body=$('community-profile-body');
   const row=data.best;
   const title=document.createElement('h4');title.textContent='Best qualifying lesson - last 14 days';
   const summary=document.createElement('p');summary.textContent=row?score(row.score)+` points · ${row.wpm.toFixed(1)} WPM · ${row.accuracy.toFixed(1)}% accuracy`:'No current qualifying score.';body.append(title,summary);
   const count=document.createElement('p');count.textContent=data.sharedLessons+' qualifying shared lesson(s) in the last 14 days.';body.append(count);
  }catch(e){if(version===profileVersion)$('community-profile-body').textContent=e.message;}
 }
 $('community-profile-close').addEventListener('click',()=>$('community-profile-dialog').close());
 $('community-username-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const version=authVersion;
  try{const data=await api({action:'profile',displayName:$('community-username').value});if(version!==authVersion)return;account={displayName:data.displayName,joined:!!account?.joined};render();message('Display name saved. Joining the public leaderboard is a separate choice.');}
  catch(e){if(version===authVersion)message(e.message);}finally{busy=false;}
 });
 $('community-join').addEventListener('click',async()=>{
  if(!$('community-public-consent').checked){message('Please check what will be public before joining.');return;}
  if(busy)return;busy=true;const version=authVersion;
  try{await api({action:'participation',joined:true});if(version!==authVersion)return;account.joined=true;render();message('Joined. New completed lessons can now be shared. Use Share saved results to include earlier results saved on this device.');await loadRankings();}
  catch(e){if(version===authVersion)message(e.message);}finally{busy=false;}
 });
 $('community-leave').addEventListener('click',async()=>{
  if(busy)return;busy=true;const version=authVersion;
  try{await api({action:'participation',joined:false});if(version!==authVersion)return;account.joined=false;render();message('Your profile and scores are no longer public. Your private progress is unchanged.');await loadRankings();}
  catch(e){if(version===authVersion)message(e.message);}finally{busy=false;}
 });
 async function serialise(row){
  const seed=[row.ts,row.chars,row.errors,row.seconds,row.score].join(':');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(seed));
  const value={id:row.communityId||Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''),wpm:row.wpm,acc:row.acc,score:row.score,ts:row.ts};
  if(Number.isInteger(row.distinctKeys))Object.assign(value,{chars:row.chars,errors:row.errors,seconds:row.seconds,distinctKeys:row.distinctKeys});
  return value;
 }
 async function shareHistory(){
  if(!account?.joined||busy)return;busy=true;const owner=user,version=authVersion;
  try{
   // This is an explicit per-device upload, not an automatic sign-in effect.
   const stored=JSON.parse(localStorage.getItem('hikeybr_store_v3')||'{}');
   const rows=(stored.lessonHistory||[]).filter(r=>r&&Number.isInteger(r.distinctKeys)&&r.distinctKeys>=10&&r.chars>=50&&r.ts>=Date.now()-14*86400000&&Number.isFinite(r.score)&&r.score>=0&&Number.isFinite(r.wpm)&&Number.isFinite(r.acc));
   const lessons=await Promise.all(rows.map(serialise));
   for(let start=0;start<lessons.length;start+=10){if(version!==authVersion)return;await api({action:'sync',lessons:lessons.slice(start,start+10)},'',owner);}
   if(version!==authVersion)return;
   if(version!==authVersion)return;message(lessons.length?'Eligible saved results shared.':'No eligible saved results from the last 14 days. Older records without key-variety metadata stay in personal history.');await loadRankings();
  }catch(e){if(version===authVersion)message('Could not finish sharing: '+e.message+' Your private progress is unchanged. You can retry safely.');}finally{busy=false;}
 }
 $('community-share-history').addEventListener('click',shareHistory);
 window.addEventListener('tankan-lesson-completed',async event=>{
  if(!user||!account?.joined)return;const owner=user,version=authVersion;
  try{const lesson=await serialise(event.detail);if(version!==authVersion)return;const result=await api({action:'sync',lessons:[lesson]},'',owner);if(version!==authVersion)return;message(result.pending?'Your new result is waiting for review.':result.ineligible?'Lesson saved privately. Ranking needs at least 50 correct input units and 10 different keys.':'Latest qualifying lesson shared.');}
  catch(e){if(version===authVersion)message('Latest lesson has not been shared. Your saved lesson is safe; use Share saved results to retry.');}
 });
 $('leaderboard-refresh').addEventListener('click',loadRankings);
 document.querySelector('[data-target="leaderboard"]').addEventListener('click',loadRankings);
 const ready=window.__tankanAuthClient;if(ready)ready.then(client=>client.onAuth(value=>{authVersion++;user=value;account=null;render();message('');if(value)loadAccount();})).catch(()=>{});
})();
