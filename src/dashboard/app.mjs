import {formatNumber as fmt,escapeHtml as esc,rankRows,sum} from './model.mjs';
import {bars,ring,metric,statusText,table} from './components.mjs';
import {createMap} from './map.mjs';
import {dashboardUrl} from './paths.mjs';
const mountedUrl=path=>dashboardUrl(path,document.baseURI);

const panel=(id,title,note,body,actions='')=>`<section class="panel" id="${id}"><header><h2>${title}</h2><small>${note}</small>${actions}</header><div class="panel-body">${body}</div><footer class="panel-state"></footer></section>`;
document.querySelector('#dashboard').innerHTML=`<header class="topbar"><div class="top-left"><a class="button" href="/cdmsmanager/">‹ 返回工作台</a><label>年度 <select id="year" aria-label="统计年度"></select></label></div><div class="brand"><h1>武汉经开区慢性呼吸疾病智慧医防管理平台</h1><p>CHRONIC RESPIRATORY DISEASE · INTELLIGENT PREVENTION & MANAGEMENT</p></div><div class="top-right"><select id="scope" aria-label="机构范围"><option value="">全部授权机构</option></select><time id="clock"></time><button id="fullscreen">全屏</button></div></header>
<div id="connection" class="connection" role="status">正在连接管理端 · 年度事件与当前状态分别统计</div>
<main class="layout"><aside class="left-column">
${panel('population','患者性别与年龄分布','当前确诊在管','<div id="gender"></div><div id="age" class="age-bars"></div>')}
${panel('institutions','机构工作量排行','年度事件',`<nav class="tabs" id="rank-tabs"><button class="active" data-key="sqScreeningCount">COPD-SQ</button><button data-key="lungFuncExamCount">肺功能</button><button data-key="score16Count">≥16分</button></nav><div id="ranking"></div><p class="footnote">按事件人次排序 · 点击机构联动地图</p>`,'<button class="text-button" id="all-institutions">明细 ↗</button>')}
${panel('monitoring','穿戴设备与预警动态','实时状态','<div id="wearable" class="mini-grid"></div><div class="subheading"><span>近60分钟新发活动预警</span><small>姓名脱敏</small></div><div id="alerts"></div>')}
</aside><div class="center-column"><div id="metrics" class="metrics"></div>
${panel('geography','武汉经济技术开发区（汉南区）','机构分布',`<div class="map-top"><span id="map-scope">全部授权机构</span><span>真实边界 · 滚轮缩放 / 拖动平移</span></div><div id="map"></div><div class="map-bottom"><span><i></i> 基层机构</span><span><i class="hospital"></i> 医院</span><span id="map-status"></span></div>`,'<button class="text-button" id="reset-scope">查看全部</button>')}
${panel('insights','人群特征与管理','当前确诊在管',`<div class="subheading">慢阻肺共病升级</div><div id="insight"></div><p id="insight-note" class="footnote"></p>`,'<button class="text-button" id="more-insights">更多 ↗</button>')}
</div><aside class="right-column">
${panel('overview','筛查与人群概况','年度 / 当前状态','<div id="overview-list"></div>')}
${panel('gold','肺功能GOLD分级','当前确诊在管','<div id="gold-bars"></div><p id="gold-note" class="footnote"></p>')}
${panel('risk','COPD-SQ问卷风险','当前确诊在管','<div id="risk-summary"></div><div class="subheading">综合评估分组</div><div id="abe-bars"></div><p class="footnote">问卷≥16分为高风险 · 综合评估保留历史C/D</p>')}
${panel('quality','档案质控情况','当前确诊在管','<div id="quality-ring"></div><p class="footnote">患者档案质控口径</p>')}
</aside></main><footer class="page-footer">数据来源：CDMS管理端 · 普通统计60秒更新 / 监测20秒更新 <a id="legacy-entry" hidden href="${mountedUrl('legacy.html')}">旧版兼容入口 ↗</a></footer>`;

