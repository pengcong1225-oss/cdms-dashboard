// Hover-only requests: no startup fan-out and no changes to dashboard filter state.
export function createInstitutionStats({request,now=Date.now,ttlMs=60000,timeoutMs=10000}) {
 const cache=new Map();let generation=0;
 async function get(key,orgId,token){
  const id=JSON.stringify([token,orgId,key]),existing=cache.get(id);
  if(existing?.promise)return existing.promise;
  if(existing&&existing.expiresAt>now())return existing.value;
  const version=generation,controller=new AbortController(),entry={controller};
  cache.set(id,entry);
  entry.timer=setTimeout(()=>controller.abort(),timeoutMs);
  entry.promise=(async()=>{
   try{
    const result=await request(key,{orgId,token},controller.signal);
    const raw=result?.data?.total,value=raw==null||raw===''?null:Number(raw);
    if(version!==generation||controller.signal.aborted||!Number.isSafeInteger(value)||value<0)return null;
    const receivedAt=now(),sourceExpiry=Date.parse(result?.meta?.staleUntil);
    const expiresAt=Math.min(receivedAt+Math.min(ttlMs,result?.meta?.refreshing?3000:ttlMs),Number.isFinite(sourceExpiry)?sourceExpiry:Infinity);
    if(expiresAt<=receivedAt)return null;
    entry.value=value;entry.expiresAt=expiresAt;return value;
   }catch{return null;}
   finally{
    clearTimeout(entry.timer);entry.promise=null;
    if(entry.value==null&&cache.get(id)===entry)cache.delete(id);
   }
  })();
  return entry.promise;
 }
 async function load(orgId,token){
  if(!orgId||!token)return {highRisk:null,managed:null,expiresAt:null};
  const [highRisk,managed]=await Promise.all([get('highrisk',String(orgId),token),get('population',String(orgId),token)]);
  const expiries=[['highrisk',highRisk],['population',managed]].filter(([,value])=>value!=null).map(([key])=>cache.get(JSON.stringify([token,String(orgId),key]))?.expiresAt).filter(Number.isFinite);
  return {highRisk,managed,expiresAt:expiries.length?Math.min(...expiries):null};
 }
 function reset(){generation++;for(const entry of cache.values()){clearTimeout(entry.timer);entry.controller.abort();}cache.clear();}
 return {load,reset};
}
