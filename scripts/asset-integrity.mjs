import {createHash} from 'node:crypto';

const textAsset=/\.(html|js|mjs|css|json|svg|txt)$/i;
export function canonicalAssetBytes(path,bytes) {
 if(!textAsset.test(path)||!bytes.includes(13))return bytes;
 // Remove only CR in CRLF, preserving every other byte, including standalone CR and UTF-8.
 const normalized=Buffer.allocUnsafe(bytes.length);
 let length=0;
 for(let i=0;i<bytes.length;i++){
  if(bytes[i]===13&&bytes[i+1]===10)continue;
  normalized[length++]=bytes[i];
 }
 return normalized.subarray(0,length);
}
export function assetSha256(path,bytes) {
 return createHash('sha256').update(canonicalAssetBytes(path,bytes)).digest('hex');
}
