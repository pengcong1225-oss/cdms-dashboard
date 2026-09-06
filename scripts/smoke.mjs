import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:4318';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('server/data/manifest.json',root),'utf8'));
const assets=JSON.parse(await readFile(new URL('artifacts/asset-manifest.json',root),'utf8'));
for(const path of ['/','/smart-hguard-monitor/','/status.html',...assets.map(a=>'/'+a.path)]){
 const response=await fetch(base+path);assert.equal(response.status,200,`Asset ${path}`);
 if(path.endsWith('.ttf'))assert.equal(response.headers.get('content-type'),'font/ttf');
}
const call=(name,body,method='POST')=>fetch(`${base}/smart-hguard/api/v1/screen/v2/${name}`,{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
for(const entry of [{endpoint:'context',scope:'all',year:null,file:'context.json'},...manifest.entries]){
 const response=await call(entry.endpoint,{...(entry.scope==='all'?{}:{enterpriseId:entry.scope}),...(entry.year?{year:entry.year}:{})});
 assert.equal(response.status,200,`${entry.endpoint}/${entry.scope}/${entry.year}`);
 const expected=JSON.parse(await readFile(new URL('server/data/'+entry.file,root),'utf8'));
 assert.deepEqual(await response.json(),expected);
}
assert.equal((await call('context',{},'GET')).status,405);
assert.equal((await call('context','{')).status,400);
assert.equal((await call('context',{enterpriseId:'../context'})).status,400);
assert.equal((await call('abnormal-trend',{year:2020})).status,404);
assert.equal((await fetch(base+'/server/data/context.json')).status,404);
assert.equal((await fetch(base+'/smart-hguard/api/v1/screen/v2/context',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'})).status,403);
const report={verifiedAt:new Date().toISOString(),apiResponses:manifest.entries.length+1,originalAssets:assets.length,errorCases:6,result:'passed'};
await writeFile(new URL('artifacts/verification.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
