import { waiverNews, matchingNews } from "./waiverNews.ts";
import { teamBriefFacts } from "../shared/teamBrief.ts";
import { parse } from "csv-parse/sync";
import type { Pool } from "pg";
import type { SnapshotData } from "../shared/model.ts";
import { forecastPlayer } from "../shared/playerForecast.ts";
import { depthCharts } from "./depth.ts";
import { advice } from "../shared/advice.ts";
const root = "https://github.com/nflverse/nflverse-data/releases/download/";
export async function research(db: Pool, s: SnapshotData, news: any[]) {
  const newsResearch = await waiverNews(
    db,
    s.available
      .filter(
        (p) =>
          !p.locked &&
          p.bye !== s.week &&
          !["O", "IR", "PUP", "SUSP"].includes(p.status),
      )
      .sort((a, b) => (b.projected ?? -Infinity) - (a.projected ?? -Infinity))
      .slice(0, 12)
      .map((p) => p.name),
  );
  const sources: any[] = [];
  async function csv(path: string) {
    const url = root + path;
    const old = (
      await db.query(
        "SELECT data,updated_at FROM research_cache WHERE url=$1",
        [url],
      )
    ).rows[0];
    if (old && Date.now() - Date.parse(old.updated_at) < 86400000) {
      sources.push({ url, updatedAt: old.updated_at, status: "cached" });
      return old.data;
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw Error();
      const text = await r.text();
      if (text.length > 20000000) throw Error();
      const rows = parse(text, { columns: true, skip_empty_lines: true });
      await db.query(
        "INSERT INTO research_cache VALUES($1,now(),$2) ON CONFLICT(url) DO UPDATE SET updated_at=now(),data=$2",
        [url, JSON.stringify(rows)],
      );
      sources.push({ url, updatedAt: new Date().toISOString(), status: "ok" });
      return rows;
    } catch {
      sources.push({
        url,
        updatedAt: old?.updated_at || null,
        status: old ? "stale" : "unavailable",
      });
      return old?.data || [];
    }
  }
  const stats: any[] = [],
    snaps: any[] = [];
  for (const year of [s.season - 1, s.season]) {
    stats.push(...(await csv(`stats_player/stats_player_week_${year}.csv`)));
    snaps.push(...(await csv(`snap_counts/snap_counts_${year}.csv`)));
  }
  const games = await csv("schedules/games.csv");
  let depth: any = null;
  try {
    depth = await depthCharts();
  } catch {}
  const aliases: Record<string, string> = { JAC: "JAX", WAS: "WSH", LA: "LAR" };
  const players = [
    ...new Map([...s.available, ...s.players].map((p) => [p.id, p])).values(),
  ].map((p) => {
    const t = p.team.toUpperCase();
    const game = games.find(
      (g: any) =>
        Number(g.season) === s.season &&
        Number(g.week) === s.week &&
        g.game_type === "REG" &&
        [g.home_team, g.away_team].some(
          (x: string) => (aliases[x] || x) === (aliases[t] || t),
        ),
    );
    const opponent = game
      ? (aliases[game.home_team] || game.home_team) === (aliases[t] || t)
        ? game.away_team
        : game.home_team
      : null;
    const result = forecastPlayer(p, s, stats, snaps, opponent);
    const key = p.name
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
    const rank = depth?.teams?.[aliases[t] || t]?.ranks?.[key];
    return {
      ...result,
      nflRole:
        p.position === "DEF"
          ? "Team defense"
          : rank === 1
            ? "Starter"
            : rank > 1
              ? "Backup"
              : "Unknown",
      headlines: matchingNews(p.name, newsResearch.articles),
    };
  });
  const map = new Map(players.map((p) => [p.id, p.projection]));
  const lineup = advice({
    ...s,
    players: s.players.map((p) => ({
      ...p,
      projected: map.get(p.id) ?? p.projected,
    })),
  });
  const recommendations = players
    .filter(
      (p) =>
        !p.locked &&
        p.bye !== s.week &&
        !["O", "IR", "PUP", "SUSP"].includes(p.injury),
    )
    .sort((a, b) => (b.projection ?? -Infinity) - (a.projection ?? -Infinity));
  const shortlist = [
    ...players
      .filter((p) => !!p.slot && (!!p.injury || p.bye === s.week))
      .slice(0, 4),
    ...recommendations.filter((p) => !!p.slot).slice(0, 8),
    ...recommendations.filter((p) => !p.slot).slice(0, 8),
  ];
  return {
    version: 4,
    newsSources: newsResearch.sources,
    waiverCandidates: recommendations
      .filter((p) => !p.slot && /^(FA|W)/.test(p.available))
      .filter((p, i) => i < 12 || p.headlines.length > 0)
      .slice(0, 20)
      .map((p) => p.id),
    teamFacts: teamBriefFacts(s, lineup),
    snapshotAt: s.capturedAt,
    generatedAt: new Date().toISOString(),
    season: s.season,
    week: s.week,
    players,
    lineup,
    shortlist: shortlist.map((p) => p.id),
    sources,
    method:
      "Experimental statistical baseline; Qwen explains supplied evidence. No guarantee of wins. Prior-season history is context only.",
  };
}
