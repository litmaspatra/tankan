const PROJECT='tankan-6e340';
const KEY_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let cached={expires:0,keys:[]};
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
export async function verifyToken(token,{now=Date.now(),getKeys}={}) {
    if(typeof token!=='string'||token.length>12000)throw Error('Sign in again.');
    const parts=token.split('.');if(parts.length!==3)throw Error('Sign in again.');
    let header,claims;try{header=JSON.parse(new TextDecoder().decode(decode(parts[0])));claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));}catch{throw Error('Sign in again.');}
    const seconds=Math.floor(now/1000);
    if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.aud!==PROJECT||claims.iss!==`https://securetoken.google.com/${PROJECT}`||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>128||!Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.iat)||claims.iat>seconds+30||!Number.isFinite(claims.auth_time)||claims.auth_time>seconds+30)throw Error('Sign in again.');
    let keys;
    if(getKeys)keys=await getKeys();
    else{
        if(cached.expires<=now){const response=await fetch(KEY_URL);if(!response.ok)throw Error('Sign-in verification is temporarily unavailable.');const data=await response.json();cached={keys:data.keys,expires:now+Math.min(3600,Number((response.headers.get('cache-control')||'').match(/max-age=(\d+)/)?.[1])||300)*1000};}
        keys=cached.keys;
    }
    const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('Sign in again.');
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('Sign in again.');
    return {uid:claims.sub};
}
export async function authenticate(request){
    const match=(request.headers.get('authorization')||'').match(/^Bearer (\S+)$/);if(!match)throw Error('Sign in first.');
    return verifyToken(match[1]);
}
