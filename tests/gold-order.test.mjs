import test from 'node:test';
import assert from 'node:assert/strict';
import {bars} from '../src/dashboard/components.mjs';
test('GOLD stays in level order including zeros instead of ranking by count',()=>{
 const order=['GOLD 1级','GOLD 2级','GOLD 3级','GOLD 4级'];
 const html=bars({'GOLD 4级':5,'GOLD 3级':20,'GOLD 1级':0,'GOLD 2级':15},40,{order});
 assert.deepEqual([...html.matchAll(/title="(GOLD [1-4]级)"/g)].map(m=>m[1]),order);
 assert.match(html,/50\.0%/);assert.match(html,/0\.0%/);
 assert.match(bars(undefined,40,{order}),/等待管理端统计/);
});
