import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap} from '../src/dashboard/map.mjs';
import {dashboardDom} from './dashboard-dom.mjs';

test('restored map legend counts only visible institutions and keeps selection, street drilldown and navigation',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try {
  const polygon=(left,right)=>({type:'Polygon',coordinates:[[[left,0],[right,0],[right,2],[left,2],[left,0]]]});
  const geo={features:[{geometry:polygon(0,2)}]},streets={features:[{properties:{name:'西街',center:[.5,1]},geometry:polygon(0,1)},{properties:{name:'东街',center:[1.5,1]},geometry:polygon(1,2)}]};
  const metadata={a:{name:'普通机构',shortName:'<普通>',lng:.5,lat:1,labelLng:-1,labelLat:3},b:{name:'武汉亚心总医院',shortName:'亚心',lng:1.5,lat:1},hidden:{name:'无权机构',lng:1.6,lat:1}};
  const selected=[],opened=[],map=createMap(dom.node('#map'),geo,metadata,id=>selected.push(id),streets,(name,rows)=>opened.push([name,rows]));
  map.update([{orgId:'a'},{orgId:'b'}]);
  const points=dom.node('#map #map-points'),legend=dom.node('#map .map-street-legend'),svg=dom.node('#map svg');
  assert.doesNotMatch(points.innerHTML,/无权机构|data-org="hidden"/);
  assert.match(points.innerHTML,/&lt;普通&gt;/);assert.match(points.innerHTML,/亚心（经开区慢呼中心）/);
  assert.match(legend.innerHTML,/西街.*?<b>1<\/b>/);assert.match(legend.innerHTML,/东街.*?<b>1<\/b>/);
  svg.handlers.wheel({preventDefault(){},deltaY:-1});const transform=dom.node('#map #map-scene').attributes.transform;
  const street={dataset:{street:'东街'}};
  legend.handlers.click({target:{closest:()=>street}});
  assert.deepEqual(opened,[['东街',[{orgId:'b'}]]]);
  svg.handlers.click({target:{closest:selector=>selector==='[data-street]'?null:{dataset:{org:'b'}}},stopPropagation(){}});
  // The DOM boundary keeps the last click listener; org keyboard selection exercises the production handler.
  svg.handlers.keydown({key:'Enter',target:{closest:selector=>selector==='[data-org]'?{dataset:{org:'b'}}:null},preventDefault(){}});
  assert.deepEqual(selected,['b']);
  map.update([{orgId:'a'}],'a');
  assert.match(legend.innerHTML,/东街.*?<b>0<\/b>/);assert.doesNotMatch(points.innerHTML,/data-org="b"/);
  assert.equal(dom.node('#map #map-scene').attributes.transform,transform);
  map.update([]);assert.equal(points.innerHTML,'');assert.match(legend.innerHTML,/西街.*?<b>0<\/b>/);
 }finally{installed.restore();}
});
