const assert=require('node:assert/strict');
(async()=>{global.crypto=require('node:crypto').webcrypto;const {verifyToken}=await import('../server/community/auth.mjs');
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
const now=Date.now(),sec=Math.floor(now/1000),claims={aud:'tankan-6e340',iss:'https://securetoken.google.com/tankan-6e340',sub:'test-user',iat:sec,auth_time:sec,exp:sec+3600,email:'test@example.com',email_verified:true};
const encode=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
async function mint(c,h={alg:'RS256',kid:'test-key'}){const body=encode(h)+'.'+encode(c);const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body));return body+'.'+Buffer.from(sig).toString('base64url');}
const options={now,getKeys:async()=>[jwk]};assert.equal((await verifyToken(await mint(claims),options)).uid,'test-user');
for(const change of [{aud:'other-project'},{iss:'wrong'},{sub:''},{exp:sec-1},{iat:sec+1000},{auth_time:sec+1000}])await assert.rejects(()=>mint({...claims,...change}).then(t=>verifyToken(t,options)));
await assert.rejects(()=>mint(claims,{alg:'none',kid:'test-key'}).then(t=>verifyToken(t,options)));
const token=await mint(claims);const parts=token.split('.');parts[1]=encode({...claims,sub:'attacker'});await assert.rejects(()=>verifyToken(parts.join('.'),options));
console.log('community auth ok: signed project-bound token, issuer/expiry/identity checks, forged payload rejected');})().catch(e=>{console.error(e);process.exit(1)});
