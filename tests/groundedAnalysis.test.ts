import test from "node:test";
import assert from "node:assert/strict";
import { groundAnalysis } from "../shared/groundedAnalysis.ts";
const p = {
  id: "one",
  projection: 10,
  method: "Yahoo baseline",
  currentSamples: 0,
  slot: "BN",
  history: [],
  injury: "",
  nflRole: "Starter",
};
const data = {
  week: 1,
  players: [p],
  shortlist: ["one"],
  lineup: { lineup: [] },
};
test("Qwen cannot introduce unsupported evidence or start an ineligible player", () => {
  assert.throws(() =>
    groundAnalysis(
      { insights: [{ id: "one", action: "start", evidence: ["redZone"] }] },
      data,
    ),
  );
  const r = groundAnalysis(
    { insights: [{ id: "one", action: "start", evidence: ["projection"] }] },
    data,
  );
  assert.equal(r.insights[0].action, "monitor");
  assert.match(r.insights[0].reason, /10.00/);
});
test("Qwen cannot recommend a rostered player as a waiver addition; duplicate IDs collapse", () => {
  const row = {
    id: "one",
    action: "consider waiver",
    evidence: ["availability"],
  };
  const r = groundAnalysis({ insights: [row, row] }, data);
  assert.equal(r.insights.length, 1);
  assert.equal(r.insights[0].action, "monitor");
});
test('team priorities use supplied facts and reject invented categories', () => {
  const input = { insights: [{id:'one',action:'hold',evidence:['projection']}], priorities:['matchup','matchup','risks'] };
  const d = {...data, teamFacts:{matchup:'No matchup available.',risks:'Check injury flags.'}};
  const r = groundAnalysis(input,d);
  assert.deepEqual(r.teamBrief?.priorities,[{key:'matchup',text:'No matchup available.'},{key:'risks',text:'Check injury flags.'}]);
  assert.throws(() => groundAnalysis({...input,priorities:['guaranteedWin']},d));
});
test('waiver picks reject owned players and nonexistent news citations',()=>{
 const waiver={...p,id:'waiver',slot:'',available:'FA',headlines:[{title:'Report',url:'https://example.com/report'}]};
 const d={...data,players:[p,waiver],waiverCandidates:['waiver']};
 const base={insights:[{id:'one',action:'hold',evidence:['projection']}]};
 assert.throws(()=>groundAnalysis({...base,waivers:[{id:'one',evidence:['role'],news:[]}]},d));
 assert.throws(()=>groundAnalysis({...base,waivers:[{id:'waiver',evidence:['role'],news:[2]}]},d));
 const r=groundAnalysis({...base,waivers:[{id:'waiver',evidence:['role'],news:[0]}]},d);
 assert.equal(r.waivers[0].news[0].url,'https://example.com/report');
});
