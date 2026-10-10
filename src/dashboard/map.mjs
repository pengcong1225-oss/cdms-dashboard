import {escapeHtml as esc,formatNumber as fmt} from './model.mjs';
export function containsPoint(geometry,point) {
 const inside=ring=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)result=!result;}return result;};
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 return polygons.some(rings=>inside(rings[0])&&!rings.slice(1).some(inside));
}
export function createMap(container,geo,metadata,onSelect,streets,onStreet) {
 const coordinates=geo.features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2));
 const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
 // Fit the district; keep restored labels inside the viewport without shrinking the map.
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const project=([x,y])=>[24+(x-minX)*952/(maxX-minX||1),24+(maxY-y)*532/(maxY-minY||1)];
 const path=geo.features.map(f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ')+' Z').join(' ')).join(' ')).join(' ');
 container.innerHTML=`<svg class="map-svg" viewBox="0 0 1000 580" role="img" aria-label="武汉经济技术开发区真实地图，滚轮缩放、拖动平移"><defs><linearGradient id="map-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3c8db0"/><stop offset="1" stop-color="#24587f"/></linearGradient></defs><g id="map-scene"><path class="district-outline" d="${path}" fill="url(#map-fill)" stroke="#78c3dd" stroke-width="1.6"/><g id="map-points"></g></g></svg><nav class="map-street-legend" aria-label="各街道机构数量"></nav><div class="map-tooltip" hidden></div>`;
 const svg=container.querySelector('svg'),scene=container.querySelector('#map-scene'),points=container.querySelector('#map-points'),tooltip=container.querySelector('.map-tooltip');
 const streetPath=f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ')+' Z').join(' ')).join(' ');
 const streetLayer=document.createElementNS('http://www.w3.org/2000/svg','g');
 const streetLabels=[];
 svg.setAttribute('role','group');
 streetLayer.innerHTML=(streets?.features??[]).map(f=>{
  const center=f.properties.center,[x,y]=Array.isArray(center)?project(center):[0,0];
  const [offsetX,offsetY]=({'军山街道':[60,12],'纱帽街道':[-40,-15],'东荆街道':[25,-12],'沌阳街道':[-12,-20]})[f.properties.name]??[0,0];
  if(Array.isArray(center))streetLabels.push({x:x+offsetX,y:y+offsetY,width:Array.from(f.properties.name).length*21,name:f.properties.name});
  return `<path class="street-region" data-street="${esc(f.properties.name)}" tabindex="0" role="button" aria-label="${esc(f.properties.name)}机构看板" d="${streetPath(f)}"/>`;
 }).join('');
 const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');clip.id='district-clip';clip.innerHTML=`<path d="${path}"/>`;svg.querySelector('defs').append(clip);
 streetLayer.innerHTML=`<g clip-path="url(#district-clip)">${streetLayer.innerHTML}</g>`+streetLabels.map(b=>`<text class="street-label" x="${b.x}" y="${b.y}" text-anchor="middle">${esc(b.name)}</text>`).join('');scene.insertBefore(streetLayer,points);
 let zoom=1,dx=0,dy=0,drag=null,moved=false,visibleRows=[],selected='';
 const legend=container.querySelector('.map-street-legend');
 const streetRows=feature=>visibleRows.filter(row=>{const item=metadata[String(row.orgId)];return item&&containsPoint(feature.geometry,[item.lng,item.lat]);});
 const transform=()=>scene.setAttribute('transform',`translate(${dx} ${dy}) translate(500 290) scale(${zoom}) translate(-500 -290)`);
 const viewport=()=>{const rect=svg.getBoundingClientRect();return {rect,scale:Math.min(rect.width/1000,(rect.height??rect.width*.58)/580)};};
 function update(rows,orgId='') {
  tooltip.hidden=true;
  visibleRows=rows??[]; selected=orgId;
  const byId=new Map(visibleRows.map(row=>[String(row.orgId),row]));
  legend.innerHTML=(streets?.features??[]).map(feature=>`<button data-street="${esc(feature.properties.name)}"><span>${esc(feature.properties.name)}</span><i aria-hidden="true">✚</i><b>${fmt(streetRows(feature).length)}</b></button>`).join('');
  const occupied=streetLabels.map(b=>({...b,x:b.x-b.width/2}));
  const {rect,scale}=viewport(),marginX=(rect.width/scale-1000)/2;
  // The legend stays fixed outside the scene; convert its screen box into scene units.
  const overlay=legend.getBoundingClientRect();
  if(overlay.width>0&&overlay.height>0){
   const left=(overlay.left-rect.left)/scale-marginX;
   const top=(overlay.top-rect.top-(rect.height-580*scale)/2)/scale;
   occupied.push({x:(left-500-dx)/zoom+500,y:(top+overlay.height/scale/2-290-dy)/zoom+290,width:overlay.width/scale/zoom,height:overlay.height/scale/zoom+16});
  }
  points.innerHTML=Object.entries(metadata).filter(([id])=>byId.has(id)).map(([id,item])=>{
   const [x,y]=project([item.lng,item.lat]);
   const center=item.shortName==='亚心';
   const symbol=center?'M0 -15L4.4 -4.9L15 -4.6L7.1 2.7L9.3 13.6L0 7.9L-9.3 13.6L-7.1 2.7L-15 -4.6L-4.4 -4.9Z':'M-2.5 -8H2.5V-2.5H8V2.5H2.5V8H-2.5V2.5H-8V-2.5H-2.5Z';
   const label=center?'亚心（经开区慢呼中心）':item.shortName??item.name;
   const width=Math.min(940,Array.from(label).length*18),[preferredX,preferredY]=project([item.labelLng??item.lng,item.labelLat??item.lat]);
   const lx=Math.max(20-marginX,Math.min(980+marginX-width,preferredX+5));
   let ly=Math.max(22,Math.min(558,preferredY+5));
   for(const offset of [0,24,-24,48,-48,72,-72,96,-96,120,-120,144,-144]){
    const candidate=Math.max(22,Math.min(558,preferredY+5+offset));
    if(!occupied.some(b=>lx<b.x+b.width+8&&lx+width+8>b.x&&Math.abs(candidate-b.y)<(b.height??44)/2)){ly=candidate;break;}
   }
   occupied.push({x:lx,y:ly,width});
   return `<g class="institution ${center?'hospital':''} ${id===selected?'selected':''}" data-org="${esc(id)}" tabindex="0" role="button" aria-label="${esc(item.name)}"><path class="leader" d="M${x} ${y}L${lx} ${ly-5}"/><g transform="translate(${x} ${y})"><circle class="halo" r="${center?19:15}"/><circle class="marker-ring" r="${center?16:12}"/><path class="medical-symbol" d="${symbol}"/></g><text x="${lx}" y="${ly}">${esc(label)}</text></g>`;
  }).join('');
 }
 const show=target=>{
  const node=target.closest('[data-org]');if(!node){
   const street=target.closest('[data-street]'),feature=(streets?.features??[]).find(f=>f.properties.name===street?.dataset.street);
   if(!feature){tooltip.hidden=true;return;}
   tooltip.innerHTML=`<strong>${esc(feature.properties.name)}</strong><p>机构数量：<b>${fmt(streetRows(feature).length)}</b></p><small>点击查看街道机构看板</small>`;tooltip.hidden=false;return;
  }
  const row=visibleRows.find(r=>String(r.orgId)===node.dataset.org);const item=metadata[node.dataset.org];
  if(!row||!item){tooltip.hidden=true;return;}
  tooltip.innerHTML=`<strong>${esc(row.orgName??item.name)}</strong><p>年度问卷 ${fmt(row.sqScreeningCount)} 人次</p><p>≥16分问卷 ${fmt(row.score16Count)} 人次</p><p>肺功能检查 ${fmt(row.lungFuncExamCount)} 人次</p><small>点击联动机构范围</small>`;tooltip.hidden=false;
 };
 svg.addEventListener('pointerover',e=>show(e.target));svg.addEventListener('focusin',e=>show(e.target));svg.addEventListener('pointerleave',()=>tooltip.hidden=true);
 svg.addEventListener('click',e=>{const p=e.target.closest('[data-org]');if(p){e.stopPropagation();if(!moved)onSelect(p.dataset.org);}});
 const openStreet=street=>{const feature=(streets?.features??[]).find(f=>f.properties.name===street.dataset.street);if(feature)onStreet?.(street.dataset.street,streetRows(feature));};
 legend.addEventListener('click',e=>{const street=e.target.closest('[data-street]');if(street)openStreet(street);});
 legend.addEventListener('pointerover',e=>show(e.target));legend.addEventListener('focusin',e=>show(e.target));legend.addEventListener('pointerleave',()=>tooltip.hidden=true);
 svg.addEventListener('click',e=>{const street=e.target.closest('[data-street]');if(street&&!moved)openStreet(street);});
 svg.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){const p=e.target.closest('[data-org]');const street=e.target.closest('[data-street]');if(p||street){e.preventDefault();if(p)onSelect(p.dataset.org);else openStreet(street);}}});
 svg.addEventListener('wheel',e=>{
  e.preventDefault();if(!e.deltaY)return;
  const next=Math.max(.7,Math.min(4,zoom*(e.deltaY<0?1.1:.9)));
  // Keep the geographic point under the mouse stationary while zooming.
  if(Number.isFinite(e.clientX)&&Number.isFinite(e.clientY)){
   const {rect,scale}=viewport(),x=(e.clientX-rect.left-(rect.width-1000*scale)/2)/scale,y=(e.clientY-rect.top-(rect.height-580*scale)/2)/scale;
   dx=x-500-(x-500-dx)*next/zoom;dy=y-290-(y-290-dy)*next/zoom;
  }
  zoom=next;tooltip.hidden=true;transform();
 },{passive:false});
 svg.addEventListener('pointerdown',e=>{moved=false;if(e.target.closest('[data-org]'))return;drag={x:e.clientX,y:e.clientY,dx,dy};});
 svg.addEventListener('pointermove',e=>{if(drag&&e.buttons){const {scale}=viewport();dx=drag.dx+(e.clientX-drag.x)/scale;dy=drag.dy+(e.clientY-drag.y)/scale;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4){moved=true;tooltip.hidden=true;svg.setPointerCapture(e.pointerId);}transform();}});
 svg.addEventListener('pointerup',()=>{drag=null;});
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>update(visibleRows,selected)).observe(container);
 return {update};
}
