import {escapeHtml as esc,formatNumber as fmt} from './model.mjs';
export function containsPoint(geometry,point) {
 const inside=ring=>{let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>point[1])!==(yj>point[1])&&point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi)result=!result;}return result;};
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 return polygons.some(rings=>inside(rings[0])&&!rings.slice(1).some(inside));
}
export function createMap(container,geo,metadata,onSelect,streets,onStreet,loadInstitutionStats) {
 const coordinates=geo.features.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2));
 const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
 // Fit the district with space for the legacy-style outer institution captions.
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const project=([x,y])=>[24+(x-minX)*720/(maxX-minX||1),70+(maxY-y)*402/(maxY-minY||1)];
 const path=geo.features.map(f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ')+' Z').join(' ')).join(' ')).join(' ');
 container.innerHTML=`<svg class="map-svg" viewBox="0 0 1000 580" role="img" aria-label="武汉经济技术开发区真实地图，滚轮缩放、拖动平移"><defs><linearGradient id="map-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3c8db0"/><stop offset="1" stop-color="#24587f"/></linearGradient></defs><g id="map-scene"><path class="district-outline" d="${path}" fill="url(#map-fill)" stroke="#78c3dd" stroke-width="1.6"/><g id="map-points"></g></g></svg><nav class="map-street-legend" aria-label="各街道机构数量"></nav><div class="map-tooltip" hidden></div>`;
 const svg=container.querySelector('svg'),scene=container.querySelector('#map-scene'),points=container.querySelector('#map-points'),tooltip=container.querySelector('.map-tooltip');
 const streetPath=f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>(i?'L':'M')+project(p).join(',')).join(' ')+' Z').join(' ')).join(' ');
 const streetLayer=document.createElementNS('http://www.w3.org/2000/svg','g');
 const streetLabels=[];
 svg.setAttribute('role','group');
 streetLayer.innerHTML=(streets?.features??[]).map(f=>{
  const center=f.properties.center,[x,y]=Array.isArray(center)?project(center):[0,0];
  const [offsetX,offsetY]=({'军山街道':[60,12],'纱帽街道':[-40,-15],'东荆街道':[25,-12],'沌阳街道':[-35,-15],'沌口街道':[10,25]})[f.properties.name]??[0,0];
  if(Array.isArray(center))streetLabels.push({x:x+offsetX,y:y+offsetY,preferredX:x+offsetX,preferredY:y+offsetY,width:Array.from(f.properties.name).length*16,name:f.properties.name});
  return `<path class="street-region" data-street="${esc(f.properties.name)}" tabindex="0" role="button" aria-label="${esc(f.properties.name)}机构看板" d="${streetPath(f)}"/>`;
 }).join('');
 const clip=document.createElementNS('http://www.w3.org/2000/svg','clipPath');clip.id='district-clip';clip.innerHTML=`<path d="${path}"/>`;svg.querySelector('defs').append(clip);
 streetLayer.innerHTML=`<g clip-path="url(#district-clip)">${streetLayer.innerHTML}</g>`+streetLabels.map(b=>`<text class="street-label" x="${b.x}" y="${b.y}" text-anchor="middle">${esc(b.name)}</text>`).join('');scene.insertBefore(streetLayer,points);
 let zoom=1,dx=0,dy=0,drag=null,moved=false,visibleRows=[],selected='',hoverVersion=0,hoverTimer;
 const hideTooltip=()=>{hoverVersion++;clearTimeout(hoverTimer);tooltip.hidden=true;};
 const legend=container.querySelector('.map-street-legend');
 const streetRows=feature=>visibleRows.filter(row=>{const item=metadata[String(row.orgId)];return item&&containsPoint(feature.geometry,[item.lng,item.lat]);});
 const transform=()=>scene.setAttribute('transform',`translate(${dx} ${dy}) translate(500 290) scale(${zoom}) translate(-500 -290)`);
 const viewport=()=>{const rect=svg.getBoundingClientRect();return {rect,scale:Math.min(rect.width/1000,(rect.height??rect.width*.58)/580)};};
 function update(rows,orgId='') {
  hideTooltip();
  visibleRows=rows??[]; selected=orgId;
  const byId=new Map(visibleRows.map(row=>[String(row.orgId),row]));
  legend.innerHTML=(streets?.features??[]).map(feature=>`<button data-street="${esc(feature.properties.name)}"><span>${esc(feature.properties.name)}</span><i aria-hidden="true">✚</i><b>${fmt(streetRows(feature).length)}</b></button>`).join('');
  const entries=Object.entries(metadata).filter(([id])=>byId.has(id)).sort(([,a],[,b])=>Number(b.shortName==='亚心')-Number(a.shortName==='亚心'));
  const occupied=[];
  // Names must clear the stars and crosses, including the other institutions' markers.
  for(const [,item] of entries){const [x,y]=project([item.lng,item.lat]);occupied.push({x:x-28,y:y+8,width:56,height:80});}
  const {rect,scale}=viewport(),marginX=(rect.width/scale-1000)/2,marginY=((rect.height??580*scale)/scale-580)/2;
  // The legend stays fixed outside the scene; convert its screen box into scene units.
  const overlay=legend.getBoundingClientRect();
  if(overlay.width>0&&overlay.height>0){
   const left=(overlay.left-rect.left)/scale-marginX;
   const top=(overlay.top-rect.top-(rect.height-580*scale)/2)/scale;
   occupied.push({x:(left-500-dx)/zoom+500,y:(top+overlay.height/scale/2-290-dy)/zoom+290,width:overlay.width/scale/zoom,height:overlay.height/scale/zoom+16});
  }
  // Give street names their own clear space before placing institution captions.
  for(const label of streetLabels){
   let placed=false;
   for(const offset of [0,...Array.from({length:14},(_,i)=>[(i+1)*36,-(i+1)*36]).flat()]){
    const y=Math.max(28-marginY,Math.min(552+marginY,label.preferredY+offset));
    for(const shift of [0,-90,90,-180,180]){
     const x=Math.max(20-marginX,Math.min(980+marginX-label.width,label.preferredX-label.width/2+shift));
     if(!occupied.some(b=>x<b.x+b.width+16&&x+label.width+16>b.x&&Math.abs(y-b.y)<(b.height??72)/2)){
      label.x=x+label.width/2;label.y=y;placed=true;break;
     }
    }
    if(placed)break;
   }
   occupied.push({...label,x:label.x-label.width/2,height:72});
  }
  streetLayer.innerHTML=`<g clip-path="url(#district-clip)">${(streets?.features??[]).map(f=>`<path class="street-region" data-street="${esc(f.properties.name)}" tabindex="0" role="button" aria-label="${esc(f.properties.name)}机构看板" d="${streetPath(f)}"/>`).join('')}</g>`+streetLabels.map(b=>`<text class="street-label" x="${b.x}" y="${b.y}" text-anchor="middle">${esc(b.name)}</text>`).join('');
  points.innerHTML=entries.map(([id,item])=>{
   const [x,y]=project([item.lng,item.lat]);
   const center=item.shortName==='亚心';
   const symbol=center?'M0 -15L4.4 -4.9L15 -4.6L7.1 2.7L9.3 13.6L0 7.9L-9.3 13.6L-7.1 2.7L-15 -4.6L-4.4 -4.9Z':'M-2.5 -8H2.5V-2.5H8V2.5H2.5V8H-2.5V2.5H-8V-2.5H-2.5Z';
   const label=center?'亚心（经开区慢呼中心）':item.shortName??item.name;
   const width=Math.min(940,Array.from(label).length*14),preferred=project([item.labelLng??item.lng,item.labelLat??item.lat]);
   const [spreadX,spreadY]=({'亚心':[110,0],'碧湖':[-85,-45],'名逸':[0,-70],'新民':[35,-60]})[item.shortName]??[0,0];
   const [preferredX,preferredY]=[preferred[0]+spreadX,preferred[1]+spreadY];
   const clampX=value=>Math.max(20-marginX,Math.min(980+marginX-width,value));
   const clampY=value=>Math.max(22-marginY,Math.min(558+marginY,value));
   const positions=[...new Set((center?[preferredX+5,x+28,x-width-28]:[preferredX+5,x+28,x-width-28]).map(clampX))];
   let lx=positions[0],ly=clampY(preferredY+5),placed=false;
   for(const offset of [0,...Array.from({length:12},(_,i)=>[(i+1)*24,-(i+1)*24]).flat()]){
    const candidate=clampY(preferredY+5+offset);
    for(const position of positions){
     if(!occupied.some(b=>position<b.x+b.width+16&&position+width+16>b.x&&Math.abs(candidate-b.y)<(b.height??64)/2)){lx=position;ly=candidate;placed=true;break;}
    }
    if(placed)break;
   }
   occupied.push({x:lx,y:ly,width});
   const leaderX=lx+width<x?lx+width:lx;
   return `<g class="institution ${center?'hospital':''} ${id===selected?'selected':''}" data-org="${esc(id)}" tabindex="0" role="button" aria-label="${esc(item.name)}"><path class="leader" d="M${x} ${y}L${leaderX} ${ly-5}"/><g transform="translate(${x} ${y})"><circle class="halo" r="${center?19:15}"/><circle class="marker-ring" r="${center?16:12}"/><path class="medical-symbol" d="${symbol}"/></g><text x="${lx}" y="${ly}">${esc(label)}</text></g>`;
  }).join('');
 }
 const show=target=>{
  clearTimeout(hoverTimer);
  const version=++hoverVersion,node=target.closest('[data-org]');if(!node){
   tooltip.classList.toggle('institution-tooltip',false);
   const street=target.closest('[data-street]'),feature=(streets?.features??[]).find(f=>f.properties.name===street?.dataset.street);
   if(!feature){tooltip.hidden=true;return;}
   tooltip.classList.toggle('institution-tooltip',true);
   tooltip.innerHTML=`<div class="institution-tooltip-heading"><strong>${esc(feature.properties.name)}</strong><span>街道机构概况</span></div><div class="institution-tooltip-stats"><p><span>机构数量：</span><b>${fmt(streetRows(feature).length)}</b><small>家</small></p></div><small class="street-tooltip-hint">点击查看街道机构看板</small>`;tooltip.hidden=false;return;
  }
  const row=visibleRows.find(r=>String(r.orgId)===node.dataset.org);const item=metadata[node.dataset.org];
  if(!row||!item){tooltip.hidden=true;return;}
  const name=String(row.orgName??item.name)+(item.shortName==='亚心'&&!String(row.orgName??item.name).includes('慢呼中心')?'（经开区慢呼中心）':'');
  const content=stats=>`<div class="institution-tooltip-heading"><strong>${esc(name)}</strong><span>人群情况统计</span></div><div class="institution-tooltip-stats">${[['COPD-SQ筛查问卷',row.sqScreeningCount,'人次'],['高危人群',stats?.highRisk,'人'],['慢阻肺人群管理',stats?.managed,'人']].map(([label,value,unit])=>`<p><span>${label}</span><b>${fmt(value)}</b><small>${unit}</small></p>`).join('')}</div>`;
  tooltip.classList.toggle('institution-tooltip',true);
  tooltip.innerHTML=content(null);tooltip.hidden=false;
  const applyStats=stats=>{
   if(version!==hoverVersion||tooltip.hidden)return;
   const expiresAt=stats?.expiresAt;
   if(Number.isFinite(expiresAt)&&expiresAt<=Date.now()){tooltip.innerHTML=content(null);return;}
   tooltip.innerHTML=content(stats);
   if(Number.isFinite(expiresAt))hoverTimer=setTimeout(()=>{
    if(version!==hoverVersion||tooltip.hidden)return;
    tooltip.innerHTML=content(null);loadStats();
   },expiresAt-Date.now());
  };
  const loadStats=()=>{if(loadInstitutionStats)void Promise.resolve(loadInstitutionStats(node.dataset.org)).then(applyStats).catch(()=>{});};
  loadStats();
 };
 svg.addEventListener('pointerover',e=>show(e.target));svg.addEventListener('focusin',e=>show(e.target));svg.addEventListener('pointerleave',hideTooltip);
 svg.addEventListener('focusout',e=>{if(!container.contains(e.relatedTarget))hideTooltip();});
 svg.addEventListener('click',e=>{const p=e.target.closest('[data-org]');if(p){e.stopPropagation();if(!moved)onSelect(p.dataset.org);}});
 const openStreet=street=>{const feature=(streets?.features??[]).find(f=>f.properties.name===street.dataset.street);if(feature)onStreet?.(street.dataset.street,streetRows(feature));};
 legend.addEventListener('click',e=>{const street=e.target.closest('[data-street]');if(street)openStreet(street);});
 legend.addEventListener('pointerover',e=>show(e.target));legend.addEventListener('focusin',e=>show(e.target));legend.addEventListener('pointerleave',hideTooltip);
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
  zoom=next;hideTooltip();transform();
 },{passive:false});
 svg.addEventListener('pointerdown',e=>{moved=false;if(e.target.closest('[data-org]'))return;drag={x:e.clientX,y:e.clientY,dx,dy};});
 svg.addEventListener('pointermove',e=>{if(drag&&e.buttons){const {scale}=viewport();dx=drag.dx+(e.clientX-drag.x)/scale;dy=drag.dy+(e.clientY-drag.y)/scale;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4){moved=true;hideTooltip();svg.setPointerCapture(e.pointerId);}transform();}});
 svg.addEventListener('pointerup',()=>{drag=null;});
 if(typeof ResizeObserver==='function')new ResizeObserver(()=>update(visibleRows,selected)).observe(container);
 return {update,hideTooltip};
}
