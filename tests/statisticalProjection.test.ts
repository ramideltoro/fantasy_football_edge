import test from 'node:test';
import assert from 'node:assert/strict';
import {statisticalProjection} from '../shared/statisticalProjection.ts';
const scoring={'Passing Yards':.04,'Passing Touchdowns':4,'Rushing Yards':.1,'Rushing Touchdowns':6,'Receptions':1,'Receiving Yards':.1,'Receiving Touchdowns':6};
const input={season:2026,week:4,scoring};
const player={id:'x',position:'WR',history:[1,2,3].map(week=>({season:2026,week,receptions:week,receiving_yards:week*10}))};
test('statistical forecasts use recency weights and exclude Yahoo',()=>{
 const a=statisticalProjection({...player,projected:99},input);
 assert.equal(a.points,4.3);assert.deepEqual(a,statisticalProjection({...player,projected:1},input));
});
test('future and prior-season games cannot satisfy minimum samples',()=>{
 assert.equal(statisticalProjection({...player,history:[...player.history.slice(0,2),{season:2025,week:3},{season:2026,week:4}]},input).points,null);
});
test('unavailable players are zero; unverified specialists and scoring fall back',()=>{
 assert.equal(statisticalProjection({...player,injury:'O'},input).points,0);
 assert.equal(statisticalProjection({...player,position:'DEF'},input).points,null);
 assert.equal(statisticalProjection(player,{...input,scoring:{}}).points,null);
});
