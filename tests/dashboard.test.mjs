import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

test('dashboard URLs retain the browser entry prefix and reject origin-root escapes',async()=>{
 const {dashboardUrl}=await import('../src/dashboard/paths.mjs');
 for(const entry of ['http://localhost:4318/','https://cdms.example/dashboard/']){
  const base=new URL('.',entry);
  for(const path of ['api/map-config','map/whkfq.json','manager-api/api/v1/copd/stats?orgId=1972545764702666753','legacy.html'])
   assert.equal(dashboardUrl(path,entry),new URL(path,base).href);
 }
 assert.throws(()=>dashboardUrl('/map/whkfq.json','https://cdms.example/dashboard/'));
});

test('Nginx-style dashboard mount serves entry assets, map, config and authorized Manager requests',async()=>{
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 const build=spawn(process.execPath,['scripts/build.mjs'],{cwd,stdio:'ignore'});
 assert.equal((await once(build,'exit'))[0],0);
 const calls=[];
 const manager=createServer((req,res)=>{calls.push({path:req.url,auth:req.headers.authorization});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:200,data:{total:7}}));});
 manager.listen(0,'127.0.0.1');await once(manager,'listening');
 const server=spawn(process.execPath,['server/index.mjs'],{cwd,env:{...process.env,PORT:'0',DATA_MODE:'manager',MANAGER_BASE_URL:`http://127.0.0.1:${manager.address().port}`},stdio:['ignore','pipe','pipe']});
 let proxy;
 try {
  const upstream=await new Promise((resolve,reject)=>{
   server.once('exit',code=>reject(Error(`server exited ${code}`)));
   server.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});
   server.stderr.on('data',chunk=>reject(Error(String(chunk))));
  });
  proxy=createServer(async(req,res)=>{
   if(!req.url.startsWith('/dashboard/')){res.writeHead(404);return res.end('outside dashboard');}
   const response=await fetch(upstream+req.url.replace(/^\/dashboard\//,'/smart-hguard-monitor/'),{headers:req.headers.authorization?{Authorization:req.headers.authorization}:{}});
   res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')});res.end(Buffer.from(await response.arrayBuffer()));
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  const entry=`http://127.0.0.1:${proxy.address().port}/dashboard/`;
  const html=await fetch(entry).then(r=>r.text());
  const script=html.match(/<script type="module" src="([^"]+)"/)[1];
  const cssPath=html.match(/rel="stylesheet" href="([^"]+)"/)[1];
  const module=await fetch(new URL(script,entry));assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/text\/javascript/);
  const cssUrl=new URL(cssPath,entry),css=await fetch(cssUrl).then(r=>r.text());
  const font=css.match(/src:url\('([^']+)'\)/)[1];assert.equal((await fetch(new URL(font,cssUrl))).status,200);
  for(const path of ['map/whkfq.json','map/streets.json','api/map-config','api/dashboard-config','api/health'])assert.equal((await fetch(new URL(path,entry))).status,200,path);
  assert.equal((await fetch(new URL('legacy.html',entry))).status,503);
  const config=await fetch(new URL('api/dashboard-config',entry)).then(r=>r.json());assert.equal(config.legacyAvailable,false);
  assert.equal((await fetch(new URL('manager-api/api/v1/copd/stats',entry))).status,401);
  const result=await fetch(new URL('manager-api/api/v1/copd/stats?orgId=1972545764702666753',entry),{headers:{Authorization:'Bearer mount-test'}}).then(r=>r.json());
  assert.equal(result.data.total,7);assert.deepEqual(calls,[{path:'/api/v1/copd/stats?orgId=1972545764702666753',auth:'Bearer mount-test'}]);
  const legacy=await readFile(new URL('../dist/legacy.html',import.meta.url),'utf8');
  const legacyScript=legacy.match(/<script src=(static\/js\/app\.[^> ]+)/)[1];
  const legacyApp=await fetch(new URL(legacyScript,entry)).then(r=>r.text());
  assert.ok(legacyApp.includes('new URL("smart-hguard",document.baseURI)'));
  assert.ok(legacyApp.includes('baseApi:new URL("smart-hguard/api/v1",document.baseURI)'));
  const originalApi=await fetch(new URL('smart-hguard/api/v1/screen/v2/dashboard',entry));
  assert.equal(originalApi.status,503); // Route reached; Manager mode never exposes legacy data.
  assert.equal((await fetch(new URL('replica-status.js',entry))).status,200);
 }finally{
  if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
  server.kill();await once(server,'exit');manager.closeAllConnections();await new Promise(resolve=>manager.close(resolve));
 }
});
test('ranking preserves snowflake IDs and uses one scale for all comorbidities', async () => {
 const {rankRows,distribution}=await import('../src/dashboard/model.mjs');
 const rows=rankRows([{orgId:'1972545764702666753',sqScreeningCount:12},{orgId:'1972545633966211073',sqScreeningCount:6}], 'sqScreeningCount');
 assert.equal(rows[0].orgId,'1972545764702666753'); assert.ok(Math.abs(rows[1].share-100/3)<1e-10);
 const bars=distribution({甲:100,乙:50,丙:0},200);
 assert.equal(bars[1].width,50); assert.equal(bars[1].percent,25);
});
test('missing metrics remain unavailable, zero is valid', async () => {
 const {formatNumber}=await import('../src/dashboard/model.mjs');
 assert.equal(formatNumber(null),'—'); assert.equal(formatNumber(undefined),'—'); assert.equal(formatNumber(0),'0');
});
test('manager proxy forwards user auth only to allowlisted read-only paths', async () => {
 const {createManagerProxy}=await import('../server/manager-proxy.mjs');
 const calls=[]; const proxy=createManagerProxy({baseUrl:'http://127.0.0.1:8081',fetchImpl:async(url,options)=>{calls.push({url,options}); return new Response('{"code":200,"data":{}}',{status:200});}});
 assert.equal((await proxy('/api/v1/monitoring/stats?orgId=1972545764702666753',{authorization:'Bearer user-token'})).status,200);
 assert.equal(calls[0].options.headers.Authorization,'Bearer user-token');
 assert.ok(calls[0].url.includes('1972545764702666753'));
 assert.equal((await proxy('/api/v1/copd/123/patient360',{})).status,404);
 assert.equal((await proxy('/api/v1/monitoring/stats',{})).status,401);
 assert.equal((await proxy('/api/v1/monitoring/stats?keyword=patient',{})).status,400);
});
test('manager failures never become successful zero data', async () => {
 const {createManagerProxy}=await import('../server/manager-proxy.mjs');
 const proxy=createManagerProxy({baseUrl:'http://127.0.0.1:8081',fetchImpl:async()=>{throw Error('offline');}});
 assert.equal((await proxy('/api/v1/copd/stats',{authorization:'Bearer user-token'})).status,503);
});
test('manager proxy forwards cached dashboard metadata and read-only population paths',async()=>{
 const {createManagerProxy}=await import('../server/manager-proxy.mjs');
 const meta={dataUpdatedAt:'2026-10-09T00:00:00Z',stale:true,refreshing:true,refreshFailed:false,freshUntil:'2026-10-09T00:00:45Z',staleUntil:'2026-10-09T00:02:45Z'};
 const calls=[];const proxy=createManagerProxy({baseUrl:'http://127.0.0.1:8081/cdmsmanager',fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({code:200,data:{total:7},meta});}});
 for(const path of ['/api/v1/dashboard/population','/api/v1/dashboard/high-risk']){
  const result=await proxy(`${path}?orgId=1972545764702666753`,{authorization:'Bearer user-token'});
  assert.equal(result.status,200);assert.deepEqual(result.body.meta,meta);
 }
 assert.equal(calls[0].url,'http://127.0.0.1:8081/cdmsmanager/api/v1/dashboard/population?orgId=1972545764702666753');
 assert.equal(calls[1].options.headers.Authorization,'Bearer user-token');
 assert.equal((await proxy('/api/v1/dashboard/population?orgId=1972545764702666753&keyword=patient',{authorization:'Bearer user-token'})).status,400);
});
test('real local server serves ES modules with JavaScript MIME and blocks mutating manager requests',async()=>{
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 const build=spawn(process.execPath,['scripts/build.mjs'],{cwd,stdio:'ignore'});
 assert.equal((await once(build,'exit'))[0],0);
 const server=spawn(process.execPath,['server/index.mjs'],{cwd,env:{...process.env,PORT:'0',DATA_MODE:'manager'},stdio:['ignore','pipe','pipe']});
 try {
  const base=await new Promise((resolve,reject)=>{
   server.once('exit',code=>reject(Error(`server exited ${code}`)));
   server.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});
   server.stderr.on('data',chunk=>reject(Error(String(chunk))));
  });
  const module=await fetch(base+'/dashboard/app.mjs');
  assert.match(module.headers.get('content-type'),/text\/javascript/);
  assert.equal(module.status,200);
  assert.equal((await fetch(base+'/manager-api/api/v1/copd/stats',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/manager-api/api/v1/copd/stats')).status,401);
  const health=await fetch(base+'/api/health').then(r=>r.json()); assert.equal(health.mode,'manager');assert.equal(health.legacyMode,null);assert.equal(health.capturedAt,null);
  assert.equal((await fetch(base+'/legacy.html')).status,503);
  assert.equal((await fetch(base+'/smart-hguard/api/v1/screen/v2/dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503);
 }finally{server.kill();await once(server,'exit');}
});
test('street matching handles polygon holes and multipolygons',async()=>{
 const {containsPoint}=await import('../src/dashboard/map.mjs');
 const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[2,2],[4,2],[4,4],[2,4],[2,2]];
 assert.equal(containsPoint({type:'Polygon',coordinates:[outer,hole]},[1,1]),true);
 assert.equal(containsPoint({type:'Polygon',coordinates:[outer,hole]},[3,3]),false);
 assert.equal(containsPoint({type:'MultiPolygon',coordinates:[[outer]]},[20,20]),false);
});
