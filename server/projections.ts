import { statisticalProjection, projectionMethod } from "../shared/statisticalProjection.ts";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
export async function initProjections(db: Pool) {
  await db.query(
    `CREATE TABLE IF NOT EXISTS projection_jobs(id bigserial PRIMARY KEY,hash text UNIQUE NOT NULL,snapshot_id bigint REFERENCES snapshots(id),season int NOT NULL,week int NOT NULL,data jsonb NOT NULL,result jsonb,status text NOT NULL DEFAULT 'ready',created_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,completed_at timestamptz,error text);`,
  );
}
export async function enqueueProjections(db: Pool, id: string, d: any) {
  const players = [...d.players].sort(
    (a: any, b: any) =>
      a.position.localeCompare(b.position) || a.id.localeCompare(b.id),
  );
  for (let i = 0; i < players.length; i += 8) {
    const input = {
      method: projectionMethod,
      season: d.season,
      week: d.week,
      scoring: d.scoring,
      players: players.slice(i, i + 8).map((p: any) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        team: p.team,
        opponent: p.opponent,
        injury: p.injury,
        bye: p.bye,
        nflRole: p.nflRole,
        kickoffAt: p.kickoffAt,
        history: p.researchHistory,
        news: p.headlines.map((n: any) => ({
          title: n.title,
          excerpt: n.excerpt?.slice(0, 180),
          source: n.source,
          publishedAt: n.publishedAt,
          url: n.url,
          searchResult: !!n.searchPlayer,
        })),
      })),
    };
    const hash = createHash("sha256")
      .update(JSON.stringify({ ...input, refreshWindow: Math.floor(Date.now()/14400000) }))
      .digest("hex");
    await db.query(
      "INSERT INTO projection_jobs(hash,snapshot_id,season,week,data,result,status,completed_at) VALUES($1,$2,$3,$4,$5,$6,'complete',now()) ON CONFLICT(hash) DO NOTHING",
      [hash, id, d.season, d.week, input, JSON.stringify(input.players.map(p => statisticalProjection(p,input)))],
    );
  }
  await db.query(
    "UPDATE projection_jobs SET status='superseded' WHERE status IN ('ready','analyzing') AND snapshot_id<=$1 AND season=$2 AND week=$3",
    [id, d.season, d.week],
  );
}
export async function claimProjection(db: Pool) {
  const row = (
    await db.query(
      "UPDATE projection_jobs SET status='analyzing',claimed_at=now() WHERE id=(SELECT qj.id FROM projection_jobs qj WHERE status='ready' OR (status='analyzing' AND claimed_at<now()-interval '10 minutes') ORDER BY snapshot_id DESC, (data->'players'->0->>'position' IN ('QB','K','DEF')) DESC, (SELECT count(*) FROM projection_jobs done WHERE done.status='complete' AND done.data->'players'->0->>'position'=qj.data->'players'->0->>'position') ASC, id DESC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,data",
    )
  ).rows[0];
  if (!row) return null;
  const d = structuredClone(row.data);
  for (const p of d.players) {
    p.news = p.news.slice(0, 1);
    for (const n of p.news) delete n.url;
    p.history = p.history?.map((r: any) =>
      Object.fromEntries(
        Object.entries(r).filter(
          ([k, v]) => k === "season" || k === "week" || v !== 0,
        ),
      ),
    );
  }
  return {
    id: row.id,
    kind: "projection",
    prompt: JSON.stringify({
      task: "Estimate CURRENT WEEK fantasy points independently using ONLY provided historical statistics, league scoring and news. Yahoo projections are deliberately absent. Return forecasts for EVERY supplied id, with points (number or null), low/high plausible outcome range (not calibrated confidence), and one short reason. Do not use your memory as current evidence. Prior-season stats are historical context. Reddit is unverified opinion; search titles do not establish facts. For no usable history or substantive news, use null, not an invented number. Account for role, injuries and opponent where supported. Never claim most accurate or guaranteed.",
      ...d,
    }),
    format: {
      type: "object",
      required: ["forecasts"],
      properties: {
        forecasts: {
          type: "array",
          minItems: d.players.length,
          maxItems: d.players.length,
          items: {
            type: "object",
            required: ["id", "points", "low", "high", "reason"],
            properties: {
              id: { type: "string", enum: d.players.map((p: any) => p.id) },
              points: { type: ["number", "null"], minimum: -20, maximum: 80 },
              low: { type: ["number", "null"], minimum: -30, maximum: 100 },
              high: { type: ["number", "null"], minimum: -30, maximum: 100 },
              reason: { type: "string", maxLength: 180 },
            },
          },
        },
      },
    },
  };
}
const Forecast = z.object({
  id: z.string(),
  points: z.number().min(-20).max(80).nullable(),
  low: z.number().min(-30).max(100).nullable(),
  high: z.number().min(-30).max(100).nullable(),
  reason: z.string().max(240),
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
    const supported =
      p.history?.length > 0 ||
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
    if (p.bye === input.week || ["O", "IR", "PUP", "SUSP"].includes(p.injury))
      return {
        ...x,
        points: 0,
        low: 0,
        high: 0,
        reason:
          "Imported bye or unavailable designation; verify current status.",
      };
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
  const result = validateForecasts(body.result, row.data);
  await db.query(
    "UPDATE projection_jobs SET status='complete',result=$2,completed_at=now(),error=null WHERE id=$1",
    [String(body.id), JSON.stringify(result)],
  );
  return true;
}
export async function projectionMap(db: Pool, season: number, week: number) {
  const rows = (
    await db.query(
      "SELECT data,result,completed_at FROM projection_jobs WHERE data->>'method'='statistics-v1' AND season=$1 AND week=$2 AND status='complete' AND completed_at>now()-interval '4 hours' ORDER BY created_at ASC",
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
        label: "Statistical",
        generatedAt: row.completed_at,
        team: p.team,
        sources: p.news.map((n: any) => ({
          title: n.title,
          url: n.url,
          source: n.source,
          publishedAt: n.publishedAt,
        })),
        method:
          "Recency-weighted current-season scoring; Yahoo excluded; Qwen provides separate commentary.",
      });
    }
  return map;
}
export async function projectionAccuracy(db: Pool) {
  const jobs = (
    await db.query(
      "SELECT j.data,j.result,j.completed_at,s.data - 'sections' AS snapshot FROM projection_jobs j JOIN snapshots s ON s.id=j.snapshot_id WHERE j.status='complete' AND j.data->>'method'='statistics-v1' ORDER BY j.completed_at ASC LIMIT 1000",
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
      "Earliest completed pre-kickoff statistical estimate versus completed imported results. Lower mean absolute error is better; no improvement is established until measured.",
  };
}
