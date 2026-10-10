import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap} from '../src/dashboard/map.mjs';
import {dashboardDom} from './dashboard-dom.mjs';

test('scaled map labels avoid the fixed street legend',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try{
  dom.node('#map svg').getBoundingClientRect=()=>({left:10,top:20,width:500,height:290});
  dom.node('#map .map-street-legend').getBoundingClientRect=()=>({left:400,top:260,width:110,height:50});
  const geo={features:[{geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}}]};
  const map=createMap(dom.node('#map'),geo,{a:{name:'红十字会',lng:1.63,lat:.2}},()=>{});
  map.update([{orgId:'a'}]);
  const label=dom.node('#map #map-points').innerHTML.match(/<text x="([\d.]+)" y="([\d.]+)"/);
  assert.ok(label);
  assert.ok(Number(label[2])<=472,'label baseline must stay above the legend at SVG y=480');
 }finally{installed.restore();}
});

test('labelled map keeps district fit, scoped street counts, drilldown and wheel navigation without toolbar controls',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try {
  const polygon=(left,right)=>({type:'Polygon',coordinates:[[[left,0],[right,0],[right,2],[left,2],[left,0]]]});
  const geo={features:[{geometry:polygon(0,2)}]},streets={features:[{properties:{name:'西街',center:[.5,1]},geometry:polygon(0,1)},{properties:{name:'东街',center:[1.5,1]},geometry:polygon(1,2)}]};
  const metadata={a:{name:'普通机构',shortName:'<普通>',lng:.5,lat:1,labelLng:-1,labelLat:3},b:{name:'武汉亚心总医院',shortName:'亚心',lng:1.5,lat:1},hidden:{name:'无权机构',lng:1.6,lat:1}};
  const selected=[],opened=[],map=createMap(dom.node('#map'),geo,metadata,id=>selected.push(id),streets,(name,rows)=>opened.push([name,rows]));
  map.update([{orgId:'a'},{orgId:'b'}]);
  const points=dom.node('#map #map-points'),svg=dom.node('#map svg'),tooltip=dom.node('#map .map-tooltip'),legend=dom.node('#map .map-street-legend');
  assert.doesNotMatch(points.innerHTML,/无权机构|data-org="hidden"/);
  assert.match(points.innerHTML,/&lt;普通&gt;/);assert.match(points.innerHTML,/亚心（经开区慢呼中心）/);
  assert.match(dom.node('created g').innerHTML,/street-label.*?西街/);
  assert.match(legend.innerHTML,/西街.*?<b>1<\/b>/);assert.match(legend.innerHTML,/东街.*?<b>1<\/b>/);
  assert.match(points.innerHTML,/<text x="20" y="22">&lt;普通&gt;/);
  assert.match(points.innerHTML,/translate\(262 290\)/);
  assert.match(points.innerHTML,/institution hospital/);
  assert.doesNotMatch(dom.node('#map').innerHTML,/map-controls|data-reset|data-zoom/);
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
  legend.handlers.click({target:{closest:()=>street}});
  assert.deepEqual(opened,[['东街',[{orgId:'b'}]]]);
  svg.handlers.click({target:{closest:selector=>selector==='[data-street]'?null:{dataset:{org:'b'}}},stopPropagation(){}});
  // The DOM boundary keeps the last click listener; org keyboard selection exercises the production handler.
  svg.handlers.keydown({key:'Enter',target:{closest:selector=>selector==='[data-org]'?{dataset:{org:'b'}}:null},preventDefault(){}});
  assert.deepEqual(selected,['b']);
  map.update([{orgId:'a'}],'a');
  assert.doesNotMatch(points.innerHTML,/data-org="b"/);
  assert.match(legend.innerHTML,/东街.*?<b>0<\/b>/);
  svg.handlers.pointerover({target:{closest:selector=>selector==='[data-street]'?street:null}});
  assert.match(tooltip.innerHTML,/机构数量：<b>0<\/b>/);
  assert.equal(dom.node('#map #map-scene').attributes.transform,anchoredTransform);
  map.update([]);assert.equal(points.innerHTML,'');assert.equal(tooltip.hidden,true);
 }finally{installed.restore();}
});
