import { test } from "node:test";
import assert from "node:assert/strict";
import { Player, type PlayerData } from "../shared/model.ts";
import {
  lineupAdvice,
  lineupProjection,
  type ProjectionMode,
} from "../shared/lineupProjections.ts";
import {
  compareValues,
  recordSortValue,
  sortValue,
} from "../shared/tableSort.ts";
const player = (
  id: string,
  yahoo: number | null,
  qwen: number | null,
  bookies: number | null,
  overrides: Partial<PlayerData> = {},
) =>
  Player.parse({
    id,
    name: id,
    team: "NYJ",
    position: "RB",
    eligible: ["RB"],
    slot: "BN",
    bye: 9,
    actual: null,
    projected: qwen,
    providerProjected: yahoo,
    startPct: null,
    rosterPct: 80,
    status: "",
    locked: false,
    stats: {},
    aiProjection: {
      label: "Qwen",
      points: qwen,
      stale: false,
      calculation: {
        components: [
          { stat: "rushing_yards", points: 6 },
          { stat: "receptions", points: 4 },
        ],
      },
    },
    sportsbook: {
      points: bookies,
      partial: true,
      stale: false,
      reason: null,
      components: [{ market: "rushing-yards", points: bookies }],
    },
    ...overrides,
  });
const snapshot = (players: PlayerData[]) => ({
  players,
  week: 2,
  capturedAt: new Date().toISOString(),
});
test("four playbooks select from their own numbers, and combined completes partial markets", () => {
  const s = snapshot([
    player("yahoo", 40, 1, 1, { slot: "RB" }),
    player("qwen", 1, 40, 1),
    player("bookies", 1, 1, 40),
    player("balanced", 22, 22, 22),
  ]);
  const expected = {
    yahoo: "yahoo",
    qwen: "qwen",
    bookies: "bookies",
    combined: "balanced",
  };
  for (const mode of Object.keys(expected) as ProjectionMode[]) {
    const a = lineupAdvice(s, mode);
    assert.equal(a.lineup[0].playerId, expected[mode]);
    assert.ok(a.complete);
  }
  const combined = lineupProjection(s.players[3], "combined");
  assert.equal(combined.remainder, 4);
  assert.equal(combined.bookInformed, 26);
  assert.equal(combined.points, 70 / 3);
  assert.equal(combined.sourceCount, 3);
});
test("source-only modes never borrow forecasts; null is not zero and stale sources stay out", () => {
  const p = player("a", null, 25, 8);
  assert.equal(lineupProjection(p, "yahoo").points, null);
  p.aiProjection.stale = true;
  p.sportsbook!.stale = true;
  assert.equal(lineupProjection(p, "qwen").points, null);
  assert.equal(lineupProjection(p, "bookies").points, null);
  assert.equal(lineupProjection(p, "combined").points, null);
  p.providerProjected = 0;
  assert.equal(lineupProjection(p, "combined").points, 0);
});
test("partial markets without a valid remainder are excluded from the combined average", () => {
  const p = player("a", 20, 30, 5);
  p.aiProjection.calculation = null;
  const v = lineupProjection(p, "combined");
  assert.equal(v.points, 25);
  assert.equal(v.sourceCount, 2);
  assert.equal(v.bookInformed, null);
  assert.equal(lineupProjection(p, "bookies").points, 5);
});
test("specialist models enter combined directly, including negative defense forecasts", () => {
  const p = player("def", -2, -4, -6);
  p.sportsbook!.partial = false;
  assert.equal(lineupProjection(p, "combined").points, -4);
});
test("combined fills only unquoted categories, preserving penalties without double-counting TDs", () => {
  const p = player("a", 20, 20, 15);
  p.aiProjection.calculation.components = [
    { stat: "rushing_tds", points: 6 },
    { stat: "receiving_tds", points: 3 },
    { stat: "passing_tds", points: 8 },
    { stat: "fumbles_lost_total", points: -2 },
  ];
  p.sportsbook!.components = [{ market: "touchdowns", points: 15 } as any];
  assert.equal(lineupProjection(p, "combined").remainder, 6);
  assert.equal(lineupProjection(p, "combined").bookInformed, 21);
});
test("all modes respect locked games, FLEX eligibility, byes, absences and distinct players", () => {
  const s = snapshot([
    player("locked", 1, 1, 1, { slot: "RB", locked: true }),
    player("flex", 1, 1, 1, { slot: "W/R/T" }),
    player("bench", 20, 20, 20),
    player("bye", 999, 999, 999, { bye: 2 }),
    player("out", 999, 999, 999, { status: "O" }),
    player("IR", 999, 999, 999, { slot: "IR" }),
    player("qb", 999, 999, 999, { eligible: ["QB"], position: "QB" }),
    player("elapsed", 999, 999, 999, {
      kickoffAt: new Date(Date.now() - 60_000).toISOString(),
    }),
  ]);
  for (const mode of ["yahoo", "qwen", "bookies", "combined"] as const) {
    const a = lineupAdvice(s, mode);
    assert.deepEqual(
      a.lineup.map((x) => x.playerId),
      ["locked", "bench"],
    );
    assert.equal(a.lineup[0].locked, true);
  }
});
test("missing position coverage cannot fabricate a complete lineup or improvement", () => {
  const a = lineupAdvice(
    snapshot([player("a", 10, null, null, { slot: "RB" })]),
    "qwen",
  );
  assert.equal(a.complete, false);
  assert.equal(a.delta, null);
  const b = lineupAdvice(
    snapshot([
      player("a", null, 5, 5, { slot: "RB" }),
      player("b", 20, 20, 20),
    ]),
    "yahoo",
  );
  assert.equal(b.complete, true);
  assert.equal(b.delta, null);
});
test("column sorting handles signed points, percentages and nulls in both directions", () => {
  const values = ["10.5", "2", "—", "-0.10", "99%", "0", "1,000", "N/A"].map(
    sortValue,
  );
  assert.deepEqual(
    [...values].sort((a, b) => compareValues(a, b, "ascending")),
    [-0.1, 0, 2, 10.5, 99, 1000, null, null],
  );
  assert.deepEqual(
    [...values].sort((a, b) => compareValues(a, b, "descending")),
    [1000, 99, 10.5, 2, 0, -0.1, null, null],
  );
  assert.ok(compareValues("Player 2", "Player 10", "ascending") < 0);
  assert.equal(recordSortValue("10-2-0"), 10 / 12);
  assert.equal(recordSortValue("1-0-1"), 0.75);
});

test("equal-score assignments retain current slots and avoid unnecessary FLEX shuffles", () => {
  const a = player("a", 0.1, 0.1, 0.1, { slot: "RB" });
  const b = player("b", 0.2, 0.2, 0.2, { slot: "W/R/T" });
  const c = player("c", 0.3, 0.3, 0.3, { slot: "W/R/T" });
  const s = snapshot([a, b, c]);
  for (const mode of ["yahoo", "qwen", "bookies", "combined"] as const) {
    const result = lineupAdvice(s, mode);
    assert.equal(result.changes.length, 0);
    assert.equal(result.delta, 0);
    assert.deepEqual(
      result.lineup.map((x) => x.playerId),
      ["a", "b", "c"],
    );
  }
  const upgraded = lineupAdvice(
    snapshot([a, b, c, player("d", 1, 1, 1)]),
    "yahoo",
  );
  assert.equal(upgraded.changes.length, 1);
  assert.equal(upgraded.changes[0].currentPlayerId, "a");
});
