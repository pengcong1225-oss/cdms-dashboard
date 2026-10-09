import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardDom} from './dashboard-dom.mjs';
const drain=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
function serve(calls,handler){return async(input,options={})=>{
 const url=new URL(input);calls.push({url,options});
 if(url.pathname.includes('/manager-api/')||url.pathname.endsWith('/auth/refresh'))return handler(url,options);
 return Response.json(url.pathname.endsWith('/api/dashboard-config')?{managerUiUrl:'/cdmsmanager/'}:url.pathname.endsWith('/api/map-config')?{}:{features:[]});
};}
test('bookmark without login sends no statistics, explains login and resumes on same-origin login',async()=>{
 const dom=dashboardDom(),session=dom.install(),calls=[];session.storage.clear();
 globalThis.fetch=serve(calls,url=>Response.json({code:200,data:url.pathname.endsWith('/dashboard/alerts')?{records:[],total:0,current:1,size:3,pages:0}:[]}));
 try{
  await import(`../src/dashboard/app.mjs?login=${Date.now()}`);await drain();
  assert.equal(calls.filter(c=>c.url.pathname.includes('/manager-api/')).length,0);
  assert.equal(dom.node('#auth-gate').hidden,false);assert.match(dom.node('#auth-message').textContent,/登录/);
  assert.match(dom.node('#dashboard').innerHTML,/href="\/cdmsmanager\/login" target="_blank" rel="noopener"/);
  for(const timer of dom.timers)timer.handler();await drain();
  assert.equal(calls.filter(c=>c.url.pathname.includes('/manager-api/')).length,0);
  session.storage.set('token','logged-in');dom.windowHandlers.storage({key:'token'});await drain();
  assert.equal(dom.node('#auth-gate').hidden,true);assert.equal(calls.filter(c=>c.url.pathname.includes('/manager-api/')).length,6);
  session.storage.clear();dom.windowHandlers.focus();await drain();
  assert.equal(dom.node('#auth-gate').hidden,false);assert.match(dom.node('#gender').innerHTML,/等待管理端统计/);
 }finally{session.restore();}
});
test('concurrent 401s renew once, reload with new token and stop all polling when renewal expires',async()=>{
 const dom=dashboardDom(),session=dom.install(),calls=[];session.storage.set('refreshToken','refresh-a');let validRefresh=true;
 globalThis.fetch=serve(calls,(url,options)=>{
  if(url.pathname.endsWith('/auth/refresh'))return Response.json(validRefresh?{code:200,data:{token:'renewed',refreshToken:'refresh-b'}}:{code:401});
  if(options.headers.Authorization==='Bearer user-a'||!validRefresh)return Response.json({code:401},{status:401});
  return Response.json({code:200,data:url.pathname.endsWith('/population')?{total:7,genderDistribution:{男:7},comorbidities:{}}:url.pathname.endsWith('/dashboard/alerts')?{records:[],total:0,current:1,size:3,pages:0}:[]});
 });
 try{
  await import(`../src/dashboard/app.mjs?renew=${Date.now()}`);await drain();
  assert.equal(calls.filter(c=>c.url.pathname.endsWith('/auth/refresh')).length,1);
  assert.equal(calls.filter(c=>c.options.headers?.Authorization==='Bearer renewed').length,6);
  assert.match(dom.node('#gender').innerHTML,/7/);assert.equal(dom.node('#auth-gate').hidden,true);
  validRefresh=false;dom.node('#more-insights').onclick();dom.timers.find(t=>t.ms===60000).handler();await drain();
  assert.equal(dom.node('#auth-gate').hidden,false);assert.equal(dom.node('#detail').open,false);
  assert.match(dom.node('#gender').innerHTML,/等待管理端统计/);
  const count=calls.length;for(const timer of dom.timers)timer.handler();await drain();assert.equal(calls.length,count);
 }finally{session.restore();}
});
