import type { SportsbookProjection } from "./sportsbook.ts";
import { PA_BINS } from "./leagueScoring.ts";
export function specialistBooks(
  p: any,
  research: any,
  rules: Record<string, number>,
  base: SportsbookProjection,
): SportsbookProjection {
  const context = research?.specialist,
    baseline = context?.baseline;
  if (
    !["K", "DEF"].includes(p.position) ||
    !baseline ||
    (base.reason && !base.reason.includes("does not publish the scoring props"))
  )
    return base;
  if (p.position === "K" && research.nflRole !== "Starter")
    return {
      ...base,
      reason:
        "The game lines price the team's primary kicker. This player's starting role is not confirmed, and the source has no individual kicking props to support an estimate.",
    };
  const games = base.games.filter((g) => g.kind === "sportsbook");
  const books = [...new Set(games.map((g) => g.book))];
  const history = context.teamHistory.filter(
    (h: any) => h.pointsAllowed != null && h.teamPoints != null,
  );
  const modeled = books.flatMap((book) => {
    const spread = games.find(
      (g) => g.book === book && g.market === "spread",
    )?.line;
    const total = games.find(
      (g) => g.book === book && g.market === "total",
    )?.line;
    if (spread == null || total == null) return [];
    const impliedOwn = (total - spread) / 2,
      impliedOpponent = (total + spread) / 2;
    if (impliedOwn < 0 || impliedOpponent < 0) return [];
    if (p.position === "K") {
      const teamPoints = baseline.expected.teamPoints;
      if (!(teamPoints > 0)) return [];
      const coefficient = baseline.points / teamPoints;
      return [
        {
          book,
          spread,
          total,
          impliedOwn,
          impliedOpponent,
          points: impliedOwn * coefficient,
          coefficient,
        },
      ];
    }
    // Smoothed distribution, not a hard points-allowed bracket at the line's midpoint.
    const mu = impliedOpponent,
      sigma = 10;
    const erf = (x: number) => {
      const sign = x < 0 ? -1 : 1,
        a = Math.abs(x),
        t = 1 / (1 + 0.3275911 * a);
      return (
        sign *
        (1 -
          ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
            0.284496736) *
            t +
            0.254829592) *
            t *
            Math.exp(-a * a))
      );
    };
    const cdf = (x: number) => (1 + erf((x - mu) / (sigma * Math.SQRT2))) / 2;
    const pa = PA_BINS.reduce(
      (sum, [lo, hi, key]) =>
        sum +
        ((hi === Infinity ? 1 : cdf(hi + 0.5)) -
          (lo === 0 ? 0 : cdf(lo - 0.5))) *
          (rules[key] || 0),
      0,
    );
    const eventPoints = baseline.components
      .filter((c: any) => !c.rule.startsWith("Points Allowed"))
      .reduce((sum: number, c: any) => sum + c.points, 0);
    return [
      {
        book,
        spread,
        total,
        impliedOwn,
        impliedOpponent,
        points: eventPoints + pa,
        coefficient: 0,
        pointsAllowed: pa,
        eventPoints,
      },
    ];
  });
  if (modeled.length < 3)
    return {
      ...base,
      reason:
        "At least three books with both a game total and spread are needed for this specialist model.",
    };
  const mean = (key: string) =>
    modeled.reduce((n: number, r: any) => n + r[key], 0) / modeled.length;
  const usedBooks = modeled.map((b) => b.book);
  const components =
    p.position === "K"
      ? [
          {
            market: "kicking-model",
            label: "Kicking share of expected team scoring",
            mean: mean("impliedOwn"),
            multiplier: modeled[0].coefficient,
            points: mean("points"),
            books: usedBooks,
            unit: "team NFL points",
          },
        ]
      : [
          {
            market: "def-events",
            label: "Expected sacks, turnovers, blocks and TDs",
            mean: mean("eventPoints"),
            multiplier: 1,
            points: mean("eventPoints"),
            books: usedBooks,
            unit: "fantasy points",
          },
          {
            market: "def-pa",
            label: "Expected points-allowed contribution",
            mean: mean("pointsAllowed"),
            multiplier: 1,
            points: mean("pointsAllowed"),
            books: usedBooks,
            unit: "fantasy points",
          },
        ];
  return {
    ...base,
    reason: null,
    points: Math.round(mean("points") * 100) / 100,
    partial: false,
    components,
    books: usedBooks,
    missing: [],
    model: {
      name:
        p.position === "K"
          ? "Market + kicking-history model"
          : "Market + defense-history model",
      perBook: modeled,
      historyGames: history.length,
      peerGames: baseline.peerSamples,
      source: context.source,
      formula:
        p.position === "K"
          ? "Per book: (game total − team spread) ÷ 2 × historical fantasy kicking points per team NFL point. The kicking share uses team field goals by distance and extra points, shrunk toward league history. Assumes the player is the team’s primary kicker."
          : "Per book: league-scored historical sacks, turnovers, blocks and touchdowns + expected points-allowed score. Opponent NFL total = (game total + team spread) ÷ 2. A normal approximation with a 10-point standard deviation distributes that total across your league’s points-allowed brackets; this spread is an explicit model assumption.",
      limitation:
        "This is our model derived from sportsbook game lines and nflverse history, not a sportsbook-published player fantasy projection. It is not adjusted for live play. Historical means are shrunk toward league history; source coverage and model assumptions limit precision.",
    },
  };
}
