import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('text asset checksums accept CRLF/LF without hiding actual byte changes',async()=>{
 const {assetSha256}=await import('../scripts/asset-integrity.mjs');
 const lf=Buffer.from('const label="机构";\n// preserved standalone CR\rEND\n');
 const crlf=Buffer.from(lf.toString().replace(/\n/g,'\r\n'));
 assert.equal(assetSha256('responsive.js',lf),assetSha256('responsive.js',crlf));
 assert.notEqual(assetSha256('responsive.js',lf),assetSha256('responsive.js',Buffer.from(lf.toString().replace('机构','篡改'))));
 assert.notEqual(assetSha256('responsive.js',lf),assetSha256('responsive.js',Buffer.from(lf.toString().replace('\rEND','END'))));
});

test('binary assets retain exact-byte integrity and all manifest hashes tolerate text checkout newlines',async()=>{
 const {assetSha256}=await import('../scripts/asset-integrity.mjs');
 assert.notEqual(assetSha256('font.ttf',Buffer.from([0,13,10,255])),assetSha256('font.ttf',Buffer.from([0,10,255])));
 assert.notEqual(assetSha256('image.png',Buffer.from([13,10])),assetSha256('image.png',Buffer.from([10])));
 const manifest=JSON.parse(await readFile(new URL('../assets/asset-manifest.json',import.meta.url),'utf8'));
 for(const asset of manifest){
  const bytes=await readFile(new URL('../public/'+asset.path,import.meta.url));
  assert.equal(assetSha256(asset.path,bytes),asset.sha256,asset.path);
  if(/\.(html|js|css|json)$/i.test(asset.path)){
   const crlf=Buffer.from(bytes.toString().replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
   assert.equal(assetSha256(asset.path,crlf),asset.sha256,asset.path+' with CRLF checkout');
  }
 }
});
