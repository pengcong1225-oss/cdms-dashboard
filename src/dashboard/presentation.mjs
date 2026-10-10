const modes=['auto','16:9','4:3'];
const storageKey='dashboard.layoutMode';
const validMode=value=>modes.includes(value)?value:'auto';

export function computeFrame(viewWidth,viewHeight,mode='auto') {
 const w=Number.isFinite(viewWidth)&&viewWidth>0?viewWidth:1920,h=Number.isFinite(viewHeight)&&viewHeight>0?viewHeight:1080;
 const chosen=validMode(mode),aspect=chosen==='auto'?(w/h>=14/9?'16:9':'4:3'):chosen;
 const width=aspect==='16:9'?1920:1440,height=1080,scale=Math.min(w/width,h/height);
 return {aspect,width,height,scale,x:(w-width*scale)/2,y:(h-height*scale)/2};
}

export function createPresentation({root,control,storage,viewport=window}) {
 try{storage??=globalThis.localStorage;}catch{}
 let mode='auto';
 try{mode=validMode(storage?.getItem(storageKey));}catch{}
 function apply(){
  const frame=computeFrame(viewport.innerWidth,viewport.innerHeight,mode);
  root.dataset.aspect=frame.aspect;
  root.style.width=`${frame.width}px`;root.style.height=`${frame.height}px`;
  root.style.transform=`translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})`;
  control.value=mode;
 }
 control.addEventListener('change',()=>{mode=validMode(control.value);try{storage?.setItem(storageKey,mode);}catch{}apply();});
 viewport.addEventListener('resize',apply);
 apply();
 return {apply};
}
