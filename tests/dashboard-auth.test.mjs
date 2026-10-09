import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthSession} from '../src/dashboard/auth.mjs';

const expired=`e30.${Buffer.from(JSON.stringify({exp:1})).toString('base64url')}.signature`;
function fixture(values={},fetcher=()=>{throw Error('unexpected request');}) {
 const valuesMap=new Map(Object.entries(values)),changes=[];
 const storage={getItem:key=>valuesMap.get(key)??null,setItem:(key,value)=>valuesMap.set(key,value),removeItem:key=>valuesMap.delete(key)};
 const auth=createAuthSession({storage,refreshUrl:'https://example.test/cdmsmanagerapi/api/v1/auth/refresh',fetcher,onChange:value=>changes.push(value)});
 return {auth,storage,changes};
}
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};

test('missing and placeholder sessions require login without sending requests',()=>{
 for(const token of [undefined,'','undefined','null']){
  const {auth}=fixture(token?{token}:{});auth.sync();assert.equal(auth.status,'required');assert.equal(auth.token,null);
 }
 const {auth,storage}=fixture({token:expired,userInfo:'old profile'});auth.sync();
 assert.equal(auth.status,'required');assert.equal(storage.getItem('token'),null);assert.equal(storage.getItem('userInfo'),null);
});
test('expired access token renews before statistics and concurrent 401s share renewal',async()=>{
 let calls=0,resolve;
 const {auth,storage}=fixture({token:expired,refreshToken:'refresh-a'},async(url,options)=>{
  calls++;assert.equal(new URL(url).pathname,'/cdmsmanagerapi/api/v1/auth/refresh');assert.equal(options.method,'POST');
  assert.deepEqual(JSON.parse(options.body),{refreshToken:'refresh-a'});assert.equal(options.redirect,'error');
  return new Promise(done=>resolve=done);
 });
 auth.sync();assert.equal(auth.status,'refreshing');assert.equal(auth.token,null);
 const pending=[auth.recover(expired),auth.recover(expired)];assert.equal(calls,1);
 resolve(Response.json({code:200,data:{token:'new-token',refreshToken:'new-refresh'}}));await Promise.all(pending);
 assert.equal(auth.token,'new-token');assert.equal(storage.getItem('refreshToken'),'new-refresh');
 await auth.recover('new-token');assert.equal(auth.status,'required','a rejected renewed token must not loop');assert.equal(calls,1);
});
test('invalid refresh clears session, transient errors preserve it for explicit retry',async()=>{
 for(const [response,expected] of [[Response.json({code:401,message:'expired'}),'required'],[Response.json({code:403}),'required'],[Response.json({code:503},{status:503}),'unavailable']]){
  const {auth,storage}=fixture({token:'old',refreshToken:'refresh-a'},async()=>response);
  auth.sync();await auth.recover('old');assert.equal(auth.status,expected);assert.equal(auth.token,null);
  assert.equal(storage.getItem('token'),expected==='required'?null:'old');
  auth.sync();assert.equal(auth.status,expected,'clock polling must not restart failed refresh');
 }
});
test('late success or denial cannot restore or clear an account changed during renewal',async()=>{
 for(const success of [true,false])for(const replacement of ['user-b',null]){
  let resolve;const {auth,storage}=fixture({token:'old',refreshToken:'refresh-a'},()=>new Promise(done=>resolve=done));
  auth.sync();const pending=auth.recover('old');
  if(replacement){storage.setItem('token',replacement);storage.setItem('refreshToken','refresh-b');}
  else{storage.removeItem('token');storage.removeItem('refreshToken');}
  resolve(Response.json(success?{code:200,data:{token:'stale',refreshToken:'stale-refresh'}}:{code:401}));await pending;
  assert.equal(storage.getItem('token'),replacement);assert.equal(auth.token,replacement);
 }
});
test('successful authenticated request permits a later renewal; retry recovers a temporary outage',async()=>{
 let calls=0;const {auth}=fixture({token:'old',refreshToken:'refresh-a'},async()=>{
  calls++;if(calls===1)throw Error('network');
  return Response.json({code:200,data:{token:`new-${calls}`,refreshToken:`refresh-${calls}`}});
 });
 auth.sync();await auth.recover('old');assert.equal(auth.status,'unavailable');auth.retry();await settle();
 assert.equal(auth.token,'new-2');auth.accept('new-2');await auth.recover('new-2');assert.equal(auth.token,'new-3');
});
