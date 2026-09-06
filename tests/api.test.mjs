import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('serves exact institution and year; never substitutes aggregate data',async()=>{
 const {createHandler}=await import('../server/handler.mjs');
 const folder=await mkdtemp(join(tmpdir(),'hguard-test-'));
 try {
  await writeFile(join(folder,'manifest.json'),JSON.stringify({capturedAt:'2026-09-05',scopes:['all','hospital-a'],entries:[{endpoint:'abnormal-trend',scope:'hospital-a',year:2026,file:'a.json'}]}));
  await writeFile(join(folder,'a.json'),JSON.stringify({code:'200',data:{monthlyScreeningCounts:[11,23]}}));
  const handle=await createHandler({dataDir:folder});
  const good=await handle('abnormal-trend',{enterpriseId:'hospital-a',year:2026});
  assert.deepEqual(good.body.data.monthlyScreeningCounts,[11,23]);
  assert.equal((await handle('abnormal-trend',{enterpriseId:'hospital-a',year:2025})).status,404);
  assert.equal((await handle('abnormal-trend',{enterpriseId:'unknown',year:2026})).status,400);
  assert.equal((await handle('abnormal-trend',{enterpriseId:'../../secret',year:2026})).status,400);
  assert.equal((await handle('unlisted',{})).status,404);
  assert.equal((await handle('abnormal-trend',{year:'2026 OR 1=1'})).status,400);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('database mode uses provider data and keeps the response envelope', async () => {
 const {createHandler}=await import('../server/handler.mjs');
 const folder=await mkdtemp(join(tmpdir(),'hguard-db-test-'));
 try {
  await writeFile(join(folder,'manifest.json'),JSON.stringify({capturedAt:'2026-09-05',scopes:['all'],entries:[]}));
  const names=['getContext','getLungFunctionStats','getAbnormalTrend','getInstitutionRank','getMapLayer','getOrgRegionList','getLungLevelDistribution','getAssessmentGroupDistribution','getManagementLevelRating'];
  const provider=Object.fromEntries(names.map(name=>[name,async()=>name==='getContext'?{viewAll:true,currentEnterpriseName:'全部'}:{}]));
  const handle=await createHandler({dataDir:folder,mode:'db',provider});
  const result=await handle('context',{});
  assert.equal(result.status,200);
  assert.equal(result.body.code,'200');
  assert.equal(result.body.data.currentEnterpriseName,'全部');
 }
 finally{await rm(folder,{recursive:true,force:true});}
});

test('database mode exposes provider failures as 503', async () => {
 const {createHandler}=await import('../server/handler.mjs');
 const folder=await mkdtemp(join(tmpdir(),'hguard-db-error-'));
 try {
  await writeFile(join(folder,'manifest.json'),JSON.stringify({capturedAt:'2026-09-05',scopes:['all'],entries:[]}));
  const names=['getContext','getLungFunctionStats','getAbnormalTrend','getInstitutionRank','getMapLayer','getOrgRegionList','getLungLevelDistribution','getAssessmentGroupDistribution','getManagementLevelRating'];
  const provider=Object.fromEntries(names.map(name=>[name,async()=>{throw new Error('database unavailable');}]));
  const handle=await createHandler({dataDir:folder,mode:'db',provider});
  const result=await handle('context',{});
  assert.equal(result.status,503);
  assert.equal(result.body.code,'503');
 }
 finally{await rm(folder,{recursive:true,force:true});}
});

test('database health stays disconnected until a query succeeds', async () => {
 const {createHandler}=await import('../server/handler.mjs');
 const folder=await mkdtemp(join(tmpdir(),'hguard-db-health-'));
 try {
  await writeFile(join(folder,'manifest.json'),JSON.stringify({capturedAt:'2026-09-05',scopes:['all'],entries:[]}));
  const names=['getContext','getLungFunctionStats','getAbnormalTrend','getInstitutionRank','getMapLayer','getOrgRegionList','getLungLevelDistribution','getAssessmentGroupDistribution','getManagementLevelRating'];
  const provider=Object.fromEntries(names.map(name=>[name,async()=>({})]));
  const handle=await createHandler({dataDir:folder,mode:'db',provider});
  assert.deepEqual(handle.health(),{mode:'db',databaseConnected:false,lastSuccessAt:null,lastError:null});
  await handle('context',{});
  assert.equal(handle.health().databaseConnected,true);
 }
 finally{await rm(folder,{recursive:true,force:true});}
});
