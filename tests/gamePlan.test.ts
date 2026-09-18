import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Player,
  Snapshot,
  type PlayerData,
  type SnapshotData,
} from "../shared/model.ts";
import { effectiveStatus } from "../shared/availability.ts";
import {
  scoringRange,
  strategyLineup,
  flexPlan,
  weeklyPlan,
  waiverImpact,
  type Schedule,
} from "../shared/strategy.ts";
import {
  captureForecasts,
  performanceReport,
  weeklyRecaps,
  type SavedForecast,
} from "../shared/gamePlanAudit.ts";
import {
  changedSince,
  kickoffAlerts,
  observation,
} from "../shared/gamePlanChanges.ts";
import {
  easternKickoff,
  scheduleFromRows,
  injuryCode,
} from "../server/gamePlanService.ts";
const now = Date.now(),
  at = (h: number) => new Date(now + h * 3600000).toISOString();
const player = (id: string, overrides: Partial<PlayerData> = {}) =>
  Player.parse({
    id,
    name: id,
    position: "RB",
    team: "DET",
    slot: "BN",
    eligible: ["RB"],
    projected: 10,
    providerProjected: 10,
    actual: null,
    status: "",
    locked: false,
    kickoffAt: at(48),
    bye: 8,
    stats: {},
    rosterPct: 75,
    startPct: 50,
    availability: "FA",
    research: { baselinePoints: 8 },
    ...overrides,
  });
const snap = (players: PlayerData[], overrides: Partial<SnapshotData> = {}) =>
  Snapshot.parse({
    version: 1,
    source: "test",
    season: 2026,
    week: 10,
    team: { id: "1", name: "Team" },
    league: { id: "1", name: "League" },
    capturedAt: at(0),
    receivedAt: at(0),
    players,
    available: [],
    sections: [],
    ...overrides,
  });
