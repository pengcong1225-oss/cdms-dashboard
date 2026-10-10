import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap} from '../src/dashboard/map.mjs';
import {dashboardDom} from './dashboard-dom.mjs';

test('unlabelled map fits district instead of label margins and keeps scoped hover, selection, street drilldown and wheel navigation',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try {
  const polygon=(left,right)=>({type:'Polygon',coordinates:[[[left,0],[right,0],[right,2],[left,2],[left,0]]]});
  const geo={features:[{geometry:polygon(0,2)}]},streets={features:[{properties:{name:'西街',center:[.5,1]},geometry:polygon(0,1)},{properties:{name:'东街',center:[1.5,1]},geometry:polygon(1,2)}]};
  const metadata={a:{name:'普通机构',shortName:'<普通>',lng:.5,lat:1,labelLng:-1,labelLat:3},b:{name:'武汉亚心总医院',shortName:'亚心',lng:1.5,lat:1},hidden:{name:'无权机构',lng:1.6,lat:1}};
  const selected=[],opened=[],map=createMap(dom.node('#map'),geo,metadata,id=>selected.push(id),streets,(name,rows)=>opened.push([name,rows]));
  map.update([{orgId:'a'},{orgId:'b'}]);
  const points=dom.node('#map #map-points'),svg=dom.node('#map svg'),tooltip=dom.node('#map .map-tooltip');
  assert.doesNotMatch(points.innerHTML,/无权机构|data-org="hidden"/);
  assert.doesNotMatch(points.innerHTML,/<text|class="leader"/);
  assert.match(points.innerHTML,/translate\(262 290\)/);
  assert.match(points.innerHTML,/institution hospital/);
  assert.doesNotMatch(dom.node('#map').innerHTML,/map-controls|data-reset|data-zoom|map-street-legend/);
  svg.handlers.wheel({preventDefault(){},deltaY:-1});const transform=dom.node('#map #map-scene').attributes.transform;
  assert.match(transform,/scale\(1.1\)/);
  svg.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:580});
  svg.handlers.wheel({preventDefault(){},deltaY:1,clientX:750,clientY:435});
  assert.match(dom.node('#map #map-scene').attributes.transform,/translate\(25 14.5\).*scale\(0.9900000000000001\)/);
  svg.handlers.wheel({preventDefault(){},deltaY:0});
  const anchoredTransform=dom.node('#map #map-scene').attributes.transform;
  const street={dataset:{street:'东街'}};
  svg.handlers.pointerover({target:{closest:selector=>selector==='[data-street]'?street:null}});
  assert.match(tooltip.innerHTML,/机构数量：<b>1<\/b>/);
  svg.handlers.click({target:{closest:selector=>selector==='[data-street]'?street:null}});
  assert.deepEqual(opened,[['东街',[{orgId:'b'}]]]);
  svg.handlers.click({target:{closest:selector=>selector==='[data-street]'?null:{dataset:{org:'b'}}},stopPropagation(){}});
  // The DOM boundary keeps the last click listener; org keyboard selection exercises the production handler.
  svg.handlers.keydown({key:'Enter',target:{closest:selector=>selector==='[data-org]'?{dataset:{org:'b'}}:null},preventDefault(){}});
  assert.deepEqual(selected,['b']);
  map.update([{orgId:'a'}],'a');
  assert.doesNotMatch(points.innerHTML,/data-org="b"/);
  svg.handlers.pointerover({target:{closest:selector=>selector==='[data-street]'?street:null}});
  assert.match(tooltip.innerHTML,/机构数量：<b>0<\/b>/);
  assert.equal(dom.node('#map #map-scene').attributes.transform,anchoredTransform);
  map.update([]);assert.equal(points.innerHTML,'');assert.equal(tooltip.hidden,true);
 }finally{installed.restore();}
});
