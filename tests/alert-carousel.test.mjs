import test from 'node:test';
import assert from 'node:assert/strict';

test('carousel advances every six seconds, wraps and pauses for interaction, visibility, loading and missing auth',async()=>{
 const {createAlertCarousel}=await import('../src/dashboard/alert-carousel.mjs');
 let now=0;const carousel=createAlertCarousel({now:()=>now});
 carousel.acceptPage({current:1,pages:3,total:13,size:6});
 now=6000;assert.equal(carousel.tick(),null,'no session must not advance');
 carousel.setFlags({authorized:true});now=11999;assert.equal(carousel.tick(),null);now=12000;assert.equal(carousel.tick(),2);
 carousel.setFlags({loading:true});now=30000;assert.equal(carousel.tick(),null);carousel.acceptPage({current:2,pages:3,total:13,size:6});carousel.setFlags({loading:false});
 now=36000;assert.equal(carousel.tick(),3);carousel.acceptPage({current:3,pages:3,total:13,size:6});
 for(const flag of ['hover','focus','hidden','loading']){
  carousel.setFlags({[flag]:true});now+=12000;assert.equal(carousel.tick(),null,flag);carousel.setFlags({[flag]:false});
  now+=5999;assert.equal(carousel.tick(),null);now++;
  assert.equal(carousel.tick(),1);carousel.acceptPage({current:3,pages:3,total:13,size:6});
 }
 carousel.togglePause();now+=6000;assert.equal(carousel.tick(),null);assert.equal(carousel.snapshot().userPaused,true);
 assert.equal(carousel.previous(),2,'manual controls remain available while user paused');carousel.acceptPage({current:2,pages:3,total:13,size:6});
 carousel.togglePause();now+=6000;assert.equal(carousel.tick(),3);
});
test('carousel handles empty and single pages, server-clamped pages and resets scope to page one',async()=>{
 const {createAlertCarousel}=await import('../src/dashboard/alert-carousel.mjs');
 let now=0;const carousel=createAlertCarousel({now:()=>now});carousel.setFlags({authorized:true});
 carousel.acceptPage({current:1,pages:0,total:0,size:6});now+=6000;
 assert.equal(carousel.tick(),null);assert.equal(carousel.next(),null);assert.equal(carousel.previous(),null);
 carousel.acceptPage({current:1,pages:1,total:2,size:6});now+=6000;assert.equal(carousel.tick(),null);
 carousel.acceptPage({current:1,pages:3,total:13,size:6});assert.equal(carousel.previous(),3);
 carousel.acceptPage({current:2,pages:2,total:7,size:6});assert.equal(carousel.snapshot().page,2);
 carousel.togglePause();carousel.reset();assert.deepEqual([carousel.snapshot().current,carousel.snapshot().page,carousel.snapshot().pages],[1,1,0]);assert.equal(carousel.snapshot().userPaused,false);assert.equal(carousel.snapshot().loading,false);
});
test('alert renderer preserves and escapes original names, prefers reason and formats every fallback type with full timestamp titles',async()=>{
 const {renderAlertRecords}=await import('../src/dashboard/alert-carousel.mjs');
 const html=renderAlertRecords([{patientName:'王<明>&"',reason:'血氧低于<阈值>&"',alertType:'SPO2',alertValue:88,alertUnit:'%',level:2,occurredAt:'2026-09-01 08:30:59'}]);
 assert.match(html,/王&lt;明&gt;&amp;&quot;/);assert.match(html,/血氧低于&lt;阈值&gt;&amp;&quot;/);assert.doesNotMatch(html,/王\*\*/);
 assert.match(html,/title="2026-09-01 08:30:59"/);assert.match(html,/09-01 08:30/);assert.doesNotMatch(html,/>血氧 88%/);
 for(const [type,label] of [['SPO2','血氧'],['SPO2_LOW','血氧低'],['SPO2_WARNING','血氧低'],['HEART_RATE','心率'],['HEART_RATE_ABNORMAL','心率异常'],['HEART_RATE_WARNING','心率异常'],['STEPS','步数'],['STEPS_LOW','步数不足'],['SLEEP','睡眠'],['SLEEP_LOW','睡眠不足'],['MULTIPLE_WARNING','综合预警'],['CUSTOM<TYPE>','CUSTOM&lt;TYPE&gt;']]){
  assert.match(renderAlertRecords([{patientName:'李明',alertType:type,alertValue:88,alertUnit:'%',occurredAt:'2024-01-01 00:00:00'}]),new RegExp(`${label}.*88%`));
 }
 assert.match(renderAlertRecords([]),/当前暂无未处理告警/);
 assert.equal((renderAlertRecords(Array.from({length:5},(_,i)=>({patientName:`姓名${i}`,reason:'具体告警'}))).match(/role="listitem"/g)??[]).length,3);
});
