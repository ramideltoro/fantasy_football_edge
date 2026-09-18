import test from "node:test";
import assert from "node:assert/strict";
import { waiverShortlist } from "../shared/shortlist.ts";
import { leagueOverview } from "../shared/analytics.ts";
import { validateForecasts } from "../server/projections.ts";
import { applyProjections } from "../shared/applyProjections.ts";
import { playerProfiles } from "../server/playerProfiles.ts";
test("shortlist caps QB at three and fills remaining places with other positions", () => {
  const pool: any = Array.from({ length: 18 }, (_, i) => ({
    id: String(i),
    position: i < 8 ? "QB" : "RB",
    projected: 40 - i,
    availability: "FA",
  }));
  const r = waiverShortlist(pool);
  assert.equal(r.length, 10);
  assert.equal(r.filter((p) => p.position === "QB").length, 3);
  assert.deepEqual(
    r.slice(0, 3).map((p) => p.id),
    ["0", "1", "2"],
  );
});
test("public standings show team names without manager cells or raw sections", () => {
  const s: any = {
    team: { id: "1", name: "Home Team" },
    sections: [
      {
        kind: "league",
        tables: [
          {
            headers: [{ text: "W-L-T" }],
            rows: [
              {
                links: [
                  {
                    text: "Gridiron Giants",
                    url: "https://football.fantasysports.yahoo.com/f1/123/2",
                  },
                ],
                cells: [
                  "2",
                  "Private Manager Name",
                  "1-0-0",
                  "120",
                  "90",
                  "",
                  "3",
                  "2",
                ],
              },
            ],
          },
        ],
      },
      {
        kind: "matchups",
        tables: [],
        text: "20 vs 30 100 Live Proj 120 Gridiron Giants",
      },
    ],
  };
  const r = leagueOverview(s, false);
  assert.equal(r.standings[0].name, "Gridiron Giants");
  assert.equal(r.matchup?.opponentName, "Gridiron Giants");
  assert.ok(!JSON.stringify(r).includes("Private Manager"));
});
test("Qwen numbers are preserved and forecasts contradicting unavailable players are rejected", () => {
  const x = {
    id: "a",
    points: 12.7,
    low: 5,
    high: 22,
    playProbability: 95,
    startProbability: 80,
    reason: "Historical scoring and role.",
  };
  const input = {
    week: 2,
    players: [{ id: "a", history: [{ week: 1 }], injury: "", news: [] }],
  };
  assert.equal(validateForecasts({ forecasts: [x] }, input)[0].points, 12.7);
  assert.throws(() =>
    validateForecasts(
      { forecasts: [x] },
      { ...input, players: [{ ...input.players[0], injury: "IR" }] },
    ),
  );
  assert.throws(() =>
    validateForecasts({ forecasts: [{ ...x, startProbability: 100 }] }, input),
  );
});
test("Yahoo null is preserved and stale or injury-mismatched Qwen cannot drive the lineup", () => {
  const s: any = {
    players: [{ id: "a", team: "NYJ", status: "Q", projected: null }],
    available: [],
  };
  const p = applyProjections(
    s,
    new Map([
      [
        "a",
        { label: "Qwen", points: 20, team: "NYJ", injury: "Q", stale: true },
      ],
    ]),
  );
  assert.equal(p.players[0].providerProjected, null);
  assert.equal(p.players[0].projected, null);
  assert.equal(
    applyProjections(
      s,
      new Map([["a", { points: 20, team: "NYJ", injury: "" }]]),
    ).players[0].aiProjection,
    null,
  );
});
test("actual NFL starts use completed game flags, exclude DNP and combine team stints", async () => {
  const teams = Array.from({ length: 32 }, (_, i) => ({
    team: { abbreviation: "T" + i },
  }));
  const db: any = {
    query: async (sql: string, args: any[]) => {
      if (!sql.startsWith("SELECT")) return { rows: [] };
      const url = args[0];
      let data: any;
      if (url.endsWith("/teams")) data = { sports: [{ leagues: [{ teams }] }] };
      else if (url.includes("/schedule?")) {
        const team = Number(url.match(/teams\/t(\d+)/)?.[1]);
        data = {
          events:
            team < 2
              ? [
                  {
                    id: "G" + team,
                    date: "2026-09-01T17:00Z",
                    seasonType: { type: 2 },
                    competitions: [
                      {
                        status: { type: { completed: true } },
                        competitors: [
                          {
                            id: String(team),
                            team: { abbreviation: "T" + team },
                          },
                        ],
                      },
                    ],
                  },
                ]
              : [],
        };
      } else if (url.includes("/competitors/"))
        data = {
          entries: [
            {
              playerId: "123",
              valid: true,
              didNotPlay: false,
              starter: url.includes("/0/"),
            },
            { playerId: "456", valid: false, didNotPlay: true, starter: false },
          ],
        };
      else
        data = {
          athletes: [
            {
              items: [
                {
                  id: "123",
                  fullName: "Test Player",
                  position: { abbreviation: "QB" },
                  injuries: [],
                  links: [],
                },
              ],
            },
          ],
        };
      return { rows: [{ data, updated_at: new Date().toISOString() }] };
    },
  };
  const p: any = {
    id: "yahoo:1",
    name: "Test Player",
    team: "T1",
    position: "QB",
  };
  const profiles = await playerProfiles(db, {
    season: 2026,
    players: [p],
    available: [],
  } as any);
  assert.equal(profiles[p.id].starts.games, 2);
  assert.equal(profiles[p.id].starts.starts, 1);
  assert.equal(profiles[p.id].starts.percent, 50);
});
import { projectionRequest, validateQwenPoints } from "../shared/qwenPoints.ts";
test("player-keyed Qwen output prevents cross-player IDs and fabricated narrative", () => {
  const input = {
    week: 2,
    players: [
      {
        id: "a",
        name: "A",
        history: [{}],
        fantasyHistory: [{ points: 17, week: 1 }],
        news: [],
        nflRole: "Starter",
      },
    ],
  };
  const request = projectionRequest(input);
  assert.deepEqual(request.format.required, ["a"]);
  const row = {
    points: 16,
    playProbability: 98,
    startProbability: 90,
    evidence: ["history", "role"],
  };
  assert.equal(validateQwenPoints({ a: row }, input)[0].points, 16);
  assert.throws(() => validateQwenPoints({ b: row }, input));
  assert.throws(() =>
    validateQwenPoints({ a: { ...row, reason: "invented injury" } }, input),
  );
  assert.throws(() =>
    validateQwenPoints({ a: { ...row, playProbability: 0.98 } }, input),
  );
});
test("Qwen availability respects elapsed kickoff, team defense, and impossible positive points", () => {
  const base = {
    id: "a",
    position: "QB",
    history: [{}],
    news: [],
    injury: "",
    kickoffAt: new Date(Date.now() - 60000).toISOString(),
  };
  const input = { week: 2, players: [base] };
  const empty = {
    points: null,
    playProbability: null,
    startProbability: null,
    evidence: ["locked"],
  };
  assert.equal(
    projectionRequest(input).format.properties.a.properties.points.type,
    "null",
  );
  assert.equal(validateQwenPoints({ a: empty }, input)[0].points, null);
  assert.throws(() =>
    validateQwenPoints({ a: { ...empty, points: 12 } }, input),
  );
  const upcoming = { ...input, players: [{ ...base, kickoffAt: null }] };
  assert.throws(() =>
    validateQwenPoints(
      { a: { ...empty, points: 12, playProbability: 0 } },
      upcoming,
    ),
  );
  const defense = {
    ...input,
    players: [{ ...base, kickoffAt: null, position: "DEF" }],
  };
  assert.equal(
    validateQwenPoints(
      { a: { ...empty, points: 6, evidence: ["history"] } },
      defense,
    )[0].points,
    6,
  );
  assert.throws(() =>
    validateQwenPoints(
      { a: { ...empty, points: 6, playProbability: 95 } },
      defense,
    ),
  );
});
