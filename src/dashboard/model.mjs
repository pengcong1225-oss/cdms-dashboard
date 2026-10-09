export const formatNumber=value => value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toLocaleString('zh-CN');
export function rankRows(rows,key) {
 const total=rows.reduce((sum,row)=>sum+Number(row[key]??0),0);
 return [...rows].sort((a,b)=>Number(b[key]??0)-Number(a[key]??0)).map(row=>({...row,orgId:String(row.orgId),value:Number(row[key]??0),share:total?Number(row[key]??0)/total*100:0}));
}
export function distribution(values,total) {
 const entries=Object.entries(values??{}).sort((a,b)=>b[1]-a[1]);
 const max=Math.max(1,...entries.map(([,n])=>Number(n)));
 return entries.map(([name,value])=>({name,value:Number(value),width:Number(value)/max*100,percent:total?Number(value)/total*100:0}));
}
export const sum=(rows,key)=>rows == null ? null : rows.reduce((n,row)=>n+Number(row[key]??0),0);
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
