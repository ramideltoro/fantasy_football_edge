export type ScoringRules = Record<string, number>;
export type ScoringComponent = {
  stat: string;
  quantity: number;
  rule: string;
  multiplier: number;
  points: number;
};
const offense: Record<string, string> = {
  passing_yards: "Passing Yards",
  passing_tds: "Passing Touchdowns",
  passing_interceptions: "Interceptions",
  rushing_yards: "Rushing Yards",
  rushing_tds: "Rushing Touchdowns",
  receptions: "Receptions",
  receiving_yards: "Receiving Yards",
  receiving_tds: "Receiving Touchdowns",
  special_teams_tds: "Return Touchdowns",
  fumbles_lost_total: "Fumbles Lost",
  fumble_recovery_tds: "Offensive Fumble Return TD",
  two_point: "2-Point Conversions",
};
const kicking: Record<string, string> = {
  fg_made_0_19: "Field Goals 0-19 Yards",
  fg_made_20_29: "Field Goals 20-29 Yards",
  fg_made_30_39: "Field Goals 30-39 Yards",
  fg_made_40_49: "Field Goals 40-49 Yards",
  fg_made_50_plus: "Field Goals 50+ Yards",
  pat_made: "Point After Attempt Made",
};
const defense: Record<string, string> = {
  def_sacks: "Sack",
  def_interceptions: "Interception",
  fumble_recovery_opp: "Fumble Recovery",
  def_tds: "Touchdown",
  def_safeties: "Safety",
  blocks: "Block Kick",
  special_teams_tds: "Kickoff and Punt Return Touchdowns",
  def_2pt_made: "Extra Point Returned",
};
export const PA_BINS = [
  [0, 0, "Points Allowed 0 points"],
  [1, 6, "Points Allowed 1-6 points"],
  [7, 13, "Points Allowed 7-13 points"],
  [14, 20, "Points Allowed 14-20 points"],
  [21, 27, "Points Allowed 21-27 points"],
  [28, 34, "Points Allowed 28-34 points"],
  [35, Infinity, "Points Allowed 35+ points"],
] as const;
export function scoringStatLine(row: any) {
  const allowed = new Set([
    ...Object.keys(offense),
    ...Object.keys(kicking),
    ...Object.keys(defense),
    "fg_made_50_59",
    "fg_made_60_",
    "passing_2pt_conversions",
    "rushing_2pt_conversions",
    "receiving_2pt_conversions",
    "def_punt_blocks",
    "def_pat_blocks",
    "def_fg_blocks",
    "pointsAllowed",
    "teamPoints",
  ]);
  const r: Record<string, number> = Object.fromEntries(
    Object.entries(row)
      .filter(([k]) => allowed.has(k))
      .filter(([, v]) => v != null && v !== "" && Number.isFinite(Number(v)))
      .map(([k, v]) => [k, Number(v)]),
  );
  r.two_point =
    (r.passing_2pt_conversions || 0) +
    (r.rushing_2pt_conversions || 0) +
    (r.receiving_2pt_conversions || 0);
  r.fg_made_50_plus = (r.fg_made_50_59 || 0) + (r.fg_made_60_ || 0);
  r.blocks =
    (r.def_punt_blocks || 0) + (r.def_pat_blocks || 0) + (r.def_fg_blocks || 0);
  for (const [lo, hi, rule] of PA_BINS)
    r[rule] =
      r.pointsAllowed != null
        ? Number(r.pointsAllowed >= lo && r.pointsAllowed <= hi)
        : 0;
  return r;
}
export function scoreStatLine(
  position: string,
  row: any,
  rules: ScoringRules,
): ScoringComponent[] | null {
  const mapping =
    position === "K" ? kicking : position === "DEF" ? defense : offense;
  if (
    !Object.values(mapping)
      .filter(
        (rule) =>
          ![
            "Return Touchdowns",
            "Offensive Fumble Return TD",
            "Extra Point Returned",
            "Kickoff and Punt Return Touchdowns",
          ].includes(rule),
      )
      .every((rule) => Number.isFinite(rules[rule]))
  )
    return null;
  if (
    position === "DEF" &&
    !PA_BINS.every(([, , rule]) => Number.isFinite(rules[rule]))
  )
    return null;
  const out = Object.entries(mapping).map(([stat, rule]) => ({
    stat,
    quantity: row[stat] || 0,
    rule,
    multiplier: rules[rule] || 0,
    points: (row[stat] || 0) * (rules[rule] || 0),
  }));
  if (position === "DEF")
    for (const [, , rule] of PA_BINS)
      out.push({
        stat: rule,
        quantity: row[rule] || 0,
        rule,
        multiplier: rules[rule],
        points: (row[rule] || 0) * rules[rule],
      });
  return out;
}
export const sumComponents = (cs: ScoringComponent[]) =>
  cs.reduce((n, c) => n + c.points, 0);
