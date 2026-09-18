import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBoard, parseProps, parseGames } from "../server/vegasInsider.ts";
import {
  impliedProbability,
  sportsbookProjection,
  ODDS_INTERVAL,
  type OddsBoard,
  type OddsState,
} from "../shared/sportsbook.ts";
import type { SnapshotData, PlayerData } from "../shared/model.ts";
const props = readFileSync(
  new URL("./fixtures/vegasinsider-props.html", import.meta.url),
  "utf8",
);
const games = readFileSync(
  new URL("./fixtures/vegasinsider-games.html", import.meta.url),
  "utf8",
);
const now = Date.parse("2026-09-18T06:00:00Z");
const board = () => parseBoard(props, games, new Date(now).toISOString());
const p = {
  id: "1",
  name: "Trevor Lawrence",
  team: "Jax",
  position: "QB",
  kickoffAt: "2026-09-20T20:05:00Z",
  locked: false,
  completed: false,
} as PlayerData;
const rules = {
  "Passing Yards": 0.04,
  "Passing Touchdowns": 4,
  Interceptions: -2,
  "Rushing Yards": 0.1,
  "Rushing Touchdowns": 6,
  Receptions: 1,
  "Receiving Yards": 0.1,
  "Receiving Touchdowns": 6,
};
const snapshot = (player = p) =>
  ({
    season: 2026,
    week: 2,
    players: [player],
    available: [],
    sections: [
      {
        kind: "settings",
        tables: [
          {
            rows: Object.entries(rules).map(([k, v]) => ({
              cells: [k, String(v)],
            })),
          },
        ],
      },
    ],
  }) as unknown as SnapshotData;
const state = (b: OddsBoard | null = board()): OddsState => ({
  board: b,
  nextAt: new Date(now + ODDS_INTERVAL).toISOString(),
  attemptedAt: new Date(now).toISOString(),
  error: null,
});
const project = (b = board(), player = p, s = snapshot(player), time = now) =>
  sportsbookProjection(player, s, state(b), time);
