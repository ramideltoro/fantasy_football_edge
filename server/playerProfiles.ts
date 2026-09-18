import type { Pool } from "pg";
import type { SnapshotData } from "../shared/model.ts";
import { nameKey } from "./depth.ts";
const aliases: Record<string, string> = { JAC: "JAX", WAS: "WSH", LA: "LAR" };
export const teamKey = (s: string) =>
  aliases[s.toUpperCase()] || s.toUpperCase();
export function seasonStarts(data: any) {
  const stats = (data.splits?.categories || []).flatMap(
    (c: any) => c.stats || [],
  );
  const get = (key: string) => {
    const value = stats.find((x: any) => x.name === key)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const games = get("gamesPlayed"),
    starts = get("gamesStarted");
  return {
    games,
    starts,
    percent:
      games !== null && games > 0 && starts !== null && starts <= games
        ? Math.round((100 * starts) / games)
        : null,
  };
}
export async function playerProfiles(db: Pool, s: SnapshotData) {
  async function cached(url: string, ttl: number) {
    const old = (
      await db.query(
        "SELECT data,updated_at FROM research_cache WHERE url=$1",
        [url],
      )
    ).rows[0];
    if (old && Date.now() - Date.parse(old.updated_at) < ttl)
      return { ...old.data, checkedAt: old.updated_at };
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw Error();
      const data = await r.json();
      await db.query(
        "INSERT INTO research_cache VALUES($1,now(),$2) ON CONFLICT(url) DO UPDATE SET updated_at=now(),data=$2",
        [url, JSON.stringify(data)],
      );
      return { ...data, checkedAt: new Date().toISOString() };
    } catch {
      return old
        ? { ...old.data, checkedAt: old.updated_at, stale: true }
        : null;
    }
  }
  const all = [
    ...new Map([...s.players, ...s.available].map((p) => [p.id, p])).values(),
  ];
  const result: Record<string, any> = {};
  const league = await cached(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams",
    86400000,
  );
  const teams: string[] = (league?.sports?.[0]?.leagues?.[0]?.teams || []).map(
    (t: any) => t.team.abbreviation,
  );
  const seasonRecords: Record<
    string,
    { games: number; starts: number; sources: string[] }
  > = {};
  let allComplete = teams.length === 32;
  let index = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < teams.length) {
        const team = teams[index++];
        const roster = await cached(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.toLowerCase()}/roster`,
          3600000,
        );
        const athletes = (roster?.athletes || []).flatMap(
          (g: any) => g.items || [],
        );
        const schedule = await cached(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.toLowerCase()}/schedule?season=${s.season}&seasontype=2`,
          3600000,
        );
        const completed = (schedule?.events || []).filter(
          (e: any) =>
            e.seasonType?.type === 2 &&
            e.competitions?.[0]?.status?.type?.completed &&
            Date.parse(e.date) < Date.now(),
        );
        const appearances: Record<string, { games: number; starts: number }> =
          {};
        const sources: string[] = [];
        let complete = !!schedule && !schedule.stale;
        for (const event of completed) {
          const teamId = event.competitions[0].competitors.find(
            (c: any) => teamKey(c.team.abbreviation) === team,
          )?.id;
          if (!teamId) {
            complete = false;
            continue;
          }
          const game = await cached(
            `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${event.id}/competitions/${event.id}/competitors/${teamId}/roster`,
            86400000,
          );
          if (!game?.entries?.length || game.stale) {
            complete = false;
            continue;
          }
          sources.push(`https://www.espn.com/nfl/game/_/gameId/${event.id}`);
          const seen = new Set<string>();
          for (const entry of game.entries) {
            if (
              entry.valid !== true ||
              entry.didNotPlay !== false ||
              typeof entry.starter !== "boolean"
            )
              continue;
            if (seen.has(String(entry.playerId))) continue;
            seen.add(String(entry.playerId));
            const count = (appearances[String(entry.playerId)] ||= {
              games: 0,
              starts: 0,
            });
            count.games++;
            count.starts += Number(entry.starter);
          }
        }
        allComplete = allComplete && complete;
        for (const [id, record] of Object.entries(appearances)) {
          const current = (seasonRecords[id] ||= {
            games: 0,
            starts: 0,
            sources: [],
          });
          current.games += record.games;
          current.starts += record.starts;
          current.sources.push(...sources);
        }
        for (const p of all.filter((p) => teamKey(p.team) === team)) {
          if (p.position === "DEF") {
            result[p.id] = {
              photo: `https://a.espncdn.com/i/teamlogos/nfl/500/${team.toLowerCase()}.png`,
              source: `https://www.espn.com/nfl/team/_/name/${team.toLowerCase()}`,
              checkedAt: roster?.checkedAt,
              season: s.season,
            };
            continue;
          }
          const matches = athletes.filter(
            (a: any) =>
              nameKey(a.fullName || a.displayName) === nameKey(p.name) &&
              (a.position?.abbreviation === p.position ||
                (p.position === "K" && a.position?.abbreviation === "PK")),
          );
          if (matches.length !== 1) continue;
          const a = matches[0];
          const record = appearances[a.id];
          result[p.id] = {
            espnId: a.id,
            photo: a.headshot?.href?.startsWith("https://a.espncdn.com/")
              ? a.headshot.href
              : null,
            age: a.age,
            height: a.displayHeight,
            weight: a.displayWeight,
            jersey: a.jersey,
            college: a.college?.name,
            experience: a.experience?.years,
            source: a.links?.find((l: any) => l.rel?.includes("playercard"))
              ?.href,
            injuries: (a.injuries || []).map((i: any) => ({
              status: i.status,
              date: i.date,
              detail: i.details?.detail || i.details?.type || "",
              comment: i.shortComment || "",
            })),
            checkedAt: roster.checkedAt,
            stale: !!roster.stale,
            season: s.season,
            starts:
              record && complete
                ? {
                    ...record,
                    percent: Math.round((record.starts / record.games) * 100),
                    asOf: schedule.checkedAt,
                    source: sources[0],
                    sources,
                    definition:
                      "Official starting-lineup flags from completed ESPN regular-season game rosters; starts / games played for the current NFL team.",
                  }
                : null,
          };
        }
      }
    }),
  );
  for (const p of Object.values(result)) {
    const record = seasonRecords[p.espnId];
    p.starts =
      record && allComplete
        ? {
            ...record,
            percent: Math.round((record.starts / record.games) * 100),
            asOf: new Date().toISOString(),
            source: record.sources[0],
            definition:
              "Official starting-lineup flags from all completed ESPN regular-season game rosters this season; starts divided by games played, including prior NFL teams.",
          }
        : null;
  }
  return result;
}
