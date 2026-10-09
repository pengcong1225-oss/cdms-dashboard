import {escapeHtml as esc,formatNumber as fmt} from './model.mjs';
export function containsPoint(geometry,point) {
 const inside=ring=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)result=!result;}return result;};
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 return polygons.some(rings=>inside(rings[0])&&!rings.slice(1).some(inside));
}
export function createMap(container,geo,metadata,onSelect,streets,onStreet) {
 const coordinates=geo.features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2));
 const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min(850/(maxX-minX),460/(maxY-minY));
 const project=([x,y])=>[75+(x-minX)*scale,45+(maxY-y)*scale];
 const path=geo.features.map(f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ')+' Z').join(' ')).join(' ')).join(' ');
 container.innerHTML=`<svg class="map-svg" viewBox="0 0 1000 580" role="img" aria-label="武汉经济技术开发区真实地图，滚轮缩放、拖动平移"><defs><linearGradient id="map-fill" x2="0.7" y2="1"><stop stop-color="#175383"/><stop offset="1" stop-color="#102b51"/></linearGradient><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#5393cc" stroke-opacity=".14"/></pattern><filter id="map-glow"><feGaussianBlur stdDeviation="3"/></filter></defs><g id="map-scene"><path d="${path}" fill="url(#map-fill)" stroke="#43c9ff" stroke-width="2"/><path d="${path}" fill="url(#grid)"/><g id="map-points"></g></g></svg><div class="map-controls"><button data-zoom="1.2" aria-label="放大地图">＋</button><button data-zoom="0.8" aria-label="缩小地图">−</button><button data-reset>复位</button></div><div class="map-tooltip" hidden></div>`;
 const svg=container.querySelector('svg'),scene=container.querySelector('#map-scene'),points=container.querySelector('#map-points'),tooltip=container.querySelector('.map-tooltip');
 const streetPath=f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ')+' Z').join(' ')).join(' ');
 const streetLayer=document.createElementNS('http://www.w3.org/2000/svg','g');
 svg.setAttribute('role','group');
 streetLayer.innerHTML=(streets?.features??[]).map(f=>`<path class="street-region" data-street="${esc(f.properties.name)}" tabindex="0" role="button" aria-label="${esc(f.properties.name)}机构看板" d="${streetPath(f)}"><title>${esc(f.properties.name)} · 点击查看街道机构看板</title></path>`).join('');
 const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');clip.id='district-clip';clip.innerHTML=`<path d="${path}"/>`;svg.querySelector('defs').append(clip);
 streetLayer.setAttribute('clip-path','url(#district-clip)');scene.insertBefore(streetLayer,points);
 let zoom=1,dx=0,dy=0,drag=null,moved=false,visibleRows=[],selected='';
 const transform=()=>scene.setAttribute('transform',`translate(${dx} ${dy}) translate(500 290) scale(${zoom}) translate(-500 -290)`);
 function update(rows,orgId='') {
  tooltip.hidden=true;
  visibleRows=rows??[]; selected=orgId;
  const byId=new Map(visibleRows.map(row=>[String(row.orgId),row]));
  points.innerHTML=Object.entries(metadata).filter(([id])=>byId.has(id)).map(([id,item])=>{
   const [x,y]=project([item.lng,item.lat]); const [lx,ly]=project([item.labelLng??item.lng,item.labelLat??item.lat]);
   return `<g class="institution ${item.hospitalLevel>=2?'hospital':''} ${id===selected?'selected':''}" data-org="${esc(id)}" tabindex="0" role="button" aria-label="${esc(item.name)}"><path class="leader" d="M${x} ${y}L${lx} ${ly}"/><circle class="halo" cx="${x}" cy="${y}" r="9"/><circle cx="${x}" cy="${y}" r="4"/><text x="${lx+9}" y="${ly+4}">${esc(item.shortName)}</text></g>`;
  }).join('');
 }
 const show=target=>{
  const node=target.closest('[data-org]');if(!node){tooltip.hidden=true;return;}
  const row=visibleRows.find(r=>String(r.orgId)===node.dataset.org);const item=metadata[node.dataset.org];
  tooltip.innerHTML=`<strong>${esc(row.orgName??item.name)}</strong><p>年度问卷 ${fmt(row.sqScreeningCount)} 人次</p><p>≥16分问卷 ${fmt(row.score16Count)} 人次</p><p>肺功能检查 ${fmt(row.lungFuncExamCount)} 人次</p><small>点击联动机构范围</small>`;tooltip.hidden=false;
 };
 svg.addEventListener('pointerover',e=>show(e.target));svg.addEventListener('focusin',e=>show(e.target));svg.addEventListener('pointerleave',()=>tooltip.hidden=true);
 svg.addEventListener('click',e=>{const p=e.target.closest('[data-org]');if(p){e.stopPropagation();if(!moved)onSelect(p.dataset.org);}});
 const openStreet=street=>{const feature=streets.features.find(f=>f.properties.name===street.dataset.street);const rows=visibleRows.filter(row=>{const item=metadata[String(row.orgId)];return item&&containsPoint(feature.geometry,[item.lng,item.lat]);});onStreet?.(street.dataset.street,rows);};
 svg.addEventListener('click',e=>{const street=e.target.closest('[data-street]');if(street&&!moved)openStreet(street);});
 svg.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){const p=e.target.closest('[data-org]');const street=e.target.closest('[data-street]');if(p||street){e.preventDefault();if(p)onSelect(p.dataset.org);else openStreet(street);}}});
 svg.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.7,Math.min(4,zoom*(e.deltaY<0?1.1:.9)));transform();},{passive:false});
 svg.addEventListener('pointerdown',e=>{moved=false;if(e.target.closest('[data-org]'))return;drag={x:e.clientX,y:e.clientY,dx,dy};});
 svg.addEventListener('pointermove',e=>{if(drag&&e.buttons){const ratio=1000/svg.getBoundingClientRect().width;dx=drag.dx+(e.clientX-drag.x)*ratio;dy=drag.dy+(e.clientY-drag.y)*ratio;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4){moved=true;svg.setPointerCapture(e.pointerId);}transform();}});
 svg.addEventListener('pointerup',()=>{drag=null;});
 container.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoom=Math.max(.7,Math.min(4,zoom*Number(b.dataset.zoom)));transform();});
 container.querySelector('[data-reset]').onclick=()=>{zoom=1;dx=0;dy=0;transform();};
 return {update};
}
