import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createProviderContract} from './provider-contract.mjs';

export const endpoints=['context','lung-function-stats','abnormal-trend','institution-rank','map-layer','org-region-list','lung-level-distribution','assessment-group-distribution','management-level-rating'];
const methods = {
 context:'getContext',
 'lung-function-stats':'getLungFunctionStats',
 'abnormal-trend':'getAbnormalTrend',
 'institution-rank':'getInstitutionRank',
 'map-layer':'getMapLayer',
 'org-region-list':'getOrgRegionList',
 'lung-level-distribution':'getLungLevelDistribution',
 'assessment-group-distribution':'getAssessmentGroupDistribution',
 'management-level-rating':'getManagementLevelRating'
};
const success = data => ({extra:{},count:0,data,msg:'操作成功',code:'200',nextStartIndex:0,isEnd:1});
const error = (status,msg) => ({status,body:{code:String(status),msg}});

export async function createHandler({dataDir,mode=process.env.DATA_MODE??'snapshot',provider,cacheTtlMs=15000} = {}) {
 const selectedMode = mode === 'db' ? 'db' : 'snapshot';
 const manifest = dataDir ? JSON.parse(await readFile(join(dataDir,'manifest.json'),'utf8')) : null;
 const dbProvider = selectedMode === 'db' ? createProviderContract(provider) : null;
 const cache = new Map();
 let lastSuccessAt = null;
 let lastError = null;

 const loadSnapshot = async entry => {
  if (!/^[\w.-]+\.json$/.test(entry.file)) throw new Error('invalid snapshot index');
  if (!cache.has(entry.file)) cache.set(entry.file,{expiresAt:Infinity,value:JSON.parse(await readFile(join(dataDir,entry.file),'utf8'))});
  return cache.get(entry.file).value;
 };
 const loadDatabase = async (endpoint, args) => {
  const key = JSON.stringify([endpoint,args.enterpriseId,args.year??null]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const data = await dbProvider[methods[endpoint]](args);
  cache.set(key,{expiresAt:Date.now()+cacheTtlMs,value:data});
  return data;
 };

 const handle = async (endpoint,body={}) => {
  if (!endpoints.includes(endpoint)) return error(404,'接口不存在');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400,'请求参数必须为对象');
  const scope = body.enterpriseId == null || body.enterpriseId === '' ? 'all' : String(body.enterpriseId);
  const year = endpoint === 'abnormal-trend' ? Number(body.year ?? new Date().getFullYear()) : null;
  if (year !== null && (!Number.isInteger(year) || year < 2000 || year > 2100)) return error(400,'年份无效');
  try {
   let data;
   if (selectedMode === 'snapshot') {
    if (!manifest.scopes.includes(scope)) return error(400,'机构不存在');
    const entry = endpoint === 'context' ? {file:'context.json'} : manifest.entries.find(x => x.endpoint === endpoint && x.scope === scope && x.year === year);
    if (!entry) return error(404,'该机构或年份尚未采集数据，请刷新快照或接入数据库');
    data = await loadSnapshot(entry);
    lastSuccessAt = new Date().toISOString();
   } else {
    data = await loadDatabase(endpoint,{enterpriseId:scope,year});
    lastSuccessAt = new Date().toISOString();
    lastError = null;
   }
   return {status:200,body:selectedMode === 'snapshot' ? data : success(data)};
  } catch (cause) {
   lastError = cause instanceof Error ? cause.message : String(cause);
   if (selectedMode === 'db') return error(503,'数据库统计暂不可用');
   return error(500,'快照读取失败');
  }
 };
 handle.health = () => ({mode:selectedMode,databaseConnected:selectedMode === 'db' && lastSuccessAt !== null && !lastError,lastSuccessAt,lastError:selectedMode === 'db' ? lastError : null});
 return handle;
}