test("real source fixture preserves book alignment, blanks, American prices and operator types", () => {
  const b = board();
  assert.equal(b.week, 2);
  assert.equal(b.season, 2026);
  assert.equal(b.books.length, 8);
  assert.deepEqual(b.pickem, ["PrizePicks", "Sleeper"]);
  assert.equal(
    b.props.find(
      (q) =>
        q.player === p.name &&
        q.book === "BetMGM" &&
        q.market === "passing-yards",
    )?.line,
    222.5,
  );
  assert.equal(
    b.props.find(
      (q) =>
        q.player === p.name &&
        q.book === "Fanatics" &&
        q.market === "passing-yards",
    )?.line,
    215.5,
  );
  assert.equal(
    b.props.find(
      (q) =>
        q.player === p.name &&
        q.book === "Fanatics" &&
        q.market === "touchdowns",
    )?.odds,
    450,
  );
  assert.equal(new Set(b.games.map((g) => g.eventId)).size, 1);
  assert.deepEqual([...new Set(b.games.map((g) => g.team))].sort(), [
    "DEN",
    "JAC",
  ]);
  assert.equal(b.games.find((g) => g.book === "Open")?.kind, "reference");
});
test("broken market tables, book headings and week metadata fail closed", () => {
  assert.throws(
    () => parseProps(props.replace('id="table-touchdowns"', 'id="changed"')),
    /Missing/,
  );
  assert.throws(() => parseProps(props.replaceAll("BetMGM", "")), /Unaligned/);
  assert.throws(
    () => parseGames(games.replace(/Week 2/i, "This week")),
    /week missing/,
  );
  assert.throws(() => parseProps("<h1>Access denied</h1>"), /Missing/);
});
test("US odds and partial points use a per-market average and league scoring", () => {
  assert.equal(impliedProbability(100), 0.5);
  assert.equal(impliedProbability(-200), 2 / 3);
  assert.equal(impliedProbability(0), null);
  assert.equal(impliedProbability(NaN), null);
  const result = project();
  assert.equal(result.reason, null);
  assert.equal(result.partial, true);
  const passing = result.components.find((c) => c.market === "passing-yards")!;
  assert.equal(passing.books.length, 7);
  assert.ok(
    Math.abs(
      passing.mean -
        (220.5 + 222.5 + 222.5 + 220.5 + 220.5 + 215.5 + 222.5) / 7,
    ) < 0.0001,
  );
  assert.equal(passing.multiplier, 0.04);
  assert.equal(
    result.points,
    Math.round(result.components.reduce((sum, c) => sum + c.points, 0) * 100) /
      100,
  );
  assert.ok(result.missing.includes("Passing touchdowns"));
  assert.ok(result.missing.includes("Receptions"));
  assert.ok(
    result.quotes.filter((q) => q.kind === "pickem").every((q) => !q.used),
  );
});
test("anomalous touchdown prices are visible but excluded, not converted into huge forecasts", () => {
  const b = board(),
    henry = { ...p, name: "Derrick Henry", team: "JAX", position: "RB" };
  const r = project(b, henry);
  const hardRock = r.quotes.find(
    (q) => q.book === "Hard Rock" && q.market === "touchdowns",
  )!;
  assert.equal(hardRock.odds, 185);
  assert.equal(hardRock.used, false);
  assert.match(hardRock.exclusion!, /Outlier/);
  assert.equal(
    r.components.find((c) => c.market === "touchdowns")?.books.length,
    5,
  );
});
test("minimum three books per market; pick’em and zero-scoring markets never inflate coverage", () => {
  const b = board();
  b.props = b.props.filter(
    (q) => q.kind === "pickem" || ["Bet365", "FanDuel"].includes(q.book),
  );
  assert.equal(project(b).points, null);
  const s = snapshot();
  s.sections[0].tables[0].rows.find(
    (r) => r.cells[0] === "Passing Yards",
  )!.cells[1] = "0";
  assert.ok(
    !project(board(), p, s).components.some(
      (c) => c.market === "passing-yards",
    ),
  );
});
test("missing scoring never guesses a default and incompatible TD rules are withheld", () => {
  const s = snapshot();
  s.sections = [];
  assert.equal(project(board(), p, s).points, null);
  const s2 = snapshot();
  s2.sections[0].tables[0].rows.find(
    (r) => r.cells[0] === "Receiving Touchdowns",
  )!.cells[1] = "8";
  assert.ok(
    !project(board(), p, s2).components.some((c) => c.market === "touchdowns"),
  );
});
test("stale, locked, unmatched, mismatched week and ambiguous names cannot produce an active number", () => {
  assert.equal(
    project(board(), p, snapshot(), now + ODDS_INTERVAL + 6 * 60000).points,
    null,
  );
  assert.equal(project(board(), { ...p, locked: true }).points, null);
  assert.equal(project(board(), { ...p, team: "NYJ" }).points, null);
  assert.equal(
    project(board(), { ...p, kickoffAt: "2026-09-21T20:05:00Z" }).points,
    null,
  );
  assert.equal(project(board(), p, { ...snapshot(), week: 3 }).points, null);
  assert.equal(
    project(board(), p, { ...snapshot(), season: 2025 }).points,
    null,
  );
  assert.equal(
    project(board(), p, { ...snapshot(), available: [{ ...p, id: "2" }] })
      .points,
    null,
  );
  assert.equal(
    sportsbookProjection(p, snapshot(), state(null), now).points,
    null,
  );
});
test("unavailable players cannot receive an active odds estimate", () => {
  for (const status of ["O", "IR", "PUP", "SUSP"])
    assert.equal(project(board(), { ...p, status }).points, null);
});

test("game lock is enforced from the schedule even when the Yahoo locked flag is stale", () => {
  const time = Date.parse(p.kickoffAt!) + 1000,
    b = board();
  b.fetchedAt = new Date(time).toISOString();
  assert.match(project(b, p, snapshot(), time).reason!, /locked/);
});
test("kicking and defense game lines stay context, and failed refresh metadata stays visible", () => {
  assert.equal(project(board(), { ...p, position: "DEF" }).points, null);
  const r = sportsbookProjection(
    p,
    snapshot(),
    { ...state(), error: "Refresh failed" },
    now,
  );
  assert.equal(r.error, "Refresh failed");
  assert.ok(r.games.length);
  assert.ok(r.points != null);
});
