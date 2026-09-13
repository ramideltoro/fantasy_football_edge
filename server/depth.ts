export const nameKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
export function parseDepth(data: any) {
  const ranks = new Map<string, number>();
  for (const chart of data.depthchart || [])
    for (const entry of Object.values(chart.positions || {}) as any[]) {
      const position = entry.position?.abbreviation;
      if (!["QB", "RB", "FB", "WR", "TE", "K", "PK"].includes(position))
        continue;
      (entry.athletes || []).forEach((a: any, i: number) => {
        const key = nameKey(a.displayName || "");
        if (key) ranks.set(key, Math.min(ranks.get(key) ?? Infinity, i + 1));
      });
    }
  return Object.fromEntries(ranks);
}
let cached: any = null,
  pending: Promise<any> | null = null;
async function load() {
  const response = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw Error("Depth source unavailable");
  const data = await response.json();
  const teams = data.sports[0].leagues[0].teams.map((x: any) => x.team);
  const result: Record<string, any> = {};
  let index = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (index < teams.length) {
        const team = teams[index++];
        try {
          const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${team.id}/depthcharts`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!r.ok) throw Error();
          const d = await r.json();
          result[team.abbreviation] = {
            ranks: parseDepth(d),
            source: `https://www.espn.com/nfl/team/depth/_/name/${team.abbreviation.toLowerCase()}`,
            asOf: d.timestamp || new Date().toISOString(),
          };
        } catch {
          /* Missing teams remain unknown, never inferred from popularity. */
        }
      }
    }),
  );
  return { teams: result, fetchedAt: new Date().toISOString() };
}
export async function depthCharts() {
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < 3600000)
    return cached;
  if (!pending)
    pending = load()
      .then((d) => (cached = d))
      .finally(() => (pending = null));
  return pending;
}
