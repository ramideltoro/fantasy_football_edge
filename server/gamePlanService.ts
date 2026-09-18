import type { Express } from "express";
import type { Pool, PoolClient } from "pg";
import type { SnapshotData } from "../shared/model.ts";
import { createHash } from "node:crypto";
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
  type PlanChange,
} from "../shared/gamePlanChanges.ts";
import { teamCode, type Schedule } from "../shared/strategy.ts";
import { keyName } from "../shared/playerForecast.ts";

const scopeOf = (s: SnapshotData) =>
  createHash("sha256")
    .update([s.source, s.league.id, s.team.id, s.season].join(":"))
    .digest("hex");
const scheduleUrl =
  "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv";
export function easternKickoff(day: string, time: string): string | null {
  if (!/^\d{4}-\d\d-\d\d$/.test(day) || !/^\d\d:\d\d/.test(time)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(day + "T12:00:00Z"));
  const offset = Number(
    parts
      .find((p) => p.type === "timeZoneName")
      ?.value.match(/GMT([+-]\d+)/)?.[1],
  );
  if (!Number.isFinite(offset)) return null;
  return new Date(
    Date.parse(`${day}T${time.slice(0, 5)}:00Z`) - offset * 3600000,
  ).toISOString();
}
export function scheduleFromRows(rows: any[], s: SnapshotData): Schedule {
  const teams = [
    ...new Set([...s.players, ...s.available].map((p) => teamCode(p.team))),
  ];
  const regular = rows.filter(
    (g) => Number(g.season) === s.season && g.game_type === "REG",
  );
  return Object.fromEntries(
    teams.map((team) => [
      team,
      [s.week, s.week + 1, s.week + 2]
        .filter((w) => w <= 18)
        .map((week) => {
          const games = regular.filter(
            (g) =>
              Number(g.week) === week &&
              [teamCode(g.home_team), teamCode(g.away_team)].includes(team),
          );
          // An absent row is a bye only when a complete 17-game team schedule is present.
          const teamGames = regular.filter((g) =>
            [teamCode(g.home_team), teamCode(g.away_team)].includes(team),
          );
          const game = games.length === 1 ? games[0] : null;
          return {
            team,
            week,
            opponent: game
              ? teamCode(game.home_team) === team
                ? teamCode(game.away_team)
                : teamCode(game.home_team)
              : null,
            kickoffAt: game
              ? easternKickoff(game.gameday, game.gametime)
              : null,
            bye: !games.length && teamGames.length === 17,
            unknown:
              games.length > 1 || (!games.length && teamGames.length !== 17),
          };
        }),
    ]),
  );
}
export function injuryCode(value: string) {
  return (
    {
      Out: "O",
      "Injured Reserve": "IR",
      Questionable: "Q",
      Doubtful: "D",
      Suspended: "SUSP",
      "Physically Unable to Perform": "PUP",
      "PUP-R": "PUP",
      "PUP-P": "PUP",
    }[value] || ""
  );
}
export async function installGamePlan(
  app: Express,
  db: Pool,
  enrich: (s: SnapshotData) => Promise<SnapshotData>,
) {
  await db.query(`CREATE TABLE IF NOT EXISTS gameplan_state(scope text PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL);
    CREATE TABLE IF NOT EXISTS gameplan_forecasts(scope text NOT NULL, season int NOT NULL, week int NOT NULL, player_id text NOT NULL, mode text NOT NULL, method text NOT NULL, data jsonb NOT NULL, PRIMARY KEY(scope,season,week,player_id,mode,method));`);
  let cached: { scope: string; data: any } | null = null,
    running = false;
  async function get(s: SnapshotData) {
    const scope = scopeOf(s);
    if (cached?.scope !== scope) {
      const row = (
        await db.query("SELECT data FROM gameplan_state WHERE scope=$1", [
          scope,
        ])
      ).rows[0];
      cached = { scope, data: row?.data || null };
    }
    if (!cached.data) return null;
    const {
      observed: _observed,
      backfilled: _backfilled,
      ...publicData
    } = cached.data;
    return {
      ...publicData,
      report: publicData.report
        ? {
            ...publicData.report,
            rowCount: publicData.report.rows.length,
            rows: publicData.report.rows.slice(-500),
          }
        : null,
      stale: Date.now() - Date.parse(publicData.generatedAt) > 10 * 60_000,
    };
  }
  async function availability(s: SnapshotData) {
    const now = Date.now(),
      near = s.players.some(
        (p) =>
          p.kickoffAt &&
          Date.parse(p.kickoffAt) - now < 90 * 60_000 &&
          Date.parse(p.kickoffAt) > now,
      );
    const ttl = near ? 5 * 60_000 : 30 * 60_000;
    const teams = [...new Set(s.players.map((p) => teamCode(p.team)))];
    const result: Record<string, any> = {},
      sources: any[] = [];
    let index = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (index < teams.length) {
          const team = teams[index++],
            url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.toLowerCase()}/roster`;
          let row = (
            await db.query(
              "SELECT data,updated_at FROM research_cache WHERE url=$1",
              [url],
            )
          ).rows[0];
          let failed = false;
          if (!row || now - Date.parse(row.updated_at) >= ttl) {
            try {
              const r = await fetch(url, {
                signal: AbortSignal.timeout(10000),
              });
              if (!r.ok) throw Error("Source unavailable");
              const data = await r.json();
              if (!Array.isArray(data.athletes) || !data.athletes.length)
                throw Error("Roster missing");
              await db.query(
                "INSERT INTO research_cache VALUES($1,now(),$2) ON CONFLICT(url) DO UPDATE SET updated_at=now(),data=$2",
                [url, JSON.stringify(data)],
              );
              row = { data, updated_at: new Date().toISOString() };
            } catch {
              failed = true;
            }
          }
          sources.push({
            team,
            checkedAt: row?.updated_at || null,
            stale:
              failed || !row || now - Date.parse(row.updated_at) > ttl + 60_000,
          });
          for (const p of [...s.players, ...s.available].filter(
            (p) => teamCode(p.team) === team,
          )) {
            const matches = (row?.data.athletes || [])
              .flatMap((g: any) => g.items || [])
              .filter(
                (a: any) =>
                  keyName(a.fullName || a.displayName || "") ===
                    keyName(p.name) &&
                  [p.position, p.position === "K" ? "PK" : p.position].includes(
                    a.position?.abbreviation,
                  ),
              );
            if (matches.length !== 1) continue;
            const injuries = (matches[0].injuries || []).filter((i: any) =>
              injuryCode(i.status),
            );
            injuries.sort(
              (a: any, b: any) =>
                Number(
                  ["O", "IR", "SUSP", "PUP"].includes(injuryCode(b.status)),
                ) -
                Number(
                  ["O", "IR", "SUSP", "PUP"].includes(injuryCode(a.status)),
                ),
            );
            result[p.id] = {
              status: injuryCode(injuries[0]?.status || ""),
              reportedAt: injuries[0]?.date || null,
              checkedAt: row.updated_at,
              stale: failed || now - Date.parse(row.updated_at) > 30 * 60_000,
              source: `https://www.espn.com/nfl/team/injuries/_/name/${team.toLowerCase()}`,
            };
          }
        }
      }),
    );
    return { players: result, sources, intervalMinutes: ttl / 60_000 };
  }
  async function tick() {
    if (running) return;
    running = true;
    let connection: PoolClient | undefined;
    let acquired = false;
    try {
      connection = await db.connect();
      acquired = (
        await connection.query("SELECT pg_try_advisory_lock(587231) AS ok")
      ).rows[0].ok;
      if (!acquired) return;
      const raw: SnapshotData | undefined = (
        await db.query(
          "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
        )
      ).rows[0]?.data;
      if (!raw) return;
      const scope = scopeOf(raw);
      await get(raw);
      const prior = cached?.scope === scope ? cached.data : null;
      if (
        prior &&
        prior.snapshotAt === raw.capturedAt &&
        Date.now() - Date.parse(prior.generatedAt) < 60_000
      )
        return;
      const s = await enrich(raw);
      const live = await availability(s);
      for (const p of [...s.players, ...s.available])
        p.gameDay = live.players[p.id];
      const games = (
        await db.query(
          "SELECT data,updated_at FROM research_cache WHERE url=$1",
          [scheduleUrl],
        )
      ).rows[0];
      const schedule = scheduleFromRows(games?.data || [], s);
      const historical: SnapshotData[] = (
        await db.query(
          "SELECT data - 'sections' AS data FROM snapshots WHERE data->>'season'=$1 AND data->'league'->>'id'=$2 AND data->'team'->>'id'=$3 ORDER BY captured_at DESC LIMIT 2000",
          [String(s.season), s.league.id, s.team.id],
        )
      ).rows
        .map((r) => r.data)
        .reverse();
      // Backfill only original timestamped Yahoo forecasts. Never reconstruct old combined forecasts with today's inputs.
      const backfill = prior?.backfilled
        ? []
        : historical.flatMap((h) =>
            captureForecasts(h, Date.parse(h.receivedAt || h.capturedAt), [
              "yahoo",
            ]),
          );
      const captured = [...backfill, ...captureForecasts(s)];
      if (captured.length)
        await db.query(
          `INSERT INTO gameplan_forecasts(scope,season,week,player_id,mode,method,data)
        SELECT $1,(f->>'season')::int,(f->>'week')::int,f->>'id',f->>'mode',f->>'method',f FROM jsonb_array_elements($2::jsonb) f
        ON CONFLICT(scope,season,week,player_id,mode,method) DO NOTHING`,
          [
            scope,
            JSON.stringify([
              ...new Map(
                captured
                  .reverse()
                  .map((f) => [
                    `${f.season}:${f.week}:${f.id}:${f.mode}:${f.method}`,
                    f,
                  ]),
              ).values(),
            ]),
          ],
        );
      const forecasts: SavedForecast[] = (
        await db.query(
          "SELECT data FROM gameplan_forecasts WHERE scope=$1 ORDER BY data->>'capturedAt',week,player_id,mode",
          [scope],
        )
      ).rows.map((r) => r.data);
      const now = new Date().toISOString();
      const changes: PlanChange[] = [
        ...changedSince(prior?.week === s.week ? prior.observed : null, s, now),
        ...(prior?.changes || []),
      ]
        .filter((c) => Date.now() - Date.parse(c.at) < 14 * 86400000)
        .slice(0, 250);
      const currentIds = new Set(
        [...s.players, ...s.available].map((p) => p.id),
      );
      const historyPlayers = [
        ...new Map(
          historical.flatMap((h) => h.players).map((p) => [p.id, p]),
        ).values(),
      ].filter((p) => !currentIds.has(p.id));
      if (historyPlayers.length) {
        const archivedResearch = (
          await db.query(
            "SELECT DISTINCT ON (p->>'id') p AS player FROM intelligence i CROSS JOIN LATERAL jsonb_array_elements(i.data->'players') p WHERE p->>'id'=ANY($1::text[]) AND i.data->>'season'=$2 ORDER BY p->>'id',i.snapshot_id DESC",
            [historyPlayers.map((p) => p.id), String(s.season)],
          )
        ).rows;
        for (const p of historyPlayers) {
          const record = archivedResearch.find(
            (r) => r.player.id === p.id && r.player.team === p.team,
          )?.player;
          if (record?.profile) p.profile = { ...record.profile, stale: true };
          p.research = {
            historicalRoster: true,
            asOf: historical
              .filter((h) => h.players.some((x) => x.id === p.id))
              .at(-1)?.capturedAt,
          };
        }
      }
      const next = {
        version: 1,
        generatedAt: now,
        snapshotAt: s.capturedAt,
        season: s.season,
        week: s.week,
        scope,
        monitoringSince: prior?.monitoringSince || now,
        backfilled: true,
        observed: observation(s),
        availability: live.players,
        sources: live.sources,
        intervalMinutes: live.intervalMinutes,
        alerts: kickoffAlerts(s),
        changes,
        schedule,
        scheduleAt: games?.updated_at || null,
        scheduleSource: "https://github.com/nflverse/nflverse-data",
        scheduleStale:
          !games || Date.now() - Date.parse(games.updated_at) > 48 * 3600000,
        report: performanceReport(forecasts, historical),
        recaps: weeklyRecaps(historical, forecasts),
        historyPlayers,
        error: null,
      };
      await db.query(
        "INSERT INTO gameplan_state(scope,data) VALUES($1,$2) ON CONFLICT(scope) DO UPDATE SET updated_at=now(),data=$2",
        [scope, JSON.stringify(next)],
      );
      cached = { scope, data: next };
    } catch (error) {
      console.error(
        "Game plan refresh failed",
        (error as any)?.code || "source-or-calculation",
      );
      if (cached?.data)
        cached.data = {
          ...cached.data,
          error: "A refresh failed. Last successful checks remain visible.",
        };
    } finally {
      if (acquired && connection)
        await connection
          .query("SELECT pg_advisory_unlock(587231)")
          .catch(() => {});
      connection?.release();
      running = false;
    }
  }
  app.get("/api/gameplan", async (_q, r) => {
    const s = (
      await db.query(
        "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
      )
    ).rows[0]?.data;
    r.json(s ? await get(s) : null);
  });
  setTimeout(() => void tick(), 1200).unref();
  setInterval(() => void tick(), 60_000).unref();
  return { get, tick };
}
