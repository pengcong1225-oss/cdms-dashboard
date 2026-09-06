import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('artifacts/asset-manifest.json',root),'utf8'));
for(const asset of manifest){
 const bytes=await readFile(new URL('public/'+asset.path,root));
 if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error(`Original asset changed: ${asset.path}`);
}
await mkdir(new URL('dist/',root),{recursive:true});
await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
const appFile=new URL('dist/static/js/app.d091c683.js',root);
let app=await readFile(appFile,'utf8');
app=app.replace('baseUrl:"https://agpay.lulife.net/smart-hguard"','baseUrl:"/smart-hguard"').replace('loginUrl:"https://agpay.lulife.net/smart-hguard/a/login"','loginUrl:"/status.html"');
await writeFile(appFile,app);
let html=await readFile(new URL('dist/index.html',root),'utf8');
html=html.replace('</body>','<script src="replica-status.js"></script></body>');
await writeFile(new URL('dist/index.html',root),html);
await cp(new URL('src/replica-status.js',root),new URL('dist/replica-status.js',root));
await cp(new URL('src/status.html',root),new URL('dist/status.html',root));
console.log(`Verified ${manifest.length} original assets; built dist with local API configuration.`);
