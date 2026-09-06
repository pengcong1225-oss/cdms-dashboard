import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=new URL('../public/',import.meta.url);
const base='https://agpay.lulife.net/smart-hguard-monitor/';
const queue=['index.html','responsive.js','favicon.ico','static/css/app.0d52b2dc.css','static/css/chunk-0adb2638.4e09da26.css','static/js/chunk-libs.a36fe31f.js','static/js/app.d091c683.js','static/js/chunk-772c38b6.150c1ddb.js','static/js/chunk-0adb2638.cceccd02.js','map/whkfq.json'];
const seen=new Set();const manifest=[];
while(queue.length){
 const relative=queue.shift();if(seen.has(relative))continue;seen.add(relative);
 const url=new URL(relative==='index.html'?'':relative,base);
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Missing ${relative}: ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 const dest=new URL(relative,root);await mkdir(dirname(fileURLToPath(dest)),{recursive:true});await writeFile(dest,bytes);
 manifest.push({path:relative,source:url.href,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 if(/\.(css|js)$/.test(relative)){
  const text=bytes.toString('utf8');
  for(const match of text.matchAll(/(?:static\/(?:img|fonts)\/)[A-Za-z0-9_./-]+\.(?:png|jpe?g|gif|svg|woff2?|ttf|eot)/g))queue.push(match[0]);
  if(relative.endsWith('.css'))for(const match of text.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)){
   const value=match[1];if(value.startsWith('data:'))continue;
   const asset=new URL(value,url);if(asset.origin!==url.origin||!asset.pathname.startsWith('/smart-hguard-monitor/'))continue;
   queue.push(asset.pathname.replace('/smart-hguard-monitor/',''));
  }
 }
 console.log(relative,bytes.length);
}
await writeFile(new URL('../artifacts/asset-manifest.json',import.meta.url),JSON.stringify(manifest,null,2));
