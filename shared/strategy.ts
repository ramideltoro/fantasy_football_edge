import { advice, fits } from "./advice.ts";
import {
  effectiveStatus,
  eligibleNow,
  gameLocked,
  reserveSlots,
} from "./availability.ts";
import {
  lineupAdvice,
  lineupProjection,
  type ProjectionMode,
} from "./lineupProjections.ts";
import type { PlayerData, SnapshotData } from "./model.ts";
export type RiskMode = "balanced" | "protect" | "chase";
export type TeamGame = {
  week: number;
  team: string;
  opponent: string | null;
  kickoffAt: string | null;
  bye: boolean;
  unknown: boolean;
  difficulty?: string;
  samples?: number;
};
export type Schedule = Record<string, TeamGame[]>;
export const teamCode = (team: string) =>
  ({ JAC: "JAX", WAS: "WSH", LA: "LAR" })[team.toUpperCase()] ||
  team.toUpperCase();
export const round = (n: number) => Math.round(n * 100) / 100;
const quantile = (sorted: number[], q: number) => {
  const i = (sorted.length - 1) * q,
    lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
};
export function scoringRange(
  p: PlayerData,
  season: number,
  week: number,
  center: number | null,
) {
  const rows: Array<{ season: number; week: number; points: number }> =
    p.research?.scoringHistory || p.aiProjection?.calculation?.history || [];
  const samples = rows
    .filter(
      (r) =>
        Number.isFinite(r.points) &&
        (r.season < season || (r.season === season && r.week < week)),
    )
    .sort((a, b) => b.season - a.season || b.week - a.week)
    .slice(0, 8);
  const values = samples.map((r) => r.points).sort((a, b) => a - b);
  if (values.length < 5 || center === null)
    return {
      samples: values.length,
      low: null,
      high: null,
      priorSeason: samples.some((r) => r.season < season),
    };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    samples: values.length,
    low: round(center + quantile(values, 0.25) - mean),
    high: round(center + quantile(values, 0.75) - mean),
    priorSeason: samples.some((r) => r.season < season),
  };
}
export function strategyLineup(
  s: SnapshotData,
  mode: ProjectionMode,
  risk: RiskMode,
  constraints: { pinned?: string[]; excluded?: string[] } = {},
) {
  const base = lineupAdvice(s, mode, constraints);
  const ranges = Object.fromEntries(
    s.players.map((p) => [
      p.id,
      scoringRange(p, s.season, s.week, base.projections[p.id].points),
    ]),
  );
  if (risk === "balanced" || mode === "bookies")
    return {
      ...base,
      ranges,
      strategyDelta: base.delta,
      risk: "balanced" as RiskMode,
    };
  const ranked = advice(
    {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        projected:
          (risk === "protect" ? ranges[p.id].low : ranges[p.id].high) ??
          base.projections[p.id].points,
      })),
    },
    constraints,
  );
  const current = s.players.filter(
    (p) => !reserveSlots.has(p.slot) && !gameLocked(p),
  );
  const chosen = ranked.lineup.filter((x) => !x.locked);
  const complete =
    ranked.complete &&
    current.every((p) => base.projections[p.id].points !== null) &&
    chosen.every((p) => base.projections[p.playerId].points !== null);
  const delta = complete
    ? round(
        chosen.reduce((n, p) => n + base.projections[p.playerId].points!, 0) -
          current.reduce((n, p) => n + base.projections[p.id].points!, 0),
      )
    : null;
  return {
    ...ranked,
    projections: base.projections,
    method: base.method,
    ranges,
    delta,
    strategyDelta: ranked.delta,
    risk,
  };
}
export function flexPlan(
  s: Pick<SnapshotData, "players" | "week">,
  now = Date.now(),
) {
  const starters = s.players.filter((p) => !reserveSlots.has(p.slot));
  const assignments = starters.map((p) => ({ slot: p.slot, playerId: p.id }));
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const flex = new Set(["W/R/T", "W/R", "Q/W/R/T"]);
  for (let pass = 0; pass < assignments.length; pass++) {
    let moved = false;
    for (const a of assignments.filter((a) => flex.has(a.slot))) {
      const early = byId.get(a.playerId)!;
      if (!eligibleNow(early, s.week, now) || !early.kickoffAt) continue;
      const b = assignments
        .filter((b) => !flex.has(b.slot))
        .filter((b) => {
          const late = byId.get(b.playerId)!;
          return (
            eligibleNow(late, s.week, now) &&
            !!late.kickoffAt &&
            Date.parse(late.kickoffAt) > Date.parse(early.kickoffAt!) &&
            fits(late, a.slot) &&
            fits(early, b.slot)
          );
        })
        .sort(
          (x, y) =>
            Date.parse(byId.get(y.playerId)!.kickoffAt!) -
            Date.parse(byId.get(x.playerId)!.kickoffAt!),
        )[0];
      if (b) {
        const id = a.playerId;
        a.playerId = b.playerId;
        b.playerId = id;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const changes = assignments
    .filter((a, i) => a.playerId !== starters[i].id)
    .map((a) => ({
      ...a,
      from: byId.get(a.playerId)!.slot,
      kickoffAt: byId.get(a.playerId)!.kickoffAt,
    }));
  const contingencies = starters
    .filter(
      (p) =>
        eligibleNow(p, s.week, now) &&
        (["Q", "D"].includes(effectiveStatus(p, now)) ||
          (p.aiProjection?.playProbability != null &&
            p.aiProjection.playProbability < 85)),
    )
    .map((p) => {
      const options = s.players
        .filter(
          (x) =>
            reserveSlots.has(x.slot) &&
            eligibleNow(x, s.week, now) &&
            fits(x, p.slot) &&
            x.kickoffAt &&
            !["Q", "D"].includes(effectiveStatus(x, now)),
        )
        .sort(
          (a, b) =>
            (lineupProjection(b, "combined").points ?? -Infinity) -
            (lineupProjection(a, "combined").points ?? -Infinity),
        );
      return {
        playerId: p.id,
        kickoffAt: p.kickoffAt,
        status: effectiveStatus(p, now),
        late: options
          .filter(
            (x) =>
              p.kickoffAt &&
              Date.parse(x.kickoffAt!) >= Date.parse(p.kickoffAt),
          )
          .slice(0, 3)
          .map((x) => ({ id: x.id, kickoffAt: x.kickoffAt })),
        early: options
          .filter(
            (x) =>
              !p.kickoffAt ||
              Date.parse(x.kickoffAt!) < Date.parse(p.kickoffAt),
          )
          .slice(0, 2)
          .map((x) => ({ id: x.id, kickoffAt: x.kickoffAt })),
      };
    });
  return { changes, contingencies };
}
export function planningPlayer(
  p: PlayerData,
  s: SnapshotData,
  week: number,
  schedule: Schedule,
) {
  const game = schedule[teamCode(p.team)]?.find((g) => g.week === week);
  const current = week === s.week;
  const baseline =
    p.research?.baselinePoints ?? p.aiProjection?.calculation?.points;
  const estimate = current
    ? lineupProjection(p, "combined").points
    : typeof baseline === "number" && Number.isFinite(baseline)
      ? baseline
      : null;
  const bye = p.bye === week || !!game?.bye;
  return {
    ...p,
    slot: p.slot,
    projected: bye || (!current && (!game || game.unknown)) ? null : estimate,
    bye: bye ? week : null,
    locked: current && gameLocked(p),
    completed: current && p.completed,
    kickoffAt: current ? p.kickoffAt : game?.kickoffAt || null,
    status: effectiveStatus(p),
    gameDay: current ? p.gameDay : undefined,
    game,
    estimate,
    projectionKind: current
      ? "Combined forecast"
      : "Historical planning baseline",
  };
}
export function weeklyPlan(s: SnapshotData, week: number, schedule: Schedule) {
  const players = s.players.map((p) => planningPlayer(p, s, week, schedule));
  const locked = players.filter(
    (p) => !reserveSlots.has(p.slot) && gameLocked(p),
  );
  const open = players.filter(
    (p) => !reserveSlots.has(p.slot) && !gameLocked(p),
  );
  const pool = players.filter(
    (p) => eligibleNow(p, week) && p.projected !== null,
  );
  // Match players to a bitmask of slots (at most the league's starting lineup),
  // so missing coverage stays fast without adding a factorial set of dummy players.
  type Match = { points: number; moves: number; picks: number[] };
  const states = new Map<number, Match>([
    [0, { points: 0, moves: 0, picks: Array(open.length).fill(-1) }],
  ]);
  for (let pi = 0; pi < pool.length; pi++) {
    for (const [mask, state] of [...states.entries()]) {
      for (let si = 0; si < open.length; si++) {
        if (mask & (1 << si) || !fits(pool[pi], open[si].slot)) continue;
        const nextMask = mask | (1 << si),
          points = state.points + pool[pi].projected!,
          moves = state.moves + Number(pool[pi].id !== open[si].id),
          existing = states.get(nextMask);
        if (
          !existing ||
          points > existing.points + 1e-9 ||
          (Math.abs(points - existing.points) <= 1e-9 && moves < existing.moves)
        ) {
          const picks = [...state.picks];
          picks[si] = pi;
          states.set(nextMask, { points, moves, picks });
        }
      }
    }
  }
  const filled = (m: Match) => m.picks.filter((p) => p >= 0).length;
  const best = [...states.values()].sort(
    (a, b) => filled(b) - filled(a) || b.points - a.points || a.moves - b.moves,
  )[0];
  const gaps = open.filter((_, i) => best.picks[i] < 0).map((p) => p.slot);
  const chosen = [
    ...locked.map((p) => ({ playerId: p.id, slot: p.slot, locked: true })),
    ...best.picks.flatMap((pi, si) =>
      pi < 0
        ? []
        : [{ playerId: pool[pi].id, slot: open[si].slot, locked: false }],
    ),
  ];
  const missingLocked = chosen.some(
    (x) =>
      x.locked &&
      !Number.isFinite(players.find((p) => p.id === x.playerId)?.actual),
  );
  const total = chosen.reduce((sum, x) => {
    const p = players.find((p) => p.id === x.playerId)!;
    return sum + (x.locked ? (p.actual ?? 0) : (p.projected ?? 0));
  }, 0);
  const comparable = !gaps.length && !missingLocked;
  const pickups = [...new Set(gaps)].map((slot) => ({
    slot,
    candidates: s.available
      .filter(
        (p) =>
          /^(FA|W)/.test(p.availability) &&
          !s.players.some((r) => r.id === p.id) &&
          fits(p, slot),
      )
      .map((p) => planningPlayer(p, s, week, schedule))
      .filter((p) => eligibleNow(p, week) && p.projected !== null)
      .sort((a, b) => b.projected! - a.projected!)
      .slice(0, 3)
      .map((p) => ({ id: p.id, points: p.projected })),
  }));
  return {
    week,
    total: comparable ? round(total) : null,
    knownTotal: round(total),
    complete: comparable,
    gaps,
    lineup: chosen,
    pickups,
    byes: players.filter((p) => p.bye === week).map((p) => p.id),
    uncertain: players
      .filter(
        (p) =>
          !!p.status || (p.projected === null && !p.locked && p.bye !== week),
      )
      .map((p) => p.id),
  };
}
export function waiverImpact(
  s: SnapshotData,
  outId: string,
  inId: string,
  schedule: Schedule,
) {
  const out = s.players.find((p) => p.id === outId),
    incoming = s.available.find((p) => p.id === inId);
  if (
    !out ||
    !incoming ||
    !/^(FA|W)/.test(incoming.availability) ||
    s.players.some((p) => p.id === inId)
  )
    return null;
  const after: SnapshotData = {
    ...s,
    players: s.players.map((p) =>
      p.id === outId
        ? {
            ...incoming,
            slot: ["IR", "IR+", "NA"].includes(out.slot) ? "BN" : out.slot,
          }
        : p,
    ),
  };
  const weeks = [s.week, s.week + 1, s.week + 2]
    .filter((w) => w <= 18)
    .map((week) => {
      const before = weeklyPlan(s, week, schedule),
        next = weeklyPlan(after, week, schedule);
      const locked =
        week === s.week && (gameLocked(out) || gameLocked(incoming));
      return {
        week,
        before,
        after: next,
        locked,
        delta:
          !locked && before.total !== null && next.total !== null
            ? round(next.total - before.total)
            : null,
      };
    });
  const depth = ["QB", "RB", "WR", "TE", "K", "DEF"]
    .map((position) => ({
      position,
      before: s.players.filter((p) => fits(p, position)).length,
      after: after.players.filter((p) => fits(p, position)).length,
    }))
    .filter((x) => x.before !== x.after);
  return {
    outId,
    inId,
    weeks,
    depth,
    total: weeks.every((w) => w.delta !== null)
      ? round(weeks.reduce((n, w) => n + w.delta!, 0))
      : null,
    droppedPoints: lineupProjection(out, "combined").points,
    incomingPoints: lineupProjection(incoming, "combined").points,
  };
}
