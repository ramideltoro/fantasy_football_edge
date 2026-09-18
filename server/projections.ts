import {
  qwenPointsMethod,
  projectionRequest,
  validateQwenPoints,
} from "../shared/qwenPoints.ts";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
export async function initProjections(db: Pool) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS projection_jobs(id bigserial PRIMARY KEY,hash text UNIQUE NOT NULL,snapshot_id bigint REFERENCES snapshots(id),season int NOT NULL,week int NOT NULL,data jsonb NOT NULL,result jsonb,status text NOT NULL DEFAULT 'ready',created_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,completed_at timestamptz,error text);`,
  );
  await db.query(
    "ALTER TABLE projection_jobs ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0",
  );
}
export async function enqueueProjections(db: Pool, id: string, d: any) {
  const players = [...d.players].sort(
    (a: any, b: any) =>
      Number(!a.slot) - Number(!b.slot) || a.id.localeCompare(b.id),
  );
  const market = (
    await db.query("SELECT data->'market' AS market FROM news_state WHERE id=1")
  ).rows[0]?.market;
  for (let i = 0; i < players.length; i += 3) {
    const batch = players.slice(i, i + 3);
    const input = {
      method: "qwen-points-v4",
      priority: batch.some((p: any) => p.slot) ? 0 : 1,
      season: d.season,
      week: d.week,
      scoring: d.scoring,
      players: batch.map((p: any) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        team: p.team,
        opponent: p.opponent,
        injury: p.injury,
        bye: p.bye,
        nflRole: p.nflRole,
        kickoffAt: p.kickoffAt,
        locked: p.locked,
        history: p.researchHistory,
        fantasyHistory: p.history,
        injuryReports: p.profile?.injuries || [],
        news: p.headlines.slice(0, 3).map((n: any) => ({
          title: n.title,
          excerpt: n.excerpt?.slice(0, 300),
          source: n.source,
          publishedAt: n.publishedAt,
          url: n.url,
          searchResult: !!n.searchPlayer,
        })),
        market: (market?.games || [])
          .filter((g: any) =>
            g.teams?.some(
              (t: string) => t.toUpperCase() === p.team.toUpperCase(),
            ),
          )
          .map((g: any) => ({
            spread: g.spread,
            total: g.total,
            provider: g.provider,
            updatedAt: g.updatedAt,
          })),
      })),
    };
    // Stable groups prevent each Yahoo poll from burying unfinished model work.
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          method: input.method,
          season: d.season,
          week: d.week,
          players: input.players.map((p) => [
            p.id,
            p.team,
            p.injury,
            p.bye,
            p.nflRole,
            p.news.map((n: any) => [n.url, n.publishedAt]),
          ]),
          window: Math.floor(Date.now() / 14400000),
        }),
      )
      .digest("hex");
    await db.query(
      "UPDATE projection_jobs SET status='superseded' WHERE status='ready' AND season=$1 AND week=$2 AND hash<>$3 AND data->>'method'='qwen-points-v4' AND data->'players'->0->>'id'=$4",
      [d.season, d.week, hash, input.players[0].id],
    );
    await db.query(
      "INSERT INTO projection_jobs(hash,snapshot_id,season,week,data,status) VALUES($1,$2,$3,$4,$5,'ready') ON CONFLICT(hash) DO NOTHING",
      [hash, id, d.season, d.week, input],
    );
  }
  await db.query(
    "UPDATE projection_jobs SET status='superseded' WHERE status='ready' AND (data->>'method'<>'qwen-points-v4' OR season<>$1 OR week<>$2 OR created_at<now()-interval '8 hours')",
    [d.season, d.week],
  );
}
export async function claimProjection(db: Pool, rosterOnly = false) {
  const row = (
    await db.query(
      "UPDATE projection_jobs SET status='analyzing',claimed_at=now(),attempts=attempts+1 WHERE id=(SELECT id FROM projection_jobs WHERE data->>'method'='qwen-points-v4' AND (NOT $1::boolean OR data->>'priority'='0') AND attempts<3 AND (status='ready' OR (status IN ('analyzing','failed') AND claimed_at<now()-interval '10 minutes')) ORDER BY (data->>'priority')::int ASC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,data",
      [rosterOnly],
    )
  ).rows[0];
  if (!row) return null;
  const request = projectionRequest(row.data);
  return {
    id: row.id,
    kind: "projection",
    prompt: JSON.stringify(request.context),
    format: request.format,
  };
}

const Forecast = z.object({
  id: z.string(),
  points: z.number().min(-20).max(80).nullable(),
  low: z.number().min(-30).max(100).nullable(),
  high: z.number().min(-30).max(100).nullable(),
  reason: z.string().max(240),
  playProbability: z.number().min(0).max(100).nullable().optional(),
  startProbability: z.number().min(0).max(100).nullable().optional(),
});
export function validateForecasts(raw: any, input: any) {
  const rows = z.object({ forecasts: z.array(Forecast) }).parse(raw).forecasts;
  if (
    rows.length !== input.players.length ||
    new Set(rows.map((x) => x.id)).size !== rows.length
  )
    throw Error("Incomplete forecast");
  return rows.map((x) => {
    const p = input.players.find((p: any) => p.id === x.id);
    if (!p) throw Error("Unknown player");
    if (
      x.points !== null &&
      (x.low === null ||
        x.high === null ||
        x.low > x.points ||
        x.high < x.points)
    )
      throw Error("Invalid range");
    if (p.locked && x.points !== null)
      throw Error("New forecasts cannot be made after kickoff");
    const supported =
      p.history?.length > 0 ||
      p.market?.some((g: any) => g.total != null) ||
      p.news?.some((n: any) => !n.searchResult && n.excerpt?.length > 80);
    if (!supported)
      return {
        ...x,
        points: null,
        low: null,
        high: null,
        reason:
          "Insufficient independent statistical or directly matched reporting evidence.",
      };
    if (
      !p.locked &&
      (p.bye === input.week || ["O", "IR", "PUP", "SUSP"].includes(p.injury)) &&
      (x.points !== 0 || (x.playProbability ?? 0) !== 0)
    )
      throw Error("Forecast contradicts unavailable designation");
    if (
      x.startProbability != null &&
      x.playProbability != null &&
      x.startProbability > x.playProbability
    )
      throw Error("Starting probability exceeds playing probability");
    return x;
  });
}
export async function saveProjection(db: Pool, body: any) {
  const row = (
    await db.query("SELECT data,status FROM projection_jobs WHERE id=$1", [
      String(body.id),
    ])
  ).rows[0];
  if (!row || row.status !== "analyzing") return false;
  if (body.error) {
    await db.query(
      "UPDATE projection_jobs SET status='failed',error='Qwen forecast failed; Yahoo fallback remains labeled.' WHERE id=$1",
      [String(body.id)],
    );
    return true;
  }
  const result =
    row.data.method === qwenPointsMethod
      ? validateQwenPoints(body.result, row.data)
      : validateForecasts(body.result, row.data);
  await db.query(
    "UPDATE projection_jobs SET status='complete',result=$2,completed_at=now(),error=null WHERE id=$1",
    [String(body.id), JSON.stringify(result)],
  );
  return true;
}
export async function projectionMap(db: Pool, season: number, week: number) {
  const rows = (
    await db.query(
      "SELECT data,result,completed_at FROM projection_jobs WHERE data->>'method'='qwen-points-v4' AND season=$1 AND week=$2 AND status='complete' AND completed_at>now()-interval '24 hours' ORDER BY created_at ASC",
      [season, week],
    )
  ).rows;
  const map = new Map<string, any>();
  for (const row of rows)
    for (const f of row.result) {
      const p = row.data.players.find((p: any) => p.id === f.id);
      map.set(f.id, {
        ...f,
        reason: f.reason,
        label: "Qwen",
        stale: Date.now() - Date.parse(row.completed_at) > 14400000,
        injury: p.injury,
        bye: p.bye,
        role: p.nflRole,
        generatedAt: row.completed_at,
        team: p.team,
        sources: p.news.map((n: any) => ({
          title: n.title,
          url: n.url,
          source: n.source,
          publishedAt: n.publishedAt,
        })),
        method:
          "Qwen2.5 calculates points and availability estimates from supplied player history, league scoring, ESPN roles, reporting and available game lines. Yahoo projections are excluded.",
      });
    }
  return map;
}
export async function projectionAccuracy(db: Pool) {
  const jobs = (
    await db.query(
      "SELECT j.data,j.result,j.completed_at,s.data - 'sections' AS snapshot FROM projection_jobs j JOIN snapshots s ON s.id=j.snapshot_id WHERE j.status='complete' AND j.data->>'method'='qwen-points-v4' ORDER BY j.completed_at ASC LIMIT 1000",
    )
  ).rows;
  const predictions = new Map<string, any>();
  for (const j of jobs)
    for (const f of j.result) {
      const p = j.data.players.find((p: any) => p.id === f.id),
        s = j.snapshot;
      const original = [...s.players, ...s.available].find(
        (p: any) => p.id === f.id,
      );
      const key = [s.league.id, s.season, s.week, f.id].join(":");
      if (
        !predictions.has(key) &&
        f.points !== null &&
        original?.projected !== null &&
        p.kickoffAt &&
        Date.parse(j.completed_at) < Date.parse(p.kickoffAt)
      )
        predictions.set(key, { ai: f.points, yahoo: original.projected });
    }
  const outcomes = new Map<string, number>();
  for (const { data: s } of (
    await db.query(
      "SELECT data - 'sections' AS data FROM snapshots ORDER BY captured_at ASC LIMIT 1000",
    )
  ).rows)
    for (const p of [...s.players, ...s.available])
      if (p.completed && p.actual !== null)
        outcomes.set([s.league.id, s.season, s.week, p.id].join(":"), p.actual);
  const samples = [...predictions]
    .filter(([k]) => outcomes.has(k))
    .map(([k, p]) => ({ ...p, actual: outcomes.get(k) }));
  const mae = (key: string) =>
    samples.length
      ? samples.reduce((n, p) => n + Math.abs(p[key] - p.actual), 0) /
        samples.length
      : null;
  return {
    samples: samples.length,
    qwenMae: mae("ai"),
    yahooMae: mae("yahoo"),
    method:
      "Earliest completed pre-kickoff Qwen estimate versus completed imported results. Lower mean absolute error is better; no improvement is established until measured.",
  };
}
