import test from 'node:test';
import assert from 'node:assert/strict';

const schedulerModule = new URL('../src/dashboard/refresh.mjs', import.meta.url);
async function make(options={}) {
 const {createRefreshController}=await import(schedulerModule);
 return createRefreshController({year:'2026',orgId:'',token:'user-a',request:async()=>({data:{total:7}}),...options});
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
test('year changes only cancel and reload annual data while current population requests survive',async()=>{
 const calls=[],waiting=[];
 const controller=await make({request:(key,context,signal)=>{const work=deferred();calls.push({key,context,signal});waiting.push(work);return work.promise;}});
 const annual=controller.load('annual'),population=controller.load('population');
 const changed=controller.setContext({year:'2025'});
 assert.deepEqual(changed,['annual','followup']);
 assert.equal(calls[0].signal.aborted,true);assert.equal(calls[1].signal.aborted,false);
 const replacement=controller.load('annual');
 waiting[0].resolve({data:[{orgId:'1972545764702666753',sqScreeningCount:999}]});
 waiting[1].resolve({data:{total:7}});waiting[2].resolve({data:[{orgId:'1972545764702666753',sqScreeningCount:12}]});
 await Promise.all([annual,population,replacement]);
 assert.equal(controller.data.population.total,7);assert.equal(controller.data.annual[0].sqScreeningCount,12);
 assert.equal(calls[2].context.year,'2025');
});
test('duplicate requests share one promise and scope changes isolate snowflake IDs and old results',async()=>{
 const calls=[],waiting=[];
 const controller=await make({request:(key,context,signal)=>{const work=deferred();calls.push({key,context,signal});waiting.push(work);return work.promise;}});
 const first=controller.load('annual');assert.equal(controller.load('annual'),first);assert.equal(calls.length,1);
 controller.setContext({orgId:'1972545764702666753'});
 const second=controller.load('annual');assert.equal(calls[1].context.orgId,'1972545764702666753');
 waiting[1].resolve({data:[{sqScreeningCount:12}]});await second;
 waiting[0].resolve({data:[{sqScreeningCount:999}]});await first;
 assert.equal(controller.data.annual[0].sqScreeningCount,12);
});
test('403 clears only its module while token changes clear all data and discard in-flight old-token responses',async()=>{
 let failure=null,waiting=null;
 const controller=await make({request:async(key)=>{if(failure&&key==='annual')throw Object.assign(Error('denied'),{status:403});if(waiting)return waiting.promise;return {data:{total:7}};}});
 await Promise.all([controller.load('annual'),controller.load('population')]);failure=true;await controller.load('annual');
 assert.equal(controller.data.annual,undefined);assert.equal(controller.data.population.total,7);
 waiting=deferred();const old=controller.load('population');controller.setContext({token:'user-b'});
 assert.deepEqual(controller.data,{});waiting.resolve({data:{total:999}});await old;assert.deepEqual(controller.data,{});
});
test('cached responses retain real source timestamp, report stale and refresh failure, and expire old values',async()=>{
 let time=Date.parse('2026-10-09T00:00:30Z'),fail=false;
 const meta={dataUpdatedAt:'2026-10-09T00:00:00Z',freshUntil:'2026-10-09T00:00:45Z',staleUntil:'2026-10-09T00:02:00Z',stale:false,refreshing:false,refreshFailed:false};
 const controller=await make({now:()=>time,request:async()=>{if(fail)throw Error('offline');return {data:{total:7},meta};}});
 await controller.load('population');time+=20000;await controller.load('population');
 assert.equal(controller.states.population.dataUpdatedAt,'2026-10-09T00:00:00Z');assert.equal(controller.states.population.stale,true);
 fail=true;await controller.load('population');assert.equal(controller.data.population.total,7);assert.equal(controller.states.population.refreshFailed,true);
 time=Date.parse('2026-10-09T00:02:01Z');controller.checkFreshness();assert.equal(controller.data.population,undefined);
});
test('metadata-free responses never claim a source timestamp and cache hits do not repaint data',async()=>{
 const changes=[];const controller=await make({onChange:(key,event)=>changes.push({key,...event})});
 await controller.load('monitoring');await controller.load('monitoring');
 assert.equal(controller.states.monitoring.dataUpdatedAt,null);assert.ok(controller.states.monitoring.receivedAt);
 assert.equal(changes.filter(event=>event.dataChanged).length,1);
});
test('render dependencies repaint only affected sections and never repaint map on monitoring or rank changes',async()=>{
 const {createSectionRenderer}=await import('../src/dashboard/render.mjs');
 const rendered=[];const render=createSectionRenderer({map:{depends:['annual','scope'],render:()=>rendered.push('map')},ranking:{depends:['annual','rank','scope'],render:()=>rendered.push('ranking')},population:{depends:['population'],render:()=>rendered.push('population')},monitoring:{depends:['monitoring'],render:()=>rendered.push('monitoring')}});
 render(['monitoring']);assert.deepEqual(rendered,['monitoring']);rendered.length=0;
 render(['rank']);assert.deepEqual(rendered,['ranking']);rendered.length=0;
 render(['annual','scope']);assert.deepEqual(rendered,['map','ranking']);
});
test('status text distinguishes source updates, unknown source time, and stale refresh failure',async()=>{
 const {statusText}=await import('../src/dashboard/components.mjs');
 assert.match(statusText({dataUpdatedAt:'2026-10-09T00:00:00Z',stale:true,refreshFailed:true}),/陈旧/);
 assert.match(statusText({dataUpdatedAt:'2026-10-09T00:00:00Z',stale:true,refreshFailed:true}),/刷新失败/);
 assert.match(statusText({dataUpdatedAt:null,receivedAt:'2026-10-09T00:00:30Z'}),/数据更新时间未提供/);
});
