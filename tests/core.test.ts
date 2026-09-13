import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Player,
  Snapshot,
  publicSnapshot,
  parsePlayers,
  type PlayerData,
  type SnapshotData,
} from "../shared/model.ts";
import { advice } from "../shared/advice.ts";
import { accuracy, leagueOverview } from "../shared/analytics.ts";
const player = (x: Partial<PlayerData>) =>
  Player.parse({
    id: "p1",
    name: "Test Player",
    position: "RB",
    team: "DET",
    slot: "RB",
    bye: 8,
    actual: null,
    projected: 10,
    startPct: 50,
    rosterPct: 90,
    status: "",
    locked: false,
    eligible: ["RB"],
    stats: {},
    ...x,
  });
const snap = (players: PlayerData[]) =>
  Snapshot.parse({
    version: 1,
    source: "test",
    capturedAt: new Date().toISOString(),
    season: 2026,
    week: 1,
    team: { id: "8", name: "Own Team" },
    league: { id: "secret-league", name: "Private League" },
    players,
    available: [],
    sections: [],
  });
test("optimizer respects locked games, eligibility, byes and out statuses", () => {
  const s = snap([
    player({ id: "locked", locked: true, projected: 2 }),
    player({ id: "flex", slot: "W/R/T", projected: 4 }),
    player({ id: "bench", slot: "BN", projected: 20 }),
    player({ id: "bye", slot: "BN", projected: 100, bye: 1 }),
    player({ id: "out", slot: "BN", projected: 99, status: "O" }),
    player({
      id: "qb",
      slot: "BN",
      eligible: ["QB"],
      position: "QB",
      projected: 101,
    }),
  ]);
  const a = advice(s);
  assert.equal(a.delta, 16);
  assert.deepEqual(
    new Set(a.lineup.map((x) => x.playerId)),
    new Set(["locked", "bench"]),
  );
});
test("optimizer handles multiple flex slots without repeating a player", () => {
  const a = advice(
    snap([
      player({ id: "a", slot: "W/R/T" }),
      player({ id: "b", slot: "W/R/T" }),
      player({ id: "c", slot: "BN", projected: 20 }),
      player({ id: "d", slot: "BN", projected: 19 }),
    ]),
  );
  assert.equal(a.delta, 19);
  assert.equal(new Set(a.lineup.map((x) => x.playerId)).size, 2);
});
test("missing current projection does not produce a fabricated gain", () => {
  assert.equal(
    advice(snap([player({ projected: null }), player({ id: "b", slot: "BN" })]))
      .delta,
    null,
  );
});
test("public serialization omits all league sections and identifiers", () => {
  const s = snap([player({})]);
  s.sections.push({
    kind: "league",
    title: "Private",
    url: "https://example.com/private",
    text: "Owner Email Secret",
    tables: [],
    filters: {},
  });
  const json = JSON.stringify(publicSnapshot(s));
  for (const secret of [
    "secret-league",
    "Private League",
    "Owner Email Secret",
    "example.com/private",
  ])
    assert.ok(!json.includes(secret));
  assert.equal((publicSnapshot(s).team as any).id, undefined);
});
test("projection player-pool fields never masquerade as actual points", () => {
  const p = parsePlayers({
    kind: "players",
    title: "Players",
    url: "https://example.com/players",
    text: "",
    filters: { stat1: "S_PW_1" },
    tables: [
      {
        caption: "",
        headers: [
          { text: "Offense", title: "" },
          { text: "Fan Pts", title: "Fantasy Points" },
          { text: "Roster Status", title: "" },
        ],
        rows: [
          {
            cells: [
              "Test PlayerQVideo Forecast\nDet - RB\nSun 1:00 pm",
              "17.5",
              "FA",
            ],
            links: [
              {
                id: "playernote-123",
                text: "Test Player",
                url: "https://sports.yahoo.com/nfl/players/123",
              },
            ],
          },
        ],
      },
    ],
  })[0];
  assert.equal(p.projected, 17.5);
  assert.equal(p.actual, null);
  assert.equal(p.status, "Q");
  assert.equal(p.availability, "FA");
});
test("accuracy requires a stored unlocked projection and completed outcome", () => {
  const before = snap([player({ projected: 12 })]);
  before.capturedAt = "2026-09-01T12:00:00.000Z";
  const inGame = snap([player({ projected: 12, actual: 6, locked: true })]);
  inGame.capturedAt = "2026-09-02T12:00:00.000Z";
  assert.equal(accuracy([before, inGame]).sampleSize, 0);
  const final = snap([
    player({ projected: 0, actual: 15, locked: true, completed: true }),
  ]);
  final.capturedAt = "2026-09-03T12:00:00.000Z";
  assert.equal(accuracy([before, final]).mae, 3);
  assert.equal(accuracy([final]).sampleSize, 0);
});
test("invalid empty rosters fail schema validation", () =>
  assert.throws(() => snap([])));
import { kickoff } from "../shared/model.ts";
import { calibratedForecast } from "../shared/forecast.ts";
test("kickoff parser respects Eastern daylight and standard time", () => {
  assert.equal(
    kickoff([
      {
        url: "https://sports.yahoo.com/nfl/game-20260913001/",
        text: "Sun 1:00 pm",
      },
    ]),
    "2026-09-13T17:00:00.000Z",
  );
  assert.equal(
    kickoff([
      {
        url: "https://sports.yahoo.com/nfl/game-20261115001/",
        text: "Sun 1:00 pm",
      },
    ]),
    "2026-11-15T18:00:00.000Z",
  );
});
test("calibration does not invent uncertainty from insufficient samples", () => {
  assert.equal(
    calibratedForecast([player({})], {
      sampleSize: 0,
      mae: null,
      bias: null,
      points: [],
    }).available,
    false,
  );
});
test("kickoff locks advance even when the Mac has not refreshed the snapshot", () => {
  const a = advice(
    snap([
      player({
        id: "started",
        projected: 1,
        kickoffAt: "2020-01-01T00:00:00.000Z",
      }),
      player({ id: "bench", slot: "BN", projected: 30 }),
    ]),
  );
  assert.equal(a.lineup[0].playerId, "started");
  assert.equal(a.delta, 0);
});
test("late uploads cannot become prospective forecasts", () => {
  const s = snap([
    player({ projected: 12, kickoffAt: "2026-09-02T12:00:00.000Z" }),
  ]);
  s.capturedAt = "2026-09-01T12:00:00.000Z";
  s.receivedAt = "2026-09-03T12:00:00.000Z";
  const final = snap([
    player({ projected: 0, actual: 20, locked: true, completed: true }),
  ]);
  final.capturedAt = "2026-09-04T12:00:00.000Z";
  assert.equal(accuracy([s, final]).sampleSize, 0);
});
