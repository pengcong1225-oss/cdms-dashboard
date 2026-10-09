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
 '/api/v1/dashboard/population':population,
 '/api/v1/dashboard/high-risk':{total:32,pending:8},
 '/api/v1/screening/stats':{trend:Array.from({length:12},(_,i)=>({month:`2026-${String(i+1).padStart(2,'0')}`,total:15+i*4,high:2+i}))},
 '/api/v1/monitoring/stats':{managedPatientCount:20,boundPatientCount:12,activeAlertPatientCount:13,offlinePatientCount:3}
};
const alertSamples=[['张勇','SPO2',88,'%','血氧88%，低于90%预警阈值'],['李芳','HEART_RATE',118,'bpm','静息心率118次/分，高于110次/分'],['王丽','STEPS_LOW',320,'步','当日步数320步，低于活动目标'],['陈伟','SLEEP_LOW',4,'小时','昨夜睡眠4小时，少于建议时长'],['刘敏','MULTIPLE_WARNING',null,'','血氧偏低并伴随心率持续偏高'],['赵强','SPO2',89,'%','血氧89%，连续三次低于预警阈值'],['孙慧','HEART_RATE',42,'bpm','静息心率42次/分，低于50次/分'],['周军','STEPS',280,'步','当前活动量较少，请确认佩戴情况'],['吴静','SLEEP',3.5,'小时','昨夜睡眠时长不足4小时'],['郑峰','DEVICE_OFFLINE',null,'','设备离线，最近三小时未收到监测数据'],['何平','SPO2',87,'%','血氧87%，建议及时评估'],['马兰','HEART_RATE',125,'bpm','心率持续高于120次/分'],['徐晓','SLEEP_LOW',4.5,'小时','连续两日睡眠不足5小时']];
const alertRecords=alertSamples.map(([patientName,alertType,alertValue,alertUnit,reason],i)=>({orgId:Object.keys(metadata)[i],alertId:String(1972545764702666700n+BigInt(i)),patientId:String(1972545633966211000n+BigInt(i)),patientName,alertType,alertValue,alertUnit,reason,level:i%3===0?2:1,occurredAt:`2026-09-${String(i+1).padStart(2,'0')} 08:30:59`}));
// Sample data time stays fixed; extend only this isolated preview's validity windows on reads.
const capturedAt=new Date();
const fixtureMeta=()=>{const readAt=Date.now();return {dataUpdatedAt:capturedAt.toISOString(),stale:false,refreshing:false,refreshFailed:false,freshUntil:new Date(readAt+180000).toISOString(),staleUntil:new Date(readAt+780000).toISOString()};};
createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,'http://localhost');
  // The isolated sample has no Manager login. Supply a fake session only from this
  // development server, without reading/writing real browser credentials.
  if(url.pathname==='/dashboard/auth.mjs'){
   res.setHeader('Content-Type','text/javascript');
   return res.end("export function createAuthSession({onChange}){let started=false;return {sync(){if(!started){started=true;onChange({status:'ready',token:'fixture-only'});}},accept(){},recover(){return Promise.resolve();},retry(){},get token(){return 'fixture-only';},get status(){return 'ready';}};}");
  }
  if(url.pathname==='/api/map-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(metadata));}
  if(url.pathname==='/api/dashboard-config'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({managerUiUrl:'/cdmsmanager/'}));}
  if(url.pathname.startsWith('/manager-api/')){
   const path=url.pathname.replace('/manager-api','');let data=payloads[path];
   if(path==='/api/v1/dashboard/alerts'){
    const records=url.searchParams.has('orgId')?alertRecords.filter(row=>row.orgId===url.searchParams.get('orgId')):alertRecords;
    const size=Math.max(1,Math.min(100,Number(url.searchParams.get('size'))||24)),total=records.length,pages=Math.ceil(total/size),current=total?Math.max(1,Math.min(pages,Number(url.searchParams.get('page'))||1)):1;
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({code:200,data:{records:records.slice((current-1)*size,current*size),total,current,size,pages}}));
   }
   if(Array.isArray(data)&&url.searchParams.has('orgId'))data=data.filter(row=>row.orgId===url.searchParams.get('orgId'));
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({code:200,data,...(path.startsWith('/api/v1/dashboard/')?{meta:fixtureMeta()}:{})}));
  }
  const file=resolve(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
  if(!file.startsWith(root))throw Error('path');
  let bytes=await readFile(file);
  if(extname(file)==='.html')bytes=Buffer.from(bytes.toString().replace('</body>','<div style="position:fixed;z-index:99;right:16px;bottom:28px;padding:6px 10px;border:1px solid #d4a962;background:#362d17;color:#ffd67d;font-size:12px">验收样例 · 非业务数据</div></body>'));
  res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf'})[extname(file)]??'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end();}
}).listen(4319,'127.0.0.1',()=>console.log('UI acceptance fixture only: http://127.0.0.1:4319/'));