export function averageStats(rows: any[]) {
  const lines = rows.map(scoringStatLine),
    keys = [...new Set(lines.flatMap(Object.keys))];
  return Object.fromEntries(
    keys.map((k) => [
      k,
      lines.reduce((n, r) => n + (r[k] || 0), 0) / Math.max(1, lines.length),
    ]),
  );
}
export function calibratedBaseline(
  position: string,
  history: any[],
  peerRows: any[] | { mean: Record<string, number>; samples: number },
  rules: ScoringRules,
) {
  const peerSamples = Array.isArray(peerRows)
    ? peerRows.length
    : peerRows.samples;
  if (!peerSamples) return null;
  const prior = Array.isArray(peerRows)
      ? averageStats(peerRows)
      : peerRows.mean,
    recent = history.map(scoringStatLine);
  // Three peer-game equivalents keep a single hot game from becoming a weekly expectation.
  const priorWeight = 3,
    ownWeight = recent.reduce((n, _, i) => n + Math.pow(0.8, i), 0);
  const keys = [
    ...new Set([...Object.keys(prior), ...recent.flatMap(Object.keys)]),
  ];
  const expected = Object.fromEntries(
    keys.map((k) => [
      k,
      ((prior[k] || 0) * priorWeight +
        recent.reduce((n, r, i) => n + (r[k] || 0) * Math.pow(0.8, i), 0)) /
        (priorWeight + ownWeight),
    ]),
  );
  const components = scoreStatLine(position, expected, rules);
  if (!components) return null;
  const samples = history.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    points: sumComponents(
      scoreStatLine(position, scoringStatLine(r), rules) || [],
    ),
  }));
  return {
    points: sumComponents(components),
    components,
    expected,
    history: samples,
    samples: history.length,
    peerSamples,
    priorWeight,
    ownWeight,
    priorPoints: sumComponents(scoreStatLine(position, prior, rules) || []),
    source: "nflverse weekly statistics and NFL game scores",
    specialist: position === "K" || position === "DEF",
    limitation:
      position === "DEF"
        ? "Points-allowed history uses opponent game scores; Yahoo can exclude defensive return scores. The projection is an estimate, not an official historical fantasy total."
        : null,
  };
}
export function actualPoints(player: any, rules: ScoringRules) {
  // Yahoo's actual total is authoritative, including stat corrections and uncommon scoring categories.
  if (player.actual != null && Number.isFinite(player.actual))
    return { points: player.actual, source: "Yahoo scored result" };
  if (!player.locked && !player.completed)
    return { points: null, source: "Game not started" };
  const stat = player.stats || {},
    categories = Object.entries(rules).filter(([k]) => stat[k] != null);
  if (!categories.length)
    return { points: null, source: "Awaiting game stats" };
  return {
    points:
      Math.round(categories.reduce((n, [k, m]) => n + stat[k] * m, 0) * 100) /
      100,
    source:
      "Calculated from imported stats and league scoring; partial until Yahoo posts its total",
  };
}
