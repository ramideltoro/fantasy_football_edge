import { parsePlayers, type SnapshotData, type PlayerData } from "./model.ts";
import { displayTeamName } from "./analytics.ts";
import {
  scoreStatLine,
  scoringStatLine,
  type ScoringRules,
} from "./leagueScoring.ts";
import { keyName } from "./playerForecast.ts";
import { teamCode, round } from "./strategy.ts";
import { fits } from "./advice.ts";
import { effectiveStatus, gameLocked, reserveSlots } from "./availability.ts";
export type LabPlayer = PlayerData & {
  lab: {
    history: { season: number; week: number; points: number }[];
    baseline: number | null;
    baselineMethod: string;
    deviation: number;
    usage: Usage | null;
    matchups: Matchup[];
    missingReason?: string;
  };
};
export type Usage = {
  samples: number;
  priorSeason: boolean;
  latestWeek: number;
  latestSeason: number;
  redZoneTargets?: number | null;
  goalLineCarries?: number | null;
  targets: number | null;
  carries: number | null;
  targetShare: number | null;
  airShare: number | null;
  snaps: number | null;
  previousSnaps: number | null;
  opportunityDelta: number | null;
  expected: number | null;
  actual: number | null;
  trend: string;
};
export type Matchup = {
  week: number;
  opponent: string | null;
  bye: boolean;
  adjustment: number | null;
  samples: number;
  label: string;
};
export type LabTeam = {
  key: string;
  name: string;
  own: boolean;
  record: string;
  pointsFor: number | null;
  waiver: number | null;
  players: LabPlayer[];
  schedule: { week: number; opponent: string }[];
};
export const numeric = (v: any): number | null =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : null;
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export function leagueSettings(s: SnapshotData) {
  const rows = s.sections
    .filter((p) => p.kind === "settings")
    .flatMap((p) => p.tables)
    .flatMap((t) => t.rows);
  const get = (name: string) =>
    rows.find(
      (r) =>
        r.cells[0]?.replace(/[:\s]+$/, "").toLowerCase() === name.toLowerCase(),
    )?.cells[1] || "";
  const playoffs = get("Playoffs"),
    match = playoffs.match(/(\d+) teams.*?Week (\d+)/i);
  return {
    waiverType: get("Waiver Type"),
    median:
      get("Play Against Median Score") === "Yes"
        ? true
        : get("Play Against Median Score") === "No"
          ? false
          : null,
    playoffTeams: match ? Number(match[1]) : null,
    playoffWeek: match ? Number(match[2]) : null,
    divisions: get("Divisions"),
    tieBreaker: get("Playoff Tie-Breaker"),
    rosterSlots: get("Roster Positions") || get("Roster Positions"),
  };
}
export function leagueTeams(s: SnapshotData) {
  const standing = s.sections
    .find((p) => p.kind === "league")
    ?.tables.find((t) => t.headers.some((h) => h.text === "W-L-T"));
  return (standing?.rows || []).flatMap((r) => {
    const link = r.links.find(
      (l) => l.text && /\/f1\/\d+\/\d+\/?$/.test(l.url),
    );
    if (!link) return [];
    const key = new URL(link.url).pathname.split("/").filter(Boolean).at(-1)!;
    const own = key === s.team.id;
    const page = s.sections.find(
      (p) =>
        p.kind === "league-roster" &&
        new URL(p.url).pathname.split("/").filter(Boolean).at(-1) === key,
    );
    const normalized = s.leagueRosters?.find((t) => t.teamId === key);
    const roster = own
      ? s.players
      : normalized
        ? normalized.players
        : page
          ? parsePlayers({ ...page, kind: "roster" })
          : [];
    const schedulePage =
      s.sections.find(
        (p) => p.kind === "league-schedule" && p.filters.teamId === key,
      ) || (own ? s.sections.find((p) => p.kind === "schedule") : undefined);
    const schedule =
      schedulePage?.tables
        .filter((t) => t.headers.some((h) => h.text === "Wk"))
        .flatMap((t) => t.rows)
        .flatMap((r) => {
          const week = numeric(r.cells[0]);
          const opponent = r.links.find((l) =>
            /\/f1\/\d+\/\d+\/?$/.test(l.url),
          );
          return week && opponent
            ? [
                {
                  week,
                  opponent: new URL(opponent.url).pathname
                    .split("/")
                    .filter(Boolean)
                    .at(-1)!,
                },
              ]
            : [];
        }) || [];
    return [
      {
        key,
        name: displayTeamName(
          own ? s.team.name : link.text.trim().split("\n")[0],
        ),
        own,
        record: r.cells[2] || "",
        pointsFor: numeric(r.cells[3]),
        waiver: numeric(r.cells[6]),
        players: roster,
        schedule: normalized?.schedule || schedule,
      },
    ];
  });
}
const matchupMemo = new WeakMap<
  Map<string, number>,
  Map<string, Map<string, number[]>>
