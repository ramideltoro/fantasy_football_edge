import { displayTeamName } from "./analytics.ts";
import { number, parsePlayers, type SnapshotData } from "./model.ts";

export function opponentMatchupRoster(s: SnapshotData) {
  const page = s.sections.find((p) => p.kind === "matchups");
  if (!page) return [];
  const ownIds = new Set(s.players.map((p) => p.id));
  const tables = page.tables.filter(
    (t) => t.headers.filter((h) => h.text === "Player").length === 2,
  );
  const sidePlayer = (
    row: (typeof page.tables)[number]["rows"][number],
    index: number,
  ) =>
    row.links.find(
      (l) =>
        /^playernote-\d+$/.test(l.id || "") &&
        /\/nfl\/players\/\d+\/?$/.test(l.url) &&
        row.cells[index]?.trim().startsWith(l.text),
    );
  const hits = [0, 0];
  for (const t of tables) {
    const columns = t.headers.flatMap((h, i) =>
      h.text === "Player" ? [i] : [],
    );
    for (const r of t.rows)
      columns.forEach((c, side) => {
        const p = sidePlayer(r, c);
        if (p && ownIds.has(p.id!.replace("playernote-", "yahoo:")))
          hits[side]++;
      });
  }
  // Never guess which side belongs to us from display order alone.
  const opponentSide =
    hits[0] > 0 && hits[1] === 0 ? 1 : hits[1] > 0 && hits[0] === 0 ? 0 : null;
  if (opponentSide == null) return [];
  const rows = tables.flatMap((t) => {
    const indices = (label: string) =>
      t.headers.flatMap((h, i) => (h.text === label ? [i] : []));
    const pi = indices("Player")[opponentSide],
      projection = indices("Proj")[opponentSide],
      actual = indices("Fan Pts")[opponentSide],
      positions = indices("Pos");
    if (projection == null || actual == null || !positions.length) return [];
    return t.rows.flatMap((r) => {
      const link = sidePlayer(r, pi);
      if (!link) return [];
      return [
        {
          cells: [
            r.cells[opponentSide === 0 ? positions[0] : positions.at(-1)!],
            r.cells[pi]
              .split("\n")
              .map((x) => x.trim())
              .join("\n"),
            r.cells[projection],
            r.cells[actual],
          ],
          links: [link],
        },
      ];
    });
  });
  return parsePlayers({
    ...page,
    kind: "roster",
    tables: [
      {
        caption: "",
        headers: [
          "Position",
          "Player",
          "Projected Points",
          "Fantasy Points",
        ].map((text) => ({ text, title: text })),
        rows,
      },
    ],
  });
}

export type TeamGame = {
  week: number;
  opponentName: string;
  points: number;
  against: number;
  result: "W" | "L" | "T";
};
export const teamIdFromUrl = (url: string) => {
  try {
    return new URL(url).pathname.match(/\/f1\/\d+\/(\d+)\/?$/)?.[1] || null;
  } catch {
    return null;
  }
};
const cleanName = (name: string) => displayTeamName(name.trim().split("\n")[0]);
export function teamNames(s: SnapshotData) {
  const names = new Map<string, string>([[s.team.id, s.team.name]]);
  for (const p of s.sections.filter((p) => p.kind === "league"))
    for (const link of p.tables
      .flatMap((t) => t.rows)
      .flatMap((r) => r.links)) {
      const id = teamIdFromUrl(link.url);
      if (id && link.text.trim()) names.set(id, cleanName(link.text));
    }
  for (const t of s.leagueRosters || []) names.set(t.teamId, cleanName(t.name));
  return names;
}
export function teamSchedulePage(s: SnapshotData, teamId: string) {
  return (
    s.sections.find(
      (p) => p.kind === "league-schedule" && p.filters?.teamId === teamId,
    ) ||
    (teamId === s.team.id
      ? s.sections.find((p) => p.kind === "schedule")
      : undefined)
  );
}
export function currentOpponentId(s: SnapshotData) {
  const normalized = s.leagueRosters
    ?.find((t) => t.teamId === s.team.id)
    ?.schedule.find((g) => g.week === s.week);
  if (normalized) return normalized.opponent;
  const rows =
    teamSchedulePage(s, s.team.id)
      ?.tables.filter((t) => t.headers.some((h) => h.text === "Wk"))
      .flatMap((t) => t.rows) || [];
  const row = rows.find((r) => number(r.cells[0]) === s.week);
  const id = row?.links
    .map((l) => teamIdFromUrl(l.url))
    .find((id) => id && id !== s.team.id);
  if (id) return id;
  return (
    s.sections
      .find((p) => p.kind === "matchups")
      ?.tables.flatMap((t) => t.rows)
      .flatMap((r) => r.links)
      .map((l) => teamIdFromUrl(l.url))
      .find((id) => id && id !== s.team.id) || null
  );
}

