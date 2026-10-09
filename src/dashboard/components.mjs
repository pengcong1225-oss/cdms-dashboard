import {formatNumber as fmt,escapeHtml as esc,distribution} from './model.mjs';
export function bars(values,total,{limit=99}={}) {
 if(values==null)return '<div class="empty">等待管理端统计</div>';
 const items=distribution(values,total).slice(0,limit);
 if(!items.length)return '<div class="empty">当前范围暂无数据</div>';
 return items.map((r,i)=>`<div class="bar-row"><span title="${esc(r.name)}">${esc(r.name)}</span><div class="track"><i style="width:${r.width}%;--bar:${['#36c7ef','#7490ff','#db79ed','#19cead','#ecad4a'][i%5]}"></i></div><b>${fmt(r.value)}</b><small>${r.percent.toFixed(1)}%</small></div>`).join('');
}
export function metric(label,value,unit,note,color='cyan') {
 return `<article class="metric ${color}"><span>${esc(label)}</span><div><strong>${fmt(value)}</strong><small>${unit}</small></div><p>${esc(note)}</p></article>`;
}
export function ring(values,total,label) {
 if(values==null)return `<div class="ring-row"><div class="ring unavailable"><div><b>—</b><small>${esc(label)}</small></div></div><span class="muted">等待管理端统计</span></div>`;
 const colors=['#39c5ef','#ee6dbd','#526585'];
 let pos=0;const entries=Object.entries(values);
 const stops=entries.map(([,value],i)=>{const start=pos;pos+=total?Number(value)/total*100:0;return `${colors[i%3]} ${start}% ${pos}%`;});
 return `<div class="ring-row"><div class="ring" style="background:conic-gradient(${total?stops.join(','):'#243757'})"><div><b>${fmt(total)}</b><small>${esc(label)}</small></div></div><div class="legend">${entries.map(([key,n],i)=>`<div><i style="background:${colors[i%3]}"></i><span>${esc(key)}</span><b>${fmt(n)}</b><small>${total?(Number(n)/total*100).toFixed(1):'0.0'}%</small></div>`).join('')}</div></div>`;
}
export function statusText(state) {
 const time=value=>new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 const updated=state.dataUpdatedAt?`数据更新 ${time(state.dataUpdatedAt)}`:state.receivedAt?`收到 ${time(state.receivedAt)} · 数据更新时间未提供`:'';
 const flags=[state.error,state.stale?'数据陈旧':null,state.refreshFailed?'刷新失败':null,state.refreshing?'后台刷新中':state.loading?'请求中':null].filter(Boolean);
 if(!updated&&!flags.length)return '<span>正在连接管理端</span>';
 return `<span class="${state.error||state.stale||state.refreshFailed?'state-error':'state-ok'}">${esc([updated,...flags].filter(Boolean).join(' · '))}</span>`;
}
export function table(rows,metadata) {
 if(!rows)return '<div class="empty">机构统计暂不可用</div>';
 return `<div class="table-wrap"><table><thead><tr><th>排名</th><th>机构</th><th>问卷（人次）</th><th>肺功能（人次）</th><th>≥16分（人次）</th></tr></thead><tbody>${[...rows].sort((a,b)=>Number(b.sqScreeningCount)-Number(a.sqScreeningCount)).map((r,i)=>`<tr data-org="${esc(r.orgId)}" tabindex="0"><td>${i+1}</td><td>${esc(r.orgName??metadata[String(r.orgId)]?.name)}</td><td>${fmt(r.sqScreeningCount)}</td><td>${fmt(r.lungFuncExamCount)}</td><td>${fmt(r.score16Count)}</td></tr>`).join('')}</tbody></table></div>`;
}
