import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardDom} from './dashboard-dom.mjs';

const drain=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
test('real dashboard app limits yearly refresh, preserves map navigation and isolates monitoring DOM writes',async()=>{
 const dom=dashboardDom(),session=dom.install(),calls=[];
 const org='1972545764702666753';let screening=12,monitorCount=7,populationStatus=200,expiresSoon=false,timeOffset=0;
 const realNow=Date.now;Date.now=()=>realNow()+timeOffset;
 const geometry={type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1],[0,0]]]};
 const meta={dataUpdatedAt:'2026-10-09T00:00:00Z',stale:false,refreshing:false,refreshFailed:false,freshUntil:'2099-01-01T00:00:00Z',staleUntil:'2099-01-01T00:10:00Z'};
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(input);calls.push({path:url.pathname,query:url.searchParams,auth:options.headers?.Authorization});
  let payload;
  if(url.pathname.endsWith('/api/dashboard-config'))payload={managerUiUrl:'/cdmsmanager/'};
  else if(url.pathname.endsWith('/api/map-config'))payload={[org]:{name:'机构',shortName:'机构',lng:.5,lat:.5}};
  else if(url.pathname.endsWith('/map/whkfq.json'))payload={features:[{geometry}]};
  else if(url.pathname.endsWith('/map/streets.json'))payload={features:[{properties:{name:'样例街道'},geometry}]};
  else{
   let data;
   if(url.pathname.endsWith('/screening'))data=[{orgId:org,orgName:'机构',sqScreeningCount:screening,score16Count:2,lungFuncExamCount:4}];
   if(url.pathname.endsWith('/follow-up'))data=[{orgId:org,visitCount:3}];
   if(url.pathname.endsWith('/population'))data={total:7,qualityPassed:4,genderDistribution:{男:7},ageBuckets:{'60+':7},goldDistribution:{'GOLD 1-2级':4},goldGradedTotal:4,goldUngraded:3,riskDistribution:{低风险:7},abeDistribution:{A:7},comorbidities:{高血压:3}};
   if(url.pathname.endsWith('/high-risk'))data={total:9,pending:2};
   if(url.pathname.endsWith('/monitoring/stats'))data={managedPatientCount:monitorCount,boundPatientCount:4,activeAlertPatientCount:1,offlinePatientCount:2};
   if(url.pathname.endsWith('/popup'))data={remainingCount:1,alerts:[]};
   payload={code:200,data,...(url.pathname.includes('/dashboard/')?{meta:{...meta,...(expiresSoon&&url.pathname.endsWith('/screening')?{staleUntil:new Date(realNow()+30000).toISOString()}:{})}}:{})};
   if(url.pathname.endsWith('/population')&&populationStatus!==200)return Response.json({code:populationStatus,message:'denied'},{status:populationStatus});
  }
  return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
  await import(`../src/dashboard/app.mjs?test=${Date.now()}`);await drain();
  const node=dom.node,points=node('#map #map-points'),scene=node('#map #map-scene'),svg=node('#map svg');
  assert.match(node('#gender').innerHTML,/确诊在管/);assert.match(points.innerHTML,new RegExp(org));
  svg.handlers.wheel({preventDefault(){},deltaY:-1});
  svg.handlers.pointerdown({target:{closest:()=>null},clientX:0,clientY:0});
  svg.handlers.pointermove({buttons:1,clientX:30,clientY:20,pointerId:1});svg.handlers.pointerup();
  const transform=scene.attributes.transform;assert.match(transform,/translate\(30 20\).*scale\(1.1\)/);
  const beforePopulation=node('#gender').writes,beforeMap=points.writes,beforeRanking=node('#ranking').writes;
  calls.length=0;node('#year').value='2025';node('#year').onchange();await drain();
  assert.deepEqual(calls.map(call=>call.path).sort(),['/dashboard/manager-api/api/v1/dashboard/follow-up','/dashboard/manager-api/api/v1/dashboard/screening']);
  assert.ok(calls.every(call=>call.query.get('year')==='2025'));
  assert.equal(node('#gender').writes,beforePopulation);assert.equal(scene.attributes.transform,transform);
  assert.ok(points.writes>beforeMap);assert.ok(node('#ranking').writes>beforeRanking);
  const writes=points.writes,rankingWrites=node('#ranking').writes;
  monitorCount=8;calls.length=0;dom.timers.find(timer=>timer.ms===20000).handler();await drain();
  assert.equal(points.writes,writes);assert.equal(node('#ranking').writes,rankingWrites);assert.equal(node('#gender').writes,beforePopulation);
  assert.match(node('#wearable').innerHTML,/8/);assert.equal(scene.attributes.transform,transform);
  calls.length=0;dom.timers.find(timer=>timer.ms===60000).handler();await drain();assert.equal(points.writes,writes);
  screening=14;dom.timers.find(timer=>timer.ms===60000).handler();await drain();assert.ok(points.writes>writes);assert.equal(scene.attributes.transform,transform);
  node('#scope').value=org;calls.length=0;node('#scope').onchange();await drain();
  assert.equal(calls.length,6);assert.ok(calls.every(call=>call.query.get('orgId')===org));
  node('#more-insights').onclick();populationStatus=403;dom.timers.find(timer=>timer.ms===60000).handler();await drain();
  assert.match(node('#gender').innerHTML,/等待管理端统计/);assert.equal(node('#detail').open,false);assert.equal(node('#detail-body').innerHTML,'');
  expiresSoon=true;dom.timers.find(timer=>timer.ms===60000).handler();await drain();
  node('#all-institutions').onclick();assert.equal(node('#detail').open,true);assert.match(node('#detail-body').innerHTML,/机构/);
  timeOffset=31000;dom.timers.find(timer=>timer.ms===1000).handler();
  assert.equal(node('#detail').open,false);assert.equal(node('#detail-body').innerHTML,'');assert.equal(points.innerHTML,'');
  expiresSoon=false;populationStatus=200;dom.timers.find(timer=>timer.ms===60000).handler();await drain();
  node('#all-institutions').onclick();screening++;dom.timers.find(timer=>timer.ms===60000).handler();await drain();
  assert.equal(node('#detail').open,false);assert.equal(node('#detail-body').innerHTML,'');
  svg.handlers.pointerdown({target:{closest:()=>null},clientX:30,clientY:20});svg.handlers.pointerup();
  svg.handlers.click({target:{closest:selector=>selector==='[data-street]'?{dataset:{street:'样例街道'}}:null}});
  assert.equal(node('#detail').open,true);assert.match(node('#detail-title').textContent,/样例街道/);
  screening++;dom.timers.find(timer=>timer.ms===60000).handler();await drain();
  assert.equal(node('#detail').open,false);assert.equal(node('#detail-body').innerHTML,'');
  node('#more-insights').onclick();assert.equal(node('#detail').open,true);
  session.storage.set('token','user-b');calls.length=0;dom.timers.find(timer=>timer.ms===1000).handler();await drain();
  assert.equal(node('#scope').value,'');assert.equal(node('#detail').open,false);assert.equal(node('#detail-body').innerHTML,'');
  assert.equal(calls.length,6);assert.ok(calls.every(call=>call.auth==='Bearer user-b'&&!call.query.has('orgId')));
  node('#more-insights').onclick();calls.length=0;dom.timers.find(timer=>timer.ms===60000).handler();session.storage.set('token','user-c');await drain();
  assert.equal(node('#detail').open,false);assert.equal(node('#detail-body').innerHTML,'');
  assert.equal(calls.filter(call=>call.auth==='Bearer user-c').length,6);
 }finally{Date.now=realNow;session.restore();}
});
