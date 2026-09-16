import { test } from "node:test";
import assert from "node:assert/strict";
import { analysisRequest, analysisResult } from "../shared/qwenRequest";
const candidates = ["QB", "K", "DEF", "RB", "WR", "TE"].map((position) => ({
  id: position,
  position,
  name: position,
  facts: { role: "Starter", projection: "10 points" },
  news: [],
}));
const request = analysisRequest({
  waiverCandidates: candidates,
  players: [candidates[0]],
  teamFacts: { roster: "roster" },
});
test("Qwen schema requires all supplied positions and restricts IDs and news per candidate", () => {
  assert.deepEqual(request.format.properties.positions.required, [
    "QB",
    "K",
    "DEF",
    "RB",
    "WR",
    "TE",
  ]);
  const qb: any = request.format.properties.positions.properties.QB;
  assert.deepEqual(qb.anyOf[0].properties.id.enum, ["QB"]);
  assert.equal(qb.anyOf[0].properties.news.maxItems, 0);
});
test("Qwen results reject missing positions, cross-position IDs and nonexistent news", () => {
  const positions = Object.fromEntries(
    candidates.map((p) => [
      p.position,
      {
        id: p.id,
        score: 75,
        summary: "Consider this player but check the role.",
        evidence: ["role"],
        news: [],
      },
    ]),
  );
  assert.equal(
    analysisResult({ positions }, request.context).waivers.length,
    6,
  );
  assert.throws(() =>
    analysisResult({ positions: { QB: positions.QB } }, request.context),
  );
  assert.throws(() =>
    analysisResult(
      { positions: { ...positions, QB: { ...positions.QB, id: "RB" } } },
      request.context,
    ),
  );
  assert.throws(() =>
    analysisResult(
      { positions: { ...positions, QB: { ...positions.QB, news: [0] } } },
      request.context,
    ),
  );
});

import { usefulAssessment } from "../shared/groundedAnalysis";
test("coverage counts and absent news cannot masquerade as evidence of player quality", () => {
  assert.equal(
    usefulAssessment(
      "This player is the only QB with available news, which suggests a viable option. However there are limitations to consider.",
      { position: "QB", headlines: [{}] },
    ),
    false,
  );
  assert.equal(
    usefulAssessment(
      "Recent reporting suggests an advantage for this player because he has strong upside, but the outcome remains uncertain.",
      { position: "WR", headlines: [] },
    ),
    false,
  );
  assert.equal(
    usefulAssessment(
      "Consider his supplied projection and starting role, but verify playing time because news does not establish an advantage.",
      { position: "WR", headlines: [] },
    ),
    true,
  );
});
test("waiver availability cannot be presented as game availability", () => {
  assert.equal(
    usefulAssessment(
      "His availability of W (Sep 16) suggests he will be available for the game, but his backup role remains a limitation.",
      { position: "RB", headlines: [] },
    ),
    false,
  );
});
