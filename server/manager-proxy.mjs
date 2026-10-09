const allowed=new Set(['/api/v1/dashboard/screening','/api/v1/dashboard/follow-up','/api/v1/copd/stats','/api/v1/screening/stats','/api/v1/highrisk/stats','/api/v1/monitoring/stats','/api/v1/monitoring/alerts/popup']);
export function createManagerProxy({baseUrl=process.env.MANAGER_BASE_URL,fetchImpl=fetch}={}) {
 return async (path,headers={})=>{
  const url=new URL(path,'http://local');
  const error=(status,msg)=>({status,body:{code:status,msg}});
  if(!allowed.has(url.pathname))return error(404,'接口不存在');
  for(const [key,value] of url.searchParams){
   if(!['orgId','year','minutes'].includes(key)||!/^\d{1,19}$/.test(value))return error(400,'筛选参数无效');
  }
  if(!headers.authorization?.startsWith('Bearer '))return error(401,'请先登录管理端');
  if(!baseUrl)return error(503,'尚未配置管理端接口地址');
  try {
   const base=new URL(baseUrl); if(!['http:','https:'].includes(base.protocol))throw Error('invalid scheme');
   const result=await fetchImpl(base.toString().replace(/\/$/,'')+url.pathname+url.search,{headers:{Authorization:headers.authorization,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(120000)});
   return {status:result.status,body:await result.json()};
  }catch{return error(503,'管理端统计暂不可用');}
 };
}
