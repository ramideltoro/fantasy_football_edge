import type { PlayerData } from "./model.ts";
export const waiverPositions = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
export function waiverForecast(p: PlayerData, week?: number) {
  const matchup = p.research?.defenseForecast;
  if (
    p.position === "DEF" &&
    matchup?.points != null &&
    (week == null || matchup.week === week)
  )
    return { points: matchup.points as number, source: "DEF matchup model" };
  const q = p.aiProjection;
  if (
    q &&
    !q.stale &&
    q.points != null &&
    q.team === p.team &&
    (q.injury === undefined || q.injury === p.status)
  )
    return { points: q.points as number, source: "Qwen" };
  return {
    points:
      p.providerProjected !== undefined ? p.providerProjected : p.projected,
    source: "Yahoo",
  };
}
export function positionShortlist(
  players: PlayerData[],
  position: string,
  week?: number,
  now = Date.now(),
  limit = 3,
) {
  return players
    .filter(
      (p) =>
        p.position === position &&
        /^(FA|W)/.test(p.availability) &&
        !p.locked &&
        !p.completed &&
        (!p.kickoffAt || Date.parse(p.kickoffAt) > now) &&
        (week == null || p.bye !== week) &&
        !["O", "IR", "PUP", "SUSP"].includes(p.status),
    )
    .sort(
      (a, b) =>
        (position === "DEF"
          ? Number(waiverForecast(b, week).source === "DEF matchup model") -
            Number(waiverForecast(a, week).source === "DEF matchup model")
          : 0) ||
        (waiverForecast(b, week).points ?? -Infinity) -
          (waiverForecast(a, week).points ?? -Infinity) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
export function waiverShortlist(
  players: PlayerData[],
  perPosition = 3,
  week?: number,
) {
  return waiverPositions.flatMap((position) =>
    positionShortlist(players, position, week, Date.now(), perPosition),
  );
}