const currentYear=new Date().getFullYear(),yearEl=document.querySelector('#year'),scopeEl=document.querySelector('#scope');
for(let year=currentYear;year>=2024;year--)yearEl.add(new Option(`${year}年`,year));
let metadata={},map,rankKey='sqScreeningCount',generation=0;
const data={},states={},controllers=new Set(),pending=new Map();
const endpoints={annual:'/dashboard/screening',followup:'/dashboard/follow-up',population:'/copd/stats',highrisk:'/highrisk/stats',monitoring:'/monitoring/stats',alerts:'/monitoring/alerts/popup'};
const state=key=>states[key]??={error:null,updated:null};
const panelState=(id,key)=>document.querySelector(`#${id} .panel-state`).innerHTML=statusText(state(key));
const localTime=()=>new Date().toLocaleTimeString('zh-CN',{hour12:false});

function render() {
 const p=data.population,m=data.monitoring,a=data.annual,f=data.followup;
 document.querySelector('#metrics').innerHTML=[
  metric('COPD-SQ筛查',sum(a,'sqScreeningCount'),'人次',`${yearEl.value}年度问卷事件`),
  metric('高危人群',data.highrisk?.total,'人',`当前 · 待确诊 ${fmt(data.highrisk?.pending)} 人`,'blue'),
  metric('确诊在管人群',p?.total,'人','当前活跃管理','purple'),
  metric('随访记录',sum(f,'visitCount'),'人次',`${yearEl.value}年度随访事件`,'green'),
  metric('在管监测人数',m?.managedPatientCount,'人','当前监测范围','blue'),
  metric('当前预警患者',m?.activeAlertPatientCount,'人',`活动预警 ${fmt(data.alerts?.remainingCount)} 条`,'pink')
 ].join('');
 document.querySelector('#gender').innerHTML=ring(p?.genderDistribution,p?.total,'确诊在管');
 document.querySelector('#age').innerHTML=bars(p?.ageBuckets,p?.total);
 const ranks=a?rankRows(a,rankKey):null;
 document.querySelector('#ranking').innerHTML=ranks?.length?ranks.slice(0,8).map((r,i)=>`<button class="rank-row ${String(r.orgId)===scopeEl.value?'selected':''}" data-org="${esc(r.orgId)}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-label" title="${esc(r.orgName)}">${esc(metadata[r.orgId]?.shortName??r.orgName)}</span><div class="rank-track"><i style="width:${r.share}%"></i></div><b>${fmt(r.value)}</b><small>${r.share.toFixed(1)}%</small></button>`).join(''):`<div class="empty">${a?'当前范围暂无机构数据':'等待管理端机构统计'}</div>`;
 document.querySelector('#wearable').innerHTML=[['在管监测',m?.managedPatientCount],['已绑定设备',m?.boundPatientCount],['当前预警',m?.activeAlertPatientCount],['设备离线',m?.offlinePatientCount]].map(([label,value])=>`<div><span>${label}</span><b>${fmt(value)}<small>人</small></b></div>`).join('');
 document.querySelector('#alerts').innerHTML=data.alerts?.alerts?.length?data.alerts.alerts.slice(0,6).map(r=>`<div class="alert-row"><i class="${r.level===2?'critical':''}"></i><b>${esc(maskName(r.patientName))}</b><span>${esc(r.alertType==='SPO2'?'血氧':'心率')} ${fmt(r.alertValue)}${esc(r.alertUnit)}</span><time>${esc(String(r.occurredAt??'').replace('T',' ').slice(5,16))}</time></div>`).join(''):`<div class="empty">${data.alerts?'近60分钟暂无新发活动预警':'等待管理端监测数据'}</div>`;
 document.querySelector('#overview-list').innerHTML=[['COPD-SQ问卷',sum(a,'sqScreeningCount'),'人次','年度'],['≥16分问卷',sum(a,'score16Count'),'人次','年度'],['开展肺功能检查',sum(a,'lungFuncExamCount'),'人次','年度'],['高危人群',data.highrisk?.total,'人','当前'],['待确诊',data.highrisk?.pending,'人','当前'],['确诊在管',p?.total,'人','当前'],['随访记录',sum(f,'visitCount'),'人次','年度']].map(([label,value,unit,period])=>`<div class="overview-row"><span><i></i>${label}<small>${period}</small></span><b>${fmt(value)}<small>${unit}</small></b></div>`).join('');
 document.querySelector('#gold-bars').innerHTML=bars(p?.goldDistribution,p?.goldGradedTotal);
 document.querySelector('#gold-note').textContent=`占比分母：已分级 ${fmt(p?.goldGradedTotal)} 人 · 未分级 ${fmt(p?.goldUngraded)} 人`;
 document.querySelector('#risk-summary').innerHTML=bars(p?.riskDistribution,p?.total);
 document.querySelector('#abe-bars').innerHTML=bars(p?.abeDistribution,p?.total);
 document.querySelector('#quality-ring').innerHTML=ring(p?{'已通过':p.qualityPassed,'未通过 / 待质控':Math.max(0,p.total-p.qualityPassed)}:null,p?.total,'档案人数');
 renderInsight();
 for(const [id,key] of [['population','population'],['institutions','annual'],['monitoring','monitoring'],['overview','annual'],['gold','population'],['risk','population'],['quality','population'],['insights','population']])panelState(id,key);
 const errors=Object.values(states).filter(s=>s.error);
 document.querySelector('#connection').textContent=errors.length?`${errors.length}个数据模块暂不可用 · ${errors[0].error}${Object.values(states).some(s=>s.updated)?' · 保留本范围上次成功数据':' · 暂无可展示的统计数据'}`:`管理端数据 · ${yearEl.value}年度事件 / 当前在管状态 · ${localTime()}`;
 document.querySelector('#connection').classList.toggle('has-error',errors.length>0);
 const selectedLabel=scopeEl.selectedOptions[0]?.textContent??'全部授权机构';
 document.querySelector('#map-scope').textContent=selectedLabel;
 const mapped=a?.filter(row=>metadata[String(row.orgId)]).length??0;
 document.querySelector('#map-status').textContent=a?`${mapped}/${a.length}家已定位${mapped<a.length?' · '+(a.length-mapped)+'家缺少坐标':''} · ${state('annual').updated??'—'}`:'机构统计尚未连接';
 map?.update(a??[],scopeEl.value);
}
function maskName(name) {const n=String(name??'匿名');if(n.includes('*'))return n;return n.length>1?n[0]+'**':'*';}
function renderInsight() {
 const p=data.population,el=document.querySelector('#insight'),note=document.querySelector('#insight-note');
 const all=Object.entries(p?.comorbidities??{}).sort((a,b)=>b[1]-a[1]).slice(0,10);
 const totalMax=Math.max(1,...all.map(([,n])=>Number(n)));
 // A shared maximum is retained across both columns, including when rank 6 is much smaller.
 el.innerHTML=p?`<div class="comorbidity-grid">${[all.slice(0,5),all.slice(5)].map(items=>`<div>${items.map(([name,value])=>`<div class="bar-row"><span title="${esc(name)}">${esc(name)}</span><div class="track"><i style="width:${value/totalMax*100}%"></i></div><b>${fmt(value)}</b><small>${p.total?(value/p.total*100).toFixed(1):'0.0'}%</small></div>`).join('')}</div>`).join('')}</div>`:'<div class="empty">等待管理端合并症统计</div>';
 if(p&&!all.length)el.innerHTML='<div class="empty">当前人群暂无合并症记录</div>';
 note.textContent=`前10项 · 分母为当前确诊在管 ${fmt(p?.total)} 人 · 一人可有多种合并症`;
}
async function load(key,epoch=generation) {
 if(pending.get(key)?.epoch===epoch)return;
 const controller=new AbortController();controllers.add(controller);
 pending.set(key,{epoch,controller});
 const params=new URLSearchParams();if(scopeEl.value)params.set('orgId',scopeEl.value);
 if(['annual','followup'].includes(key))params.set('year',yearEl.value);
 if(key==='alerts')params.set('minutes','60');
 const token=localStorage.getItem('token');
 try {
  const response=await fetch(mountedUrl(`manager-api/api/v1${endpoints[key]}?${params}`),{headers:token?{Authorization:`Bearer ${token}`}:{},signal:controller.signal});
  const result=await response.json();
  if(!response.ok||![0,200,'200','0'].includes(result.code)){
   const status=Number(result.code)||response.status;
   const error=Error(status===401?'请先从管理端登录':status===403?'当前账号无此模块权限':result.message??result.msg??'统计请求失败');
   error.status=status;throw error;
  }
  if(epoch!==generation)return;
  data[key]=result.data;states[key]={error:null,updated:localTime()};
  if(key==='annual'&&!scopeEl.value)updateScopes(result.data);
 }catch(error){if(error.name==='AbortError'||epoch!==generation)return;if([401,403].includes(error.status)){delete data[key];state(key).updated=null;}state(key).error=error.message;}
 finally {controllers.delete(controller);if(pending.get(key)?.controller===controller)pending.delete(key);if(epoch===generation)render();}
}
function updateScopes(rows) {
 const selected=scopeEl.value;scopeEl.replaceChildren(new Option('全部授权机构',''));
 for(const row of rows??[])scopeEl.add(new Option(row.orgName??metadata[String(row.orgId)]?.name??String(row.orgId),String(row.orgId)));
 scopeEl.value=selected;
}
function refreshScope() {
 generation++;for(const controller of controllers)controller.abort();controllers.clear();
 pending.clear();
 for(const key of Object.keys(data))delete data[key];for(const key of Object.keys(states))delete states[key];
 render();for(const key of Object.keys(endpoints))load(key);
}
function selectOrg(id) {if([...scopeEl.options].some(o=>o.value===String(id))){scopeEl.value=String(id);refreshScope();}}
document.addEventListener('click',e=>{const node=e.target.closest('[data-org]');if(node){selectOrg(node.dataset.org);document.querySelector('#detail').close();}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('tr[data-org]'))selectOrg(e.target.dataset.org);});
yearEl.onchange=refreshScope;scopeEl.onchange=refreshScope;document.querySelector('#reset-scope').onclick=()=>{scopeEl.value='';refreshScope();};
window.addEventListener('storage',event=>{if(event.key==='token'){scopeEl.replaceChildren(new Option('全部授权机构',''));refreshScope();}});
document.querySelector('#rank-tabs').onclick=e=>{if(!e.target.dataset.key)return;rankKey=e.target.dataset.key;document.querySelectorAll('#rank-tabs button').forEach(b=>b.classList.toggle('active',b===e.target));render();};
const showDetail=(title,body)=>{document.querySelector('#detail-title').textContent=title;document.querySelector('#detail-body').innerHTML=body;document.querySelector('#detail').showModal();};
document.querySelector('#all-institutions').onclick=()=>showDetail(`${yearEl.value}年度机构工作量明细`,table(data.annual,metadata));
document.querySelector('#more-insights').onclick=()=>showDetail('慢阻肺共病升级（患者内去重）',bars(data.population?.comorbidities,data.population?.total));
document.querySelector('#close-detail').onclick=()=>document.querySelector('#detail').close();
document.querySelector('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.querySelector('#connection').textContent='浏览器未允许全屏，请使用F11';}};
document.addEventListener('fullscreenchange',()=>document.querySelector('#fullscreen').textContent=document.fullscreenElement?'退出全屏':'全屏');
const clock=()=>document.querySelector('#clock').textContent=new Date().toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});clock();setInterval(clock,1000);
try {const config=await fetch(mountedUrl('api/dashboard-config')).then(r=>r.json());if(/^https?:\/\//.test(config.managerUiUrl)||/^\/(?!\/)/.test(config.managerUiUrl))document.querySelector('.top-left a').href=config.managerUiUrl;document.querySelector('#legacy-entry').hidden=config.legacyAvailable!==true;}catch{}
try {const [geo,config,streets]=await Promise.all([fetch(mountedUrl('map/whkfq.json')).then(r=>r.json()),fetch(mountedUrl('api/map-config')).then(r=>r.json()),fetch(mountedUrl('map/streets.json')).then(r=>r.json())]);metadata=config;map=createMap(document.querySelector('#map'),geo,metadata,selectOrg,streets,(name,rows)=>showDetail(`${name} · 机构看板`,data.annual?table(rows,metadata)+'<p class="footnote">机构按保留坐标匹配街道边界；本范围内无坐标的机构不纳入街道看板。</p>':'<div class="empty">管理端机构统计尚未连接</div>'));}catch{document.querySelector('#map').innerHTML='<div class="empty">地图资源暂不可用</div>';}
refreshScope();
setInterval(()=>{if(!document.hidden)for(const key of ['annual','followup','population','highrisk'])load(key);},60000);
setInterval(()=>{if(!document.hidden)for(const key of ['monitoring','alerts'])load(key);},20000);
