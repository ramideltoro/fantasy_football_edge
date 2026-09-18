import type { SnapshotData } from "./model.ts";
import {
  effectiveStatus,
  eligibleNow,
  gameLocked,
  reserveSlots,
  unavailableStatuses,
} from "./availability.ts";
import { fits } from "./advice.ts";
import { lineupProjection } from "./lineupProjections.ts";
export type PlanChange = {
  id: string;
  playerId: string;
  name: string;
  kind: string;
  text: string;
  at: string;
  sourceAt: string;
  source: string;
};
export function observation(s: SnapshotData) {
  return Object.fromEntries(
    [...s.available, ...s.players].map((p) => [
      p.id,
      {
        name: p.name,
        status: effectiveStatus(p),
        role: p.nflRole?.label || "Unconfirmed",
        yahoo: lineupProjection(p, "yahoo").points,
        qwen: lineupProjection(p, "qwen").points,
        bookies: lineupProjection(p, "bookies").points,
        rostered: s.players.some((x) => x.id === p.id),
        availability: p.availability,
      },
    ]),
  );
}
export function changedSince(
  before: ReturnType<typeof observation> | null,
  s: SnapshotData,
  now: string,
): PlanChange[] {
  if (!before) return [];
  const after = observation(s);
  return Object.entries(after).flatMap(([id, p]) => {
    const old = before[id],
      changes: PlanChange[] = [];
    const add = (
      kind: string,
      text: string,
      sourceAt: string,
      source: string,
    ) =>
      changes.push({
        id: `${id}:${kind}:${now}`,
        playerId: id,
        name: p.name,
        kind,
        text,
        at: now,
        sourceAt,
        source,
      });
    const player = [...s.players, ...s.available].find((p) => p.id === id)!;
    if (!old) {
      if (!p.rostered && /^(FA|W)/.test(p.availability) && (p.yahoo ?? 0) >= 8)
        add(
          "waiver",
          "New to the imported waiver pool. Check roster fit before claiming.",
          s.capturedAt,
          "Yahoo",
        );
      return changes;
    }
    if (old.status !== p.status)
      add(
        "health",
        `${old.status || "No injury flag"} → ${p.status || "No injury flag"}. ${gameLocked(player) ? "This game is already locked." : "Review availability before kickoff."}`,
        player.gameDay?.checkedAt || s.capturedAt,
        player.gameDay?.status ? "ESPN / Yahoo" : "Yahoo",
      );
    if (
      old.role !== p.role &&
      !["Unconfirmed", "Checking role"].includes(p.role)
    )
      add(
        "role",
        `${old.role} → ${p.role} on the NFL depth chart.`,
        player.nflRole?.asOf || now,
        "ESPN",
      );
    for (const source of ["yahoo", "qwen", "bookies"] as const) {
      const a = old[source],
        b = p[source];
      if (
        a !== null &&
        b !== null &&
        Math.abs(a - b) >= Math.max(2, Math.abs(a) * 0.2)
      )
        add(
          "projection",
          `${source === "qwen" ? "Qwen" : source === "yahoo" ? "Yahoo" : "Bookies"}: ${a.toFixed(2)} → ${b.toFixed(2)} ${source === "bookies" && player.sportsbook?.partial ? "partial prop points" : "points"}. Open the player for the current calculation.`,
          source === "qwen"
            ? player.aiProjection.generatedAt
            : source === "bookies"
              ? player.sportsbook?.fetchedAt || now
              : s.capturedAt,
          source,
        );
    }
    if (!old.rostered && p.rostered)
      add(
        "roster",
        "Added to your roster. Let’s see what he brings.",
        s.capturedAt,
        "Yahoo",
      );
    return changes;
  });
}
export function kickoffAlerts(s: SnapshotData, now = Date.now()) {
  return s.players
    .filter((p) => !reserveSlots.has(p.slot) && !gameLocked(p, now))
    .flatMap((p) => {
      const status = effectiveStatus(p, now),
        out = unavailableStatuses.has(status) || p.bye === s.week;
      const risky = ["Q", "D"].includes(status);
      if (!out && !risky) return [];
      const replacements = s.players
        .filter(
          (x) =>
            reserveSlots.has(x.slot) &&
            eligibleNow(x, s.week, now) &&
            !["Q", "D"].includes(effectiveStatus(x, now)) &&
            fits(x, p.slot),
        )
        .sort(
          (a, b) =>
            (lineupProjection(b, "combined").points ?? -Infinity) -
            (lineupProjection(a, "combined").points ?? -Infinity),
        )
        .slice(0, 3)
        .map((x) => ({
          id: x.id,
          name: x.name,
          kickoffAt: x.kickoffAt,
          points: lineupProjection(x, "combined").points,
        }));
      return [
        {
          id: `${s.season}:${s.week}:${p.id}:${status}:${p.bye === s.week}`,
          playerId: p.id,
          name: p.name,
          level: out ? "urgent" : "watch",
          title: out
            ? p.bye === s.week
              ? "He’s on a bye, bro."
              : "Bro, he’s OUT."
            : "Keep a backup warmed up.",
          status,
          kickoffAt: p.kickoffAt,
          replacements,
          sourceAt: p.gameDay?.status ? p.gameDay.checkedAt : s.capturedAt,
          source: p.gameDay?.status ? "ESPN / Yahoo" : "Yahoo",
          sourceUrl: p.gameDay?.source || null,
        },
      ];
    });
}
