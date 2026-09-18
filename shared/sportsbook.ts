import type { PlayerData, SnapshotData } from "./model.ts";
import { keyName, scoring } from "./playerForecast.ts";

export const ODDS_INTERVAL = 6 * 60 * 60 * 1000;
export const PROP_SOURCE =
  "https://www.vegasinsider.com/nfl/odds/player-props/";
export const GAME_SOURCE = "https://www.vegasinsider.com/nfl/odds/las-vegas/";
export const MARKET_LABELS = {
  "passing-yards": "Passing yards",
  "rushing-yards": "Rushing yards",
  "receiving-yards": "Receiving yards",
  touchdowns: "Anytime touchdown",
} as const;
export type PropMarket = keyof typeof MARKET_LABELS;
export type OddsQuote = {
  player: string;
  market: PropMarket;
  book: string;
  kind: "sportsbook" | "pickem";
  line: number | null;
  side: "over" | "under" | "yes";
  odds: number;
  raw: string;
};
export type GameQuote = {
  eventId: string;
  kickoff: string;
  team: string;
  market: "spread" | "total" | "moneyline";
  book: string;
  kind: "sportsbook" | "reference";
  line: number | null;
  odds: number;
  raw: string;
};
export type OddsBoard = {
  version: 1;
  fetchedAt: string;
  week: number;
  season: number;
  props: OddsQuote[];
  games: GameQuote[];
  books: string[];
  pickem: string[];
};
export type OddsState = {
  board: OddsBoard | null;
  nextAt: string | null;
  attemptedAt: string | null;
  error: string | null;
};
export type EvaluatedQuote = OddsQuote & {
  used: boolean;
  exclusion: string | null;
  value: number | null;
};
export type BookComponent = {
  market: PropMarket;
  label: string;
  mean: number;
  multiplier: number;
  points: number;
  books: string[];
};
export type SportsbookProjection = {
  points: number | null;
  partial: true;
  reason: string | null;
  fetchedAt: string | null;
  nextAt: string | null;
  stale: boolean;
  error: string | null;
  books: string[];
  components: BookComponent[];
  missing: string[];
  quotes: EvaluatedQuote[];
  games: GameQuote[];
  week: number | null;
  season: number | null;
  matchup: string | null;
  kickoff: string | null;
};
export function impliedProbability(odds: number) {
  if (!Number.isFinite(odds) || Math.abs(odds) < 100) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (100 - odds);
}
const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
const median = (ns: number[]) => {
  const a = [...ns].sort((a, b) => a - b);
  return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2;
};
const teamKey = (s: string) =>
  ({ JAC: "JAX", WAS: "WSH", LA: "LAR" })[s.toUpperCase()] || s.toUpperCase();
const yardRule = {
  "passing-yards": "Passing Yards",
  "rushing-yards": "Rushing Yards",
  "receiving-yards": "Receiving Yards",
};

