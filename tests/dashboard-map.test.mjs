import test from 'node:test';
import assert from 'node:assert/strict';
import {createMap,containsPoint} from '../src/dashboard/map.mjs';
import {readFileSync} from 'node:fs';
import {dashboardDom} from './dashboard-dom.mjs';

test('institution hover contains only the requested three statistics and ignores late responses after leaving',async()=>{
 const dom=dashboardDom(),installed=dom.install();
 let release;const pending=new Promise(resolve=>release=resolve),requested=[];
 try{
  const geo={features:[{geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}}]};
  const map=createMap(dom.node('#map'),geo,{a:{name:'武汉亚心<医院>',shortName:'亚心',lng:1,lat:1}},()=>{},null,null,id=>{requested.push(id);return pending;});
  map.update([{orgId:'a',sqScreeningCount:1557,score16Count:100,lungFuncExamCount:50}]);
  const svg=dom.node('#map svg'),tooltip=dom.node('#map .map-tooltip');
  const target={closest:selector=>selector==='[data-org]'?{dataset:{org:'a'}}:null};
  svg.handlers.pointerover({target});
  assert.match(tooltip.innerHTML,/COPD-SQ筛查问卷/);assert.match(tooltip.innerHTML,/高危人群/);assert.match(tooltip.innerHTML,/慢阻肺人群管理/);
  assert.match(tooltip.innerHTML,/1,557/);assert.match(tooltip.innerHTML,/武汉亚心&lt;医院&gt;/);
  assert.doesNotMatch(tooltip.innerHTML,/肺功能检查|≥16分问卷/);
  assert.deepEqual(requested,['a']);
  svg.handlers.pointerleave();release({highRisk:23,managed:4});await pending;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(tooltip.hidden,true);assert.doesNotMatch(tooltip.innerHTML,/>23</);
  svg.handlers.pointerover({target});await new Promise(resolve=>setImmediate(resolve));
  assert.match(tooltip.innerHTML,/>23</);assert.match(tooltip.innerHTML,/>4</);
  map.hideTooltip();assert.equal(tooltip.hidden,true);
 }finally{installed.restore();}
});

test('hospital long labels clear all medical markers even in a narrow map',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try{
  const geo={features:[{geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}}]};
  const metadata={a:{name:'武汉亚心总医院',shortName:'亚心',lng:1.7,lat:1.7},b:{name:'新民',lng:1.6,lat:1.8},c:{name:'沌口',lng:1.72,lat:1.45}};
  const map=createMap(dom.node('#map'),geo,metadata,()=>{});
  map.update(Object.keys(metadata).map(orgId=>({orgId})));
  const html=dom.node('#map #map-points').innerHTML;
  const star=html.match(/data-org="a"[\s\S]*?<text x="([\d.-]+)" y="([\d.-]+)"/);
  const lx=Number(star[1]),ly=Number(star[2]),width=Array.from('亚心（经开区慢呼中心）').length*14;
  for(const item of Object.values(metadata)){
   const x=24+item.lng*360,y=70+(2-item.lat)*201;
   const overlaps=lx<x+20&&lx+width>x-20&&ly-18<y+20&&ly>y-20;
   assert.equal(overlaps,false,'hospital caption must not overlap a star or plus marker');
  }
 }finally{installed.restore();}
});

