import {
  Snapshot,
  type PageCapture,
  type PlayerData,
} from "../shared/model.ts";
import { list } from "./yahooApi.ts";
type Get = (path: string) => Promise<any>;
const n = (v: any) =>
  v !== undefined && v !== null && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
const id = (key: string) => key.split(".").at(-1)!;
export function apiPlayer(
  p: any,
  statNames: Record<string, string> = {},
): PlayerData {
  if (!p.player_id || !p.name?.full) throw Error("Invalid Yahoo player");
  return {
    id: "yahoo:" + p.player_id,
    name: p.name.full,
    position: p.display_position || "",
    team: p.editorial_team_abbr || "",
    slot: p.selected_position?.position || "",
    bye: n(p.bye_weeks?.week),
    actual: n(p.player_points?.total),
    projected: n(p.player_projected_points?.total),
    startPct: null,
    rosterPct: n(p.percent_owned?.value),
    status: p.status || "",
    locked: p.is_editable === "0",
    kickoffAt: null,
    completed: false,
    availability:
      p.ownership?.ownership_type === "freeagents"
        ? "FA"
        : p.ownership?.ownership_type === "waivers"
          ? "W"
          : p.ownership?.ownership_type === "team"
            ? "Taken"
            : "",
    eligible: list(p.eligible_positions?.position).map(String),
    stats: Object.fromEntries(
      list(p.player_stats?.stats?.stat).map((s) => [
        statNames[s.stat_id] || "Yahoo stat " + s.stat_id,
        n(s.value),
      ]),
    ),
  };
}
const row = (cells: any[], links: any[] = []) => ({
  cells: cells.map((v) => String(v ?? "")),
  links,
});
const table = (headers: string[], rows: any[]) => ({
  caption: "Yahoo Fantasy Sports API",
  headers: headers.map((text) => ({ text, title: text })),
  rows,
});
const section = (
  kind: string,
  title: string,
  url: string,
  tables: any[],
  text = "",
): PageCapture => ({ kind, title, url, tables, text, filters: {} });
export async function discoverLeagues(get: Get) {
  const year =
    new Date().getUTCFullYear() - (new Date().getUTCMonth() < 3 ? 1 : 0);
  const d = await get(
    `users;use_login=1/games;game_codes=nfl;seasons=${year}/leagues`,
  );
  return list(d.users?.user).flatMap((u) =>
    list(u.games?.game).flatMap((g) =>
      list(g.leagues?.league).map((l) => ({
        key: l.league_key,
        name: l.name,
        season: Number(l.season),
      })),
    ),
  );
}
export async function fetchYahooSnapshot(
  get: Get,
  leagueKey: string,
  expectedTeamId?: string,
) {
  if (!/^\d+\.l\.\d+$/.test(leagueKey)) throw Error("Invalid league");
  const capturedAt = new Date().toISOString();
  const league = (await get(`league/${leagueKey}`)).league;
  const week = Number(league.current_week),
    season = Number(league.season),
    leagueId = id(leagueKey);
  if (!Number.isInteger(week) || week < 1 || week > 25)
    throw Error("No active week");
  const teams = list(
    (await get(`league/${leagueKey}/teams`)).league?.teams?.team,
  );
  const mine = teams.find(
    (t) =>
      t.is_owned_by_current_login === "1" &&
      (!expectedTeamId || id(t.team_key) === expectedTeamId),
  );
  if (!mine) throw Error("Owned team not found");
  const base = `https://football.fantasysports.yahoo.com/f1/${leagueId}`;
  const settings = (await get(`league/${leagueKey}/settings`)).league?.settings;
  if (!settings?.stat_categories || !settings?.stat_modifiers)
    throw Error("Missing league scoring");
  const names = Object.fromEntries(
    list(settings.stat_categories.stats?.stat).map((s) => [
      s.stat_id,
      s.name || s.display_name,
    ]),
  );
  const roster = (
    await get(
      `team/${mine.team_key}/roster;week=${week}/players/stats;type=week;week=${week}`,
    )
  ).team?.roster?.players;
  const players = list(roster?.player).map((p) => apiPlayer(p, names));
  const standings = list(
    (await get(`league/${leagueKey}/standings`)).league?.standings?.teams?.team,
  );
  if (!standings.length) throw Error("Missing league standings");
  const scoreboard = (await get(`league/${leagueKey}/scoreboard;week=${week}`))
    .league?.scoreboard;
  const matches = list(scoreboard?.matchups?.matchup);
  const matchup = matches.find((m) =>
    list(m.teams?.team).some((t) => t.team_key === mine.team_key),
  );
  const own = list(matchup?.teams?.team).find(
      (t) => t.team_key === mine.team_key,
    ),
    opp = list(matchup?.teams?.team).find((t) => t.team_key !== mine.team_key);
  const sections: PageCapture[] = [
    section("settings", "League scoring", base + "/settings", [
      table(
        ["Statistic", "Value"],
        list(settings.stat_modifiers.stats?.stat).map((s) =>
          row([names[s.stat_id] || s.stat_id, s.value]),
        ),
      ),
    ]),
    section("league", league.name, base, [
      table(
        [
          "Rank",
          "Team",
          "W-L-T",
          "Points For",
          "Points Against",
          "Streak",
          "Waiver",
          "Moves",
        ],
        standings.map((t) => {
          const a = t.team_standings || {},
            r = a.outcome_totals || {};
          return row(
            [
              a.rank,
              t.name,
              `${r.wins || 0}-${r.losses || 0}-${r.ties || 0}`,
              a.points_for,
              a.points_against,
              "",
              t.waiver_priority,
              t.number_of_moves,
            ],
            [{ text: t.name, url: base + "/" + id(t.team_key) }],
          );
        }),
      ),
    ]),
  ];
  sections[0].tables.push(
    table(
      ["Setting", "Value"],
      [
        row(["Waiver Type:", settings.waiver_type || "Unknown"]),
        row([
          "Playoffs:",
          settings.num_playoff_teams && settings.playoff_start_week
            ? settings.num_playoff_teams +
              " teams - Week " +
              settings.playoff_start_week
            : "",
        ]),
        row([
          "Play Against Median Score:",
          settings.has_median_matchup === "1"
            ? "Yes"
            : settings.has_median_matchup === "0"
              ? "No"
              : "Unknown",
        ]),
        row(["Divisions:", settings.divisions ? "Yes" : "No"]),
      ],
    ),
  );
  const leagueRosters: any[] = [];
  // Optional scouting must not invalidate a complete core API import.
  for (const t of teams) {
    try {
      const rosterData =
        t.team_key === mine.team_key
          ? players
          : list(
              (
                await get(
                  `team/${t.team_key}/roster;week=${week}/players/stats;type=week;week=${week}`,
                )
              ).team?.roster?.players?.player,
            ).map((p) => apiPlayer(p, names));
      const matches = list(
        (await get(`team/${t.team_key}/matchups`)).team?.matchups?.matchup,
      );
      const schedule = matches.flatMap((m) => {
        const scheduledTeam = list(m.teams?.team).find(
          (o) => o.team_key === t.team_key,
        );
        const opponent = list(m.teams?.team).find(
          (o) => o.team_key !== t.team_key,
        );
        return opponent
          ? [
              {
                week: Number(m.week),
                opponent: id(opponent.team_key),
                completed: m.status === "postevent",
                ownPoints: n(scheduledTeam?.team_points?.total),
                opponentPoints: n(opponent.team_points?.total),
              },
            ]
          : [];
      });
      if (rosterData.length)
        leagueRosters.push({
          teamId: id(t.team_key),
          name: t.name,
          capturedAt,
          players: rosterData,
          schedule,
        });
    } catch {
      /* Scouting coverage remains explicit until this source is available. */
    }
  }
  const scoreText =
    own && opp
      ? `${own.team_points?.total ?? ""} vs ${opp.team_points?.total ?? ""}`
      : "";
  const projText =
    own?.team_projected_points && opp?.team_projected_points
      ? `${own.team_projected_points.total} Live Proj ${opp.team_projected_points.total}`
      : "";
  sections.push(
    section(
      "matchups",
      "Weekly matchup",
      base + "/matchup",
      [
        table(
          ["Team", "Points", "Projected"],
          list(matchup?.teams?.team).map((t) =>
            row(
              [t.name, t.team_points?.total, t.team_projected_points?.total],
              [{ text: t.name, url: base + "/" + id(t.team_key) }],
            ),
          ),
        ),
      ],
      scoreText + " " + projText,
    ),
  );
  const available: PlayerData[] = [];
  const coverage: any[] = [];
  for (const [position, count] of [
    ["W/R/T", 50],
    ["QB", 25],
    ["K", 25],
    ["DEF", 25],
  ] as const) {
    let rows = 0;
    for (let start = 0; start < count; start += 25) {
      const data = await get(
        `league/${leagueKey}/players;status=A;position=${encodeURIComponent(position)};sort=OR;start=${start};count=25/stats;type=week;week=${week}`,
      );
      if (!data.league?.players) throw Error("Missing player pool");
      const ps = list(data.league.players.player).map((p) => ({
        ...apiPlayer(p, names),
        availability: p.ownership?.ownership_type === "waivers" ? "W" : "FA",
      }));
      available.push(...ps);
      rows += ps.length;
      if (ps.length < 25) break;
    }
    coverage.push({
      kind: "players-" + position,
      pages: Math.ceil(count / 25),
      rows,
      complete: true,
    });
  }
  // These official resources replace league-page extraction. Empty collections are valid.
  for (const [kind, path, node, headers, convert] of [
    [
      "transactions",
      "transactions;count=25",
      "transactions",
      ["Type", "Status", "Time"],
      (v: any) =>
        row([
          v.type,
          v.status,
          v.timestamp ? new Date(Number(v.timestamp) * 1000).toISOString() : "",
        ]),
    ],
    [
      "draft",
      "draftresults",
      "draft_results",
      ["Round", "Pick", "Team", "Player"],
      (v: any) => row([v.round, v.pick, v.team_key, v.player_key]),
    ],
  ] as const) {
    const d = (await get(`league/${leagueKey}/${path}`)).league;
    if (!d || !(node in d)) throw Error("Missing league resource");
    const values = list(
      d[node]?.[kind === "draft" ? "draft_result" : "transaction"],
    );
    sections.push(
      section(
        kind,
        kind === "draft" ? "Draft results" : "Recent transactions",
        base + "/" + (kind === "draft" ? "draftresults" : kind),
        [table([...headers], values.map(convert))],
      ),
    );
  }
  const schedule = list(
    (await get(`team/${mine.team_key}/matchups`)).team?.matchups?.matchup,
  );
  sections.push(
    section("schedule", "Team schedule", base, [
      table(
        ["Week", "Status", "Teams"],
        schedule.map((m) =>
          row([
            m.week,
            m.status,
            list(m.teams?.team)
              .map((t) => t.name)
              .join(" vs "),
          ]),
        ),
      ),
    ]),
  );
  for (const kind of [
    "roster",
    "league",
    "matchups",
    "settings",
    "transactions",
    "draft",
    "schedule",
  ])
    coverage.push({
      kind,
      pages: 1,
      rows: kind === "roster" ? players.length : 1,
      complete: true,
    });
  return Snapshot.parse({
    version: 1,
    source: "yahoo-api",
    capturedAt,
    season,
    week,
    team: { id: id(mine.team_key), name: mine.name },
    league: { id: leagueId, name: league.name },
    players,
    available: [...new Map(available.map((p) => [p.id, p])).values()],
    sections,
    leagueRosters,
    coverage,
  });
}
