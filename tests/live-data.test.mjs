import test from 'node:test';
import assert from 'node:assert/strict';

test('provider contract rejects an incomplete provider', async () => {
  const {createProviderContract} = await import('../server/provider-contract.mjs');
  assert.throws(() => createProviderContract({}), /getContext/);
});

test('provider contract normalizes missing collection fields', async () => {
  const {createProviderContract} = await import('../server/provider-contract.mjs');
  const names = ['getContext','getLungFunctionStats','getAbnormalTrend','getInstitutionRank','getMapLayer','getOrgRegionList','getLungLevelDistribution','getAssessmentGroupDistribution','getManagementLevelRating'];
  const provider = Object.fromEntries(names.map(name => [name, async () => ({})]));
  const normalized = createProviderContract(provider);
  assert.deepEqual(await normalized.getInstitutionRank({enterpriseId:'all'}), {list:[]});
  assert.deepEqual(await normalized.getMapLayer({enterpriseId:'all'}), {hospitalMarkers:[]});
  assert.deepEqual(await normalized.getManagementLevelRating({enterpriseId:'all'}), {items:[]});
});

test('provider contract preserves database errors', async () => {
  const {createProviderContract} = await import('../server/provider-contract.mjs');
  const names = ['getContext','getLungFunctionStats','getAbnormalTrend','getInstitutionRank','getMapLayer','getOrgRegionList','getLungLevelDistribution','getAssessmentGroupDistribution','getManagementLevelRating'];
  const provider = Object.fromEntries(names.map(name => [name, async () => { throw new Error('db unavailable'); }]));
  const normalized = createProviderContract(provider);
  await assert.rejects(() => normalized.getContext({enterpriseId:'all'}), /db unavailable/);
});

test('sql provider maps aggregate rows without turning unknown values into zero', async () => {
  const {createSqlProvider} = await import('../server/metrics.mjs');
  const calls = [];
  const rows = {
    'screening-total': [{count:2}],
    'lung-test-total': [{count:3}],
    'copd-total': [{count:1}],
    'followup-total': [{count:4}],
    'bronchodilation-total': [{count:2,positive:1}],
    'screening-trend': [{month:1,count:2},{month:12,count:1}],
    'lung-level': [{level:1,count:2},{level:'GOLD 2',count:1},{level:null,count:9}],
    'assessment-group': [{abe_group:'A',count:1},{abe_group:null,count:3}],
    'management-level': [{management_level:'一级'},{management_level:'一级'},{management_level:'2级'},{management_level:null}]
  };
  const pool = {execute: async (sql, params) => {
    calls.push({sql,params});
    const key = sql.match(/\/\* hguard:([a-z-]+) \*\//)?.[1];
    return [rows[key] ?? [], []];
  }};
  const provider = createSqlProvider({pool, mapConfig:{}});
  assert.deepEqual(await provider.getLungFunctionStats({enterpriseId:'all'}), {
    screeningCount:2,lungTestCount:3,copdCount:1,followUpCount:4,
    bronchodilationCount:2,bronchodilationPositiveCount:1,bronchodilationPositiveRate:50
  });
  assert.deepEqual(await provider.getAbnormalTrend({enterpriseId:'all',year:2026}), {
    monthlyScreeningCounts:[2,0,0,0,0,0,0,0,0,0,0,1],
    monthlyCopdCounts:Array(12).fill(0)
  });
  assert.deepEqual(await provider.getLungLevelDistribution({enterpriseId:'all'}), {categories:['轻度','中度','重度','极重度','未评估'],values:[2,1,0,0,9]});
  assert.deepEqual(await provider.getAssessmentGroupDistribution({enterpriseId:'all'}), {categories:['A','B','E','未评估'],values:[1,0,0,1]});
  assert.deepEqual(await provider.getManagementLevelRating({enterpriseId:'all'}).then(x=>x.items), [
    {name:'一级',value:2,color:'#1ed9ff'},
    {name:'二级',value:1,color:'#ffd858'},
    {name:'三级',value:0,color:'#4be38c'},
    {name:'四级',value:0,color:'#ff8754'},
    {name:'未评估',value:1,color:'#7890a8'}
  ]);
  assert.ok(calls.every(({params}) => Array.isArray(params)));
  assert.match(calls.find(call => call.sql.includes('hguard:lung-level')).sql, /diagnosis_status = 1/);
});

test('sql provider applies static map metadata to live institution rows', async () => {
  const {createSqlProvider} = await import('../server/metrics.mjs');
  const rows = {
    context: [{id:'101',name:'示例卫生院',hospitalLevel:1}],
    'org-region-list': [{community_name:'示例卫生院',screening_count:8,lung_test_count:0,bronchodilation_count:0,bronchodilation_positive_count:0,questionnaire_count:0}],
    'institution-rank': [],
  };
  const pool = {execute: async sql => {
    const key = sql.match(/\/\* hguard:([a-z-]+) \*\//)?.[1];
    return [rows[key] ?? [], []];
  }};
  const provider = createSqlProvider({pool, mapConfig:{'101':{shortName:'示例',hospitalLevel:1,lng:114.1,lat:30.4}}});
  assert.deepEqual(await provider.getMapLayer({enterpriseId:'all'}), {
    hospitalMarkers:[{
      name:'示例卫生院',shortName:'示例',hospitalLevel:1,lng:114.1,lat:30.4,
      screeningCount:8,copdCount:0,bronchodilationCount:0,bronchodilationPositiveCount:0,bronchodilationPositiveRate:0
    }]
  });
});