export function sportsbookProjection(
  p: PlayerData,
  snapshot: SnapshotData,
  state: OddsState,
  now = Date.now(),
): SportsbookProjection {
  const b = state.board;
  const rules = scoring(snapshot);
  const stale =
    !b || now - Date.parse(b.fetchedAt) > ODDS_INTERVAL + 5 * 60_000;
  const games =
    b?.games.filter((g) => teamKey(g.team) === teamKey(p.team)) || [];
  const events = [...new Set(games.map((g) => g.eventId))];
  const kickoff = events.length === 1 ? games[0]?.kickoff : null;
  const opponent = b?.games.find(
    (g) =>
      events.length === 1 &&
      g.eventId === events[0] &&
      teamKey(g.team) !== teamKey(p.team),
  )?.team;
  const names = [
    ...new Set(
      b?.props
        .filter((q) => keyName(q.player) === keyName(p.name))
        .map((q) => q.player),
    ),
  ];
  const peers = [
    ...new Map(
      [...snapshot.players, ...snapshot.available]
        .filter((x) => keyName(x.name) === keyName(p.name))
        .map((x) => [x.id, x]),
    ).values(),
  ];
  let reason: string | null = !b
    ? "First odds pull is warming up."
    : stale
      ? "Odds are overdue for a refresh. Previous quotes are shown below."
      : b.season !== snapshot.season || b.week !== snapshot.week
        ? "The odds board and your roster are on different NFL weeks."
        : p.completed ||
            p.locked ||
            (kickoff && Date.parse(kickoff) <= now) ||
            (p.kickoffAt && Date.parse(p.kickoffAt) <= now)
          ? "Game locked. Pregame estimate is closed."
          : ["O", "IR", "PUP", "SUSP"].includes(p.status)
            ? "Player is listed unavailable. Any remaining book quotes are reference only."
            : events.length !== 1 || !kickoff || !opponent
              ? "No single current matchup could be matched to this player’s team."
              : p.kickoffAt &&
                  Math.abs(Date.parse(p.kickoffAt) - Date.parse(kickoff)) >
                    5 * 60_000
                ? "Yahoo and VegasInsider disagree on the game time."
                : names.length > 1 || peers.length > 1
                  ? "Player name is ambiguous on the source board."
                  : ["K", "DEF"].includes(p.position)
                    ? "This board does not publish the scoring props needed for this position."
                    : null;
  const sourceQuotes =
    b?.props.filter((q) => keyName(q.player) === keyName(p.name)) || [];
  const quotes: EvaluatedQuote[] = sourceQuotes.map((q) => {
    const probability = impliedProbability(q.odds);
    const same = sourceQuotes.filter(
      (x) => x.market === q.market && x.kind === "sportsbook",
    );
    const values = same
      .map((x) =>
        q.market === "touchdowns" ? impliedProbability(x.odds) : x.line,
      )
      .filter((x): x is number => x != null);
    const v = q.market === "touchdowns" ? probability : q.line;
    const outlier =
      v != null &&
      values.length >= 3 &&
      (q.market === "touchdowns"
        ? Math.abs(v - median(values)) > 0.25
        : Math.abs(v - median(values)) >
          Math.max(15, Math.abs(median(values)) * 0.5));
    const exclusion =
      q.kind === "pickem"
        ? "Pick’em operator: displayed, excluded from sportsbook average."
        : outlier
          ? "Outlier versus the other books; retained for inspection, excluded from calculation."
          : probability == null || v == null
            ? "Invalid or unavailable quote."
            : null;
    // ATTD supplies P(at least one rushing/receiving TD), not passing TDs or a TD count.
    // A Poisson proxy converts that probability to an expected count; margin cannot be removed from a one-sided quote.
    return {
      ...q,
      used: false,
      exclusion,
      value:
        v == null ? null : q.market === "touchdowns" ? -Math.log(1 - v) : v,
    };
  });
  const components: BookComponent[] = [];
  for (const market of Object.keys(MARKET_LABELS) as PropMarket[]) {
    const qs = quotes.filter(
      (q) => q.market === market && !q.exclusion && q.value != null,
    );
    const books = [...new Set(qs.map((q) => q.book))];
    let multiplier: number | undefined;
    if (market === "touchdowns") {
      if (rules["Rushing Touchdowns"] === rules["Receiving Touchdowns"])
        multiplier = rules["Rushing Touchdowns"];
    } else multiplier = rules[yardRule[market]];
    if (
      books.length < 3 ||
      multiplier == null ||
      !Number.isFinite(multiplier)
    ) {
      for (const q of qs)
        q.exclusion =
          books.length < 3
            ? "Fewer than three comparable sportsbook quotes."
            : "League scoring is missing or incompatible with this market.";
      continue;
    }
    if (multiplier === 0) {
      for (const q of qs)
        q.exclusion = "This market scores zero in your league.";
      continue;
    }
    for (const q of qs) q.used = true;
    const mean = avg(qs.map((q) => q.value!));
    components.push({
      market,
      label: MARKET_LABELS[market],
      mean,
      multiplier,
      points: mean * multiplier,
      books,
    });
  }
  const missing = [
    ...(p.position === "QB" ? ["Passing touchdowns", "Interceptions"] : []),
    ...(rules.Receptions ? ["Receptions"] : []),
    "Fumbles / two-point conversions / return scoring",
    ...(["K", "DEF"].includes(p.position)
      ? [
          p.position === "K"
            ? "Field goals and extra points"
            : "Sacks, turnovers and points allowed",
        ]
      : []),
    ...(["QB", "RB", "WR", "TE"].includes(p.position)
      ? (p.position === "QB"
          ? ["passing-yards", "rushing-yards", "touchdowns"]
          : ["receiving-yards", "rushing-yards", "touchdowns"]
        )
          .filter((m) => !components.some((c) => c.market === m))
          .map((m) => MARKET_LABELS[m as PropMarket])
      : []),
  ];
  if (!reason && !components.length)
    reason = sourceQuotes.length
      ? "Not enough comparable books to calculate a subtotal."
      : "No player props found on the current board.";
  return {
    points: reason
      ? null
      : Math.round(components.reduce((n, c) => n + c.points, 0) * 100) / 100,
    partial: true,
    reason,
    fetchedAt: b?.fetchedAt || null,
    nextAt: state.nextAt,
    stale,
    error: state.error,
    books: [...new Set(components.flatMap((c) => c.books))],
    components,
    missing,
    quotes,
    games,
    week: b?.week || null,
    season: b?.season || null,
    matchup: opponent ? `${p.team} vs ${opponent}` : null,
    kickoff,
  };
}
