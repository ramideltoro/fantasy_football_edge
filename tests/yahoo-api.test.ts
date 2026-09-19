import test from "node:test";
import assert from "node:assert/strict";
import {
  sealToken,
  openToken,
  yahooGet,
  YahooError,
  exchangeToken,
} from "../server/yahooApi.ts";
import {
  apiPlayer,
  discoverLeagues,
  fetchYahooSnapshot,
} from "../server/yahooSnapshot.ts";
test("tokens use authenticated encryption and reject tampering", () => {
  const key = "ab".repeat(32),
    token = {
      access_token: "private-access",
      refresh_token: "private-refresh",
      expires_at: 123,
    };
  const sealed = sealToken(token, key);
  assert.ok(!sealed.includes(token.access_token));
  assert.deepEqual(openToken(sealed, key), token);
  assert.notEqual(sealed, sealToken(token, key));
  assert.throws(() => openToken(sealed, "cd".repeat(32)));
  const b = Buffer.from(sealed, "base64");
  b[30] ^= 1;
  assert.throws(() => openToken(b.toString("base64"), key));
});
test("API player IDs preserve history; missing projections are never fabricated", () => {
  const p = apiPlayer({
    player_id: "123",
    name: { full: "Player" },
    display_position: "WR",
    editorial_team_abbr: "NYJ",
    selected_position: { position: "W/R/T" },
    eligible_positions: { position: ["WR", "W/R/T"] },
    player_points: { total: "0" },
    bye_weeks: { week: "7" },
  });
  assert.equal(p.id, "yahoo:123");
  assert.equal(p.actual, 0);
  assert.equal(p.projected, null);
  assert.deepEqual(p.eligible, ["WR", "W/R/T"]);
  assert.equal(p.slot, "W/R/T");
});
test("league discovery handles singleton Yahoo XML structures", async () => {
  const leagues = await discoverLeagues(async () => ({
    users: {
      user: {
        games: {
          game: {
            leagues: {
              league: { league_key: "461.l.12", name: "Test", season: "2026" },
            },
          },
        },
      },
    },
  }));
  assert.equal(leagues[0].key, "461.l.12");
});
test("incomplete API roster is rejected instead of replacing a snapshot", async () => {
  await assert.rejects(() =>
    fetchYahooSnapshot(
      async (path) =>
        path === "league/461.l.12"
          ? { league: { current_week: "2", season: "2026" } }
          : { league: { teams: { team: [] } } },
      "461.l.12",
    ),
  );
});
test("API authorization, cooldown and expired-token errors are classified without leaking response", async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, body, kind] of [
      [403, "sensitive additional_authorization_required", "approval_required"],
      [401, "sensitive", "reconnect"],
      [429, "sensitive", "cooldown"],
    ] as const) {
      globalThis.fetch = async () => new Response(body, { status });
      await assert.rejects(
        () => yahooGet("users;use_login=1", "secret"),
        (e: any) =>
          e instanceof YahooError &&
          e.kind === kind &&
          !e.message.includes("sensitive"),
      );
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("refresh retains old refresh token when Yahoo omits replacement", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ access_token: "new-access", expires_in: 3600 });
    const t = await exchangeToken(
      { grant_type: "refresh_token" },
      "id",
      "secret",
      { access_token: "old", refresh_token: "keep", expires_at: 0 },
    );
    assert.equal(t.refresh_token, "keep");
    assert.equal(t.access_token, "new-access");
    assert.ok(t.expires_at > Date.now());
  } finally {
    globalThis.fetch = original;
  }
});

test("complete API snapshot preserves roster IDs, league scoring and bounded player coverage", async () => {
  const team = {
    team_key: "461.l.12.t.3",
    name: "My team",
    is_owned_by_current_login: "1",
    team_standings: {
      rank: "1",
      outcome_totals: { wins: "1", losses: "0", ties: "0" },
      points_for: "100",
      points_against: "90",
    },
  };
  const player = {
    player_id: "123",
    name: { full: "Player" },
    display_position: "WR",
    editorial_team_abbr: "NYJ",
    selected_position: { position: "WR" },
    eligible_positions: { position: "WR" },
    player_stats: { stats: { stat: { stat_id: "1", value: "50" } } },
    player_points: { total: "5" },
    is_editable: "0",
  };
  const seen: string[] = [];
  const s = await fetchYahooSnapshot(
    async (path) => {
      seen.push(path);
      if (path === "league/461.l.12")
        return {
          league: { current_week: "2", season: "2026", name: "League" },
        };
      if (path.endsWith("/teams")) return { league: { teams: { team } } };
      if (path.endsWith("/settings"))
        return {
          league: {
            settings: {
              stat_categories: {
                stats: { stat: { stat_id: "1", name: "Receiving Yards" } },
              },
              stat_modifiers: {
                stats: { stat: { stat_id: "1", value: "0.1" } },
              },
            },
          },
        };
      if (path.includes("/roster;"))
        return { team: { roster: { players: { player } } } };
      if (path.endsWith("/standings"))
        return { league: { standings: { teams: { team } } } };
      if (path.includes("/scoreboard;"))
        return {
          league: {
            scoreboard: {
              matchups: {
                matchup: {
                  teams: {
                    team: [
                      team,
                      { team_key: "461.l.12.t.4", name: "Opponent" },
                    ],
                  },
                },
              },
            },
          },
        };
      if (path.includes("/players;")) return { league: { players: {} } };
      if (path.includes("/transactions;"))
        return { league: { transactions: {} } };
      if (path.endsWith("/draftresults"))
        return { league: { draft_results: {} } };
      if (path.endsWith("/matchups"))
        return {
          team: {
            matchups: {
              matchup: [
                {
                  week: "1",
                  status: "postevent",
                  teams: {
                    team: [
                      { ...team, team_points: { total: "0" } },
                      {
                        team_key: "461.l.12.t.4",
                        team_points: { total: "-2" },
                      },
                    ],
                  },
                },
                {
                  week: "2",
                  status: "midevent",
                  teams: {
                    team: [
                      { ...team, team_points: { total: "12" } },
                      {
                        team_key: "461.l.12.t.4",
                        team_points: { total: "10" },
                      },
                    ],
                  },
                },
              ],
            },
          },
        };
      throw Error("Unexpected fixture route");
    },
    "461.l.12",
    "3",
  );
  assert.equal(s.leagueRosters?.[0].schedule[0].completed, true);
  assert.equal(s.leagueRosters?.[0].schedule[0].ownPoints, 0);
  assert.equal(s.leagueRosters?.[0].schedule[0].opponentPoints, -2);
  assert.equal(s.leagueRosters?.[0].schedule[1].completed, false);
  assert.equal(s.source, "yahoo-api");
  assert.equal(s.team.id, "3");
  assert.equal(s.league.id, "12");
  assert.equal(s.players[0].id, "yahoo:123");
  assert.equal(s.players[0].locked, true);
  assert.equal(s.players[0].stats["Receiving Yards"], 50);
  assert.equal(s.available.length, 0);
  assert.equal(
    s.sections.find((s) => s.kind === "settings")?.tables[0].rows[0].cells[1],
    "0.1",
  );
  assert.ok(s.coverage.every((c) => c.complete));
  assert.ok(seen.some((p) => p.includes("position=W%2FR%2FT")));
});
