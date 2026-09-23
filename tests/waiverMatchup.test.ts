import test from "node:test";
import assert from "node:assert/strict";
import { defenseMatchupForecast } from "../shared/defenseMatchup.ts";
import { PA_BINS } from "../shared/leagueScoring.ts";
import {
  positionShortlist,
  waiverShortlist,
  waiverForecast,
  waiverPositions,
} from "../shared/shortlist.ts";
const rules = Object.fromEntries([
  ...[
    "Sack",
    "Interception",
    "Fumble Recovery",
    "Touchdown",
    "Safety",
    "Block Kick",
  ].map((k) => [k, 1]),
  ...PA_BINS.map(([, , k]) => [k, 0]),
]);
const row = {
  season: 2026,
  week: 1,
  season_type: "REG",
  team: "BAL",
  opponent_team: "PIT",
  pointsAllowed: 20,
  def_sacks: 8,
};
test("DEF projection equally blends current defense scoring and points conceded to opposing DEF", () => {
  const rows = [
    row,
    { ...row, week: 2, def_sacks: 4 },
    { ...row, team: "NYG", opponent_team: "DAL", def_sacks: 2 },
    { ...row, team: "WSH", opponent_team: "DAL", week: 2, def_sacks: 0 },
    { ...row, season: 2025, def_sacks: 100 },
    { ...row, week: 3, def_sacks: 100 },
  ];
  const d = defenseMatchupForecast("Bal", "DAL", rows, rules, 2026, 3);
  assert.equal(d.defenseAverage, 6);
  assert.equal(d.opponentAverage, 1);
  assert.equal(d.points, 3.5);
  assert.equal(d.ownGames.length, 2);
  assert.equal(d.opponentGames.length, 2);
});
test("DEF projection requires both current-season samples and complete scoring, retaining zero/negative results", () => {
  assert.equal(
    defenseMatchupForecast("BAL", "DAL", [row], rules, 2026, 3).points,
    null,
  );
  assert.equal(
    defenseMatchupForecast(
      "BAL",
      "DAL",
      [{ ...row, season: 2025 }],
      rules,
      2026,
      3,
    ).points,
    null,
  );
  assert.equal(
    defenseMatchupForecast(
      "BAL",
      "DAL",
      [row, { ...row, opponent_team: "DAL" }],
      {},
      2026,
      3,
    ).points,
    null,
  );
  const negativeRules = { ...rules, "Points Allowed 14-20 points": -3 };
  const d = defenseMatchupForecast(
    "BAL",
    "DAL",
    [
      { ...row, def_sacks: 0 },
      { ...row, team: "NYG", opponent_team: "DAL", def_sacks: 0 },
    ],
    negativeRules,
    2026,
    3,
  );
  assert.equal(d.points, -3);
});
const candidate = (id: string, position = "DEF", extra: any = {}) =>
  ({
    id,
    position,
    team: "BAL",
    status: "",
    availability: "FA",
    projected: 10,
    locked: false,
    ...extra,
  }) as any;
test("all six positions have independent shortlists and exclude ineligible players", () => {
  const pool = waiverPositions.flatMap((pos) =>
    Array.from({ length: 4 }, (_, i) =>
      candidate(pos + i, pos, { projected: 20 - i }),
    ),
  );
  assert.equal(waiverShortlist(pool).length, 18);
  for (const pos of waiverPositions)
    assert.equal(
      waiverShortlist(pool).filter((p) => p.position === pos).length,
      3,
    );
  const unavailable = [
    { locked: true },
    { completed: true },
    { bye: 3 },
    { status: "IR" },
    { availability: "Rostered" },
    { kickoffAt: "2026-01-01T00:00:00Z" },
  ].map((v, i) => candidate(String(i), "DEF", v));
  assert.equal(positionShortlist(unavailable, "DEF", 3).length, 0);
});
test("DEF ranks matchup evidence ahead of stale Qwen and unsupported Yahoo fallbacks", () => {
  const a = candidate("a", "DEF", {
    research: { defenseForecast: { points: 4, week: 3 } },
  });
  const b = candidate("b", "DEF", {
    research: { defenseForecast: { points: 8, week: 3 } },
  });
  const fallback = candidate("fallback", "DEF", {
    projected: 99,
    aiProjection: { points: 100, stale: true },
  });
  assert.deepEqual(
    positionShortlist([a, fallback, b], "DEF", 3).map((p) => p.id),
    ["b", "a", "fallback"],
  );
  assert.equal(waiverForecast(a, 4).source, "Yahoo");
  assert.equal(waiverForecast(fallback, 3).points, 99);
  assert.equal(
    waiverForecast(
      candidate("missing", "QB", { projected: 99, providerProjected: null }),
    ).points,
    null,
  );
});
