import { test } from "node:test";
import assert from "node:assert/strict";
import { Player, Snapshot } from "../shared/model.ts";
import {
  bestTeam,
  tradeImpact,
  playoffSimulation,
  leagueSettings,
  leagueTeams,
  buildPlayerLab,
  scoreRows,
  type LabPlayer,
  type LabTeam,
} from "../shared/edgeLab.ts";
import { strategyLineup } from "../shared/strategy.ts";
const player = (
  id: string,
  position = "RB",
  points = 10,
  extra: any = {},
): LabPlayer => ({
  ...Player.parse({
    id,
    name: id,
    position,
    team: "DET",
    slot: "BN",
    eligible: [position],
    projected: points,
    actual: null,
    bye: 9,
    startPct: null,
    rosterPct: null,
    status: "",
    locked: false,
    kickoffAt: new Date(Date.now() + 86400000).toISOString(),
    availability: "",
    stats: {},
    ...extra,
  }),
  lab: {
    baseline: points,
    baselineMethod: "Test history",
    deviation: 0,
    history: [],
    usage: null,
    matchups: [2, 3, 4, 5].map((week) => ({
      week,
      opponent: "GB",
      bye: false,
      adjustment: 0,
      samples: 10,
      label: "Neutral",
    })),
  },
});
const team = (key: string, players: LabPlayer[], own = false): LabTeam => ({
  key,
  name: key,
  players,
  own,
  record: "0-0-0",
  pointsFor: 0,
  waiver: 1,
  schedule: [],
});
const settings = {
  waiverType: "Continual rolling list",
  median: false,
  playoffTeams: 2,
  playoffWeek: 3,
  divisions: "No",
  tieBreaker: "",
  rosterSlots: "",
};
const snapshot = (players: LabPlayer[]) =>
  Snapshot.parse({
    version: 1,
    source: "test",
    season: 2026,
    week: 2,
    team: { id: "1", name: "Team" },
    league: { id: "1", name: "League" },
    capturedAt: new Date().toISOString(),
    players,
    available: [],
    sections: [],
  });
