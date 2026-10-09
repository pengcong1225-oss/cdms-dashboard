const clean=value=>typeof value==='string'&&value.trim()&&!['null','undefined'].includes(value.trim())?value:null;
// This is only an expiry hint. The server still verifies signatures and permissions.
function expired(token,now) {
 try{return Number(JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp)*1000<=now();}
 catch{return false;}
}

export function createAuthSession({storage,refreshUrl,fetcher=fetch,now=Date.now,onChange=()=>{}}) {
 let snapshot=null,status=null,pending=null,generation=0,renewed=false;
 const read=()=>({token:clean(storage.getItem('token')),refresh:clean(storage.getItem('refreshToken'))});
 const same=(a,b)=>a?.token===b?.token&&a?.refresh===b?.refresh;
 const token=()=>status==='ready'?snapshot.token:null;
 function publish(next){status=next;onChange({status,token:token()});}
 function requireLogin(){
  storage.removeItem('token');storage.removeItem('refreshToken');storage.removeItem('userInfo');
  snapshot=read();publish('required');
 }
 function sync(){
  const current=read();
  if(!same(snapshot,current)){
   generation++;snapshot=current;pending=null;renewed=false;
   if(current.token&&!expired(current.token,now))publish('ready');
   else if(current.refresh)void renew();
   else if(current.token)requireLogin();
   else publish('required');
  }else if(status==='ready'&&expired(current.token,now))void renew();
 }
 function renew(){
  if(pending)return pending;
  if(!snapshot.refresh||renewed){requireLogin();return Promise.resolve();}
  const started={...snapshot},version=generation;renewed=true;
  // Publish first so the dashboard aborts/clears all statistics from the old session.
  publish('refreshing');
  const stillCurrent=()=>version===generation&&same(started,read());
  const work=(async()=>{
   try{
    const response=await fetcher(refreshUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:started.refresh}),redirect:'error',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
    const body=await response.json().catch(()=>null);
    if(!stillCurrent()){sync();return;}
    if([400,401,403].includes(response.status)||[400,401,403].includes(Number(body?.code))){requireLogin();return;}
    const access=clean(body?.data?.token),refresh=clean(body?.data?.refreshToken);
    if(!response.ok||Number(body?.code)!==200||!access||!refresh||expired(access,now)){publish('unavailable');return;}
    storage.setItem('token',access);storage.setItem('refreshToken',refresh);snapshot=read();publish('ready');
   }catch{
    if(!stillCurrent()){sync();return;}
    publish('unavailable');
   }
  })();
  pending=work;
  void work.finally(()=>{if(pending===work)pending=null;});
  return work;
 }
 function recover(rejectedToken){sync();if(snapshot.token!==rejectedToken)return Promise.resolve();if(status==='refreshing')return pending;if(status==='ready')return renew();return Promise.resolve();}
 function retry(){sync();if(status==='unavailable'){renewed=false;void renew();}}
 function accept(acceptedToken){if(token()===acceptedToken)renewed=false;}
 return {sync,recover,retry,accept,get token(){return token();},get status(){return status;}};
}
