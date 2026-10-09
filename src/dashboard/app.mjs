import {formatNumber as fmt,escapeHtml as esc,rankRows,sum} from './model.mjs';
import {bars,ring,metric,statusText,table} from './components.mjs';
import {createMap} from './map.mjs';
import {dashboardUrl} from './paths.mjs';
import {createRefreshController,annualKeys,ordinaryKeys,monitoringKeys,allKeys} from './refresh.mjs';
import {createSectionRenderer} from './render.mjs';
import {createAuthSession} from './auth.mjs';
import {createAlertCarousel,renderAlertRecords} from './alert-carousel.mjs';
const mountedUrl=path=>dashboardUrl(path,document.baseURI);

const panel=(id,title,note,body,actions='')=>`<section class="panel" id="${id}"><header><h2>${title}</h2><small>${note}</small>${actions}</header><div class="panel-body">${body}</div><footer class="panel-state"></footer></section>`;
document.querySelector('#dashboard').innerHTML=`<header class="topbar"><div class="top-left"><a class="button" href="/cdmsmanager/">‹ 返回工作台</a><label>年度 <select id="year" aria-label="统计年度"></select></label></div><div class="brand"><h1>武汉经开区医防融合慢阻肺数智化健康管理平台</h1><p>CHRONIC RESPIRATORY DISEASE · INTELLIGENT PREVENTION & MANAGEMENT</p></div><div class="top-right"><select id="scope" aria-label="机构范围"><option value="">全部授权机构</option></select><time id="clock"></time><button id="fullscreen">全屏</button></div></header>
<div id="connection" class="connection" role="status">正在连接管理端 · 年度事件与当前状态分别统计</div>
<div id="auth-gate" class="auth-gate" hidden><section class="auth-card" aria-labelledby="auth-title"><h2 id="auth-title">管理端登录</h2><p id="auth-message" role="status"></p><a id="auth-login" class="button" href="/cdmsmanager/login" target="_blank" rel="noopener">登录管理端 ↗</a><button id="auth-retry" hidden>重试连接</button></section></div>
<main class="layout"><aside class="left-column">
${panel('population','患者性别与年龄分布','当前确诊在管','<div id="gender"></div><div id="age" class="age-bars"></div>')}
${panel('institutions','机构工作量排行','年度事件',`<nav class="tabs" id="rank-tabs"><button class="active" data-key="sqScreeningCount">COPD-SQ</button><button data-key="lungFuncExamCount">肺功能</button><button data-key="score16Count">≥16分</button></nav><div id="ranking"></div><p class="footnote">按事件人次排序 · 点击机构联动地图</p>`,'<button class="text-button" id="all-institutions">明细 ↗</button>')}
${panel('monitoring','穿戴设备与预警动态','实时状态','<div id="wearable" class="mini-grid"></div><div id="alert-carousel"><div class="subheading"><span>当前未处理告警</span></div><div id="alerts" role="list"></div><nav class="alert-controls" aria-label="当前告警轮播"><button id="alert-prev" aria-label="上一组告警">‹</button><span id="alert-page" aria-live="polite"></span><button id="alert-next" aria-label="下一组告警">›</button><button id="alert-pause" aria-pressed="false">暂停轮播</button></nav></div>')}
</aside><div class="center-column"><div id="metrics" class="metrics"></div>
${panel('geography','武汉经济技术开发区（汉南区）','机构分布',`<div class="map-top"><span id="map-scope">全部授权机构</span><span>真实边界 · 滚轮缩放 / 拖动平移</span></div><div id="map"></div><div class="map-bottom"><span><i></i> 基层机构</span><span><i class="hospital"></i> 医院</span></div>`,'<button class="text-button" id="reset-scope">查看全部</button>')}
${panel('insights','慢阻肺共病统计','当前确诊在管',`<div id="insight"></div><p id="insight-note" class="footnote"></p>`,'<button class="text-button" id="more-insights">更多 ↗</button>')}
</div><aside class="right-column">
${panel('overview','筛查与人群概况','年度 / 当前状态','<div id="overview-list"></div>')}
${panel('gold','肺功能GOLD分级','当前确诊在管','<div id="gold-bars"></div><p id="gold-note" class="footnote"></p>')}
${panel('risk','COPD-SQ问卷风险','当前确诊在管','<div id="risk-summary"></div><div class="subheading">综合评估分组</div><div id="abe-bars"></div><p class="footnote">问卷≥16分为高风险 · 综合评估保留历史C/D</p>')}
${panel('quality','档案质控情况','当前确诊在管','<div id="quality-ring"></div><p class="footnote">患者档案质控口径</p>')}
</aside></main><footer class="page-footer">数据来源：CDMS管理端 · 普通统计60秒更新 / 监测20秒更新 <a id="legacy-entry" hidden href="${mountedUrl('legacy.html')}">旧版兼容入口 ↗</a></footer>`;

