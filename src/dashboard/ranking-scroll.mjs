// Scroll the existing rows, so every institution keeps its normal click target.
export function createRankingScroll(element,{now=Date.now,isHidden=()=>document.hidden,isFocused=()=>element.contains(document.activeElement),speed=18,pauseMs=1800}={}) {
 let key,position=0,lastTick=now(),holdUntil=lastTick+pauseMs,hover=false,focus=false,userPaused=false,atEnd=false;
 const pause=()=>{lastTick=now();holdUntil=lastTick+pauseMs;position=element.scrollTop||0;atEnd=element.scrollHeight>element.clientHeight&&position>=element.scrollHeight-element.clientHeight;};
 element.addEventListener('pointerenter',()=>{hover=true;pause();});
 element.addEventListener('pointerleave',()=>{hover=false;pause();});
 element.addEventListener('focusin',()=>{focus=true;pause();});
 element.addEventListener('focusout',event=>{focus=element.contains(event.relatedTarget);pause();});
 element.addEventListener('wheel',pause,{passive:true});
 function refresh(nextKey){
  if(nextKey!==key||element.scrollHeight<=element.clientHeight){key=nextKey;position=element.scrollTop=0;atEnd=false;pause();}
 }
 function tick(){
  const time=now(),elapsed=Math.min(100,Math.max(0,time-lastTick));lastTick=time;
  // Removing a focused row during refresh need not dispatch focusout in every browser.
  if(focus&&!isFocused()){focus=false;pause();}
  if(hover||focus||userPaused||isHidden()){pause();return;}
  const maximum=Math.max(0,element.scrollHeight-element.clientHeight);
  if(!maximum||time<holdUntil){position=element.scrollTop||0;return;}
  if(atEnd){position=element.scrollTop=0;atEnd=false;holdUntil=time+pauseMs;return;}
  position=Math.min(maximum,position+speed*elapsed/1000);element.scrollTop=position;
  if(position>=maximum){atEnd=true;holdUntil=time+pauseMs;}
 }
 function togglePause(){userPaused=!userPaused;pause();return userPaused;}
 return {refresh,tick,togglePause};
}