>();
export function buildPlayerLab(
  p: PlayerData,
  s: SnapshotData,
  stats: any[],
  snaps: any[],
  games: any[],
  rules: ScoringRules,
  allScores: Map<string, number>,
): LabPlayer {
  const before = (r: any) =>
    Number(r.season) < s.season ||
    (Number(r.season) === s.season && Number(r.week) < s.week);
  const candidates = stats.filter(
    (r) =>
      before(r) &&
      r.season_type === "REG" &&
      (p.position === "DEF"
        ? teamCode(r.team) === teamCode(p.team) && !r.player_id
        : keyName(r.player_display_name || "") === keyName(p.name) &&
          r.position === p.position),
  );
  const ids = new Set(candidates.map((r) => r.player_id).filter(Boolean));
  const rows = (ids.size > 1 ? [] : candidates)
    .sort(
      (a, b) =>
        Number(b.season) - Number(a.season) || Number(b.week) - Number(a.week),
    )
    .slice(0, 8);
  const history = rows.flatMap((r) => {
    const value = allScores.get(rowKey(r));
    return value == null
      ? []
      : [{ season: Number(r.season), week: Number(r.week), points: value }];
  });
  const weighted = history.map((r, i) => ({
    v: r.points,
    w: Math.pow(0.85, i),
  }));
  let baseline = weighted.length
    ? weighted.reduce((n, r) => n + r.v * r.w, 0) /
      weighted.reduce((n, r) => n + r.w, 0)
    : null;
  if (baseline === null && ids.size <= 1)
    baseline = numeric(p.providerProjected ?? p.projected);
  const average = mean(history.map((r) => r.points));
  const deviation =
    history.length > 2
      ? Math.sqrt(
          history.reduce((n, r) => n + (r.points - average!) ** 2, 0) /
            (history.length - 1),
        )
      : { QB: 8, RB: 7, WR: 7, TE: 5, K: 4, DEF: 5 }[p.position] || 7;
  const last = rows[0],
    prior = rows.slice(1, 5);
  const volume = (r: any) => numeric(r.targets)! + numeric(r.carries)!;
  const latestSnaps = last
    ? snaps.filter(
        (r) =>
          Number(r.season) === Number(last.season) &&
          keyName(r.player) === keyName(p.name) &&
          teamCode(r.team) === teamCode(last.team),
      )
    : [];
  const snap = last
    ? latestSnaps.find((r) => Number(r.week) === Number(last.week))
    : null;
  const previous = latestSnaps
    .filter((r) => Number(r.week) < Number(last?.week))
    .sort((a, b) => Number(b.week) - Number(a.week))
    .slice(0, 4);
  const delta =
    last && prior.length ? volume(last) - mean(prior.map(volume))! : null;
  const peers = stats.filter(
    (r) => before(r) && r.season_type === "REG" && r.position === p.position,
  );
  const cache =
    matchupMemo.get(allScores) || new Map<string, Map<string, number[]>>();
  matchupMemo.set(allScores, cache);
  const matchupKey = [s.season, s.week, p.position].join(":");
  let residualIndex = cache.get(matchupKey);
  if (!residualIndex) {
    residualIndex = new Map();
    const groups = new Map<string, any[]>();
    for (const r of peers) {
      const group = groups.get(r.player_id) || [];
      group.push(r);
      groups.set(r.player_id, group);
    }
    for (const r of peers) {
      const score = allScores.get(rowKey(r));
      const usual = mean(
        (groups.get(r.player_id) || [])
          .filter((x) => x.game_id !== r.game_id)
          .map((x) => allScores.get(rowKey(x)))
          .filter((v): v is number => v !== undefined),
      );
      if (score === undefined || usual === null) continue;
      const opponent = teamCode(r.opponent_team || "");
      const values = residualIndex.get(opponent) || [];
      values.push(score - usual);
      residualIndex.set(opponent, values);
    }
    cache.set(matchupKey, residualIndex);
  }
  const targetRate = (stat: string) => {
    const relevant = peers.filter((r) => numeric(r.targets)! > 0);
    const denom = relevant.reduce((n, r) => n + Number(r.targets), 0);
    return denom
      ? relevant.reduce((n, r) => n + (numeric(r[stat]) || 0), 0) / denom
      : 0;
  };
  const carryRate = (stat: string) => {
    const relevant = peers.filter((r) => numeric(r.carries)! > 0);
    const denom = relevant.reduce((n, r) => n + Number(r.carries), 0);
    return denom
      ? relevant.reduce((n, r) => n + (numeric(r[stat]) || 0), 0) / denom
      : 0;
  };
  const expectation =
    last && ["RB", "WR", "TE"].includes(p.position)
      ? (numeric(last.targets) || 0) *
          (targetRate("receptions") * (rules.Receptions || 0) +
            targetRate("receiving_yards") * (rules["Receiving Yards"] || 0) +
            targetRate("receiving_tds") *
              (rules["Receiving Touchdowns"] || 0)) +
        (numeric(last.carries) || 0) *
          (carryRate("rushing_yards") * (rules["Rushing Yards"] || 0) +
            carryRate("rushing_tds") * (rules["Rushing Touchdowns"] || 0))
      : null;
  const usage: Usage | null = last
    ? {
        samples: history.length,
        priorSeason: rows.some((r) => Number(r.season) < s.season),
        latestWeek: Number(last.week),
        latestSeason: Number(last.season),
        targets: numeric(last.targets),
        carries: numeric(last.carries),
        targetShare: numeric(last.target_share),
        airShare: numeric(last.air_yards_share),
        snaps: numeric(snap?.offense_pct),
        previousSnaps: mean(
          previous
            .map((r) => numeric(r.offense_pct))
            .filter((x): x is number => x !== null),
        ),
        opportunityDelta: delta === null ? null : round(delta),
        expected: expectation === null ? null : round(expectation),
        actual: allScores.get(rowKey(last)) ?? null,
        trend:
          delta === null
            ? "Building a baseline"
            : delta >= 3
              ? "Getting fed"
              : delta <= -3
                ? "Workload cooling"
                : "Holding steady",
      }
    : null;
  const schedule = games.filter(
    (g) =>
      Number(g.season) === s.season &&
      g.game_type === "REG" &&
      [teamCode(g.home_team), teamCode(g.away_team)].includes(teamCode(p.team)),
  );
  const matchups = Array.from({ length: Math.max(0, 19 - s.week) }, (_, i) => {
    const week = s.week + i;
    const game = schedule.find((g) => Number(g.week) === week);
    const opponent = game
      ? teamCode(game.home_team) === teamCode(p.team)
        ? teamCode(game.away_team)
        : teamCode(game.home_team)
      : null;
    const residuals = opponent ? residualIndex.get(opponent) || [] : [];
    const adjustment = residuals.length
      ? round((mean(residuals)! * residuals.length) / (residuals.length + 20))
      : null;
    return {
      week,
      opponent,
      bye: !game && schedule.length === 17,
      adjustment,
      samples: residuals.length,
      label: !game
        ? schedule.length === 17
          ? "Bye"
          : "Schedule unknown"
        : adjustment === null
          ? "No comparable sample"
          : adjustment > 1
            ? "Friendly"
            : adjustment < -1
              ? "Tough"
              : "Neutral",
    };
  });
  return {
    ...p,
    profile:
      p.profile ||
      (last?.headshot_url?.startsWith("https://")
        ? { photo: last.headshot_url }
        : null),
    lab: {
      history,
      baseline: baseline === null ? null : round(baseline),
      baselineMethod: history.length
        ? "Recency-weighted league-scored history"
        : baseline !== null
          ? "Current Yahoo projection carried forward; no scored history"
          : "Unavailable",
      deviation,
      usage,
      matchups,
      missingReason:
        ids.size > 1
          ? "Ambiguous player identity"
          : history.length
            ? ""
            : "No league-scored history",
    },
  };
}
export const rowKey = (r: any) =>
  [r.player_id || r.team, r.season, r.week].join(":");