const currentYear=new Date().getFullYear(),yearEl=document.querySelector('#year'),scopeEl=document.querySelector('#scope');
for(let year=currentYear;year>=2024;year--)yearEl.add(new Option(`${year}年`,year));
let metadata={},map,rankKey='sqScreeningCount',activeToken=null,detailSource=null;
const carousel=createAlertCarousel();
const auth=createAuthSession({storage:localStorage,refreshUrl:new URL('/cdmsmanagerapi/api/v1/auth/refresh',document.baseURI).href,onChange:applySession});
const endpoints={annual:'/dashboard/screening',followup:'/dashboard/follow-up',population:'/dashboard/population',highrisk:'/dashboard/high-risk',monitoring:'/monitoring/stats',alerts:'/dashboard/alerts'};
const refresh=createRefreshController({year:yearEl.value,token:activeToken,request:requestData,onChange:(key,event)=>{
 if(key==='alerts'){
  if(data.alerts&&!states.alerts?.loading)carousel.acceptPage(data.alerts);
  else if(!data.alerts&&event.dataChanged)carousel.reset();
  carousel.setFlags({authorized:!!activeToken,loading:!!states.alerts?.loading,hidden:document.hidden});renderAlertControls();
 }
 if(event.dataChanged&&detailSource===key)closeDetail();
 if(key==='annual'&&event.dataChanged&&data.annual&&!scopeEl.value)updateScopes(data.annual);
 if(event.dataChanged)render([key]);renderStatus(key);
}});
const {data,states}=refresh;
const state=key=>states[key]??{};
const names={annual:'年度筛查',followup:'年度随访',population:'在管人群',highrisk:'高危人群',monitoring:'监测',alerts:'预警'};
const panelSources={population:['population'],institutions:['annual'],monitoring:['monitoring','alerts'],overview:['annual','followup','highrisk','population'],gold:['population'],risk:['population'],quality:['population'],insights:['population'],geography:['annual']};
function renderStatus(key) {
 for(const [id,keys] of Object.entries(panelSources))if(!key||keys.includes(key)){
  const priority=k=>state(k).error?4:state(k).refreshFailed?3:state(k).stale?2:state(k).loading||state(k).refreshing?1:0;
  const selected=[...keys].sort((a,b)=>priority(b)-priority(a)||String(state(a).dataUpdatedAt??'').localeCompare(String(state(b).dataUpdatedAt??'')))[0];
  const footer=document.querySelector(`#${id} .panel-state`);
  footer.innerHTML=(keys.length>1?`${esc(names[selected])} · `:'')+statusText(state(selected));
  footer.title=keys.map(k=>`${names[k]}: ${statusText(state(k)).replace(/<[^>]*>/g,'')}`).join('\n');
 }
 const values=Object.values(states),errors=values.filter(s=>s.error||s.refreshFailed),stale=values.filter(s=>s.stale),updating=values.filter(s=>s.loading||s.refreshing);
 const times=values.map(s=>s.dataUpdatedAt).filter(Boolean).sort();
 const actualTime=times.length?` · 统计数据最早更新 ${new Date(times[0]).toLocaleString('zh-CN',{hour12:false})}`:'';
 const warnings=[errors.length?`${errors.length}个模块刷新失败`:null,stale.length?`${stale.length}个模块数据陈旧`:null,updating.length?`${updating.length}个模块刷新中`:null].filter(Boolean);
 document.querySelector('#connection').textContent=`管理端数据 · ${yearEl.value}年度事件 / 当前在管状态${actualTime}${warnings.length?' · '+warnings.join(' · '):''}${errors[0]?.error?' · '+errors[0].error:''}`;
 document.querySelector('#connection').classList.toggle('has-error',errors.length>0||stale.length>0);
 if(!key||key==='annual')renderMapStatus();
}
function renderMapStatus(){
 document.querySelector('#map-scope').textContent=scopeEl.selectedOptions[0]?.textContent??'全部授权机构';
}
const sections={};
const add=(id,depends,update)=>sections[id]={depends,render:update};
document.querySelector('#metrics').innerHTML=Array.from({length:6},(_,i)=>`<div id="metric-${i}" class="metric-slot"></div>`).join('');
const metricSources=[['annual'],['highrisk'],['population'],['followup'],['monitoring'],['monitoring','alerts']];
const metricContent=[()=>metric('COPD-SQ筛查',sum(data.annual,'sqScreeningCount'),'人次',`${yearEl.value}年度问卷事件`),()=>metric('高危人群',data.highrisk?.total,'人',`当前 · 待确诊 ${fmt(data.highrisk?.pending)} 人`,'blue'),()=>metric('确诊在管人群',data.population?.total,'人','当前活跃管理','purple'),()=>metric('随访记录',sum(data.followup,'visitCount'),'人次',`${yearEl.value}年度随访事件`,'green'),()=>metric('在管监测人数',data.monitoring?.managedPatientCount,'人','当前监测范围','blue'),()=>metric('当前预警患者',data.monitoring?.activeAlertPatientCount,'人',`活动预警 ${fmt(data.alerts?.total)} 条`,'pink')];
metricContent.forEach((content,i)=>add(`metric-${i}`,metricSources[i],()=>document.querySelector(`#metric-${i}`).innerHTML=content()));
add('population',['population'],()=>{
 const p=data.population;
 document.querySelector('#gender').innerHTML=ring(p?.genderDistribution,p?.total,'确诊在管');
 document.querySelector('#age').innerHTML=bars(p?.ageBuckets,p?.total);
 document.querySelector('#gold-bars').innerHTML=bars(p?.goldDistribution,p?.goldGradedTotal);
 document.querySelector('#gold-note').textContent=`占比分母：已分级 ${fmt(p?.goldGradedTotal)} 人 · 未分级 ${fmt(p?.goldUngraded)} 人`;
 document.querySelector('#risk-summary').innerHTML=bars(p?.riskDistribution,p?.total);
 document.querySelector('#abe-bars').innerHTML=bars(p?.abeDistribution,p?.total);
 document.querySelector('#quality-ring').innerHTML=ring(p?{'已通过':p.qualityPassed,'未通过 / 待质控':Math.max(0,p.total-p.qualityPassed)}:null,p?.total,'档案人数');
 renderInsight();
});
add('ranking',['annual','scope','rank'],()=>{
 const a=data.annual,ranks=a?rankRows(a,rankKey):null;
 document.querySelector('#ranking').innerHTML=ranks?.length?ranks.slice(0,8).map((r,i)=>`<button class="rank-row ${String(r.orgId)===scopeEl.value?'selected':''}" data-org="${esc(r.orgId)}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-label" title="${esc(r.orgName)}">${esc(metadata[String(r.orgId)]?.shortName??r.orgName)}</span><div class="rank-track"><i style="width:${r.share}%"></i></div><b>${fmt(r.value)}</b><small>${r.share.toFixed(1)}%</small></button>`).join(''):`<div class="empty">${a?'当前范围暂无机构数据':'等待管理端机构统计'}</div>`;
});
add('wearable',['monitoring'],()=>{
 const m=data.monitoring;
 document.querySelector('#wearable').innerHTML=[['在管监测',m?.managedPatientCount],['已绑定设备',m?.boundPatientCount],['当前预警',m?.activeAlertPatientCount],['设备离线',m?.offlinePatientCount]].map(([label,value])=>`<div><span>${label}</span><b><span class="mini-value">${fmt(value)}</span><small>人</small></b></div>`).join('');
});
add('alerts',['alerts'],()=>document.querySelector('#alerts').innerHTML=data.alerts?renderAlertRecords(data.alerts.records):'<div class="empty">等待管理端告警数据</div>');
document.querySelector('#overview-list').innerHTML=Array.from({length:7},(_,i)=>`<div id="overview-${i}" class="overview-row"></div>`).join('');
const overviewRows=[['COPD-SQ问卷','annual',()=>sum(data.annual,'sqScreeningCount'),'人次','年度'],['≥16分问卷','annual',()=>sum(data.annual,'score16Count'),'人次','年度'],['开展肺功能检查','annual',()=>sum(data.annual,'lungFuncExamCount'),'人次','年度'],['高危人群','highrisk',()=>data.highrisk?.total,'人','当前'],['待确诊','highrisk',()=>data.highrisk?.pending,'人','当前'],['确诊在管','population',()=>data.population?.total,'人','当前'],['随访记录','followup',()=>sum(data.followup,'visitCount'),'人次','年度']];
overviewRows.forEach(([label,key,value,unit,period],i)=>add(`overview-${i}`,[key],()=>document.querySelector(`#overview-${i}`).innerHTML=`<span><i></i>${label}<small>${period}</small></span><b>${fmt(value())}<small>${unit}</small></b>`));
add('map',['annual','scope'],()=>{renderMapStatus();map?.update(data.annual??[],scopeEl.value);});
const render=createSectionRenderer(sections);
function renderAlertControls(){
 const value=carousel.snapshot();
 document.querySelector('#alert-page').textContent=value.pages?`${value.current}/${value.pages}页 · 共${fmt(value.total)}条${value.loading?' · 加载中':''}`:value.loading?'加载中':'0条';
 document.querySelector('#alert-prev').disabled=!value.canTurn;document.querySelector('#alert-next').disabled=!value.canTurn;
 const pause=document.querySelector('#alert-pause');pause.disabled=!activeToken||!value.total;pause.textContent=value.userPaused?'继续轮播':'暂停轮播';pause.setAttribute('aria-pressed',String(value.userPaused));
}
function changeAlertPage(page){
 if(page==null||syncToken()||!activeToken)return;
 refresh.setContext({alertPage:page});refresh.load('alerts');renderAlertControls();
}
const alertArea=document.querySelector('#alert-carousel');
alertArea.addEventListener('pointerenter',()=>carousel.setFlags({hover:true}));
alertArea.addEventListener('pointerleave',()=>carousel.setFlags({hover:false}));
alertArea.addEventListener('focusin',()=>carousel.setFlags({focus:true}));
alertArea.addEventListener('focusout',event=>{if(!alertArea.contains(event.relatedTarget))carousel.setFlags({focus:false});});
document.querySelector('#alert-prev').onclick=()=>changeAlertPage(carousel.previous());
document.querySelector('#alert-next').onclick=()=>changeAlertPage(carousel.next());
document.querySelector('#alert-pause').onclick=()=>{carousel.togglePause();renderAlertControls();};
function renderInsight() {
 const p=data.population,el=document.querySelector('#insight'),note=document.querySelector('#insight-note');
 const all=Object.entries(p?.comorbidities??{}).sort((a,b)=>b[1]-a[1]).slice(0,10);
 const totalMax=Math.max(1,...all.map(([,n])=>Number(n)));
 // A shared maximum is retained across both columns, including when rank 6 is much smaller.
 el.innerHTML=p?`<div class="comorbidity-grid">${[all.slice(0,5),all.slice(5)].map(items=>`<div>${items.map(([name,value])=>`<div class="bar-row"><span title="${esc(name)}">${esc(name)}</span><div class="track"><i style="width:${value/totalMax*100}%"></i></div><b>${fmt(value)}</b><small>${p.total?(value/p.total*100).toFixed(1):'0.0'}%</small></div>`).join('')}</div>`).join('')}</div>`:'<div class="empty">等待管理端合并症统计</div>';
 if(p&&!all.length)el.innerHTML='<div class="empty">当前人群暂无合并症记录</div>';
 note.textContent=`前10项 · 分母为当前确诊在管 ${fmt(p?.total)} 人 · 一人可有多种合并症`;
}
async function requestData(key,context,signal) {
 try {
 const params=new URLSearchParams();if(context.orgId)params.set('orgId',context.orgId);
 if(annualKeys.includes(key))params.set('year',context.year);
 if(key==='alerts'){params.set('page',String(context.alertPage));params.set('size','3');}
 const response=await fetch(mountedUrl(`manager-api/api/v1${endpoints[key]}?${params}`),{headers:context.token?{Authorization:`Bearer ${context.token}`}:{},signal});
 let result;
 try{
  result=await response.json();
 }catch{
  const error=Error(response.status===401?'请先从管理端登录':response.status===403?'当前账号无此模块权限':'统计响应不可用');error.status=response.status;throw error;
 }
  if(!response.ok||![0,200,'200','0'].includes(result.code)){
   const status=response.ok?Number(result.code):response.status;
   const error=Error(status===401?'请先从管理端登录':status===403?'当前账号无此模块权限':result.message??result.msg??'统计请求失败');
   error.status=status;throw error;
  }
 auth.accept(context.token);
 return {data:result.data,meta:result.meta};
 }catch(error){
  if(error.status===401)await auth.recover(context.token);
  throw error;
 }finally{
  // Same-document localStorage writes do not emit storage events. Invalidate before accepting
  // a response if login changed while the request was in flight, even before the next clock tick.
  syncToken();
 }
}
function updateScopes(rows) {
 const selected=scopeEl.value;scopeEl.replaceChildren(new Option('全部授权机构',''));
 for(const row of rows??[])scopeEl.add(new Option(row.orgName??metadata[String(row.orgId)]?.name??String(row.orgId),String(row.orgId)));
 scopeEl.value=selected;
}
function refreshScope() {
 if(syncToken()||!activeToken)return;
 closeDetail();
 const keys=refresh.setContext({orgId:scopeEl.value,year:yearEl.value});
 render(['scope']);for(const key of keys)refresh.load(key);
}
function applySession({token,status}){
 document.querySelector('#auth-gate').hidden=status==='ready';
 document.querySelector('#auth-title').textContent=status==='refreshing'?'正在恢复登录':status==='unavailable'?'暂时无法连接管理端':'请先登录管理端';
 document.querySelector('#auth-message').textContent=status==='refreshing'?'正在验证管理端登录状态，请稍候。':status==='unavailable'?'登录验证未完成，请检查网络后重试，或重新登录管理端。':'当前网址尚未登录或登录已失效。请在新标签页完成管理端登录，再回到此页，数据将自动加载。';
 document.querySelector('#auth-login').hidden=status==='refreshing';
 document.querySelector('#auth-retry').hidden=status!=='unavailable';
 if(token===activeToken)return;activeToken=token;
 scopeEl.replaceChildren(new Option('全部授权机构',''));closeDetail();
 refresh.setContext({token,orgId:'',year:yearEl.value});render(['scope']);if(token)for(const key of allKeys)refresh.load(key);
}
function syncToken(){const before=activeToken;auth.sync();return before!==activeToken;}
function poll(keys){if(syncToken()||!activeToken||document.hidden)return;for(const key of keys)refresh.load(key);}
function selectOrg(id) {if([...scopeEl.options].some(o=>o.value===String(id))){scopeEl.value=String(id);refreshScope();}}
document.addEventListener('click',e=>{const node=e.target.closest('[data-org]');if(node){selectOrg(node.dataset.org);closeDetail();}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('tr[data-org]'))selectOrg(e.target.dataset.org);});
yearEl.onchange=()=>{if(syncToken()||!activeToken)return;closeDetail();for(const key of refresh.setContext({year:yearEl.value}))refresh.load(key);};
scopeEl.onchange=refreshScope;document.querySelector('#reset-scope').onclick=()=>{scopeEl.value='';refreshScope();};
window.addEventListener('storage',event=>{if(event.key==='token'||event.key==='refreshToken'||event.key===null)syncToken();});
document.querySelector('#auth-retry').onclick=()=>auth.retry();
window.addEventListener('focus',()=>{syncToken();refresh.checkFreshness();});
document.addEventListener('visibilitychange',()=>{carousel.setFlags({hidden:document.hidden});renderAlertControls();refresh.checkFreshness();if(!document.hidden)poll(allKeys);});
document.querySelector('#rank-tabs').onclick=e=>{if(!e.target.dataset.key)return;rankKey=e.target.dataset.key;document.querySelectorAll('#rank-tabs button').forEach(b=>b.classList.toggle('active',b===e.target));render(['rank']);};
function closeDetail(){detailSource=null;document.querySelector('#detail').close();document.querySelector('#detail-body').replaceChildren();}
const showDetail=(title,body,source)=>{detailSource=source;document.querySelector('#detail-title').textContent=title;document.querySelector('#detail-body').innerHTML=body;document.querySelector('#detail').showModal();};
document.querySelector('#all-institutions').onclick=()=>showDetail(`${yearEl.value}年度机构工作量明细`,table(data.annual,metadata),'annual');
document.querySelector('#more-insights').onclick=()=>showDetail('慢阻肺共病统计（患者内去重）',bars(data.population?.comorbidities,data.population?.total),'population');
document.querySelector('#close-detail').onclick=closeDetail;
document.querySelector('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.querySelector('#connection').textContent='浏览器未允许全屏，请使用F11';}};
document.addEventListener('fullscreenchange',()=>document.querySelector('#fullscreen').textContent=document.fullscreenElement?'退出全屏':'全屏');
const clock=()=>{document.querySelector('#clock').textContent=new Date().toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});syncToken();refresh.checkFreshness();carousel.setFlags({hidden:document.hidden});changeAlertPage(carousel.tick());};clock();setInterval(clock,1000);
render(allKeys);renderStatus();poll(allKeys);
setInterval(()=>poll(ordinaryKeys),60000);
setInterval(()=>poll(monitoringKeys),20000);
// Collect completed background refreshes promptly instead of waiting a full minute.
setInterval(()=>{if(!syncToken()&&activeToken&&!document.hidden)void refresh.pollRefreshing();},3000);
// Statistics do not depend on navigation configuration or map downloads.
void (async()=>{
 try {const config=await fetch(mountedUrl('api/dashboard-config')).then(r=>r.json());if(/^https?:\/\//.test(config.managerUiUrl)||/^\/(?!\/)/.test(config.managerUiUrl))document.querySelector('.top-left a').href=config.managerUiUrl;document.querySelector('#legacy-entry').hidden=config.legacyAvailable!==true;}catch{}
})();
void (async()=>{
 try {const [geo,config,streets]=await Promise.all([fetch(mountedUrl('map/whkfq.json')).then(r=>r.json()),fetch(mountedUrl('api/map-config')).then(r=>r.json()),fetch(mountedUrl('map/streets.json')).then(r=>r.json())]);metadata=config;map=createMap(document.querySelector('#map'),geo,metadata,selectOrg,streets,(name,rows)=>showDetail(`${name} · 机构看板`,data.annual?table(rows,metadata)+'<p class="footnote">机构按保留坐标匹配街道边界；本范围内无坐标的机构不纳入街道看板。</p>':'<div class="empty">管理端机构统计尚未连接</div>','annual'));render(['scope']);}catch{document.querySelector('#map').innerHTML='<div class="empty">地图资源暂不可用</div>';}
})();
