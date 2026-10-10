import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstitutionStats} from '../src/dashboard/institution-stats.mjs';

test('institution totals are lazy, scoped, deduplicated and expire without reusing another account',async()=>{
 let time=0;const calls=[];
 const stats=createInstitutionStats({now:()=>time,request:async(key,context)=>{calls.push({key,...context});return {data:{total:key==='highrisk'?9:3}};}});
 assert.deepEqual(calls,[]);
 assert.deepEqual(await stats.load('a',null),{highRisk:null,managed:null,expiresAt:null});
 const first=stats.load('a','token-a'),same=stats.load('a','token-a');
 assert.deepEqual(await first,{highRisk:9,managed:3,expiresAt:60000});await same;
 assert.equal(calls.length,2);assert.ok(calls.every(c=>c.orgId==='a'&&c.token==='token-a'));
 await stats.load('a','token-a');assert.equal(calls.length,2);
 await stats.load('b','token-a');assert.equal(calls.length,4);
 time=60001;await stats.load('a','token-a');assert.equal(calls.length,6);
 stats.reset();await stats.load('a','token-b');assert.equal(calls.length,8);
 assert.ok(calls.slice(-2).every(c=>c.token==='token-b'));
});

test('partial failure stays unknown, retries and cannot expose a late result after session reset',async()=>{
 let rejectManaged=true,release;const signals=[];
 const stats=createInstitutionStats({now:()=>0,request:async(key,context,signal)=>{
  signals.push(signal);
  if(key==='population'&&rejectManaged)throw Object.assign(Error('denied'),{status:403});
  return {data:{total:key==='highrisk'?0:2}};
 }});
 assert.deepEqual(await stats.load('a','token'),{highRisk:0,managed:null,expiresAt:60000});
 rejectManaged=false;assert.deepEqual(await stats.load('a','token'),{highRisk:0,managed:2,expiresAt:60000});
 const gate=new Promise(resolve=>release=resolve);
 const late=createInstitutionStats({request:async(key,context,signal)=>{signals.push(signal);await gate;return {data:{total:999}};}});
 const pending=late.load('slow','old');late.reset();
 assert.ok(signals.slice(-2).every(signal=>signal.aborted));
 release();assert.deepEqual(await pending,{highRisk:null,managed:null,expiresAt:null});
});

test('source validity is never extended and refreshing snapshots are retrieved promptly',async()=>{
 let time=1000,refreshing=false,calls=0,sourceExpiry=2000;
 const stats=createInstitutionStats({now:()=>time,request:async()=>{calls++;return {data:{total:23},meta:{staleUntil:new Date(sourceExpiry).toISOString(),refreshing}};}});
 assert.deepEqual(await stats.load('a','token'),{highRisk:23,managed:23,expiresAt:2000});
 time=3000;assert.deepEqual(await stats.load('a','token'),{highRisk:null,managed:null,expiresAt:null});assert.equal(calls,4);
 refreshing=true;sourceExpiry=100000;
 assert.equal((await stats.load('a','token')).expiresAt,6000);
 time=6001;await stats.load('a','token');assert.equal(calls,8);
});