const history = (values: number[]) => ({
  scoringHistory: values.map((points, i) => ({
    season: 2026,
    week: 9 - i,
    points,
  })),
  baselinePoints: 10,
});
const schedule: Schedule = {
  DET: [10, 11, 12].map((week) => ({
    week,
    team: "DET",
    opponent: "GB",
    kickoffAt: at(48 + (week - 10) * 168),
    bye: false,
    unknown: false,
  })),
  GB: [10, 11, 12].map((week) => ({
    week,
    team: "GB",
    opponent: "DET",
    kickoffAt: at(48 + (week - 10) * 168),
    bye: false,
    unknown: false,
  })),
};
test("fresh official absence prevents a lineup suggestion; stale reports do not clear Yahoo", () => {
  const p = player("a", {
    status: "Q",
    gameDay: { status: "O", checkedAt: at(0), stale: false },
  });
  assert.equal(effectiveStatus(p, now), "O");
  assert.equal(
    effectiveStatus(
      { ...p, gameDay: { ...p.gameDay, checkedAt: at(-1) } },
      now,
    ),
    "Q",
  );
  assert.equal(
    effectiveStatus(
      { ...p, status: "IR", gameDay: { status: "", checkedAt: at(0) } },
      now,
    ),
    "IR",
  );
  const s = snap([
    player("start", { slot: "RB", providerProjected: 1 }),
    { ...p, providerProjected: 100 },
  ]);
  assert.equal(
    strategyLineup(s, "yahoo", "balanced").lineup[0].playerId,
    "start",
  );
});
test("ranges exclude future games, require five observations, and use most recent history", () => {
  assert.equal(
    scoringRange(player("a", { research: history([1, 2, 3, 4]) }), 2026, 10, 10)
      .low,
    null,
  );
  const p = player("a", {
    research: {
      scoringHistory: [
        { season: 2026, week: 10, points: 999 },
        ...history([8, 9, 10, 11, 12]).scoringHistory,
      ].reverse(),
    },
  });
  assert.deepEqual(scoringRange(p, 2026, 10, 20), {
    samples: 5,
    low: 19,
    high: 21,
    priorSeason: false,
  });
});
test("protect and chase use observed variation while reporting expected-point tradeoffs", () => {
  const s = snap([
    player("volatile", {
      slot: "RB",
      providerProjected: 15,
      research: history([0, 0, 15, 30, 30]),
    }),
    player("steady", {
      providerProjected: 14,
      research: history([14, 14, 14, 14, 14]),
    }),
  ]);
  assert.equal(
    strategyLineup(s, "yahoo", "balanced").lineup[0].playerId,
    "volatile",
  );
  const protect = strategyLineup(s, "yahoo", "protect");
  assert.equal(protect.lineup[0].playerId, "steady");
  assert.equal(protect.delta, -1);
  assert.equal(
    strategyLineup(s, "yahoo", "chase").lineup[0].playerId,
    "volatile",
  );
  assert.equal(strategyLineup(s, "bookies", "protect").risk, "balanced");
});
test("FLEX timing keeps the same starters, mutual eligibility and existing locks", () => {
  const s = snap([
    player("early", { slot: "W/R/T", kickoffAt: at(24) }),
    player("late", { slot: "RB", kickoffAt: at(48) }),
  ]);
  assert.deepEqual(
    flexPlan(s, now).changes.map((x) => [x.playerId, x.slot]),
    [
      ["late", "W/R/T"],
      ["early", "RB"],
    ],
  );
  assert.equal(
    flexPlan(
      {
        ...s,
        players: s.players.map((p) =>
          p.id === "late" ? { ...p, locked: true } : p,
        ),
      },
      now,
    ).changes.length,
    0,
  );
  assert.equal(
    flexPlan(
      snap([
        player("wr", {
          slot: "W/R/T",
          position: "WR",
          eligible: ["WR"],
          kickoffAt: at(24),
        }),
        player("rb", { slot: "RB" }),
      ]),
      now,
    ).changes.length,
    0,
  );
});
test("questionable late starters show earlier decision deadlines and legal late backups", () => {
  const s = snap([
    player("starter", { slot: "RB", status: "Q", kickoffAt: at(50) }),
    player("early", { kickoffAt: at(30) }),
    player("late", { kickoffAt: at(55) }),
    player("ir", { slot: "IR", kickoffAt: at(55) }),
  ]);
  const c = flexPlan(s, now).contingencies[0];
  assert.deepEqual(
    c.early.map((x) => x.id),
    ["early"],
  );
  assert.deepEqual(
    c.late.map((x) => x.id),
    ["late"],
  );
});
test("planner solves FLEX once per player, exposes bye gaps and does not invent future projections", () => {
  const s = snap([
    player("rb", { slot: "RB", bye: 11 }),
    player("wr", { slot: "W/R/T", position: "WR", eligible: ["WR"] }),
  ]);
  assert.equal(weeklyPlan(s, 10, schedule).total, 20);
  const future = weeklyPlan(s, 11, schedule);
  assert.deepEqual(future.gaps, ["RB"]);
  assert.equal(future.total, null);
  assert.equal(future.knownTotal, 8);
  assert.equal(weeklyPlan(s, 12, schedule).total, 16);
  assert.equal(weeklyPlan(s, 12, {}).gaps.length, 2);
});
test("planner includes locked actuals, never substitutes missing actuals with projections", () => {
  const s = snap([
    player("done", { slot: "RB", locked: true, actual: 6 }),
    player("bench", { providerProjected: 100 }),
  ]);
  assert.equal(weeklyPlan(s, 10, schedule).total, 6);
  s.players[0].actual = null;
  assert.equal(weeklyPlan(s, 10, schedule).total, null);
});
test("waiver simulation measures replacement lineups and position depth, rejects unavailable claims", () => {
  const s = snap(
    [
      player("out", {
        slot: "RB",
        providerProjected: 10,
        research: { baselinePoints: 8 },
      }),
    ],
    {
      available: [
        player("in", {
          team: "GB",
          providerProjected: 15,
          research: { baselinePoints: 12 },
        }),
      ],
    },
  );
  const result = waiverImpact(s, "out", "in", schedule)!;
  assert.equal(result.total, 13);
  assert.deepEqual(
    result.weeks.map((w) => w.delta),
    [5, 4, 4],
  );
  s.available[0].availability = "Taken";
  assert.equal(waiverImpact(s, "out", "in", schedule), null);
  s.available[0].availability = "FA";
  s.players[0].locked = true;
  assert.equal(waiverImpact(s, "out", "in", schedule)!.weeks[0].delta, null);
  const positions = snap(
    [player("rb", { slot: "RB" }), player("out", { slot: "BN" })],
    { available: [player("in", { position: "WR", eligible: ["WR"] })] },
  );
  assert.deepEqual(waiverImpact(positions, "out", "in", schedule)!.depth, [
    { position: "RB", before: 2, after: 1 },
    { position: "WR", before: 0, after: 1 },
  ]);
});
test("dropping an IR player models the incoming player on the bench", () => {
  const s = snap(
    [
      player("start", { slot: "RB", providerProjected: 5 }),
      player("out", { slot: "IR", status: "IR" }),
    ],
    { available: [player("in", { providerProjected: 12 })] },
  );
  assert.equal(waiverImpact(s, "out", "in", schedule)!.weeks[0].delta, 7);
});
test("forecast ledger rejects late uploads, stale imports, missing kickoff and postgame data", () => {
  const s = snap([player("p", { slot: "RB" })]);
  assert.ok(captureForecasts(s, now, ["yahoo"]).length);
  assert.equal(
    captureForecasts({ ...s, receivedAt: at(49) }, now + 50 * 3600000).length,
    0,
  );
  assert.equal(captureForecasts({ ...s, capturedAt: at(-3) }, now).length, 0);
  assert.equal(
    captureForecasts(
      { ...s, players: [{ ...s.players[0], completed: true }] },
      now,
    ).length,
    0,
  );
  assert.equal(
    captureForecasts(
      { ...s, players: [{ ...s.players[0], kickoffAt: null }] },
      now,
    ).length,
    0,
  );
});
test("report card waits for final results and compares the same player-games", () => {
  const s = snap([player("p", { slot: "RB" })]);
  const f = captureForecasts(s, now, ["yahoo"])[0];
  const finals = {
    ...s,
    capturedAt: at(52),
    players: [{ ...s.players[0], actual: 8, completed: true }],
  };
  assert.equal(performanceReport([f], [s]).rows.length, 0);
  const forecasts = [
    f,
    { ...f, mode: "qwen" as const, points: 12 },
    { ...f, mode: "combined" as const, points: 9 },
  ];
  const report = performanceReport(forecasts, [finals]);
  assert.equal(report.commonSamples, 1);
  assert.equal(report.rows[0].error, 2);
  assert.equal(
    report.summary.find((r) => r.mode === "combined" && r.position === "ALL")
      ?.commonMae,
    1,
  );
  assert.equal(
    performanceReport([{ ...f, capturedAt: f.kickoffAt }], [finals]).rows
      .length,
    0,
  );
});
test("partial book receipts score only covered stats and do not invent missing zeroes", () => {
  const s = snap([player("p", { slot: "RB" })]);
  const f: SavedForecast = {
    ...captureForecasts(s, now, ["yahoo"])[0],
    mode: "bookies",
    partial: true,
    points: 7,
    components: [{ market: "rushing-yards", multiplier: 0.1 }],
  };
  const final = {
    ...s,
    players: [
      {
        ...s.players[0],
        completed: true,
        actual: 20,
        stats: { "Rushing Yards": 60 },
      },
    ],
  };
  assert.equal(performanceReport([f], [final]).rows[0].actual, 6);
  final.players[0].stats = {} as any;
  assert.equal(performanceReport([f], [final]).rows.length, 0);
  final.players[0].stats = { "Rushing Yards": 0 };
  assert.equal(performanceReport([f], [final]).rows[0].actual, 0);
});
test("change feed begins from real baseline, filters noise and retains material forecast moves", () => {
  const s = snap([player("p", { slot: "RB" })]);
  assert.equal(changedSince(null, s, at(0)).length, 0);
  const before = observation(s);
  s.players[0].providerProjected = 11;
  assert.equal(changedSince(before, s, at(1)).length, 0);
  s.players[0].providerProjected = 13;
  s.players[0].status = "O";
  const changes = changedSince(before, s, at(1));
  assert.deepEqual(changes.map((c) => c.kind).sort(), ["health", "projection"]);
});
test("kickoff alerts rank eligible replacements, separate watch and urgent, and respect locks", () => {
  const s = snap([
    player("p", { slot: "RB", status: "Q" }),
    player("bench"),
    player("bad", { status: "O", providerProjected: 90 }),
    player("locked", { locked: true, providerProjected: 100 }),
  ]);
  const watch = kickoffAlerts(s, now)[0];
  assert.equal(watch.level, "watch");
  assert.deepEqual(
    watch.replacements.map((p) => p.id),
    ["bench"],
  );
  s.players[0].status = "O";
  assert.equal(kickoffAlerts(s, now)[0].level, "urgent");
  s.players[0].locked = true;
  assert.equal(kickoffAlerts(s, now).length, 0);
});
test("NFL schedules respect Eastern daylight saving and distinguish unknown schedules from byes", () => {
  assert.equal(
    easternKickoff("2026-09-20", "13:00"),
    "2026-09-20T17:00:00.000Z",
  );
  assert.equal(
    easternKickoff("2026-11-15", "13:00"),
    "2026-11-15T18:00:00.000Z",
  );
  const s = snap([player("p")]);
  assert.ok(scheduleFromRows([], s).DET[0].unknown);
  const rows = Array.from({ length: 18 }, (_, i) => i + 1)
    .filter((w) => w !== 11)
    .map((week) => ({
      season: 2026,
      week,
      game_type: "REG",
      home_team: "DET",
      away_team: "GB",
      gameday: "2026-11-15",
      gametime: "13:00",
    }));
  assert.ok(scheduleFromRows(rows, s).DET[1].bye);
  assert.equal(injuryCode("Questionable"), "Q");
  assert.equal(injuryCode("Made up"), "");
});
test("weekly receipts distinguish a defensible pregame choice from a better bench outcome", () => {
  const s = snap([
    player("start", { slot: "RB", projected: 15 }),
    player("bench", { projected: 10 }),
  ]);
  const final = {
    ...s,
    capturedAt: at(52),
    receivedAt: at(52),
    players: s.players.map((p) => ({
      ...p,
      locked: true,
      completed: true,
      kickoffAt: null,
      actual: p.id === "start" ? 5 : 25,
    })),
  };
  const recap = weeklyRecaps([s, final], [])[0];
  assert.equal(recap.complete, true);
  assert.equal(recap.points, 5);
  assert.equal(recap.decisions[0].kind, "Reasonable call, rough result");
  assert.equal(recap.pickupKnown, false);
  assert.equal(recap.bestSource, null);
  const noPregame = weeklyRecaps([final], [])[0];
  assert.equal(noPregame.decisions.length, 0);
});
test("planner preserves scarce fixed eligibility and retains valid negative defense estimates", () => {
  const s = snap([
    player("wr", {
      slot: "WR",
      position: "WR",
      eligible: ["WR"],
      providerProjected: 8,
    }),
    player("rb", { slot: "RB", providerProjected: 7 }),
    player("oldflex", { slot: "W/R/T", providerProjected: 1 }),
    player("te", { position: "TE", eligible: ["TE"], providerProjected: 20 }),
    player("def", {
      slot: "DEF",
      position: "DEF",
      eligible: ["DEF"],
      providerProjected: -4,
    }),
  ]);
  const p = weeklyPlan(s, 10, schedule);
  assert.equal(p.total, 31);
  assert.equal(p.lineup.find((p) => p.slot === "W/R/T")?.playerId, "te");
  assert.equal(new Set(p.lineup.map((p) => p.playerId)).size, 4);
  assert.deepEqual(p.gaps, []);
});
