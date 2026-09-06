import {createProviderContract} from './provider-contract.mjs';

const COLORS = {'一级':'#1ed9ff','二级':'#ffd858','三级':'#4be38c','四级':'#ff8754','未评估':'#7890a8'};
const LEVELS = ['轻度','中度','重度','极重度','未评估'];
const GROUPS = ['A','B','E'];

const integer = value => Number(value ?? 0) || 0;
const percent = (positive, total) => total ? Math.round(positive / total * 10000) / 100 : 0;
const scope = (enterpriseId, column = 'org_id') => enterpriseId === 'all' ? {sql:'1=1',params:[]} : {sql:`${column} = ?`,params:[enterpriseId]};
const rowsFor = async (pool, marker, sql, params = []) => (await pool.execute(`/* hguard:${marker} */\n${sql}`, params))[0];
const first = rows => rows[0] ?? {};

async function count(pool, marker, sql, params) {
 return integer(first(await rowsFor(pool, marker, sql, params)).count);
}

function mapLevel(value) {
 const text = String(value ?? '').toUpperCase();
 const matched = text.match(/(?:GOLD\s*)?([1-4])/);
 const n = matched ? Number(matched[1]) : integer(value);
 return n >= 1 && n <= 4 ? LEVELS[n - 1] : null;
}

function mapManagement(value) {
 const text = String(value ?? '').trim();
 if (COLORS[text] && text !== '未评估') return text;
 const matched = text.match(/([1-4])级?$/);
 if (matched) return `${['','一','二','三','四'][Number(matched[1])]}级`;
 return '';
}

