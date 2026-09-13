import type { SnapshotData, PlayerData } from "./model.ts";
export const keyName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
export function scoring(s: SnapshotData) {
  const rules: Record<string, number> = {};
  for (const t of s.sections.find((x) => x.kind === "settings")?.tables || [])
    for (const r of t.rows) {
      const name = r.cells[0]?.split("\n")[0],
        v = r.cells[1] || "";
      if (name) {
        const per = v.match(/^([\d.]+) yards per point$/);
        const n = per ? 1 / Number(per[1]) : Number(v);
        if (v && Number.isFinite(n)) rules[name] = n;
      }
    }
  return rules;
}
export function scoreRow(r: any, rules: Record<string, number>) {
  const fields: Record<string, string> = {
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
  };
  if (
    ![
      "Passing Yards",
      "Passing Touchdowns",
      "Rushing Yards",
      "Rushing Touchdowns",
      "Receptions",
      "Receiving Yards",
      "Receiving Touchdowns",
    ].every((k) => k in rules)
  )
    return null;
  const twoPoint =
    [
      "passing_2pt_conversions",
      "rushing_2pt_conversions",
      "receiving_2pt_conversions",
    ].reduce((n, k) => n + (Number(r[k]) || 0), 0) *
    (rules["2-Point Conversions"] || 0);
  return (
    twoPoint +
    Object.entries(fields).reduce(
      (n, [field, rule]) => n + (Number(r[field]) || 0) * (rules[rule] || 0),
      0,
    )
  );
}
export function forecastPlayer(
  p: PlayerData,
  s: SnapshotData,
  stats: any[],
  snaps: any[],
  opponent: string | null,
) {
  const eligible = stats.filter(
    (r) =>
      r.season_type === "REG" &&
      (Number(r.season) < s.season ||
        (Number(r.season) === s.season && Number(r.week) < s.week)),
  );
  const own = eligible
    .filter(
      (r) =>
        keyName(r.player_display_name) === keyName(p.name) &&
        r.position === p.position,
    )
    .sort(
      (a, b) =>
        Number(b.season) - Number(a.season) || Number(b.week) - Number(a.week),
    )
    .slice(0, 6)
    .reverse();
  const rules = scoring(s);
  const history = own.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    points: ["QB", "RB", "WR", "TE"].includes(p.position)
      ? scoreRow(r, rules)
      : null,
    targets: Number(r.targets) || 0,
    carries: Number(r.carries) || 0,
    receptions: Number(r.receptions) || 0,
    snapPct: (() => {
      const row = snaps.find(
        (x) =>
          x.season === r.season &&
          x.week === r.week &&
          keyName(x.player) === keyName(p.name) &&
          x.team === r.team,
      );
      return row ? Number(row.offense_pct) * 100 : null;
    })(),
  }));
  const current = history.filter(
    (r) => r.season === s.season && r.points !== null,
  );
  const average = current.length
    ? current.reduce((n, r) => n + r.points!, 0) / current.length
    : null;
  // Previous-season usage is shown as context but never silently treated as current form.
  const recent = eligible.filter(
    (r) => Number(r.season) === s.season && r.position === p.position,
  );
  const allowed = recent.filter((r) => r.opponent_team === opponent);
  const mean = (rows: any[]) =>
    rows.reduce((n, r) => n + (scoreRow(r, rules) || 0), 0) / rows.length;
  const matchupFactor =
    opponent && allowed.length >= 3 && recent.length >= 20 && mean(recent) > 0
      ? Math.max(0.9, Math.min(1.1, mean(allowed) / mean(recent)))
      : 1;
  const adjusted =
    p.projected !== null && average !== null && current.length >= 3;
  const projected =
    p.projected === null
      ? null
      : Math.round(
          (adjusted ? 0.75 * p.projected + 0.25 * average! : p.projected) *
            (adjusted ? matchupFactor : 1) *
            100,
        ) / 100;
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    position: p.position,
    slot: p.slot,
    injury: p.status,
    bye: p.bye,
    kickoffAt: p.kickoffAt,
    locked:
      p.locked || (!!p.kickoffAt && Date.parse(p.kickoffAt) <= Date.now()),
    providerProjection: p.projected,
    projection: projected,
    method: adjusted
      ? "75% Yahoo + 25% current-season recent scoring; bounded matchup adjustment"
      : "Yahoo baseline — insufficient current-season samples",
    history,
    opponent,
    matchupFactor: adjusted ? matchupFactor : 1,
    available: p.availability,
    currentSamples: current.length,
    missing: [
      ...(!history.length ? ["Usage history"] : []),
      ...(history.every((r) => r.snapPct === null) ? ["Snap counts"] : []),
      ...(!opponent ? ["Opponent"] : []),
    ],
  };
}
