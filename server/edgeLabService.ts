import { gunzipSync } from "node:zlib";
import type { Express } from "express";
import type { Pool } from "pg";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import type { SnapshotData } from "../shared/model.ts";
import { scoring, keyName } from "../shared/playerForecast.ts";
import {
  buildPlayerLab,
  historicalBaselineReport,
  leagueSettings,
  leagueTeams,
  scoreRows,
  bestTeam,
  playoffSimulation,
  tradeImpact,
  type LabPlayer,
  type LabTeam,
} from "../shared/edgeLab.ts";
import { reserveSlots } from "../shared/availability.ts";
import { teamCode } from "../shared/strategy.ts";
const root = "https://github.com/nflverse/nflverse-data/releases/download/";
export async function installEdgeLab(app: Express, db: Pool) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS edge_lab_state(scope text PRIMARY KEY,updated_at timestamptz NOT NULL DEFAULT now(),data jsonb NOT NULL)",
  );
  let running = false;
  async function source(url: string, ttl: number, csv = false) {
    const old = (
      await db.query(
        "SELECT data,updated_at FROM research_cache WHERE url=$1",
        [url],
      )
    ).rows[0];
    if (old && Date.now() - Date.parse(old.updated_at) < ttl)
      return { data: old.data, updatedAt: old.updated_at, stale: false, url };
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(25000),
        headers: {
          "User-Agent": "FantasyFootballEdge/1.0 (fantasy.ramideltoro.com)",
        },
      });
      if (!r.ok) throw Error("HTTP " + r.status);
      let data = csv
        ? parse(
            url.endsWith(".gz")
              ? gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8")
              : await r.text(),
            { columns: true, skip_empty_lines: true },
          )
        : await r.json();
      if (url.includes("/pbp/")) {
        const regular = data.filter((r: any) => r.season_type === "REG");
        const coveredGames = [
          ...new Map(
            regular.map((r: any) => [
              r.game_id,
              {
                game_id: r.game_id,
                week: r.week,
                season: r.season,
                coverage: true,
              },
            ]),
          ).values(),
        ];
        data = [
          ...coveredGames,
          ...regular
            .filter(
              (r: any) => r.yardline_100 !== "" && Number(r.yardline_100) <= 20,
            )
            .map((r: any) => ({
              game_id: r.game_id,
              season: r.season,
              week: r.week,
              yardline_100: r.yardline_100,
              receiver_player_id: r.receiver_player_id,
              rusher_player_id: r.rusher_player_id,
              pass_attempt: r.pass_attempt,
              rush_attempt: r.rush_attempt,
            })),
        ];
      }
      await db.query(
        "INSERT INTO research_cache VALUES($1,now(),$2) ON CONFLICT(url) DO UPDATE SET updated_at=now(),data=$2",
        [url, JSON.stringify(data)],
      );
      return { data, updatedAt: new Date().toISOString(), stale: false, url };
    } catch {
      return {
        data: old?.data ?? (csv ? [] : null),
        updatedAt: old?.updated_at || null,
        stale: true,
        url,
      };
    }
  }
  async function refresh() {
    if (running) return;
    running = true;
    try {
      const raw = (
        await db.query(
          "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
        )
      ).rows[0]?.data as SnapshotData | undefined;
      if (!raw) return;
      const scope = createHash("sha256")
        .update([raw.league.id, raw.team.id, raw.season].join(":"))
        .digest("hex");
      const old = (
        await db.query(
          "SELECT data,updated_at FROM edge_lab_state WHERE scope=$1",
          [scope],
        )
      ).rows[0];
      if (
        old?.data.snapshotAt === raw.capturedAt &&
        Date.now() - Date.parse(old.updated_at) < 1800000
      )
        return;
      const sources = await Promise.all(
        [raw.season - 1, raw.season]
          .flatMap((y) => [
            `stats_player/stats_player_week_${y}.csv`,
            `stats_team/stats_team_week_${y}.csv`,
            `snap_counts/snap_counts_${y}.csv`,
          ])
          .concat("schedules/games.csv")
          .map((p) => source(root + p, 6 * 3600000, true)),
      );
      const stats = sources
          .filter((s) => s.url.includes("/stats_"))
          .flatMap((s) => s.data),
        snaps = sources
          .filter((s) => s.url.includes("/snap_counts/"))
          .flatMap((s) => s.data),
        games = sources.find((s) => s.url.endsWith("games.csv"))!.data;
      const redZone = await source(
        root + "pbp/play_by_play_" + raw.season + ".csv.gz",
        6 * 3600000,
        true,
      );
      const rules = scoring(raw),
        scores = scoreRows(stats, rules, games),
        settings = leagueSettings(raw),
        teamsRaw = leagueTeams(raw);
      const ids = new Map(
        [
          ...teamsRaw.flatMap((t) => t.players),
          ...raw.available,
          ...raw.players,
        ].map((p) => [p.id, p]),
      );
      const players: LabPlayer[] = [];
      for (const p of ids.values()) {
        players.push(
          buildPlayerLab(p, raw, stats, snaps, games, rules, scores),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      for (const p of players) {
        const usage = p.lab.usage;
        if (!usage) continue;
        const matches = stats.filter(
          (r: any) =>
            r.position === p.position &&
            keyName(r.player_display_name || "") === keyName(p.name),
        );
        const ids = [...new Set(matches.map((r: any) => r.player_id))];
        const current =
          usage.latestSeason === raw.season &&
          ids.length === 1 &&
          redZone.updatedAt &&
          !redZone.stale &&
          matches.some(
            (r: any) =>
              Number(r.season) === usage.latestSeason &&
              Number(r.week) === usage.latestWeek &&
              redZone.data.some(
                (g: any) => g.coverage && g.game_id === r.game_id,
              ),
          );
        const plays = current
          ? redZone.data.filter((r: any) => Number(r.week) === usage.latestWeek)
          : [];
        usage.redZoneTargets = current
          ? plays.filter(
              (r: any) =>
                r.receiver_player_id === ids[0] && Number(r.pass_attempt) === 1,
            ).length
          : null;
        usage.goalLineCarries = current
          ? plays.filter(
              (r: any) =>
                r.rusher_player_id === ids[0] &&
                Number(r.rush_attempt) === 1 &&
                Number(r.yardline_100) <= 5,
            ).length
          : null;
      }
      const byId = new Map(players.map((p) => [p.id, p]));
      const teams: LabTeam[] = teamsRaw.map((t) => ({
        ...t,
        players: t.players.map((p) => byId.get(p.id)!),
      }));
      const slots = raw.players
        .filter((p) => !reserveSlots.has(p.slot))
        .map((p) => p.slot);
      const own = teams.find((t) => t.own),
        pool = raw.available.map((p) => byId.get(p.id)!);
      const proposals: any[] = [];
      if (own)
        for (const other of teams.filter((t) => !t.own && t.players.length)) {
          for (const outgoing of own.players
            .filter((p) => !p.locked)
            .sort((a, b) => (b.lab.baseline ?? 0) - (a.lab.baseline ?? 0))
            .slice(0, 8))
            for (const incoming of other.players
              .filter((p) => !p.locked)
              .sort((a, b) => (b.lab.baseline ?? 0) - (a.lab.baseline ?? 0))
              .slice(0, 8)) {
              await new Promise<void>((resolve) => setImmediate(resolve));
              const result = tradeImpact(
                own,
                other,
                [outgoing.id],
                [incoming.id],
                slots,
                raw.week,
                pool,
              );
              if (
                result &&
                result.ownGain !== null &&
                result.otherGain !== null &&
                result.ownGain > 0 &&
                result.otherGain >= 0
              )
                proposals.push(result);
            }
        }
      proposals.sort(
        (a, b) => b.ownGain + b.otherGain - (a.ownGain + a.otherGain),
      );
      const receptions = rules.Receptions ?? 0,
        format =
          receptions === 1
            ? "ppr"
            : receptions === 0.5
              ? "half-ppr"
              : "standard";
      const draft = await source(
        `https://fantasyfootballcalculator.com/api/v1/adp/${format}?teams=${teams.length || 12}&year=${raw.season}`,
        86400000,
      );
      const board = await source(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${raw.season}&seasontype=2&week=${raw.week}`,
        3600000,
      );
      const weather = (board.data?.events || []).map((e: any) => ({
        teams: (e.competitions?.[0]?.competitors || []).map((c: any) =>
          teamCode(c.team.abbreviation),
        ),
        kickoffAt: e.date,
        venue: e.competitions?.[0]?.venue?.fullName,
        indoor: e.competitions?.[0]?.venue?.indoor ?? null,
        description: e.weather?.displayValue || null,
        temperature: e.weather?.temperature ?? null,
        source: e.weather?.link?.href || "https://www.espn.com/nfl/scoreboard",
        updatedAt: board.updatedAt,
      }));
      const strengths = teams.map((t) => ({
        key: t.key,
        weekly: bestTeam(t.players, slots, raw.week, raw.week),
        next: bestTeam(t.players, slots, raw.week + 1, raw.week),
      }));
      const data = {
        version: 1,
        baselineReport: historicalBaselineReport(
          stats,
          scores,
          raw.season,
          raw.week,
        ),
        generatedAt: new Date().toISOString(),
        snapshotAt: raw.capturedAt,
        season: raw.season,
        week: raw.week,
        settings,
        slots,
        players,
        teams,
        proposals: proposals.slice(0, 12),
        strengths,
        playoffs: playoffSimulation(teams, slots, settings, raw.week),
        weather,
        draft: {
          ...draft.data,
          source: draft.url,
          updatedAt: draft.updatedAt,
          stale: draft.stale,
        },
        sources: [...sources, redZone, draft, board].map(({ data, ...s }) => s),
        coverage: {
          teams: teams.length,
          rosters: teams.filter((t) => t.players.length).length,
          scoutingAt:
            raw.sections.find((p) => p.kind === "league-roster")?.filters
              .capturedAt || null,
        },
      };
      await db.query(
        "INSERT INTO edge_lab_state VALUES($1,now(),$2) ON CONFLICT(scope) DO UPDATE SET updated_at=now(),data=$2",
        [scope, JSON.stringify(data)],
      );
    } catch (e) {
      console.error(
        "Edge lab refresh failed:",
        e instanceof Error ? e.message : "unknown error",
      );
    } finally {
      running = false;
    }
  }
  app.get("/api/edge-lab", async (_q, r) => {
    const raw = (
      await db.query(
        "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
      )
    ).rows[0]?.data;
    if (!raw) return r.json(null);
    const scope = createHash("sha256")
      .update([raw.league.id, raw.team.id, raw.season].join(":"))
      .digest("hex");
    const data =
      (
        await db.query("SELECT data FROM edge_lab_state WHERE scope=$1", [
          scope,
        ])
      ).rows[0]?.data || null;
    r.json(
      data
        ? {
            ...data,
            stale:
              data.snapshotAt !== raw.capturedAt ||
              Date.now() - Date.parse(data.generatedAt) > 3600000,
          }
        : null,
    );
  });
  setTimeout(() => void refresh(), 5000).unref();
  setInterval(() => void refresh(), 60000).unref();
  return { refresh };
}