export function scoreRows(rows: any[], rules: ScoringRules, games: any[]) {
  const lookup = new Map(games.map((g) => [g.game_id, g]));
  return new Map(
    rows.flatMap((r) => {
      const g = lookup.get(r.game_id);
      const pointsAllowed = g
        ? teamCode(g.home_team) === teamCode(r.team)
          ? numeric(g.away_score)
          : numeric(g.home_score)
        : null;
      const cs = scoreStatLine(
        r.player_id ? r.position : "DEF",
        scoringStatLine({ ...r, pointsAllowed }),
        rules,
      );
      return cs
        ? [
            [rowKey(r), cs.reduce((n, c) => n + c.points, 0)] as [
              string,
              number,
            ],
          ]
        : [];
    }),
  );
}
/** Polynomial slot-mask assignment; each player appears at most once. */
const planMemo = new WeakMap<
  LabPlayer[],
  Map<string, { points: number; ids: string[] } | null>
>();
export function bestTeam(
  players: LabPlayer[],
  slots: string[],
  week: number,
  currentWeek: number,
  pinned: string[] = [],
  excluded: string[] = [],
  allowEmpty = false,
) {
  const cacheKey = JSON.stringify([
    slots,
    week,
    currentWeek,
    pinned,
    excluded,
    allowEmpty,
  ]);
  const cache =
    planMemo.get(players) ||
    new Map<string, { points: number; ids: string[] } | null>();
  planMemo.set(players, cache);
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const current = week === currentWeek;
  const locked = current
    ? players.filter((p) => gameLocked(p) && !reserveSlots.has(p.slot))
    : [];
  const initialIds: string[] = [],
    usedSlots = new Set<number>();
  let initialScore = 0,
    initialMask = 0;
  for (const p of locked) {
    const i = slots.findIndex(
      (slot, i) => slot === p.slot && !usedSlots.has(i),
    );
    const value = p.completed ? p.actual : (p.providerProjected ?? p.projected);
    if (i < 0 || value === null || excluded.includes(p.id)) {
      cache.set(cacheKey, null);
      return null;
    }
    usedSlots.add(i);
    initialMask |= 1 << i;
    initialIds[i] = p.id;
    initialScore += value;
  }
  const required = new Set(
    pinned.filter((id) => !locked.some((p) => p.id === id)),
  );
  type State = { score: number; ids: string[] };
  let states = new Map<number, State>([
    [initialMask, { score: initialScore, ids: initialIds }],
  ]);
  const pool = players.filter(
    (p) =>
      !excluded.includes(p.id) &&
      !(current && gameLocked(p)) &&
      !["IR", "IR+", "NA"].includes(p.slot) &&
      !["O", "IR", "PUP", "SUSP"].includes(effectiveStatus(p)),
  );
  for (const p of pool) {
    const m = p.lab.matchups.find((m) => m.week === week);
    if (m?.bye || (!m?.opponent && !current)) continue;
    const value = current
      ? (p.providerProjected ?? p.projected ?? p.lab.baseline)
      : p.lab.baseline;
    if (value === null) continue;
    const next = new Map(states);
    for (const [mask, state] of states)
      for (let i = 0; i < slots.length; i++)
        if (!(mask & (1 << i)) && fits(p, slots[i])) {
          const nextMask = mask | (1 << i);
          const score =
            state.score +
            value +
            (current ? 0 : m?.adjustment || 0) +
            (required.has(p.id) ? 10000 : 0);
          const existing = next.get(nextMask);
          if (!existing || score > existing.score) {
            const ids = [...state.ids];
            ids[i] = p.id;
            next.set(nextMask, { score, ids });
          }
        }
    states = next;
  }
  let result = states.get((1 << slots.length) - 1);
  if (!result && allowEmpty) {
    // Structural gaps may score zero. Missing projections or unknown schedules may not.
    if (
      pool.some((p) => {
        const m = p.lab.matchups.find((m) => m.week === week);
        return (
          !m ||
          (!m.bye &&
            (!m.opponent ||
              (current
                ? p.projected === null && p.lab.baseline === null
                : p.lab.baseline === null)))
        );
      })
    )
      return null;
    result = [...states.values()].sort(
      (a, b) =>
        b.ids.filter(Boolean).length - a.ids.filter(Boolean).length ||
        b.score - a.score,
    )[0];
  }
  const output =
    !result || pinned.some((id) => !result.ids.includes(id))
      ? null
      : {
          points: round(result.score - required.size * 10000),
          ids: result.ids.filter(Boolean),
        };
  cache.set(cacheKey, output);
  return output;
}