test("slot matching assigns each player once and satisfies a bench pin", () => {
  const ps = [
    player("a", "RB", 20),
    player("b", "WR", 19),
    player("c", "RB", 4),
  ];
  assert.deepEqual(bestTeam(ps, ["RB", "W/R/T"], 3, 2)?.ids, ["a", "b"]);
  assert.equal(bestTeam(ps, ["RB", "W/R/T"], 3, 2, ["c"])?.points, 24);
  assert.equal(bestTeam(ps, ["QB"], 3, 2), null);
});
test("locked starters keep actual points and locked bench cannot sneak into lineup", () => {
  const ps = [
    player("starter", "RB", 20, {
      slot: "RB",
      locked: true,
      completed: true,
      actual: 3,
    }),
    player("bench", "RB", 50, { locked: true, completed: true, actual: 50 }),
    player("other", "RB", 10),
  ];
  assert.equal(bestTeam(ps, ["RB", "W/R/T"], 2, 2)?.points, 13);
  assert.equal(bestTeam(ps, ["RB", "W/R/T"], 2, 2, [], ["starter"]), null);
});
test("missing future baseline and byes do not become zero-point projections", () => {
  const p = player("a");
  p.lab.baseline = null;
  assert.equal(bestTeam([p], ["RB"], 3, 2), null);
  p.lab.baseline = 10;
  p.lab.matchups[1].bye = true;
  assert.equal(bestTeam([p], ["RB"], 3, 2), null);
});
test("lineup pins and exclusions preserve exact source points", () => {
  const s = snapshot([
    player("starter", "RB", 20, { slot: "RB" }),
    player("bench", "RB", 5),
  ]);
  const a = strategyLineup(s, "yahoo", "balanced", { pinned: ["bench"] });
  assert.equal(a.lineup[0].playerId, "bench");
  assert.equal(a.delta, -15);
  assert.equal(
    strategyLineup(s, "yahoo", "balanced", {
      pinned: ["bench"],
      excluded: ["bench"],
    }).complete,
    false,
  );
});
test("two-for-one trades model a bench drop and an unfilled roster space", () => {
  const own = team(
      "1",
      [player("a", "RB", 10), player("b", "WR", 8), player("c", "WR", 7)],
      true,
    ),
    other = team("2", [
      player("d", "RB", 12),
      player("e", "WR", 5),
      player("f", "WR", 1),
    ]);
  const r = tradeImpact(own, other, ["a", "b"], ["d"], ["RB", "WR"], 2, []);
  assert.ok(r);
  assert.equal(r.ownOpenSlots, 1);
  assert.deepEqual(r.otherDrops, ["f"]);
  assert.equal(r.ownGain, 3);
  assert.equal(r.otherGain, 3);
  assert.equal(tradeImpact(own, other, ["a", "a"], ["d"], ["RB"], 2, []), null);
});
test("no trade estimate for players whose game has locked", () => {
  const own = team("1", [player("a", "RB", 10, { locked: true })]),
    other = team("2", [player("b")]);
  assert.equal(tradeImpact(own, other, ["a"], ["b"], ["RB"], 2, []), null);
});
test("playoff simulation honors median wins and preserves reciprocal schedule coverage", () => {
  const teams = [20, 15, 10, 5].map((p, i) =>
    team(String(i), [player("p" + i, "RB", p, { slot: "RB" })]),
  );
  teams.forEach(
    (t, i) => (t.schedule = [{ week: 2, opponent: String(i ^ 1) }]),
  );
  const normal = playoffSimulation(teams, ["RB"], settings, 2, 50),
    median = playoffSimulation(
      teams,
      ["RB"],
      { ...settings, median: true },
      2,
      50,
    );
  assert.equal(normal.rows.find((r) => r.key === "0")?.expectedWins, 1);
  assert.equal(median.rows.find((r) => r.key === "0")?.expectedWins, 2);
  assert.equal(median.rows.find((r) => r.key === "1")?.expectedWins, 1);
  assert.equal(
    normal.rows.reduce((n, r) => n + r.chance, 0),
    200,
  );
  teams[0].schedule = [];
  assert.match(
    playoffSimulation(teams, ["RB"], settings, 2).reason!,
    /reciprocal/,
  );
});
test("incomplete league roster withholds playoff probabilities", () => {
  assert.match(
    playoffSimulation([team("1", [])], ["RB"], settings, 2).reason!,
    /rosters/,
  );
});
test("league rules parse median and rolling priority without pretending FAAB", () => {
  const s = snapshot([player("a")]);
  s.sections = [
    {
      kind: "settings",
      title: "settings",
      url: "https://example.com",
      filters: {},
      text: "",
      tables: [
        {
          caption: "",
          headers: [],
          rows: [
            ["Waiver Type:", "Continual rolling list"],
            ["Play Against Median Score:", "Yes"],
            ["Playoffs:", "6 teams - Week 15, 16 and 17"],
            ["Divisions:", "No"],
          ].map((cells) => ({ cells, links: [] })),
        },
      ],
    },
  ];
  assert.deepEqual(
    { ...leagueSettings(s), tieBreaker: "", rosterSlots: "" },
    { ...settings, median: true, playoffTeams: 6, playoffWeek: 15 },
  );
});
const rules = {
  "Passing Yards": 0.04,
  "Passing Touchdowns": 4,
  Interceptions: -1,
  "Rushing Yards": 0.1,
  "Rushing Touchdowns": 6,
  Receptions: 1,
  "Receiving Yards": 0.1,
  "Receiving Touchdowns": 6,
  "Fumbles Lost": -2,
  "2-Point Conversions": 2,
};
test("workload history excludes current/future games and scores exact league rules", () => {
  const p = player("receiver", "WR"),
    s = snapshot([p]);
  const rows = [1, 2, 3].map((week) => ({
    player_id: "gsis1",
    player_display_name: "receiver",
    position: "WR",
    team: "DET",
    opponent_team: "GB",
    season: 2026,
    week,
    season_type: "REG",
    game_id: "g" + week,
    receptions: 4,
    targets: 5,
    carries: 0,
    receiving_yards: 50,
    receiving_tds: 0,
    target_share: 0.25,
    air_yards_share: 0.3,
  }));
  const scores = scoreRows(rows, rules, []);
  const lab = buildPlayerLab(p, s, rows, [], [], rules, scores).lab;
  assert.equal(lab.history.length, 1);
  assert.equal(lab.history[0].points, 9);
  assert.equal(lab.usage?.latestWeek, 1);
  assert.equal(lab.usage?.snaps, null);
  assert.equal(lab.usage?.opportunityDelta, null);
});
test("explicit empty-slot simulation handles a future bye without fabricating a pickup", () => {
  const teams = [20, 15, 10, 5].map((p, i) =>
    team(String(i), [player("p" + i, "RB", p, { slot: "RB" })]),
  );
  teams.forEach(
    (t, i) => (t.schedule = [{ week: 2, opponent: String(i ^ 1) }]),
  );
  teams[0].players[0].lab.matchups[0].bye = true;
  const result = playoffSimulation(teams, ["RB"], settings, 2, 10);
  assert.equal(result.reason, null);
  assert.equal(result.emptySlots, 1);
  assert.equal(result.rows.find((r) => r.key === "0")?.expectedWins, 0);
});
test("cached opponent adjustment compares other games and preserves shrinkage", () => {
  const p = player("a", "WR"),
    s = snapshot([p]);
  s.week = 3;
  const rows = [
    ["a", 1, "GB", 10],
    ["a", 2, "MIN", 30],
    ["b", 1, "GB", 20],
    ["b", 2, "MIN", 40],
  ].map(([id, week, opponent, points]) => ({
    player_id: id,
    player_display_name: id,
    position: "WR",
    season: 2026,
    week,
    team: "DET",
    opponent_team: opponent,
    season_type: "REG",
    game_id: "g" + week,
    points,
  }));
  const scores = new Map(
    rows.map((r) => [`${r.player_id}:2026:${r.week}`, Number(r.points)]),
  );
  const games = [
    {
      season: 2026,
      week: 3,
      game_type: "REG",
      home_team: "DET",
      away_team: "GB",
    },
  ];
  assert.equal(
    buildPlayerLab(p, s, rows, [], games, rules, scores).lab.matchups[0]
      .adjustment,
    -1.82,
  );
  assert.equal(
    buildPlayerLab(player("b", "WR"), s, rows, [], games, rules, scores).lab
      .matchups[0].samples,
    2,
  );
});
