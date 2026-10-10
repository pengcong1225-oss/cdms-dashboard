import test from 'node:test';
import assert from 'node:assert/strict';
import {computeFrame,createPresentation} from '../src/dashboard/presentation.mjs';

test('auto fits wide and 4:3 screens without cropping or stretching',()=>{
 assert.deepEqual(computeFrame(1920,1080),{aspect:'16:9',width:1920,height:1080,scale:1,x:0,y:0});
 assert.deepEqual(computeFrame(1024,768),{aspect:'4:3',width:1440,height:1080,scale:1024/1440,x:0,y:0});
 assert.deepEqual(computeFrame(3840,2160),{aspect:'16:9',width:1920,height:1080,scale:2,x:0,y:0});
 const narrow=computeFrame(800,1000);assert.equal(narrow.aspect,'4:3');assert.equal(narrow.scale,800/1440);assert.equal(narrow.y,200);
});
test('manual aspect stays fixed with centered letterboxing',()=>{
 assert.deepEqual(computeFrame(1440,1080,'16:9'),{aspect:'16:9',width:1920,height:1080,scale:.75,x:0,y:135});
 assert.deepEqual(computeFrame(1920,1080,'4:3'),{aspect:'4:3',width:1440,height:1080,scale:1,x:240,y:0});
 const invalid=computeFrame(1920,1080,'junk');assert.equal(invalid.aspect,'16:9');
});
test('invalid dimensions cannot produce infinite or invalid transforms',()=>{
 for(const [w,h] of [[0,0],[-5,1080],[NaN,Infinity]]){
  const frame=computeFrame(w,h);assert.ok(Number.isFinite(frame.scale)&&frame.scale>0);assert.ok(Number.isFinite(frame.x)&&Number.isFinite(frame.y));
 }
});
test('layout control remembers explicit choice and resizing never overwrites it',()=>{
 const values=new Map([['dashboard.layoutMode','4:3']]),events={};
 const viewport={innerWidth:1920,innerHeight:1080,addEventListener:(key,fn)=>events[key]=fn};
 const root={style:{},dataset:{}},control={value:'',addEventListener:(key,fn)=>events['control:'+key]=fn};
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
 createPresentation({root,control,storage,viewport});
 assert.equal(control.value,'4:3');assert.equal(root.dataset.aspect,'4:3');assert.match(root.style.transform,/translate\(240px, 0px\) scale\(1\)/);
 viewport.innerWidth=960;viewport.innerHeight=540;events.resize();assert.equal(root.dataset.aspect,'4:3');assert.equal(control.value,'4:3');
 control.value='16:9';events['control:change']();assert.equal(values.get('dashboard.layoutMode'),'16:9');assert.equal(root.dataset.aspect,'16:9');
 control.value='auto';events['control:change']();viewport.innerWidth=1024;viewport.innerHeight=768;events.resize();assert.equal(root.dataset.aspect,'4:3');assert.equal(control.value,'auto');
});
test('blocked or malformed local storage does not block layout control',()=>{
 for(const storage of [{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},{getItem:()=>'<bad>',setItem(){}}]){
  const root={style:{},dataset:{}},control={value:'',addEventListener:(key,fn)=>control[key]=fn};
  createPresentation({root,control,storage,viewport:{innerWidth:1440,innerHeight:1080,addEventListener(){}}});
  assert.equal(control.value,'auto');assert.equal(root.dataset.aspect,'4:3');
  control.value='16:9';assert.doesNotThrow(()=>control.change());assert.equal(root.dataset.aspect,'16:9');
 }
});
