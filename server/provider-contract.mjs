const methods = {
 context: 'getContext',
 lungFunctionStats: 'getLungFunctionStats',
 abnormalTrend: 'getAbnormalTrend',
 institutionRank: 'getInstitutionRank',
 mapLayer: 'getMapLayer',
 orgRegionList: 'getOrgRegionList',
 lungLevelDistribution: 'getLungLevelDistribution',
 assessmentGroupDistribution: 'getAssessmentGroupDistribution',
 managementLevelRating: 'getManagementLevelRating'
};

const defaults = {
 getContext: {viewAll:true,canSwitchHospital:false,hospitalLevel:null,currentEnterpriseName:'',hospitals:[]},
 getLungFunctionStats: {screeningCount:0,lungTestCount:0,copdCount:0,followUpCount:0,bronchodilationCount:0,bronchodilationPositiveCount:0,bronchodilationPositiveRate:0},
 getAbnormalTrend: {monthlyScreeningCounts:Array(12).fill(0),monthlyCopdCounts:Array(12).fill(0)},
 getInstitutionRank: {list:[]},
 getMapLayer: {hospitalMarkers:[]},
 getOrgRegionList: {list:[]},
 getLungLevelDistribution: {categories:[],values:[]},
 getAssessmentGroupDistribution: {categories:[],values:[]},
 getManagementLevelRating: {items:[]}
};

function normalize(name, value) {
 const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
 const fallback = defaults[name];
 const result = {...fallback, ...source};
 for (const key of Object.keys(fallback)) {
  if (result[key] == null) result[key] = fallback[key];
 }
 return result;
}

export function createProviderContract(provider) {
 if (!provider || typeof provider !== 'object') throw new TypeError('provider must be an object');
 for (const name of Object.values(methods)) {
  if (typeof provider[name] !== 'function') throw new TypeError(`provider method ${name} is required`);
 }
 return Object.fromEntries(Object.entries(methods).map(([key,name]) => [name, async args => normalize(name, await provider[name](args))]));
}

export {defaults as providerDefaults};
