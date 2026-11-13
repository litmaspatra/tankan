const assert=require('node:assert/strict');
(async()=>{
const m=await import('../server/community/model.mjs');
assert.equal(m.validateDisplayName('  Kartik Nama '),'Kartik Nama');
assert.equal(m.validateDisplayName('कार्तिक नामा'),'कार्तिक नामा');
for(const name of ['a','admin','<script>','a@example.com','1234567890','www example com','contact me','Gmail dot com','x'.repeat(41),'@handle','someone.example'])assert.throws(()=>m.validateDisplayName(name));
const lesson={id:'test_lesson_123456',wpm:40,acc:100,chars:200,errors:0,seconds:60,distinctKeys:10,ts:Date.now(),score:8000};
assert.equal(m.validateLesson(lesson).score,8000);
assert.throws(()=>m.validateLesson({...lesson,email:'private@example.com'}));
assert.throws(()=>m.validateLesson({...lesson,score:8001}));
assert.throws(()=>m.validateLesson({...lesson,wpm:130}));
assert.throws(()=>m.validateLesson({...lesson,chars:Infinity}));
console.log('community model ok: existing-score validation, contact-free display names');
})().catch(e=>{console.error(e);process.exit(1)});
