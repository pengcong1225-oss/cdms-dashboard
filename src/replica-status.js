(() => {
 const badge=document.createElement('a');
 badge.href=new URL('status.html',document.baseURI).href;badge.target='_blank';badge.rel='noopener';
 badge.style.cssText='position:fixed;bottom:3px;right:10px;z-index:9999;font:10px sans-serif;color:#85a8c5;text-decoration:none;opacity:.8';
 badge.textContent='数据状态';badge.title='查看数据来源与接入状态';document.body.appendChild(badge);
 fetch(new URL('api/health',document.baseURI)).then(r=>r.json()).then(data=>{
  if(data.mode==='manager'){
   badge.textContent=data.managerConfigured?'CDMS管理端统计':'管理端地址未配置';
   badge.style.color=data.managerConfigured?'#85a8c5':'#ffbd75';
   badge.title='通过用户登录权限获取管理端统计，不加载历史快照；接口状态和更新时间以大屏各模块提示为准';
  }else if(data.mode==='db'){
   badge.textContent=data.databaseConnected?'新库实时统计':'新库连接失败';badge.style.color=data.databaseConnected?'#78e2c4':'#ff8a80';badge.title=data.databaseConnected?'数据来自 cdms_followup；最近成功查询：'+(data.lastSuccessAt||'尚未查询'):'cdms_followup 当前不可用；点击查看详情';
  }else{badge.textContent='原站数据快照';badge.title='原站聚合数据采集于 '+new Date(data.capturedAt).toLocaleString('zh-CN')+'；点击查看详情';}
 }).catch(()=>{badge.textContent='数据服务不可用';badge.style.color='#ff8a80';});
 const open=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(...args){
  this.addEventListener('load',()=>{if(String(args[1]).includes('/screen/v2/')&&this.status>=400){badge.textContent='部分数据加载失败 · 点击查看';badge.style.color='#ffbd75';}});
  return open.apply(this,args);
 };
})();
