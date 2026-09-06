import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
import {createHandler} from './handler.mjs';
import {createReadOnlyPool} from './db.mjs';
import {createSqlProvider} from './metrics.mjs';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const dataDir=fileURLToPath(new URL('./data/',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(dataDir,'manifest.json'),'utf8'));
const mode=process.env.DATA_MODE==='db'?'db':'snapshot';
let pool;
let provider;
let mapConfig={};
if(mode==='db'){
 pool=createReadOnlyPool();
 const mapPath=process.env.MAP_CONFIG_PATH?resolve(process.env.MAP_CONFIG_PATH):resolve(fileURLToPath(new URL('./map-config.json',import.meta.url)));
 try{mapConfig=JSON.parse(await readFile(mapPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 provider=createSqlProvider({pool,mapConfig});
}
const handle=await createHandler({dataDir,mode,provider});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 try {
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host??''))return send(403,{code:'403',msg:'仅允许本机访问'});
  const url=new URL(req.url,'http://localhost');
  const path=decodeURIComponent(url.pathname);
  if(path==='/api/health'){
   const health=handle.health();
   return send(200,{status:'ok',mode:health.mode,capturedAt:health.mode==='snapshot'?manifest.capturedAt:null,lastSuccessAt:health.lastSuccessAt,institutions:health.mode==='snapshot'?manifest.scopes.length-1:null,responses:health.mode==='snapshot'?manifest.entries.length:null,databaseConnected:health.databaseConnected});
  }
  if(path.startsWith('/smart-hguard/api/v1/screen/v2/')){
   if(req.method!=='POST')return send(405,{code:'405',msg:'请使用 POST'});
   const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return send(403,{code:'403',msg:'不允许跨站访问'});
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)return send(413,{code:'413',msg:'请求过大'});}
   let body;try{body=JSON.parse(raw||'{}');}catch{return send(400,{code:'400',msg:'JSON 格式错误'});}
   const result=await handle(path.split('/').at(-1),body);return send(result.status,result.body);
  }
  if(!['GET','HEAD'].includes(req.method))return send(405,{code:'405',msg:'方法不支持'});
  const relative=path==='/'||path==='/smart-hguard-monitor/'?'index.html':path.replace(/^\/smart-hguard-monitor\//,'/').replace(/^\//,'');
  const target=resolve(root,relative);
  if(!target.startsWith(root+sep))return send(403,{code:'403',msg:'路径无效'});
  if(!(await stat(target)).isFile())return send(404,{code:'404',msg:'资源不存在'});
  const content=await readFile(target);
  res.writeHead(200,{'Content-Type':types[extname(target)]??'application/octet-stream','Content-Length':content.length,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-cache'});
  res.end(req.method==='HEAD'?undefined:content);
 }catch(error){send(error.code==='ENOENT'?404:500,{code:error.code==='ENOENT'?'404':'500',msg:'请求未完成'});}
});
server.listen(Number(process.env.PORT||4318),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port}/`));