// Only explicit completed head-to-head results qualify. The second line is the
// league-median result, not another game or another score from the same team.
export function completedTeamGames(
  s: SnapshotData,
  teamId: string,
  includeCurrent = false,
): TeamGame[] {
  const names = teamNames(s),
    games = new Map<number, TeamGame>();
  const upper = includeCurrent ? s.week : s.week - 1;
  const add = (
    week: number,
    points: number | null | undefined,
    against: number | null | undefined,
    opponentName: string,
  ) => {
    if (
      !Number.isInteger(week) ||
      week < 1 ||
      week > upper ||
      typeof points !== "number" ||
      !Number.isFinite(points) ||
      typeof against !== "number" ||
      !Number.isFinite(against)
    )
      return;
    games.set(week, {
      week,
      points,
      against,
      opponentName,
      result: points > against ? "W" : points < against ? "L" : "T",
    });
  };
  const page = teamSchedulePage(s, teamId);
  for (const table of page?.tables || []) {
    const headers = table.headers.map((h) => h.text.trim()),
      wi = headers.indexOf("Wk"),
      ri = headers.indexOf("Result"),
      si = headers.indexOf("Score");
    if (wi < 0 || ri < 0 || si < 0) continue;
    for (const row of table.rows) {
      const result = row.cells[ri]?.trim().split("\n")[0].trim();
      if (!/^(Win|Loss|Tie|W|L|T)$/i.test(result || "")) continue;
      const scores = row.cells[si]
        ?.trim()
        .split("\n")[0]
        .match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
      if (!scores) continue;
      const points = Number(scores[1]),
        against = Number(scores[2]);
      if (
        (/^W/i.test(result) && points <= against) ||
        (/^L/i.test(result) && points >= against) ||
        (/^T/i.test(result) && points !== against)
      )
        continue;
      const link = row.links.find(
        (l) =>
          l.text.trim() &&
          teamIdFromUrl(l.url) &&
          teamIdFromUrl(l.url) !== teamId,
      );
      add(
        Number(row.cells[wi]),
        points,
        against,
        link ? cleanName(link.text) : "Imported opponent",
      );
    }
  }
  for (const game of s.leagueRosters?.find((t) => t.teamId === teamId)
    ?.schedule || [])
    if (game.completed)
      add(
        game.week,
        game.ownPoints,
        game.opponentPoints,
        names.get(game.opponent) || "Imported opponent",
      );
  return [...games.values()].sort((a, b) => b.week - a.week);
}

export function recentForm(s: SnapshotData, teamId: string) {
  const games = completedTeamGames(s, teamId).slice(0, 4);
  const page = teamSchedulePage(s, teamId);
  return {
    games,
    average: games.length
      ? games.reduce((sum, g) => sum + g.points, 0) / games.length
      : null,
    high: games.length ? Math.max(...games.map((g) => g.points)) : null,
    low: games.length ? Math.min(...games.map((g) => g.points)) : null,
    wins: games.filter((g) => g.result === "W").length,
    losses: games.filter((g) => g.result === "L").length,
    ties: games.filter((g) => g.result === "T").length,
    sourceAt:
      s.leagueRosters?.find((t) => t.teamId === teamId)?.capturedAt ||
      page?.filters?.capturedAt ||
      (page ? s.capturedAt : null),
  };
}