export function createSqlProvider({pool, mapConfig = {}, now = () => new Date()} = {}) {
 if (!pool || typeof pool.execute !== 'function') throw new TypeError('pool.execute is required');

 async function getContext({enterpriseId = 'all'} = {}) {
  const s = scope(enterpriseId, 'o.id');
  const rows = await rowsFor(pool, 'context', `
   SELECT CAST(o.id AS CHAR) AS id, o.name, o.org_type AS hospitalLevel
   FROM cdms_org o
   WHERE o.status = 1 AND ${s.sql}
   ORDER BY o.sort ASC, o.id ASC`, s.params);
  const selected = rows[0];
  return {
   viewAll: enterpriseId === 'all',
   canSwitchHospital: enterpriseId === 'all' && rows.length > 1,
   hospitalLevel: selected?.hospitalLevel ?? null,
   currentEnterpriseName: enterpriseId === 'all' ? '全部' : (selected?.name ?? ''),
   hospitals: rows.map(row => ({id:String(row.id),name:String(row.name ?? '')}))
  };
 }

 async function getLungFunctionStats({enterpriseId = 'all'} = {}) {
  const s = scope(enterpriseId, 's.org_id');
  const screeningCount = await count(pool, 'screening-total', `
   SELECT COUNT(DISTINCT s.patient_id) AS count
   FROM cdms_copd_screening s
   WHERE s.patient_id IS NOT NULL AND s.status = 0 AND ${s.sql}`, s.params);
  const reportScope = scope(enterpriseId, 'r.org_id');
  const lungTestCount = await count(pool, 'lung-test-total', `
   SELECT COUNT(*) AS count FROM (
    SELECT DISTINCT r.patient_id
    FROM cdms_lung_function_report r
    WHERE r.patient_id IS NOT NULL AND ${reportScope.sql}
    UNION
    SELECT DISTINCT old.patient_id
    FROM cdms_lung_function_record old
    JOIN cdms_patient p ON p.id = old.patient_id AND p.status = 1
    WHERE old.patient_id IS NOT NULL AND old.org_id IS NOT NULL AND ${scope(enterpriseId,'old.org_id').sql}
   ) people`, [...reportScope.params, ...scope(enterpriseId,'old.org_id').params]);
  const diagnosisScope = scope(enterpriseId, 'd.org_id');
  const copdCount = await count(pool, 'copd-total', `
   WITH latest AS (
    SELECT d.patient_id, d.diagnosis_status, d.submission_status,
           ROW_NUMBER() OVER (PARTITION BY d.patient_id ORDER BY COALESCE(d.version_no,0) DESC, d.update_time DESC, d.id DESC) AS rn
    FROM cdms_copd_diagnosis d
    WHERE d.patient_id IS NOT NULL AND ${diagnosisScope.sql}
   )
   SELECT COUNT(*) AS count FROM latest
   WHERE rn = 1 AND diagnosis_status = 1 AND submission_status IN (0,2)`, diagnosisScope.params);
  const followScope = scope(enterpriseId, 'f.org_id');
  const followUpCount = await count(pool, 'followup-total', `
   SELECT COUNT(*) AS count
   FROM cdms_follow_up_record f
   WHERE f.status = 1 AND f.draft = 0 AND ${followScope.sql}
     AND NOT EXISTS (
      SELECT 1 FROM cdms_follow_up_record newer
      WHERE newer.corrected_of_id = f.id AND newer.status = 1 AND newer.draft = 0
     )`, followScope.params);
  const bronchoScope = scope(enterpriseId, 'b.org_id');
  const broncho = first(await rowsFor(pool, 'bronchodilation-total', `
   SELECT COUNT(*) AS count,
          SUM(CASE WHEN b.dilation_result = 1 THEN 1 ELSE 0 END) AS positive
   FROM cdms_lung_function_record b
   WHERE b.is_bronchial_dilation = 1 AND ${bronchoScope.sql}`, bronchoScope.params));
  const bronchodilationCount = integer(broncho.count);
  const bronchodilationPositiveCount = integer(broncho.positive);
  return {screeningCount,lungTestCount,copdCount,followUpCount,bronchodilationCount,bronchodilationPositiveCount,bronchodilationPositiveRate:percent(bronchodilationPositiveCount,bronchodilationCount)};
 }

 async function getAbnormalTrend({enterpriseId = 'all', year} = {}) {
  const targetYear = Number(year ?? now().getFullYear());
  const screeningScope = scope(enterpriseId, 's.org_id');
  const screeningRows = await rowsFor(pool, 'screening-trend', `
   SELECT MONTH(s.screening_date) AS month, COUNT(DISTINCT s.patient_id) AS count
   FROM cdms_copd_screening s
   WHERE s.patient_id IS NOT NULL AND s.status = 0 AND s.screening_date IS NOT NULL
     AND YEAR(s.screening_date) = ? AND ${screeningScope.sql}
   GROUP BY MONTH(s.screening_date)`, [targetYear, ...screeningScope.params]);
  const diagnosisScope = scope(enterpriseId, 'd.org_id');
  const copdRows = await rowsFor(pool, 'copd-trend', `
   WITH latest AS (
    SELECT d.patient_id, d.diagnosis_status, d.submission_status, d.diagnosis_date, d.create_time,
           ROW_NUMBER() OVER (PARTITION BY d.patient_id ORDER BY COALESCE(d.version_no,0) DESC, d.update_time DESC, d.id DESC) AS rn
    FROM cdms_copd_diagnosis d
    WHERE d.patient_id IS NOT NULL AND ${diagnosisScope.sql}
   )
   SELECT MONTH(COALESCE(diagnosis_date,create_time)) AS month, COUNT(*) AS count
   FROM latest
   WHERE rn = 1 AND diagnosis_status = 1 AND submission_status IN (0,2)
     AND COALESCE(diagnosis_date,create_time) IS NOT NULL
     AND YEAR(COALESCE(diagnosis_date,create_time)) = ?
   GROUP BY MONTH(COALESCE(diagnosis_date,create_time))`, [...diagnosisScope.params, targetYear]);
  const months = rows => { const result = Array(12).fill(0); for (const row of rows) { const month = integer(row.month); if (month >= 1 && month <= 12) result[month - 1] = integer(row.count); } return result; };
  return {monthlyScreeningCounts:months(screeningRows),monthlyCopdCounts:months(copdRows)};
 }

 async function getInstitutionRank({enterpriseId = 'all'} = {}) {
  const s = scope(enterpriseId, 'd.org_id');
  const rows = await rowsFor(pool, 'institution-rank', `
   WITH latest AS (
    SELECT d.patient_id, d.org_id, d.diagnosis_status, d.submission_status,
           ROW_NUMBER() OVER (PARTITION BY d.patient_id ORDER BY COALESCE(d.version_no,0) DESC, d.update_time DESC, d.id DESC) AS rn
    FROM cdms_copd_diagnosis d
    WHERE d.patient_id IS NOT NULL AND ${s.sql}
   )
   SELECT CAST(latest.org_id AS CHAR) AS org_id, o.name AS institution_name, COUNT(*) AS copd_count
   FROM latest JOIN cdms_org o ON o.id = latest.org_id
   WHERE latest.rn = 1 AND latest.diagnosis_status = 1 AND latest.submission_status IN (0,2)
   GROUP BY latest.org_id, o.name ORDER BY copd_count DESC, o.name ASC`, s.params);
  return {list:rows.map(row => ({institutionName:String(row.institution_name ?? ''),copdCount:integer(row.copd_count)}))};
 }

 async function getOrgRegionList({enterpriseId = 'all'} = {}) {
  const s = scope(enterpriseId, 'o.id');
  const rows = await rowsFor(pool, 'org-region-list', `
   SELECT CAST(o.id AS CHAR) AS org_id, o.name AS community_name,
    (SELECT COUNT(DISTINCT r.patient_id) FROM cdms_lung_function_report r WHERE r.org_id = o.id AND r.patient_id IS NOT NULL) AS lung_test_count,
    (SELECT COUNT(*) FROM cdms_lung_function_record b WHERE b.org_id = o.id AND b.is_bronchial_dilation = 1) AS bronchodilation_count,
    (SELECT SUM(CASE WHEN b.dilation_result = 1 THEN 1 ELSE 0 END) FROM cdms_lung_function_record b WHERE b.org_id = o.id AND b.is_bronchial_dilation = 1) AS bronchodilation_positive_count,
    (SELECT COUNT(DISTINCT q.patient_id) FROM cdms_copd_screening q WHERE q.org_id = o.id AND q.patient_id IS NOT NULL AND q.total_score IS NOT NULL AND q.status = 0) AS questionnaire_count,
    (SELECT COUNT(DISTINCT q.patient_id) FROM cdms_copd_screening q WHERE q.org_id = o.id AND q.patient_id IS NOT NULL AND q.status = 0) AS screening_count
   FROM cdms_org o WHERE o.status = 1 AND ${s.sql} ORDER BY o.sort ASC, o.id ASC`, s.params);
  return {list:rows.map(row => ({communityName:String(row.community_name ?? ''),lungTestCount:integer(row.lung_test_count),bronchodilationCount:integer(row.bronchodilation_count),bronchodilationPositiveCount:integer(row.bronchodilation_positive_count),questionnaireCount:integer(row.questionnaire_count),screeningCount:integer(row.screening_count)}))};
 }

 async function getMapLayer({enterpriseId = 'all'} = {}) {
  const context = await getContext({enterpriseId});
  const region = await getOrgRegionList({enterpriseId});
  const rank = await getInstitutionRank({enterpriseId});
  const byName = new Map(rank.list.map(row => [row.institutionName,row.copdCount]));
  const regionByName = new Map(region.list.map(row => [row.communityName,row]));
  return {hospitalMarkers:context.hospitals.map(hospital => {
   const geo = mapConfig[String(hospital.id)] ?? {};
   const row = regionByName.get(hospital.name) ?? {};
   const copdCount = integer(byName.get(hospital.name));
   const bronchodilationCount = integer(row.bronchodilationCount);
   const bronchodilationPositiveCount = integer(row.bronchodilationPositiveCount);
   return {name:hospital.name,shortName:geo.shortName ?? hospital.name.slice(0,4),hospitalLevel:geo.hospitalLevel ?? null,lng:geo.lng ?? null,lat:geo.lat ?? null,...(geo.labelLng == null ? {} : {labelLng:geo.labelLng}),...(geo.labelLat == null ? {} : {labelLat:geo.labelLat}),screeningCount:integer(row.screeningCount),copdCount,bronchodilationCount,bronchodilationPositiveCount,bronchodilationPositiveRate:percent(bronchodilationPositiveCount,bronchodilationCount)};
  })};
 }

 async function getLungLevelDistribution({enterpriseId = 'all'} = {}) {
  const s = scope(enterpriseId, 'd.org_id');
  const rows = await rowsFor(pool, 'lung-level', `
   WITH latest AS (
    SELECT d.patient_id, d.lung_function_grade, d.diagnosis_status, d.submission_status,
           ROW_NUMBER() OVER (PARTITION BY d.patient_id ORDER BY COALESCE(d.version_no,0) DESC, d.update_time DESC, d.id DESC) AS rn
    FROM cdms_copd_diagnosis d WHERE d.patient_id IS NOT NULL AND ${s.sql}
   )
   SELECT lung_function_grade AS level, COUNT(*) AS count FROM latest
   WHERE rn = 1 AND diagnosis_status = 1 AND submission_status IN (0,2) GROUP BY lung_function_grade`, s.params);
  const values = Array(LEVELS.length).fill(0); for (const row of rows) { const level = mapLevel(row.level) ?? '未评估'; values[LEVELS.indexOf(level)] += integer(row.count); }
  return {categories:[...LEVELS],values};
 }

 async function assessmentRows(marker, enterpriseId) {
  const s = scope(enterpriseId, 'p.org_id');
  return rowsFor(pool, marker, `
   WITH latest AS (
    SELECT a.*, ROW_NUMBER() OVER (PARTITION BY a.patient_id ORDER BY a.assessment_date DESC, a.create_time DESC, a.id DESC) AS rn
    FROM cdms_copd_assessment a JOIN cdms_patient p ON p.id = a.patient_id
    WHERE a.patient_id IS NOT NULL AND p.status = 1 AND ${s.sql}
   ) SELECT * FROM latest WHERE rn = 1`, s.params);
 }

 async function getAssessmentGroupDistribution({enterpriseId = 'all'} = {}) {
  const rows = await assessmentRows('assessment-group', enterpriseId);
  const values = GROUPS.map(group => rows.filter(row => String(row.abe_group ?? '').toUpperCase() === group).reduce((sum,row) => sum + 1, 0));
  values.push(rows.filter(row => !GROUPS.includes(String(row.abe_group ?? '').toUpperCase())).length);
  return {categories:[...GROUPS,'未评估'],values};
 }

 async function getManagementLevelRating({enterpriseId = 'all'} = {}) {
  const rows = await assessmentRows('management-level', enterpriseId);
  const counts = new Map(); let unknown = 0;
  for (const row of rows) { const name = mapManagement(row.management_level); if (name) counts.set(name,(counts.get(name) ?? 0) + 1); else unknown += 1; }
  counts.set('未评估',unknown);
  return {items:Object.keys(COLORS).map(name => ({name,value:counts.get(name) ?? 0,color:COLORS[name]}))};
 }

 return createProviderContract({getContext,getLungFunctionStats,getAbnormalTrend,getInstitutionRank,getMapLayer,getOrgRegionList,getLungLevelDistribution,getAssessmentGroupDistribution,getManagementLevelRating});
}
