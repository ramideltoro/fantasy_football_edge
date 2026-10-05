import type { Pool } from "pg";

// Expensive historical reads are shared while pending, then cached from completion.
// A slow read must not launch a second copy when its nominal TTL passes.
export function createHistoryCache<T>(ttl = 60_000, now = Date.now) {
  const entries = new Map<
    string,
    { pending: Promise<T>; expires: number; loading: boolean }
  >();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const old = entries.get(key);
    if (old && (old.loading || old.expires > now())) return old.pending;
    if (entries.size >= 16)
      for (const [k, v] of entries) if (!v.loading) entries.delete(k);
    const entry = {
      pending: null as unknown as Promise<T>,
      expires: 0,
      loading: true,
    };
    entry.pending = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          entry.loading = false;
          entry.expires = now() + ttl;
          return value;
        },
        (error) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        },
      );
    entries.set(key, entry);
    return entry.pending;
  };
}
const caches = new WeakMap<
  Pool,
  ReturnType<typeof createHistoryCache<any[]>>
>();
export function historyQuery(db: Pool, sql: string, values: string[] = []) {
  let cached = caches.get(db);
  if (!cached) {
    cached = createHistoryCache<any[]>();
    caches.set(db, cached);
  }
  return cached(
    JSON.stringify([sql, values]),
    async () => (await db.query(sql, values)).rows,
  );
}
// Expand each stored JSON document once. Repeated -> access on a TOASTed
// snapshot decompresses the entire capture for each field and can take minutes.
const metadata =
  'source text, season int, week int, "capturedAt" text, "receivedAt" text, team jsonb, league jsonb';
const identity = (h: string) => `jsonb_build_object(
  'source', ${h}.source, 'season', ${h}.season, 'week', ${h}.week,
  'capturedAt', ${h}."capturedAt", 'receivedAt', ${h}."receivedAt",
  'team', jsonb_build_object('id', ${h}.team->'id'),
  'league', jsonb_build_object('id', ${h}.league->'id'))`;
export const dashboardHistorySql = `SELECT ${identity("h")} || jsonb_build_object('players',h.players) AS data
  FROM snapshots s CROSS JOIN LATERAL jsonb_to_record(s.data) AS h(${metadata}, players jsonb)
  WHERE h.season=$1 AND h.team->>'id'=$2 AND h.league->>'id'=$3
  ORDER BY s.captured_at DESC LIMIT 1000`;

// Retain the old first-1,000 order and exact completed/actual semantics.
export const completedHistorySql = `SELECT ${identity("h")} || jsonb_build_object(
  'players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p->'id','completed',p->'completed','actual',p->'actual'))
    FROM jsonb_array_elements(COALESCE(h.players,'[]'::jsonb) || COALESCE(h.available,'[]'::jsonb)) p
    WHERE p->>'completed'='true' AND p->'actual' IS NOT NULL AND p->'actual'<>'null'::jsonb), '[]'::jsonb), 'available','[]'::jsonb) AS data
  FROM (SELECT data FROM snapshots ORDER BY captured_at ASC LIMIT 1000) s
  CROSS JOIN LATERAL jsonb_to_record(s.data) AS h(${metadata}, players jsonb, available jsonb)`;
export const researchHistorySql = `SELECT i.created_at, ${identity("h")} AS snapshot,
  jsonb_build_object('players',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',p->'id','name',p->'name','projection',p->'projection','providerProjection',p->'providerProjection',
    'locked',p->'locked','kickoffAt',p->'kickoffAt')) FROM jsonb_array_elements(research.players) p),'[]'::jsonb)) AS data
  FROM intelligence i JOIN snapshots s ON s.id=i.snapshot_id
  CROSS JOIN LATERAL jsonb_to_record(s.data) AS h(${metadata})
  CROSS JOIN LATERAL jsonb_to_record(i.data) AS research(players jsonb)
  WHERE i.data IS NOT NULL ORDER BY i.created_at ASC LIMIT 1000`;
export const projectionHistorySql = `SELECT j.completed_at,j.result,
  jsonb_build_object('players',(SELECT jsonb_agg(jsonb_build_object('id',p->'id','kickoffAt',p->'kickoffAt')) FROM jsonb_array_elements(job.players) p)) AS data,
  ${identity("h")} || jsonb_build_object('players',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p->'id','projected',p->'projected'))
    FROM jsonb_array_elements(COALESCE(h.players,'[]'::jsonb) || COALESCE(h.available,'[]'::jsonb)) p
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(j.result) f WHERE f->>'id'=p->>'id')),'[]'::jsonb),'available','[]'::jsonb) AS snapshot
  FROM projection_jobs j JOIN snapshots s ON s.id=j.snapshot_id
  CROSS JOIN LATERAL jsonb_to_record(s.data) AS h(${metadata}, players jsonb, available jsonb)
  CROSS JOIN LATERAL jsonb_to_record(j.data) AS job(players jsonb, method text)
  WHERE j.status='complete' AND job.method='qwen-points-v5'
  ORDER BY j.completed_at ASC LIMIT 1000`;

// After the one-time original-Yahoo backfill, the game-plan audit only needs
// finished free agents. Own-roster history stays intact for recap decisions.
export const gamePlanHistorySql = `SELECT ${identity("h")} || jsonb_build_object(
  'players',h.players,'available',COALESCE((SELECT jsonb_agg(p)
    FROM jsonb_array_elements(COALESCE(h.available,'[]'::jsonb)) p
    WHERE p->>'completed'='true' AND p->'actual' IS NOT NULL AND p->'actual'<>'null'::jsonb),'[]'::jsonb)) AS data
  FROM snapshots s CROSS JOIN LATERAL jsonb_to_record(s.data) AS h(${metadata}, players jsonb, available jsonb)
  WHERE h.season=$1 AND h.league->>'id'=$2 AND h.team->>'id'=$3 ORDER BY s.captured_at DESC LIMIT 2000`;
