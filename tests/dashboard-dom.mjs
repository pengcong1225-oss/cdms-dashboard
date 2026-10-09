// Small DOM boundary double: production app, refresh controller and map event handlers remain real.
// Writes are counted so a request cannot silently repaint unrelated dashboard sections.
export function dashboardDom() {
 const nodes=new Map(),timers=[],windowHandlers={};
 const node=selector=>{
  if(nodes.has(selector))return nodes.get(selector);
  let html='',value='';
  const item={writes:0,attributes:{},handlers:{},options:[],dataset:{},hidden:false,textContent:'',title:'',classList:{toggle(){}},
   get innerHTML(){return html;},set innerHTML(next){html=next;this.writes++;},
   get value(){return value;},set value(next){value=String(next);},
   get selectedOptions(){return this.options.filter(option=>option.value===value);},
   add(option){this.options.push(option);if(this.options.length===1)value=option.value;},
   replaceChildren(...children){this.options=[...children];value=children[0]?.value??'';this.innerHTML='';},
   querySelector:sub=>node(`${selector} ${sub}`),querySelectorAll:sub=>sub==='[data-zoom]'?[]:[],
   addEventListener(event,handler){this.handlers[event]=handler;},setAttribute(name,next){this.attributes[name]=next;},
   append(){},insertBefore(){},contains(){return false;},close(){this.open=false;},showModal(){this.open=true;},setPointerCapture(){},
   getBoundingClientRect(){return {width:1000};}};
  nodes.set(selector,item);return item;
 };
 const document={baseURI:'https://cdms.example/dashboard/',hidden:false,querySelector:node,querySelectorAll:()=>[],addEventListener(event,handler){this[event]=handler;},createElementNS:(ns,name)=>node(`created ${name}`)};
 const window={addEventListener(event,handler){windowHandlers[event]=handler;}};
 const install=()=>{
  const originals=new Map(['document','window','localStorage','Option','fetch','setInterval'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const storage=new Map([['token','user-a']]);
  Object.assign(globalThis,{document,window,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},Option:class{constructor(text,value){this.textContent=text;this.value=String(value);}},setInterval:(handler,ms)=>{timers.push({handler,ms});return timers.length;}});
  return {storage,restore(){for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 };
 return {nodes,node,document,windowHandlers,timers,install};
}
