import { number, type SnapshotData } from "./model.ts";
export function leagueOverview(s: SnapshotData, owner = false) {
  const p = s.sections.find((x) => x.kind === "league");
  const table = p?.tables.find((t) =>
    t.headers.some((h) => h.text === "W-L-T"),
  );
  const standings = (table?.rows || []).flatMap((r, i) => {
    const link = r.links.find((l) => l.text && /\/f1\/\d+\/\d+$/.test(l.url));
    if (!link) return [];
    const own = link.url.endsWith("/" + s.team.id);
    return [
      {
        name: own ? s.team.name : owner ? link.text : `Opponent ${i + 1}`,
        own,
        record: r.cells[2],
        pointsFor: number(r.cells[3]),
        pointsAgainst: number(r.cells[4]),
        waiver: number(r.cells[6]),
        moves: number(r.cells[7]),
      },
    ];
  });
  const m = s.sections.find((x) => x.kind === "matchups");
  const text = m?.text || "";
  const live = text.match(/([\d.]+)\s+Live Proj\s+([\d.]+)/);
  const original = text.match(/([\d.]+)\s+Orig Proj\s+([\d.]+)/);
  const probability = text.match(/(?:Underdog|Favorite)\s+(\d+)%/);
  const scores = text.match(/([\d.]+)\s+vs\s+([\d.]+)/);
  return {
    standings,
    matchup: live
      ? {
          ownActual: number(scores?.[1]),
          opponentActual: number(scores?.[2]),
          ownProjected: number(live[1]),
          opponentProjected: number(live[2]),
          ownOriginal: number(original?.[1]),
          opponentOriginal: number(original?.[2]),
          winProbability: number(probability?.[1]),
          source: "Yahoo imported matchup",
        }
      : null,
  };
}
export function accuracy(snapshots: SnapshotData[]) {
  const predictions = new Map<
    string,
    {
      id: string;
      name: string;
      week: number;
      projected: number;
      capturedAt: string;
    }
  >();
  const results = new Map<string, number>();
  for (const s of [...snapshots].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  )) {
    for (const p of s.players) {
      const k = [s.source, s.league.id, s.team.id, s.season, s.week, p.id].join(
        ":",
      );
      if (
        !p.locked &&
        p.projected !== null &&
        !predictions.has(k) &&
        (!p.kickoffAt ||
          Date.parse(s.receivedAt || s.capturedAt) < Date.parse(p.kickoffAt))
      )
        predictions.set(k, {
          id: p.id,
          name: p.name,
          week: s.week,
          projected: p.projected,
          capturedAt: s.capturedAt,
        });
      if (p.completed && p.actual !== null) results.set(k, p.actual);
    }
  }
  const points = [...predictions].flatMap(([k, p]) =>
    results.has(k)
      ? [
          {
            ...p,
            actual: results.get(k)!,
            error: Math.round((results.get(k)! - p.projected) * 100) / 100,
          },
        ]
      : [],
  );
  return {
    method:
      "Earliest stored pre-game Yahoo projection versus latest imported completed-game points. Results remain subject to stat corrections.",
    sampleSize: points.length,
    mae: points.length
      ? points.reduce((n, p) => n + Math.abs(p.error), 0) / points.length
      : null,
    bias: points.length
      ? points.reduce((n, p) => n + p.error, 0) / points.length
      : null,
    points,
  };
}
