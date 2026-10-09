import {escapeHtml as esc,formatNumber as fmt} from './model.mjs';

const positive=value=>Number.isInteger(Number(value))&&Number(value)>0?Number(value):1;
export function createAlertCarousel({now=Date.now,intervalMs=6000}={}) {
 let current=1,page=1,pages=0,total=0,lastTurn=now(),userPaused=false;
 const flags={authorized:false,hover:false,focus:false,hidden:false,loading:false};
 const paused=()=>userPaused||!flags.authorized||flags.hover||flags.focus||flags.hidden||flags.loading;
 function setFlags(next){if(Object.entries(next).some(([key,value])=>flags[key]!==value))lastTurn=now();Object.assign(flags,next);}
 function acceptPage(value){
  total=Math.max(0,Number(value?.total)||0);pages=total?Math.max(1,Number(value?.pages)||1):0;
  const accepted=pages?Math.min(pages,positive(value?.current)):1;
  if(current!==accepted||flags.loading)lastTurn=now();current=page=accepted;setFlags({loading:false});
 }
 function turn(direction){
  if(!flags.authorized||flags.hidden||flags.loading||pages<=1)return null;
  page=((current-1+direction+pages)%pages)+1;lastTurn=now();setFlags({loading:true});return page;
 }
 function tick(){return paused()||now()-lastTurn<intervalMs?null:turn(1);}
 function togglePause(){userPaused=!userPaused;lastTurn=now();return userPaused;}
 function reset(){current=page=1;pages=total=0;userPaused=false;lastTurn=now();setFlags({loading:false,hover:false,focus:false});}
 const snapshot=()=>({current,page,pages,total,userPaused,paused:paused(),loading:flags.loading,canTurn:flags.authorized&&!flags.hidden&&!flags.loading&&pages>1});
 return {acceptPage,setFlags,tick,togglePause,reset,snapshot,next:()=>turn(1),previous:()=>turn(-1)};
}

const labels={SPO2:'血氧',SPO2_LOW:'血氧低',SPO2_WARNING:'血氧低',HEART_RATE:'心率',HEART_RATE_ABNORMAL:'心率异常',HEART_RATE_WARNING:'心率异常',STEPS:'步数',STEP_COUNT:'步数',STEPS_LOW:'步数不足',SLEEP:'睡眠',SLEEP_DURATION:'睡眠',SLEEP_LOW:'睡眠不足',MULTIPLE_WARNING:'综合预警'};
export function renderAlertRecords(records) {
 if(!records?.length)return '<div class="empty">当前暂无未处理告警</div>';
 return records.slice(0,3).map(row=>{
  const name=String(row.patientName??'未知姓名');
  const reason=String(row.reason??'').trim()||`${labels[row.alertType]??`告警（${row.alertType??'未知类型'}）`} ${fmt(row.alertValue)}${row.alertUnit??''}`;
  const occurredAt=String(row.occurredAt??'').replace('T',' ');
  return `<div class="alert-row" role="listitem"><i class="${Number(row.level)===2?'critical':''}"></i><b title="${esc(name)}">${esc(name)}</b><span title="${esc(reason)}">${esc(reason)}</span><time title="${esc(occurredAt)}">${esc(occurredAt.slice(5,16))}</time></div>`;
 }).join('');
}