export function tradeImpact(
  own: LabTeam,
  other: LabTeam,
  outgoing: string[],
  incoming: string[],
  slots: string[],
  week: number,
  pool: LabPlayer[],
) {
  if (
    !outgoing.length ||
    !incoming.length ||
    new Set(outgoing).size !== outgoing.length ||
    new Set(incoming).size !== incoming.length
  )
    return null;
  const out = own.players.filter((p) => outgoing.includes(p.id)),
    inc = other.players.filter((p) => incoming.includes(p.id));
  if (
    out.length !== outgoing.length ||
    inc.length !== incoming.length ||
    [...out, ...inc].some(
      (p) => gameLocked(p) || ["IR", "IR+", "NA"].includes(p.slot),
    )
  )
    return null;
  const assemble = (
    original: LabPlayer[],
    remove: string[],
    add: LabPlayer[],
  ) => {
    let players = [
      ...original.filter((p) => !remove.includes(p.id)),
      ...add.map((p) => ({ ...p, slot: "BN" })),
    ];
    const drops: LabPlayer[] = [];
    while (players.length > original.length) {
      const choice = players
        .filter(
          (p) =>
            !add.some((a) => a.id === p.id) &&
            !gameLocked(p) &&
            p.slot === "BN",
        )
        .sort(
          (a, b) => (a.lab.baseline ?? Infinity) - (b.lab.baseline ?? Infinity),
        )[0];
      if (!choice) return null;
      players = players.filter((p) => p.id !== choice.id);
      drops.push(choice);
    }
    // A freed roster slot remains empty: do not assume a successful waiver claim.
    return { players, drops };
  };
  const a = assemble(own.players, outgoing, inc),
    b = assemble(other.players, incoming, out);
  if (!a || !b) return null;
  const weeks = [week + 1, week + 2, week + 3].filter((w) => w <= 18);
  if (!weeks.length) return null;
  const calculate = (before: LabPlayer[], after: LabPlayer[]) =>
    weeks.map((w) => ({
      week: w,
      before: bestTeam(before, slots, w, week),
      after: bestTeam(after, slots, w, week),
    }));
  const ownWeeks = calculate(own.players, a.players),
    otherWeeks = calculate(other.players, b.players);
  const gain = (rows: typeof ownWeeks) =>
    rows.every((r) => r.before && r.after)
      ? round(rows.reduce((n, r) => n + r.after!.points - r.before!.points, 0))
      : null;
  return {
    outgoing,
    incoming,
    ownGain: gain(ownWeeks),
    otherGain: gain(otherWeeks),
    ownWeeks,
    otherWeeks,
    ownDrops: a.drops.map((p) => p.id),
    otherDrops: b.drops.map((p) => p.id),
    ownOpenSlots: own.players.length - a.players.length,
    otherOpenSlots: other.players.length - b.players.length,
    otherKey: other.key,
  };
}
export function playoffSimulation(
  teams: LabTeam[],
  slots: string[],
  settings: ReturnType<typeof leagueSettings>,
  week: number,
  iterations = 1000,
) {
  const unavailable = (reason: string) => ({
    reason,
    rows: [] as { key: string; chance: number; expectedWins: number }[],
    iterations: 0,
    emptySlots: 0,
  });
  if (settings.median === null)
    return unavailable("League median-scoring rule is not confirmed.");
  if (!settings.playoffWeek || !settings.playoffTeams)
    return unavailable("Playoff settings are not imported yet.");
  if (settings.divisions && settings.divisions !== "No")
    return unavailable(
      "Division seeding needs a supported rule before simulation.",
    );
  if (teams.length < 4 || teams.some((t) => !t.players.length))
    return unavailable("All current league rosters are required.");
  const recordedWeeks = teams.map(
    (t) =>
      t.record
        .split("-")
        .map(Number)
        .reduce((a, b) => a + b, 0) / (settings.median ? 2 : 1),
  );
  if (
    recordedWeeks.some((w) => !Number.isInteger(w)) ||
    new Set(recordedWeeks).size !== 1
  )
    return unavailable(
      "Standings include partially completed weekly results; waiting for consistent records.",
    );
  const firstWeek = Math.max(week, recordedWeeks[0] + 1);
  const weeks = Array.from(
    { length: Math.max(0, settings.playoffWeek - firstWeek) },
    (_, i) => firstWeek + i,
  );
  if (!weeks.length) return unavailable("The regular season is complete.");
  const plans = new Map<string, ReturnType<typeof bestTeam>>();
  for (const t of teams)
    for (const w of weeks) {
      const opp = t.schedule.find((g) => g.week === w)?.opponent;
      if (
        !opp ||
        !teams.some(
          (o) =>
            o.key === opp &&
            o.schedule.some((g) => g.week === w && g.opponent === t.key),
        )
      )
        return unavailable(
          "Waiting for a complete, reciprocal remaining league schedule.",
        );
      const plan = bestTeam(t.players, slots, w, week, [], [], true);
      if (!plan)
        return unavailable(
          "Some teams cannot fill every starting slot with available projections.",
        );
      plans.set(t.key + ":" + w, plan);
    }
  let seed = 20260918;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
  const counts = new Map(teams.map((t) => [t.key, { made: 0, wins: 0 }]));
  for (let n = 0; n < iterations; n++) {
    const records = new Map(
      teams.map((t) => {
        const parts = t.record.split("-").map(Number);
        return [
          t.key,
          { wins: (parts[0] || 0) + (parts[2] || 0) / 2, pf: t.pointsFor || 0 },
        ];
      }),
    );
    for (const w of weeks) {
      const totals = new Map(
        teams.map((t) => {
          const plan = plans.get(t.key + ":" + w)!;
          const variance = plan.ids.reduce((v, id) => {
            const p = t.players.find((p) => p.id === id)!;
            return v + (w === week && p.completed ? 0 : p.lab.deviation ** 2);
          }, 0);
          return [
            t.key,
            Math.max(0, plan.points + normal() * Math.sqrt(variance)),
          ];
        }),
      );
      const sorted = [...totals.values()].sort((a, b) => a - b);
      const median =
        (sorted[Math.floor((sorted.length - 1) / 2)] +
          sorted[Math.ceil((sorted.length - 1) / 2)]) /
        2;
      for (const t of teams) {
        const score = totals.get(t.key)!,
          opp = totals.get(t.schedule.find((g) => g.week === w)!.opponent)!;
        const record = records.get(t.key)!;
        record.wins += score > opp ? 1 : score === opp ? 0.5 : 0;
        if (settings.median)
          record.wins += score > median ? 1 : score === median ? 0.5 : 0;
        record.pf += score;
      }
    }
    const order = [...teams].sort(
      (a, b) =>
        records.get(b.key)!.wins - records.get(a.key)!.wins ||
        records.get(b.key)!.pf - records.get(a.key)!.pf,
    );
    for (const [i, t] of order.entries()) {
      const count = counts.get(t.key)!;
      if (i < settings.playoffTeams) count.made++;
      count.wins += records.get(t.key)!.wins;
    }
  }
  return {
    reason: null,
    rows: teams.map((t) => ({
      key: t.key,
      chance: round((counts.get(t.key)!.made / iterations) * 100),
      expectedWins: round(counts.get(t.key)!.wins / iterations),
    })),
    iterations,
    emptySlots: [...plans.values()].reduce(
      (n, plan) => n + slots.length - (plan?.ids.filter(Boolean).length || 0),
      0,
    ),
  };
}
/** Rolling-origin check: predict each held-out game using only earlier games. */
export function historicalBaselineReport(
  stats: any[],
  scores: Map<string, number>,
  season: number,
  week: number,
) {
  const groups = new Map<string, any[]>();
  for (const r of stats) {
    if (
      r.season_type !== "REG" ||
      Number(r.season) > season ||
      (Number(r.season) === season && Number(r.week) >= week)
    )
      continue;
    const id = r.player_id || "DEF:" + r.team;
    const rows = groups.get(id) || [];
    rows.push(r);
    groups.set(id, rows);
  }
  const errors = new Map<string, number[]>();
  for (const rows of groups.values()) {
    rows.sort(
      (a, b) =>
        Number(a.season) - Number(b.season) || Number(a.week) - Number(b.week),
    );
    for (let i = 4; i < rows.length; i++) {
      const prior = rows
        .slice(Math.max(0, i - 8), i)
        .reverse()
        .map((r) => scores.get(rowKey(r)))
        .filter((v): v is number => v !== undefined);
      const actual = scores.get(rowKey(rows[i]));
      if (prior.length < 4 || actual === undefined) continue;
      const weights = prior.map((_, i) => 0.85 ** i);
      const predicted =
        prior.reduce((n, v, i) => n + v * weights[i], 0) /
        weights.reduce((a, b) => a + b, 0);
      const pos = rows[i].player_id ? rows[i].position : "DEF";
      const list = errors.get(pos) || [];
      list.push(predicted - actual);
      errors.set(pos, list);
    }
  }
  return [...errors]
    .filter(([position]) =>
      ["QB", "RB", "WR", "TE", "K", "DEF"].includes(position),
    )
    .map(([position, errors]) => ({
      position,
      samples: errors.length,
      mae: round(errors.reduce((n, e) => n + Math.abs(e), 0) / errors.length),
      bias: round(errors.reduce((n, e) => n + e, 0) / errors.length),
    }));
}
