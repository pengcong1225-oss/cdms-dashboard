import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardDom} from './dashboard-dom.mjs';

const drain=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
test('dashboard cycles current alert pages, pauses interaction and keeps the previous page during requests without repainting other modules',async()=>{
 const dom=dashboardDom(),session=dom.install(),calls=[];let offset=0,waiting=null,status=200,total=13;
 const realNow=Date.now;Date.now=()=>realNow()+offset;
 const records=Array.from({length:13},(_,i)=>({alertId:String(1972545764702666700n+BigInt(i)),patientId:String(1972545633966211000n+BigInt(i)),patientName:`王${i+1}<明>`,reason:`血氧低于<阈值> ${i+80}%`,alertType:'SPO2',alertValue:i+80,alertUnit:'%',level:2,occurredAt:'2026-09-01 08:30:59'}));
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input);calls.push({url,auth:options.headers?.Authorization});
  if(url.pathname.endsWith('/api/dashboard-config'))return Response.json({managerUiUrl:'/cdmsmanager/'});
  if(url.pathname.includes('/map/')||url.pathname.endsWith('/api/map-config'))throw Error('optional map unavailable in this alert test');
  if(url.pathname.endsWith('/dashboard/alerts')){
   const current=total?Math.min(Number(url.searchParams.get('page')),Math.ceil(total/5)):1;
   if(waiting){const work=waiting;waiting=null;await work;}
   if(status!==200)return Response.json({code:status,msg:'denied'},{status});
   return Response.json({code:200,data:{records:records.slice((current-1)*5,Math.min(current*5,total)),total,current,size:5,pages:Math.ceil(total/5)}});
  }
  return Response.json({code:200,data:url.pathname.endsWith('/screening')?[]:url.pathname.endsWith('/follow-up')?[]:url.pathname.endsWith('/population')?{total:7,genderDistribution:{男:7},comorbidities:{}}:{}});
 };
 const alertCalls=()=>calls.filter(call=>call.url.pathname.endsWith('/dashboard/alerts'));
 try{
  await import(`../src/dashboard/app.mjs?alerttest=${realNow()}`);await drain();
  const node=dom.node,clock=dom.timers.find(timer=>timer.ms===1000).handler,area=node('#alert-carousel');
  assert.equal(alertCalls().length,1);assert.equal(alertCalls()[0].url.pathname,'/dashboard/manager-api/api/v1/dashboard/alerts');
  assert.equal(alertCalls()[0].url.searchParams.get('page'),'1');assert.equal(alertCalls()[0].url.searchParams.get('size'),'5');assert.equal(alertCalls()[0].url.searchParams.has('minutes'),false);
  assert.match(node('#alerts').innerHTML,/王1&lt;明&gt;/);assert.match(node('#alerts').innerHTML,/血氧低于&lt;阈值&gt;/);assert.doesNotMatch(node('#alerts').innerHTML,/王1\*\*/);
  assert.match(node('#metric-5').innerHTML,/13/);
  const populationWrites=node('#gender').writes,rankingWrites=node('#ranking').writes;
  calls.length=0;status=503;node('#alert-next').onclick();await drain();
  assert.equal(alertCalls().length,1);assert.equal(alertCalls()[0].url.searchParams.get('page'),'2');assert.match(node('#alerts').innerHTML,/王1&lt;明&gt;/);
  assert.equal(node('#alert-next').disabled,false);
  status=200;node('#alert-next').onclick();await drain();assert.equal(alertCalls().length,2,'same target page must retry immediately after failure');
  assert.match(node('#alerts').innerHTML,/王6&lt;明&gt;/);assert.equal(node('#alert-next').disabled,false);
  node('#alert-prev').onclick();await drain();assert.match(node('#alerts').innerHTML,/王1&lt;明&gt;/);
  calls.length=0;let release;waiting=new Promise(resolve=>release=resolve);offset+=6000;clock();await drain();
  assert.equal(alertCalls().length,1);assert.equal(alertCalls()[0].url.searchParams.get('page'),'2');assert.match(node('#alerts').innerHTML,/王1&lt;明&gt;/);
  assert.equal(node('#alert-next').disabled,true);dom.timers.find(timer=>timer.ms===20000).handler();await drain();assert.equal(alertCalls().length,1,'monitoring poll must share pending page request');
  release();await drain();assert.match(node('#alerts').innerHTML,/王6&lt;明&gt;/);assert.equal(node('#gender').writes,populationWrites);assert.equal(node('#ranking').writes,rankingWrites);
  for(const [enter,leave] of [['pointerenter','pointerleave'],['focusin','focusout']]){
   area.handlers[enter]({});calls.length=0;offset+=12000;clock();await drain();assert.equal(alertCalls().length,0);
   area.handlers[leave]({relatedTarget:null});offset+=6000;clock();await drain();assert.equal(alertCalls().length,1);
  }
  dom.document.hidden=true;dom.document.visibilitychange();calls.length=0;offset+=12000;clock();await drain();assert.equal(alertCalls().length,0);
  dom.document.hidden=false;dom.document.visibilitychange();await drain();calls.length=0;
  node('#alert-pause').onclick();offset+=12000;clock();await drain();assert.equal(alertCalls().length,0);assert.match(node('#alert-pause').textContent,/继续/);
  node('#alert-prev').onclick();await drain();assert.equal(alertCalls().length,1,'manual navigation works while auto rotation paused');
  calls.length=0;node('#year').value='2025';node('#year').onchange();await drain();assert.equal(alertCalls().length,0);
  node('#scope').value='1972545764702666753';calls.length=0;node('#scope').onchange();await drain();
  assert.equal(alertCalls().at(-1).url.searchParams.get('page'),'1');assert.equal(alertCalls().at(-1).url.searchParams.get('orgId'),'1972545764702666753');assert.match(node('#alert-pause').textContent,/暂停/);
  status=403;node('#alert-next').onclick();await drain();assert.doesNotMatch(node('#alerts').innerHTML,/王/);
  status=200;total=0;dom.timers.find(timer=>timer.ms===20000).handler();await drain();assert.match(node('#alerts').innerHTML,/当前暂无未处理告警/);assert.equal(node('#alert-next').disabled,true);
  total=13;session.storage.set('token','user-b');calls.length=0;clock();await drain();assert.equal(alertCalls().at(-1).url.searchParams.get('page'),'1');assert.equal(alertCalls().at(-1).auth,'Bearer user-b');
  session.storage.delete('token');calls.length=0;clock();await drain();assert.doesNotMatch(node('#alerts').innerHTML,/王/);offset+=12000;clock();dom.timers.find(timer=>timer.ms===20000).handler();await drain();assert.equal(alertCalls().length,0);
 }finally{Date.now=realNow;session.restore();}
});
