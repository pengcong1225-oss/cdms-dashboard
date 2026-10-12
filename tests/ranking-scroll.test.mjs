import test from 'node:test';
import assert from 'node:assert/strict';
import {createRankingScroll} from '../src/dashboard/ranking-scroll.mjs';

function fixture(){
 let time=0,hidden=false,focused=true;
 const handlers={},element={scrollTop:0,scrollHeight:600,clientHeight:130,contains:node=>node==='child',addEventListener:(type,fn)=>handlers[type]=fn};
 const scroll=createRankingScroll(element,{now:()=>time,isHidden:()=>hidden,isFocused:()=>focused});
 const advance=ms=>{for(let n=0;n<ms;n+=50){time+=50;scroll.tick();}};
 return {element,handlers,scroll,advance,hide:value=>hidden=value,focus:value=>focused=value};
}
test('ranking automatically reaches the final institution, pauses at the bottom and loops',()=>{
 const {element,scroll,advance}=fixture();scroll.refresh('2026:all:sq');
 advance(1700);assert.equal(element.scrollTop,0);
 advance(27000);assert.equal(element.scrollTop,470);
 advance(2000);assert.equal(element.scrollTop,0);
 advance(3000);assert.ok(element.scrollTop>0);
});
test('hover, keyboard focus, manual pause and hidden tabs stop movement without losing the position',()=>{
 const {element,handlers,scroll,advance,hide}=fixture();scroll.refresh('all');advance(4000);
 for(const [pause,resume] of [
  [()=>handlers.pointerenter(),()=>handlers.pointerleave()],
  [()=>handlers.focusin(),()=>handlers.focusout({relatedTarget:null})],
  [()=>scroll.togglePause(),()=>scroll.togglePause()],
  [()=>hide(true),()=>hide(false)],
 ]){
  pause();const position=element.scrollTop;advance(4000);assert.equal(element.scrollTop,position);
  resume();advance(1000);assert.equal(element.scrollTop,position);advance(2000);assert.ok(element.scrollTop>position);
 }
 handlers.wheel();element.scrollTop=40;advance(1000);assert.equal(element.scrollTop,40);advance(2000);assert.ok(element.scrollTop>40);
});
test('routine data refresh keeps progress while tab or scope changes reset and short lists remain still',()=>{
 const {element,scroll,advance}=fixture();scroll.refresh('all:sq');advance(5000);
 const position=element.scrollTop;scroll.refresh('all:sq');assert.equal(element.scrollTop,position);
 scroll.refresh('all:lung');assert.equal(element.scrollTop,0);advance(4000);assert.ok(element.scrollTop>0);
 scroll.refresh('org:lung');assert.equal(element.scrollTop,0);
 element.scrollHeight=100;scroll.refresh('org:lung');advance(10000);assert.equal(element.scrollTop,0);
});
test('removing a focused institution without focusout cannot permanently stop auto scroll',()=>{
 const {element,handlers,scroll,advance,focus}=fixture();scroll.refresh('all');advance(5000);
 handlers.focusin();advance(3000);const position=element.scrollTop;
 focus(false);scroll.refresh('all');advance(4000);assert.ok(element.scrollTop>position);
 handlers.focusin();focus(true);scroll.refresh('org');advance(3000);assert.equal(element.scrollTop,0);
 focus(false);scroll.refresh('all');advance(4000);assert.ok(element.scrollTop>0);
});
