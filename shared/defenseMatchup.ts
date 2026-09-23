import {
  scoringStatLine,
  scoreStatLine,
  sumComponents,
  type ScoringRules,
} from "./leagueScoring.ts";
const team = (value: string) =>
  ({ JAC: "JAX", WAS: "WSH", LA: "LAR" })[value?.toUpperCase()] ||
  value?.toUpperCase();
/** Score the defenses that faced this offense, not the offense's own defense. */
export function defensePointsAllowed(
  opponent: string | null,
  rows: any[],
  rules: ScoringRules,
  season: number,
  week: number,
) {
  if (!opponent) return null;
  const eligible = rows.filter(
    (r) =>
      team(r.opponent_team) === team(opponent) &&
      r.season_type === "REG" &&
      Number(r.season) <= season &&
      (Number(r.season) < season || Number(r.week) < week) &&
      r.pointsAllowed != null &&
      r.pointsAllowed !== "" &&
      r.def_sacks != null &&
      r.def_sacks !== "",
  );
  const current = eligible.filter((r) => Number(r.season) === season);
  const sampleSeason = current.length ? season : season - 1;
  const sample = eligible
    .filter((r) => Number(r.season) === sampleSeason)
    .map((r) => scoreStatLine("DEF", scoringStatLine(r), rules))
    .filter((r) => r !== null);
  return {
    opponent,
    points: sample.length
      ? sample.reduce((sum, r) => sum + sumComponents(r), 0) / sample.length
      : null,
    games: sample.length,
    season: sampleSeason,
    priorSeason: sampleSeason !== season,
  };
}

/** Transparent current-season matchup estimate; no prior-season or Yahoo input. */
export function defenseMatchupForecast(
  defense: string,
  opponent: string | null,
  rows: any[],
  rules: ScoringRules,
  season: number,
  week: number,
) {
  const scoreGames = (matches: (r: any) => boolean) =>
    rows
      .filter(
        (r) =>
          Number(r.season) === season &&
          r.season_type === "REG" &&
          Number(r.week) < week &&
          matches(r) &&
          r.pointsAllowed != null &&
          r.pointsAllowed !== "" &&
          r.def_sacks != null &&
          r.def_sacks !== "",
      )
      .flatMap((r) => {
        const components = scoreStatLine("DEF", scoringStatLine(r), rules);
        return components
          ? [
              {
                week: Number(r.week),
                defense: team(r.team),
                opponent: team(r.opponent_team),
                points: sumComponents(components),
              },
            ]
          : [];
      })
      .sort((a, b) => a.week - b.week);
  const ownGames = scoreGames((r) => team(r.team) === team(defense));
  const opponentGames = opponent
    ? scoreGames((r) => team(r.opponent_team) === team(opponent))
    : [];
  const mean = (games: typeof ownGames) =>
    games.length
      ? games.reduce((n, g) => n + g.points, 0) / games.length
      : null;
  const defenseAverage = mean(ownGames),
    opponentAverage = mean(opponentGames);
  return {
    season,
    week,
    opponent,
    defenseAverage,
    opponentAverage,
    ownGames,
    opponentGames,
    points:
      defenseAverage != null && opponentAverage != null
        ? (defenseAverage + opponentAverage) / 2
        : null,
    method:
      "50% current-season DEF average + 50% opponent fantasy points allowed to DEF",
    limitation:
      !ownGames.length || !opponentGames.length
        ? "Both current-season samples are required; other forecasts remain available."
        : Math.min(ownGames.length, opponentGames.length) < 4
          ? "Small current-season sample; this estimate is volatile and is not a calibrated forecast."
          : "Simple matchup estimate; historical results do not guarantee next-game performance.",
  };
}