test('a continuously visible institution tooltip discards expired totals and reloads',async()=>{
 const dom=dashboardDom(),installed=dom.install();let loads=0;
 try{
  const geo={features:[{geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]}}]};
  const map=createMap(dom.node('#map'),geo,{a:{name:'机构',lng:1,lat:1}},()=>{},null,null,async()=>++loads===1?{highRisk:23,managed:4,expiresAt:Date.now()+40}:{highRisk:null,managed:null,expiresAt:null});
  map.update([{orgId:'a',sqScreeningCount:100}]);
  dom.node('#map svg').handlers.pointerover({target:{closest:selector=>selector==='[data-org]'?{dataset:{org:'a'}}:null}});
  await new Promise(resolve=>setImmediate(resolve));assert.match(dom.node('#map .map-tooltip').innerHTML,/>23</);
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(loads,2);assert.doesNotMatch(dom.node('#map .map-tooltip').innerHTML,/>23</);map.hideTooltip();
 }finally{installed.restore();}
});

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
  assert.ok(Number(label[1])+Array.from('红十字会').length*18<=772||Number(label[2])<=472,'label must clear the legend on either axis');
  const svg=dom.node('#map svg'),scene=dom.node('#map #map-scene');
  svg.handlers.wheel({preventDefault(){},deltaY:-1,clientX:385,clientY:237.5});
  const offsets=()=>scene.attributes.transform.match(/^translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  let [dx,dy]=offsets();
  assert.ok(Math.abs(dx+25)<1e-8&&Math.abs(dy+14.5)<1e-8,'wheel anchor uses scaled screen coordinates');
  svg.handlers.pointerdown({clientX:100,clientY:100,target:{closest:()=>null}});
  svg.handlers.pointermove({clientX:150,clientY:130,buttons:1,pointerId:1});
  [dx,dy]=offsets();
  assert.ok(Math.abs(dx-75)<1e-8&&Math.abs(dy-45.5)<1e-8,'drag distance is converted to SVG units');
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
  assert.match(points.innerHTML,/translate\(204 271\)/);
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
  assert.match(tooltip.innerHTML,/机构数量：<\/span><b>1<\/b>/);
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
  assert.match(tooltip.innerHTML,/机构数量：<\/span><b>0<\/b>/);
  assert.equal(dom.node('#map #map-scene').attributes.transform,anchoredTransform);
  map.update([]);assert.equal(points.innerHTML,'');assert.equal(tooltip.hidden,true);
 }finally{installed.restore();}
});


test('street captions clear northern institution markers and each other',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try{
  const geometry={type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]};
  const streets={features:['沌阳街道','沌口街道'].map(name=>({geometry,properties:{name,center:[1.7,1.7]}}))};
  const metadata={a:{name:'亚心',shortName:'亚心',lng:1.7,lat:1.7},b:{name:'新民',lng:1.55,lat:1.8}};
  const map=createMap(dom.node('#map'),{features:[{geometry}]},metadata,()=>{},streets);
  map.update([{orgId:'a'},{orgId:'b'}]);
  const labels=[...dom.node('created g').innerHTML.matchAll(/<text class="street-label" x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]+)<\/text>/g)].map(m=>({x:+m[1],y:+m[2],width:Array.from(m[3]).length*16}));
  assert.equal(labels.length,2);
  for(const label of labels)for(const item of Object.values(metadata)){
   const x=24+item.lng*360,y=70+(2-item.lat)*201;
   assert.equal(label.x-label.width/2<x+28&&label.x+label.width/2>x-28&&label.y-24<y+28&&label.y+8>y-28,false,'street caption must clear marker with breathing room');
  }
  assert.ok(Math.abs(labels[0].y-labels[1].y)>=36||Math.abs(labels[0].x-labels[1].x)>=(labels[0].width+labels[1].width)/2+16,'street captions must have breathing room');
 }finally{installed.restore();}
});


test('real street captions stay inside their own district and do not move with institution scope',()=>{
 const dom=dashboardDom(),installed=dom.install();
 try{
  const geo=JSON.parse(readFileSync(new URL('../public/map/whkfq.json',import.meta.url),'utf8'));
  const streets=JSON.parse(readFileSync(new URL('../assets/streets.json',import.meta.url),'utf8'));
  const metadata=JSON.parse(readFileSync(new URL('../server/map-config.json',import.meta.url),'utf8'));
  const coordinates=geo.features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2));
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const map=createMap(dom.node('#map'),geo,metadata,()=>{},streets);
  const read=()=>[...dom.node('created g').innerHTML.matchAll(/<text class="street-label" x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]+)<\/text>/g)].map(m=>({x:+m[1],y:+m[2],name:m[3]}));
  map.update(Object.keys(metadata).map(orgId=>({orgId})));
  const labels=read();assert.equal(labels.length,7);
  for(const label of labels){
   const location=[minX+(label.x-24)*(maxX-minX)/720,maxY-(label.y-70)*(maxY-minY)/402];
   assert.ok(containsPoint(streets.features.find(f=>f.properties.name===label.name).geometry,location),label.name+' must identify its own region');
   assert.ok(geo.features.some(f=>containsPoint(f.geometry,location)),label.name+' must remain on the district map');
  }
  map.update([]);assert.deepEqual(read(),labels,'street labels are geographic anchors, not institution-scope-dependent captions');
 }finally{installed.restore();}
});
