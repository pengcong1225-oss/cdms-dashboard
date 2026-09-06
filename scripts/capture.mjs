import {mkdir,writeFile} from 'node:fs/promises';
import {encodeLogin} from '../server/login-codec.mjs';
const origin='https://agpay.lulife.net';
const jar=new Map();
async function request(path, options={}) {
  const r=await fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000),headers:{...options.headers,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}});
  for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0];const at=pair.indexOf('=');jar.set(pair.slice(0,at),pair.slice(at+1));}
  return r;
}
if(!process.env.SOURCE_USERNAME||!process.env.SOURCE_PASSWORD) throw new Error('Set SOURCE_USERNAME and SOURCE_PASSWORD in this process.');
await request('/smart-hguard/a/login');
const login=await request('/smart-hguard/a/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({username:encodeLogin(process.env.SOURCE_USERNAME),password:encodeLogin(process.env.SOURCE_PASSWORD)})});
const result=await login.json();
if(result.isValidCodeLogin) throw new Error('Original site requires CAPTCHA. Stop and complete its normal login in browser.');
if(String(result.result)==='false') throw new Error('Original site rejected the login. No repeated attempts made.');
console.log('Authorized login accepted');
const dir=new URL('../server/data/',import.meta.url);await mkdir(dir,{recursive:true});
async function read(endpoint,body={}) {
  const r=await request('/smart-hguard/api/v1/screen/v2/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`API ${endpoint}: HTTP ${r.status}`);
  const data=await r.json();
  if(data.code && !['0','200'].includes(String(data.code)))throw new Error(`API ${endpoint} failed`);
  return data;
}
const context=await read('context');
await writeFile(new URL('context.json',dir),JSON.stringify(context,null,2));
const payload=context.data??context;
const hospitals=payload.hospitals??[];
console.log('Context fields:',Object.keys(payload));
console.log('Available institutions:',hospitals.length);
const scopes=[null,...hospitals.map(x=>x.id).filter(Boolean)];
const endpoints=['lung-function-stats','abnormal-trend','institution-rank','map-layer','org-region-list','lung-level-distribution','assessment-group-distribution','management-level-rating'];
const manifest={capturedAt:new Date().toISOString(),source:origin,scopes:[],entries:[]};
for(const scope of scopes){
  const body=scope?{enterpriseId:scope}:{};
  const scopeKey=scope===null?'all':String(scope);
  if(!/^[\w-]+$/.test(scopeKey))throw new Error('Unexpected institution identifier');
  manifest.scopes.push(scopeKey);
  for(const endpoint of endpoints){
    const years=endpoint==='abnormal-trend'?[new Date().getFullYear(),new Date().getFullYear()-1,new Date().getFullYear()-2]:[null];
    for(const year of years){
      const data=await read(endpoint,{...body,...(year?{year}:{})});
      const filename=`${scopeKey}--${endpoint}${year?'--'+year:''}.json`;
      await writeFile(new URL(filename,dir),JSON.stringify(data,null,2));
      manifest.entries.push({endpoint,scope:scopeKey,year,file:filename});
    }
  }
  console.log(`Captured scope ${manifest.scopes.length}/${scopes.length}`);
}
await writeFile(new URL('manifest.json',dir),JSON.stringify(manifest,null,2));
console.log(`Captured ${manifest.entries.length} aggregate responses. No patient records requested.`);
