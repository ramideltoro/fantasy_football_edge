import { test } from "node:test";
import assert from "node:assert/strict";
import { defensePointsAllowed } from "../shared/defenseMatchup.ts";
import { PA_BINS } from "../shared/leagueScoring.ts";
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
  team: "NYG",
  opponent_team: "DAL",
  def_sacks: 3,
  pointsAllowed: 20,
};
test("DEF allowance scores opposing defenses and excludes future games", () => {
  const d = defensePointsAllowed(
    "DAL",
    [
      row,
      { ...row, team: "DAL", opponent_team: "NYG", def_sacks: 9 },
      { ...row, week: 3, def_sacks: 10 },
    ],
    rules,
    2026,
    3,
  );
  assert.equal(d?.points, 3);
  assert.equal(d?.games, 1);
  assert.equal(d?.priorSeason, false);
});
test("labels prior season fallback, preserves zero, and does not invent absent data", () => {
  assert.equal(
    defensePointsAllowed(
      "DAL",
      [{ ...row, season: 2025, def_sacks: 0 }],
      rules,
      2026,
      3,
    )?.points,
    0,
  );
  assert.equal(
    defensePointsAllowed("DAL", [{ ...row, season: 2025 }], rules, 2026, 3)
      ?.priorSeason,
    true,
  );
  assert.equal(defensePointsAllowed("DAL", [], rules, 2026, 3)?.points, null);
  assert.equal(defensePointsAllowed(null, [row], rules, 2026, 3), null);
  assert.equal(
    defensePointsAllowed(
      "DAL",
      [{ ...row, pointsAllowed: null }],
      rules,
      2026,
      3,
    )?.games,
    0,
  );
});
