import type { Pool } from "pg";
import type { Express, Request } from "express";
import { waiverFeeds } from "./waiverNews.ts";
import {
  parseFeed,
  matchesPlayer,
  eventsFor,
  cleanArticle,
  articleExcerpt,
  hash,
  newsRequest,
  validateNewsResult,
} from "../shared/newsEvidence.ts";

export async function newsSummary(db: Pool) {
  const [state, sources, runs, events, history, articles] = await Promise.all([
    db.query("SELECT data FROM news_state WHERE id=1"),
    db.query(
      "SELECT source,status,checked_at,updated_at,next_at,failures FROM news_sources ORDER BY source",
    ),
    db.query(
      "SELECT id,status,created_at,completed_at,jsonb_array_length(input->'players') AS players,error FROM news_runs ORDER BY id DESC LIMIT 30",
    ),
    db.query(
      "SELECT data,assessment,updated_at FROM player_events WHERE published_at>now()-interval '7 days' AND data->>'supersededAt' IS NULL ORDER BY published_at DESC LIMIT 300",
    ),
    db.query(
      "SELECT created_at,data->'waivers' AS waivers FROM qwen_history ORDER BY id DESC LIMIT 100",
    ),
    db.query(
      "SELECT data FROM news_articles WHERE published_at>now()-interval '7 days' ORDER BY published_at DESC LIMIT 60",
    ),
  ]);
  const counts = (
    await db.query(
      "SELECT status,count(*)::int AS count FROM news_runs GROUP BY status",
    )
  ).rows;
  const recent = events.rows.map((r) => ({
    ...r.data,
    assessment: r.assessment,
    analyzedAt: r.updated_at,
  }));
  for (const e of recent) {
    e.previousAssessment =
      recent.find((x) => x.playerId === e.playerId && x.assessment)
        ?.assessment || null;
    e.conflicting = recent.some(
      (x) =>
        x.playerId === e.playerId &&
        x.id !== e.id &&
        /ruled out|will not play/i.test(x.evidence) &&
        /will play|cleared/i.test(e.evidence),
    );
  }
  return {
    ...state.rows[0]?.data,
    sources: sources.rows,
    runs: runs.rows,
    counts,
    events: recent,
    scoreHistory: history.rows,
    articles: articles.rows.map((r) => {
      const a = cleanArticle(r.data);
      return {
        id: a.id,
        title: a.title,
        source: a.source,
        url: a.url,
        publishedAt: a.publishedAt,
        discoveryOnly: a.discoveryOnly,
      };
    }),
  };
}
export async function claimNews(db: Pool) {
  await db.query(
    "UPDATE news_runs SET status='failed',error='Worker lease expired; retry available' WHERE status='analyzing' AND claimed_at<now()-interval '10 minutes' AND attempts>=3",
  );
  const row = (
    await db.query(
      "UPDATE news_runs SET status='analyzing',claimed_at=now(),attempts=attempts+1 WHERE id=(SELECT id FROM news_runs WHERE status='queued' OR (status IN ('failed','analyzing') AND attempts<3 AND claimed_at<now()-interval '10 minutes') ORDER BY priority,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",
    )
  ).rows[0];
  return row
    ? {
        id: String(row.id),
        kind: "news",
        prompt: JSON.stringify(row.input),
        ...newsRequest(row.input),
      }
    : null;
}
export async function saveNews(db: Pool, body: any) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const row = (
      await client.query("SELECT * FROM news_runs WHERE id=$1 FOR UPDATE", [
        String(body.id),
      ])
    ).rows[0];
    if (!row || row.status !== "analyzing") {
      await client.query("ROLLBACK");
      return false;
    }
    if (body.error) {
      await client.query(
        "UPDATE news_runs SET status='failed',error='AI unavailable or response did not validate; previous advice retained' WHERE id=$1",
        [row.id],
      );
      await client.query("COMMIT");
      return true;
    }
    const latest = (
      await client.query(
        "SELECT data - 'sections' AS data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
      )
    ).rows[0]?.data;
    for (const p of row.input.players) {
      const current = [
        ...(latest?.players || []),
        ...(latest?.available || []),
      ].find((x: any) => x.id === p.id);
      if (current) {
        p.locked =
          current.locked ||
          !!(current.kickoffAt && Date.parse(current.kickoffAt) <= Date.now());
        p.status = current.status;
        p.slot = current.slot;
        p.bye = current.bye === latest.week;
        p.available = /^(FA|W)/.test(current.availability);
      } else p.locked = true;
    }
    const assessments = validateNewsResult(body.result, row.input);
    for (const a of assessments) {
      const previous = (
        await client.query(
          "SELECT assessment FROM player_events WHERE player_id=$1 AND assessment IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
          [a.playerId],
        )
      ).rows[0]?.assessment;
      (a as any).changed = previous
        ? previous.action !== a.action
          ? "Advice changed from " + previous.action + " to " + a.action
          : "New cited evidence; advice remains " + a.action
        : "First news-based assessment";
    }
    for (const a of assessments)
      await client.query(
        "UPDATE player_events SET assessment=$2,updated_at=now() WHERE id=$1",
        [
          a.eventId,
          JSON.stringify({ ...a, generatedAt: new Date().toISOString() }),
        ],
      );
    await client.query(
      "UPDATE news_runs SET status='complete',result=$2,completed_at=now(),error=null WHERE id=$1",
      [row.id, JSON.stringify(assessments)],
    );
    await client.query(
      "UPDATE intelligence SET status='ready',attempts=0,error=null WHERE snapshot_id=(SELECT id FROM snapshots ORDER BY captured_at DESC LIMIT 1) AND data IS NOT NULL AND status IN ('complete','failed')",
    );
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function installNews(
  app: Express,
  db: Pool,
  isOwner: (q: Request) => Promise<boolean>,
) {
  await db.query(`CREATE TABLE IF NOT EXISTS news_sources(url text primary key,source text not null,status text,checked_at timestamptz,updated_at timestamptz,next_at timestamptz,failures int default 0,etag text,modified text,data jsonb default '[]');
 CREATE TABLE IF NOT EXISTS news_articles(id text primary key,published_at timestamptz not null,data jsonb not null);
 CREATE TABLE IF NOT EXISTS player_events(id text primary key,player_id text not null,article_id text not null,published_at timestamptz not null,data jsonb not null,assessment jsonb,updated_at timestamptz);
 CREATE INDEX IF NOT EXISTS player_events_player ON player_events(player_id,published_at DESC);
 CREATE TABLE IF NOT EXISTS news_runs(id bigserial primary key,evidence_version text unique not null,status text not null default 'queued',priority int not null,created_at timestamptz default now(),claimed_at timestamptz,completed_at timestamptz,attempts int default 0,input jsonb not null,result jsonb,error text);
 CREATE TABLE IF NOT EXISTS news_state(id int primary key CHECK(id=1),data jsonb not null);
 CREATE TABLE IF NOT EXISTS news_searches(url text,requested_at timestamptz default now());`);
  await db.query(
    "UPDATE player_events SET data=jsonb_set(data,'{supersededAt}',to_jsonb(now()::text)) WHERE COALESCE((data->>'evidenceVersion')::int,0)<4 AND data->>'supersededAt' IS NULL; UPDATE news_runs SET status='superseded' WHERE status IN ('queued','analyzing','failed') AND COALESCE((input->'players'->0->'events'->0->>'evidenceVersion')::int,0)<4",
  );
  let collecting = false,
    articles: any[] = [],
    health: any = {};
  const previous = (
    await db.query(
      "SELECT data FROM news_articles WHERE published_at>now()-interval '7 days' ORDER BY published_at DESC LIMIT 500",
    )
  ).rows;
  articles = previous.map((r) => r.data);
  async function stage(value: string, more: any = {}) {
    await db.query(
      "INSERT INTO news_state VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET data=news_state.data||$1",
      [
        JSON.stringify({
          stage: value,
          heartbeat: new Date().toISOString(),
          ...more,
        }),
      ],
    );
  }
  async function collect() {
    if (collecting) return;
    collecting = true;
    try {
      const latest = (
        await db.query(
          "SELECT id,data - 'sections' AS data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
        )
      ).rows[0];
      if (!latest) return;
      const s = latest.data;
      await stage("Collecting feeds", {
        collecting: true,
        completed: 0,
        total: waiverFeeds.length,
        error: null,
      });
      const pool = [
        ...new Map(
          [...s.players, ...s.available].map((p: any) => [p.id, p]),
        ).values(),
      ] as any[];
      const eligible = s.available.filter(
        (p: any) =>
          !p.locked &&
          (!p.kickoffAt || Date.parse(p.kickoffAt) > Date.now()) &&
          p.bye !== s.week &&
          !["O", "IR", "PUP", "SUSP"].includes(p.status),
      );
      const targets = [
        ...s.players,
        ...["QB", "RB", "WR", "TE", "K", "DEF"].flatMap((pos) =>
          eligible
            .filter((p: any) => p.position === pos)
            .sort((a: any, b: any) => (b.projected ?? -1) - (a.projected ?? -1))
            .slice(0, 2),
        ),
      ];
      const searches = [...new Set(targets.map((p: any) => p.name))]
        .slice(0, 30)
        .map((name) => [
          "News search: " + name,
          "https://news.google.com/rss/search?q=" +
            encodeURIComponent('"' + name + '" NFL fantasy when:7d') +
            "&hl=en-US&gl=US&ceid=US:en",
        ]);
      const used = Number(
        (
          await db.query(
            "SELECT count(*) FROM news_searches WHERE requested_at>now()-interval '1 hour'",
          )
        ).rows[0].count,
      );
      let budget = Math.max(0, 30 - used),
        completed = 0;
      const sources = [...waiverFeeds, ...searches];
      await stage("Collecting feeds", { total: sources.length });
      const fetched: any[] = [];
      async function source(source: string, url: string) {
        const old = (
          await db.query("SELECT * FROM news_sources WHERE url=$1", [url])
        ).rows[0];
        let rows = old?.data || [];
        if (!old?.next_at || Date.parse(old.next_at) <= Date.now()) {
          if (source.startsWith("News search: ") && budget <= 0) {
            fetched.push(...rows.map(cleanArticle));
            return;
          }
          if (source.startsWith("News search: ")) {
            budget--;
            await db.query("INSERT INTO news_searches(url) VALUES($1)", [url]);
          }
          try {
            const headers: Record<string, string> = {
              "User-Agent": "FantasyFootballEdge/2.0 RSS reader",
            };
            if (old?.etag) headers["If-None-Match"] = old.etag;
            if (old?.modified) headers["If-Modified-Since"] = old.modified;
            const r = await fetch(url, {
              headers,
              signal: AbortSignal.timeout(12000),
            });
            if (r.status !== 304) {
              if (!r.ok) throw Error("Feed unavailable");
              const xml = await r.text();
              if (xml.length > 3000000) throw Error("Feed too large");
              rows = parseFeed(xml, source);
              if (!rows.length) throw Error("No recent articles");
            }
            const delay = source.startsWith("News search: ") ? 3600 : 1800;
            await db.query(
              "INSERT INTO news_sources(url,source,status,checked_at,updated_at,next_at,failures,etag,modified,data) VALUES($1,$2,'ok',now(),now(),now()+$3*interval '1 second',0,$4,$5,$6) ON CONFLICT(url) DO UPDATE SET status='ok',checked_at=now(),updated_at=now(),next_at=EXCLUDED.next_at,failures=0,etag=COALESCE(EXCLUDED.etag,news_sources.etag),modified=COALESCE(EXCLUDED.modified,news_sources.modified),data=EXCLUDED.data",
              [
                url,
                source,
                delay,
                r.headers.get("etag"),
                r.headers.get("last-modified"),
                JSON.stringify(rows),
              ],
            );
          } catch {
            const failures = (old?.failures || 0) + 1;
            await db.query(
              "INSERT INTO news_sources(url,source,status,checked_at,next_at,failures) VALUES($1,$2,$3,now(),now()+$4*interval '1 second',$5) ON CONFLICT(url) DO UPDATE SET status=EXCLUDED.status,checked_at=now(),next_at=EXCLUDED.next_at,failures=EXCLUDED.failures",
              [
                url,
                source,
                old ? "stale" : "unavailable",
                Math.min(21600, 1800 * 2 ** Math.min(failures - 1, 4)),
                failures,
              ],
            );
          }
        }
        fetched.push(...rows.map(cleanArticle));
      }
      for (let i = 0; i < sources.length; i += 2) {
        await Promise.allSettled(
          sources.slice(i, i + 2).map(async ([name, url]) => {
            await source(name, url);
            completed++;
          }),
        );
        await stage("Collecting feeds", { completed });
      }
      const dedup = new Map<string, any>();
      for (const a of fetched) {
        if (Date.now() - Date.parse(a.publishedAt) > 7 * 86400000) continue;
        const old = dedup.get(a.id);
        if (!old || a.excerpt.length > old.excerpt.length) dedup.set(a.id, a);
      }
      articles = [...dedup.values()].sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      );
      const stored = new Map(
        (
          await db.query(
            "SELECT id,data FROM news_articles WHERE published_at>now()-interval '7 days'",
          )
        ).rows.map((r) => [r.id, r.data]),
      );
      for (const a of articles) {
        const old = stored.get(a.id);
        if (
          old?.enrichmentAt &&
          Date.now() - Date.parse(old.enrichmentAt) < 4 * 3600000
        ) {
          a.enrichmentAt = old.enrichmentAt;
          if (old.excerpt?.length > a.excerpt.length) a.excerpt = old.excerpt;
        }
      }
      const enrich = articles
        .filter(
          (a) =>
            !a.discoveryOnly &&
            a.kind !== "community" &&
            a.excerpt.length < 600 &&
            (!a.enrichmentAt ||
              Date.now() - Date.parse(a.enrichmentAt) > 4 * 3600000) &&
            pool.some((p) => matchesPlayer(p, a)),
        )
        .sort(
          (a, b) =>
            Number(!s.players.some((p: any) => matchesPlayer(p, a))) -
            Number(!s.players.some((p: any) => matchesPlayer(p, b))),
        )
        .slice(0, 12);
      await stage("Reading supporting publisher excerpts", {
        completed: 0,
        total: enrich.length,
      });
      for (let i = 0; i < enrich.length; i += 2) {
        await Promise.allSettled(
          enrich.slice(i, i + 2).map(async (a) => {
            a.enrichmentAt = new Date().toISOString();
            try {
              const u = new URL(a.url);
              if (
                !/(^|\.)(espn\.com|yahoo\.com|cbssports\.com|fantasypros\.com|draftsharks\.com)$/.test(
                  u.hostname,
                )
              )
                return;
              const r = await fetch(u, {
                redirect: "error",
                signal: AbortSignal.timeout(12000),
              });
              if (!r.ok) return;
              const html = await r.text();
              if (html.length > 3000000) return;
              const excerpt = articleExcerpt(html);
              if (excerpt.length > a.excerpt.length) a.excerpt = excerpt;
            } catch {}
          }),
        );
        await stage("Reading supporting publisher excerpts", {
          completed: Math.min(i + 2, enrich.length),
        });
      }
      for (const a of articles) {
        const old = stored.get(a.id);
        if (old && (old.excerpt !== a.excerpt || old.title !== a.title))
          await db.query(
            "UPDATE player_events SET data=jsonb_set(data,'{supersededAt}',to_jsonb(now()::text)) WHERE article_id=$1 AND data->>'supersededAt' IS NULL",
            [a.id],
          );
        await db.query(
          "INSERT INTO news_articles VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,published_at=EXCLUDED.published_at",
          [a.id, a.publishedAt, JSON.stringify(a)],
        );
      }
      await stage("Matching players and extracting cited events", {
        completed: 0,
        total: pool.length,
      });
      const changed: any[] = [];
      for (const p of pool) {
        const matches = articles.filter((a) => matchesPlayer(p, a));
        const events = matches.flatMap((a) => eventsFor(p, a));
        for (const e of events) {
          await db.query(
            "UPDATE player_events SET data=jsonb_set(data,'{supersededAt}',to_jsonb(now()::text)) WHERE player_id=$1 AND article_id=$2 AND data->>'type'=$3 AND id<>$4 AND data->>'supersededAt' IS NULL",
            [p.id, e.articleId, e.type, e.id],
          );
          await db.query(
            "INSERT INTO player_events(id,player_id,article_id,published_at,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",
            [
              e.id,
              p.id,
              e.articleId,
              e.publishedAt,
              JSON.stringify({
                ...e,
                playerName: p.name,
                position: p.position,
              }),
            ],
          );
        }
        const ranked = events
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
          .slice(0, 4);
        if (ranked.length)
          changed.push({
            id: p.id,
            name: p.name,
            position: p.position,
            slot: p.slot,
            status: p.status,
            locked:
              p.locked ||
              !!(p.kickoffAt && Date.parse(p.kickoffAt) < Date.now()),
            bye: p.bye === s.week,
            available: /^(FA|W)/.test(p.availability),
            events: ranked,
          });
      }
      await stage("Preparing changed-evidence batches", {
        completed: pool.length,
      });
      let market: any = {
        updatedAt: new Date().toISOString(),
        status: "unavailable",
        games: [],
      };
      try {
        const r = await fetch(
          "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=" +
            s.season +
            "&seasontype=2&week=" +
            s.week,
          { signal: AbortSignal.timeout(12000) },
        );
        if (!r.ok) throw Error();
        const d = await r.json();
        market = {
          ...market,
          status: "ok",
          games: (d.events || []).map((e: any) => {
            const c = e.competitions?.[0],
              o = c?.odds?.[0];
            return {
              id: e.id,
              name: e.name,
              date: e.date,
              teams: c?.competitors?.map((t: any) => t.team.abbreviation) || [],
              spread: typeof o?.spread === "number" ? o.spread : null,
              total: typeof o?.overUnder === "number" ? o.overUnder : null,
              provider: o?.provider?.name || null,
              url: e.links?.[0]?.href || "https://www.espn.com/nfl/scoreboard",
              updatedAt: market.updatedAt,
            };
          }),
        };
      } catch {}
      let queued = 0;
      // Player-specific versions avoid reprocessing unchanged players when batch membership changes.
      for (const p of changed.sort(
        (a, b) => Number(!a.slot) - Number(!b.slot),
      )) {
        const version = hash(JSON.stringify([s.season, s.week, p]));
        await db.query(
          "UPDATE news_runs SET status='superseded' WHERE status IN ('queued','failed','analyzing') AND input->'players'->0->>'id'=$1 AND evidence_version<>$2",
          [p.id, version],
        );
        const inserted = await db.query(
          "INSERT INTO news_runs(evidence_version,priority,input) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
          [
            version,
            p.slot
              ? 0
              : targets.some((candidate: any) => candidate.id === p.id)
                ? 1
                : 2,
            JSON.stringify({
              players: [p],
              market: market.games
                .filter((g: any) =>
                  g.teams.includes(
                    pool.find((x) => x.id === p.id)?.team.toUpperCase(),
                  ),
                )
                .slice(0, 1),
            }),
          ],
        );
        queued += inserted.rowCount || 0;
      }
      const intelligence = (
        await db.query("SELECT data FROM intelligence WHERE snapshot_id=$1", [
          latest.id,
        ])
      ).rows[0]?.data;
      if (intelligence?.players) {
        for (const p of intelligence.players)
          p.headlines = articles
            .filter((a) => !a.discoveryOnly && matchesPlayer(p, a))
            .slice(0, 3);
        await db.query(
          "UPDATE intelligence SET data=jsonb_set(data,'{players}',$2) WHERE snapshot_id=$1",
          [latest.id, JSON.stringify(intelligence.players)],
        );
      }
      const sourcesNow = (
        await db.query(
          "SELECT source,status,updated_at,jsonb_array_length(data) AS articles FROM news_sources",
        )
      ).rows;
      health = Object.fromEntries(sourcesNow.map((r) => [r.source, r]));
      await stage("News collection complete", {
        collecting: false,
        lastCollectedAt: new Date().toISOString(),
        articleCount: articles.length,
        eventCount: changed.reduce((n, p) => n + p.events.length, 0),
        queued,
        market,
        completed: pool.length,
        total: pool.length,
      });
      await db.query(
        "DELETE FROM news_articles WHERE published_at<now()-interval '90 days'; DELETE FROM player_events WHERE published_at<now()-interval '90 days'; DELETE FROM news_searches WHERE requested_at<now()-interval '1 day'",
      );
    } catch {
      await stage("Collection failed; previous evidence retained", {
        collecting: false,
        error: "Collection failed",
      });
    } finally {
      collecting = false;
    }
  }
  app.get("/api/news", async (_q, r) => {
    r.json(await newsSummary(db));
  });
  app.post("/api/news/refresh", async (q, r) => {
    if (!(await isOwner(q)) || q.headers.origin !== process.env.APP_ORIGIN)
      return r.sendStatus(403);
    if (collecting) return r.status(202).json({ queued: true, reused: true });
    await db.query(
      "UPDATE news_runs SET status='queued',attempts=0,error=null WHERE status='failed'; UPDATE intelligence SET status=CASE WHEN data IS NULL THEN 'queued' ELSE 'ready' END,attempts=0,error=null WHERE status='failed' AND snapshot_id=(SELECT id FROM snapshots ORDER BY captured_at DESC LIMIT 1)",
    );
    void collect();
    r.status(202).json({ queued: true });
  });
  app.get("/api/players/:id/news", async (q, r) => {
    const page = Math.max(0, Math.min(100, Number(q.query.page) || 0)),
      limit = 20;
    const [events, history] = await Promise.all([
      db.query(
        "SELECT data,assessment,updated_at FROM player_events WHERE player_id=$1 AND data->>'supersededAt' IS NULL ORDER BY published_at DESC LIMIT $2 OFFSET $3",
        [q.params.id, limit + 1, page * limit],
      ),
      db.query(
        "SELECT created_at,w AS pick FROM qwen_history CROSS JOIN LATERAL jsonb_array_elements(data->'waivers') w WHERE w->>'id'=$1 ORDER BY created_at DESC LIMIT 60",
        [q.params.id],
      ),
    ]);
    r.json({
      page,
      hasMore: events.rows.length > limit,
      events: events.rows.slice(0, limit).map((e) => ({
        ...e.data,
        assessment: e.assessment,
        analyzedAt: e.updated_at,
      })),
      scoreHistory: history.rows,
    });
  });
  setTimeout(() => void collect(), 5000).unref();
  setInterval(() => void collect(), 1800000).unref();
  return {
    articles: () => articles.slice(0, 100),
    health: () => health,
    collect,
  };
}
