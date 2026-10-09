// Isolated UI acceptance harness. Never imported by production server or shipped to dist.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('dist');
const metadata=JSON.parse(await readFile('server/map-config.json','utf8'));
const rows=Object.entries(metadata).map(([id,item],i)=>({orgId:id,orgName:item.name,sqScreeningCount:120-i*5,score16Count:20-i,lungFuncExamCount:30-i}));
const population={total:20,stable:18,acuteExacerbation:2,qualityPassed:14,ageBuckets:{'<60':3,'60-69':7,'70+':9,'未知':1},genderDistribution:{'男':14,'女':5,'未知':1},riskDistribution:{'高风险':4,'低风险':13,'未评估':3},abeDistribution:{A:4,B:8,E:3,'历史C':1,'历史D':1,'未分组':3},goldDistribution:{'GOLD 1-2级':9,'GOLD 3-4级':6},goldGradedTotal:15,goldUngraded:5,managementDistribution:{'一级':4,'二级':7,'三级':6,'未分级':3},comorbidities:{'高血压':12,'糖尿病':7,'冠心病':6,'慢性肾病':5,'心力衰竭':4,'骨质疏松':3,'焦虑':2,'睡眠障碍':2,'贫血':1,'抑郁':1,'甲状腺疾病':1}};
const payloads={
 '/api/v1/dashboard/screening':rows,
 '/api/v1/dashboard/follow-up':rows.map(row=>({...row,visitCount:10})),
 '/api/v1/copd/stats':population,
 '/api/v1/highrisk/stats':{total:32,pending:8},
 '/api/v1/screening/stats':{trend:Array.from({length:12},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,total:15+i*4,high:2+i}))},
 '/api/v1/monitoring/stats':{managedPatientCount:20,boundPatientCount:12,activeAlertPatientCount:2,offlinePatientCount:3},
 '/api/v1/monitoring/alerts/popup':{remainingCount:3,alerts:[{patientName:'测**',alertType:'SPO2',alertValue:88,alertUnit:'%',level:2,occurredAt:'2026-10-08T10:00:00'},{patientName:'样**',alertType:'HEART_RATE',alertValue:110,alertUnit:'bpm',level:1,occurredAt:'2026-10-08T09:50:00'}]}
};
createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/map-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(metadata));}
  if(url.pathname==='/api/dashboard-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({managerUiUrl:'/cdmsmanager/'}));}
  if(url.pathname.startsWith('/manager-api/')){
   const path=url.pathname.replace('/manager-api','');let data=payloads[path];
   if(Array.isArray(data)&&url.searchParams.has('orgId'))data=data.filter(row=>row.orgId===url.searchParams.get('orgId'));
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({code:200,data}));
  }
  const file=resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
  if(!file.startsWith(root))throw Error('path');
  let bytes=await readFile(file);
  if(extname(file)==='.html')bytes=Buffer.from(bytes.toString().replace('</body>','<div style="position:fixed;z-index:99;right:16px;bottom:28px;padding:6px 10px;border:1px solid #d4a962;background:#362d17;color:#ffd67d;font-size:12px">验收样例 · 非业务数据</div></body>'));
  res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf'})[extname(file)]??'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end();}
}).listen(4319,'127.0.0.1',()=>console.log('UI acceptance fixture only: http://127.0.0.1:4319/'));
