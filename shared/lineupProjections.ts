import { advice } from "./advice.ts";
import type { PlayerData, SnapshotData } from "./model.ts";
import type { ScoringComponent } from "./leagueScoring.ts";

export type ProjectionMode = "yahoo" | "qwen" | "bookies" | "combined";
export const projectionModes: Record<
  ProjectionMode,
  { label: string; description: string }
> = {
  yahoo: {
    label: "Yahoo only",
    description:
      "Straight from Yahoo. Every choice uses Yahoo’s imported projection only.",
  },
  qwen: {
    label: "Qwen only",
    description:
      "Let Qwen call the plays. Current Qwen forecasts only; no Yahoo fallback.",
  },
  bookies: {
    label: "Bookies only",
    description:
      "Follow the board. Offensive scores are partial prop subtotals; K and DEF use the game-line model. Missing markets can skew rankings, especially at FLEX. This is not a full-team fantasy forecast.",
  },
  combined: {
    label: "All combined",
    description:
      "The whole huddle. Equal-weight average of available Yahoo, Qwen and book-informed forecasts. For offensive players, the book-informed forecast fills missing scoring categories from the league-scored historical baseline. It is a model, not a full prediction published by a book.",
  },
};
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const marketStats: Record<string, string[]> = {
  "passing-yards": ["passing_yards"],
  "rushing-yards": ["rushing_yards"],
  "receiving-yards": ["receiving_yards"],
  touchdowns: ["rushing_tds", "receiving_tds"],
};
export function lineupProjection(p: PlayerData, mode: ProjectionMode) {
  const yahooRaw =
    p.providerProjected !== undefined ? p.providerProjected : p.projected;
  const yahoo = finite(yahooRaw) ? yahooRaw : null;
  const q =
    p.aiProjection?.label === "Qwen" && !p.aiProjection.stale
      ? p.aiProjection
      : null;
  const qwen = finite(q?.points) ? (q.points as number) : null;
  const b = p.sportsbook;
  const bookies =
    b && !b.stale && !b.reason && finite(b.points) ? b.points : null;
  let bookInformed: number | null = bookies;
  let remainder: number | null = null;
  if (bookies !== null && b?.partial) {
    const components: ScoringComponent[] | undefined =
      q?.calculation?.components;
    const markets = b.components.map((c) => marketStats[c.market]);
    if (
      !components?.length ||
      !markets.length ||
      markets.some(
        (stats) =>
          !stats ||
          stats.some(
            (stat) =>
              !components.some((c) => c.stat === stat && finite(c.points)),
          ),
      )
    ) {
      bookInformed = null;
    } else {
      const covered = new Set(markets.flat());
      remainder = components
        .filter((c) => !covered.has(c.stat))
        .reduce((sum, c) => sum + c.points, 0);
      bookInformed = finite(remainder) ? bookies + remainder : null;
    }
  }
  const sources = [yahoo, qwen, bookInformed].filter(finite);
  const points =
    mode === "yahoo"
      ? yahoo
      : mode === "qwen"
        ? qwen
        : mode === "bookies"
          ? bookies
          : sources.length
            ? sources.reduce((sum, n) => sum + n, 0) / sources.length
            : null;
  return {
    points,
    yahoo,
    qwen,
    bookies,
    bookInformed,
    remainder,
    sourceCount: sources.length,
    partial: mode === "bookies" && !!b?.partial,
  };
}
export function lineupAdvice(
  s: Pick<SnapshotData, "players" | "capturedAt" | "week">,
  mode: ProjectionMode,
  constraints: { pinned?: string[]; excluded?: string[] } = {},
) {
  const projections = Object.fromEntries(
    s.players.map((p) => [p.id, lineupProjection(p, mode)]),
  );
  const result = advice(
    {
      ...s,
      players: s.players.map((p) => ({
        ...p,
        projected: projections[p.id].points,
      })),
    },
    constraints,
  );
  return { ...result, method: projectionModes[mode].description, projections };
}
