import type { PlayerData, SnapshotData } from "./model.ts";
import { lineupProjection, type ProjectionMode } from "./lineupProjections.ts";
import { gameLocked, reserveSlots } from "./availability.ts";
import { fits } from "./advice.ts";
import { round } from "./strategy.ts";
export type SavedForecast = {
  id: string;
  name: string;
  position: string;
  season: number;
  week: number;
  mode: ProjectionMode;
  method: string;
  points: number;
  capturedAt: string;
  kickoffAt: string;
  partial: boolean;
  components: Array<{ market: string; multiplier: number }>;
  inRoster: boolean;
};
export const forecastKey = (p: Pick<SavedForecast, "season" | "week" | "id">) =>
  `${p.season}:${p.week}:${p.id}`;
export function captureForecasts(
  s: SnapshotData,
  now = Date.now(),
  modes: ProjectionMode[] = ["yahoo", "qwen", "bookies", "combined"],
): SavedForecast[] {
  if (
    now - Date.parse(s.capturedAt) > 2 * 3600000 ||
    Date.parse(s.receivedAt || s.capturedAt) > now
  )
    return [];
  return [
    ...new Map([...s.available, ...s.players].map((p) => [p.id, p])).values(),
  ].flatMap((p) => {
    if (
      !p.kickoffAt ||
      gameLocked(p, now) ||
      Date.parse(s.receivedAt || s.capturedAt) >= Date.parse(p.kickoffAt) ||
      p.bye === s.week
    )
      return [];
    return modes.flatMap((mode) => {
      const v = lineupProjection(p, mode);
      if (v.points === null) return [];
      return [
        {
          id: p.id,
          name: p.name,
          position: p.position,
          season: s.season,
          week: s.week,
          mode,
          method: mode === "qwen" ? "qwen-points-v5" : `${mode}-v1`,
          points: v.points,
          capturedAt: new Date(now).toISOString(),
          kickoffAt: p.kickoffAt!,
          partial: mode === "bookies" && !!p.sportsbook?.partial,
          components:
            mode === "bookies"
              ? p.sportsbook?.components.map((c) => ({
                  market: c.market,
                  multiplier: c.multiplier,
                })) || []
              : [],
          inRoster: s.players.some((x) => x.id === p.id),
        },
      ];
    });
  });
}
function bookActual(f: SavedForecast, p: PlayerData) {
  const rules: Record<string, string[]> = {
    "passing-yards": ["Passing Yards"],
    "rushing-yards": ["Rushing Yards"],
    "receiving-yards": ["Receiving Yards"],
    touchdowns: ["Rushing Touchdowns", "Receiving Touchdowns"],
  };
  if (!f.components.length) return null;
  let total = 0;
  for (const c of f.components) {
    const keys = rules[c.market];
    if (
      !keys ||
      !keys.every(
        (k) => typeof p.stats[k] === "number" && Number.isFinite(p.stats[k]),
      )
    )
      return null;
    total += keys.reduce((n, k) => n + p.stats[k]!, 0) * c.multiplier;
  }
  return round(total);
}
export function performanceReport(
  forecasts: SavedForecast[],
  history: SnapshotData[],
) {
  const outcomes = new Map<string, PlayerData>();
  for (const s of [...history].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  ))
    for (const p of [...s.available, ...s.players])
      if (
        p.completed &&
        typeof p.actual === "number" &&
        Number.isFinite(p.actual)
      )
        outcomes.set(forecastKey({ ...p, season: s.season, week: s.week }), p);
  const rows = forecasts.flatMap((f) => {
    const p = outcomes.get(forecastKey(f));
    if (!p || Date.parse(f.capturedAt) >= Date.parse(f.kickoffAt)) return [];
    const actual = f.partial ? bookActual(f, p) : p.actual;
    if (actual === null) return [];
    return [
      {
        ...f,
        actual,
        error: round(f.points - actual),
        absoluteError: round(Math.abs(f.points - actual)),
      },
    ];
  });
  const modes: ProjectionMode[] = ["yahoo", "qwen", "combined", "bookies"];
  const common = new Set(
    rows
      .filter((r) => r.mode === "yahoo")
      .map(forecastKey)
      .filter((key) =>
        ["qwen", "combined"].every((mode) =>
          rows.some((r) => r.mode === mode && forecastKey(r) === key),
        ),
      ),
  );
  const summary = modes.flatMap((mode) =>
    ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"].map((position) => {
      const sample = rows.filter(
        (r) =>
          r.mode === mode && (position === "ALL" || r.position === position),
      );
      const paired = sample.filter(
        (r) => !r.partial && common.has(forecastKey(r)),
      );
      const mean = (xs: typeof rows, key: "error" | "absoluteError") =>
        xs.length
          ? round(xs.reduce((n, p) => n + p[key], 0) / xs.length)
          : null;
      return {
        mode,
        position,
        samples: sample.length,
        mae: mean(sample, "absoluteError"),
        bias: mean(sample, "error"),
        commonSamples: paired.length,
        commonMae: mean(paired, "absoluteError"),
        partialSamples: sample.filter((r) => r.partial).length,
      };
    }),
  );
  return {
    rows,
    summary,
    commonSamples: common.size,
    captured: forecasts.length,
    awaiting: forecasts.length - rows.length,
    firstCapturedAt: forecasts.map((f) => f.capturedAt).sort()[0] || null,
  };
}
export function weeklyRecaps(
  history: SnapshotData[],
  forecasts: SavedForecast[],
) {
  const weeks = [...new Set(history.map((s) => s.week))].sort((a, b) => b - a);
  return weeks.slice(0, 18).map((week) => {
    const snaps = history
      .filter((s) => s.week === week)
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const latest = snaps.at(-1)!;
    const pre = new Map<string, PlayerData>();
    const finished = new Map<string, PlayerData>();
    for (const s of snaps)
      for (const p of s.players) {
        if (
          !p.locked &&
          !p.completed &&
          p.kickoffAt &&
          Date.parse(s.receivedAt || s.capturedAt) < Date.parse(p.kickoffAt)
        )
          pre.set(p.id, p);
        if (p.completed && p.actual !== null) finished.set(p.id, p);
      }
    const starters = latest.players.filter(
      (p) => !reserveSlots.has((pre.get(p.id) || p).slot),
    );
    const completedStarters = starters.filter((p) => finished.has(p.id));
    const scored = [...finished.values()].sort((a, b) => b.actual! - a.actual!);
    const mvp = scored[0]
      ? { id: scored[0].id, name: scored[0].name, points: scored[0].actual! }
      : null;
    const misses = scored
      .flatMap((p) => {
        const before = pre.get(p.id);
        return before?.projected != null
          ? [
              {
                id: p.id,
                name: p.name,
                expected: before.projected,
                actual: p.actual!,
                difference: round(p.actual! - before.projected),
              },
            ]
          : [];
      })
      .sort((a, b) => a.difference - b.difference);
    const prior = history
      .filter((s) => s.week < week)
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    const pickup = prior
      ? scored.find((p) => !prior.players.some((x) => x.id === p.id))
      : null;
    const decisions = completedStarters.flatMap((p) => {
      const before = pre.get(p.id);
      if (!before || before.projected === null) return [];
      const s = snaps
        .filter((s) =>
          p.kickoffAt
            ? Date.parse(s.receivedAt || s.capturedAt) < Date.parse(p.kickoffAt)
            : before.kickoffAt &&
              Date.parse(s.receivedAt || s.capturedAt) <
                Date.parse(before.kickoffAt),
        )
        .at(-1);
      if (!s) return [];
      const alternatives = s.players
        .filter(
          (b) =>
            reserveSlots.has(b.slot) &&
            !["IR", "IR+", "NA"].includes(b.slot) &&
            !b.locked &&
            b.bye !== week &&
            !["O", "IR", "PUP", "SUSP"].includes(b.status) &&
            b.projected !== null &&
            fits(b, before.slot) &&
            b.kickoffAt &&
            Date.parse(b.kickoffAt) > Date.parse(s.receivedAt || s.capturedAt),
        )
        .sort((a, b) => b.projected! - a.projected!);
      const bench = alternatives[0];
      if (!bench || !finished.has(bench.id)) return [];
      const expectedGap = round(bench.projected! - before.projected);
      const actualGap = round(finished.get(bench.id)!.actual! - p.actual!);
      return [
        {
          id: p.id,
          name: p.name,
          benchId: bench.id,
          benchName: bench.name,
          expectedGap,
          actualGap,
          kind:
            expectedGap >= 2
              ? "Pregame opportunity"
              : actualGap > 2
                ? "Reasonable call, rough result"
                : "Decision held up",
        },
      ];
    });
    const report = performanceReport(
      forecasts.filter((f) => f.week === week),
      snaps,
    );
    const best =
      report.commonSamples >= 3
        ? report.summary
            .filter(
              (x) =>
                x.position === "ALL" &&
                ["yahoo", "qwen", "combined"].includes(x.mode) &&
                x.commonMae !== null,
            )
            .sort((a, b) => a.commonMae! - b.commonMae!)[0]
        : null;
    return {
      week,
      season: latest.season,
      complete:
        starters.length > 0 && starters.every((p) => finished.has(p.id)),
      completedStarters: completedStarters.length,
      starterCount: starters.length,
      points: round(
        completedStarters.reduce((n, p) => n + finished.get(p.id)!.actual!, 0),
      ),
      mvp,
      letdown: misses[0]?.difference < 0 ? misses[0] : null,
      pickup: pickup
        ? { id: pickup.id, name: pickup.name, points: pickup.actual }
        : null,
      pickupKnown: !!prior,
      decisions,
      bestSource: best?.mode || null,
      commonSamples: report.commonSamples,
      updatedAt: latest.capturedAt,
    };
  });
}
