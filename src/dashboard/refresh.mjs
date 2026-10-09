export const annualKeys=['annual','followup'];
export const ordinaryKeys=[...annualKeys,'population','highrisk'];
export const monitoringKeys=['monitoring','alerts'];
export const allKeys=[...ordinaryKeys,...monitoringKeys];
const timestamp=value=>value&&Number.isFinite(Date.parse(value))?String(value):null;

// Each module owns its epoch: changing the year must not invalidate current-state requests.
export function createRefreshController({request,onChange=()=>{},now=Date.now,year,orgId='',token=null}) {
 const data={},states={},pending=new Map(),epochs=new Map();
 let context={year:String(year),orgId:String(orgId),token};
 const notify=(key,dataChanged=false)=>onChange(key,{dataChanged});
 function clear(key) {
  epochs.set(key,(epochs.get(key)??0)+1);pending.get(key)?.controller.abort();pending.delete(key);
  delete data[key];delete states[key];notify(key,true);
 }
 function setContext(next) {
  const updated={...context,...next};updated.year=String(updated.year);updated.orgId=String(updated.orgId??'');
  const keys=updated.token!==context.token||updated.orgId!==context.orgId?allKeys:updated.year!==context.year?annualKeys:[];
  context=updated;for(const key of keys)clear(key);return [...keys];
 }
 function checkFreshness() {
  for(const [key,state] of Object.entries(states)) {
   let changed=false;
   if(state.freshUntil&&now()>=Date.parse(state.freshUntil)&&!state.stale){state.stale=true;changed=true;}
   if(state.staleUntil&&now()>=Date.parse(state.staleUntil)&&key in data){delete data[key];state.error='缓存数据已过期，等待重新统计';state.stale=true;notify(key,true);}
   else if(changed)notify(key);
  }
 }
 function load(key) {
  if(pending.has(key))return pending.get(key).promise;
  const controller=new AbortController(),epoch=epochs.get(key)??0,snapshot={...context};
  const valid=()=>epoch===(epochs.get(key)??0);
  states[key]??={error:null,dataUpdatedAt:null,receivedAt:null};states[key].loading=true;notify(key);
  const entry={controller,promise:null};pending.set(key,entry);
  // Install the entry before invoking request, while preserving synchronous request dispatch.
  let response;
  try{response=request(key,snapshot,controller.signal);}catch(error){response=Promise.reject(error);}
  entry.promise=Promise.resolve(response).then(result=>{
   if(!valid())return;
   const changed=JSON.stringify(data[key])!==JSON.stringify(result.data);
   data[key]=result.data;
   const meta=result.meta??{};
   states[key]={error:null,loading:false,dataUpdatedAt:timestamp(meta.dataUpdatedAt),receivedAt:new Date(now()).toISOString(),freshUntil:timestamp(meta.freshUntil),staleUntil:timestamp(meta.staleUntil),stale:meta.stale===true,refreshing:meta.refreshing===true,refreshFailed:meta.refreshFailed===true};
   if(states[key].freshUntil&&now()>=Date.parse(states[key].freshUntil))states[key].stale=true;
   if(states[key].staleUntil&&now()>=Date.parse(states[key].staleUntil)){delete data[key];states[key].error='缓存数据已过期，等待重新统计';notify(key,true);}
   else notify(key,changed);
  }).catch(error=>{
   if(!valid()||error.name==='AbortError')return;
   let cleared=false;
   if([401,403].includes(error.status)){cleared=key in data;delete data[key];states[key]={dataUpdatedAt:null,receivedAt:null};}
   const state=states[key];state.error=error.message;state.loading=false;state.refreshing=false;state.refreshFailed=true;
   notify(key,cleared);checkFreshness();
  }).finally(()=>{
   if(pending.get(key)===entry)pending.delete(key);
  });
  return entry.promise;
 }
 return {data,states,load,setContext,checkFreshness};
}
