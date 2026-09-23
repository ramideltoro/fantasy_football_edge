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
