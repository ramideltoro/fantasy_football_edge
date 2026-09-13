import { installIntelligence } from "./intelligence.ts";
import { unpackSnapshot } from "../shared/importPackage.ts";
import { completeYahooSnapshot } from "../shared/importCompleteness.ts";
import { depthCharts } from "./depth.ts";
import { calibratedForecast } from "../shared/forecast.ts";
import { leagueOverview, accuracy } from "../shared/analytics.ts";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pg from "pg";
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { XMLParser } from "fast-xml-parser";
import {
  Snapshot,
  publicSnapshot,
  type SnapshotData,
} from "../shared/model.ts";
import { advice } from "../shared/advice.ts";
const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const origin = process.env.APP_ORIGIN || "http://localhost:3101";
const owner = "rami.deltoro@gmail.com";
const secure = origin.startsWith("https:");
await db.query(
  `CREATE TABLE IF NOT EXISTS snapshots(id bigserial primary key,hash text unique not null,captured_at timestamptz not null,data jsonb not null);CREATE TABLE IF NOT EXISTS forecasts(snapshot_id bigint references snapshots(id),created_at timestamptz default now(),data jsonb not null);CREATE TABLE IF NOT EXISTS sessions(id text primary key,data jsonb not null,expires_at timestamptz not null);CREATE TABLE IF NOT EXISTS events(id bigserial primary key,created_at timestamptz default now(),status text not null,message text not null);`,
);
await db.query(
  "CREATE TABLE IF NOT EXISTS refresh_request(id integer primary key CHECK(id=1), requested_at timestamptz not null, fulfilled_at timestamptz)",
);
await db.query(
  "CREATE TABLE IF NOT EXISTS worker_health(id integer primary key CHECK(id=1),seen_at timestamptz not null,state jsonb not null)",
);
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "font-src": ["'self'"],
      },
    },
  }),
);
app.use("/api", rateLimit({ windowMs: 60000, limit: 120 }));
app.use("/auth", rateLimit({ windowMs: 60000, limit: 20 }));
app.use(express.json({ limit: "8mb" }));
app.use("/api", (_q, r, n) => {
  r.set("Cache-Control", "no-store");
  n();
});
const cookie = (q: express.Request) =>
  q.headers.cookie
    ?.split("; ")
    .find((x) => x.startsWith("edge_session="))
    ?.slice(13);
async function session(q: express.Request) {
  const id = cookie(q);
  if (!id) return null;
  return (
    await db.query(
      "SELECT data FROM sessions WHERE id=$1 AND expires_at>now()",
      [id],
    )
  ).rows[0]?.data;
}
const tokenOK = (q: express.Request) => {
  const expected = process.env.IMPORT_TOKEN || "";
  const got = q.headers.authorization?.replace(/^Bearer /, "") || "";
  return (
    expected.length >= 32 &&
    Buffer.byteLength(expected) === Buffer.byteLength(got) &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))
  );
};
app.get("/api/depth", async (_q, r) => {
  try {
    r.json(await depthCharts());
  } catch {
    r.status(503).json({ error: "Depth charts unavailable" });
  }
});
app.get("/healthz", async (_q, r) => {
  await db.query("SELECT 1");
  r.json({ status: "ok" });
});
app.get("/api/auth", async (q, r) =>
  r.json({
    owner: (await session(q))?.email === owner,
    loginConfigured:
      !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
  }),
);
app.get("/auth/google", async (_q, r) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return r
      .status(503)
      .send("Owner Google login needs OAuth application configuration.");
  const id = crypto.randomBytes(32).toString("hex"),
    nonce = crypto.randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '10 minutes')",
    [id, { nonce }],
  );
  r.cookie("edge_session", id, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 600000,
  });
  r.redirect(
    "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: origin + "/auth/google/callback",
        response_type: "code",
        scope: "openid email",
        state: nonce,
        nonce,
        prompt: "select_account",
      }),
  );
});
const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
app.get("/auth/google/callback", async (q, r) => {
  const s = await session(q);
  if (
    !s?.nonce ||
    q.query.state !== s.nonce ||
    typeof q.query.code !== "string"
  )
    return r.status(400).send("Invalid or expired login.");
  await db.query("DELETE FROM sessions WHERE id=$1", [cookie(q)]);
  try {
    const reply = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: q.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: origin + "/auth/google/callback",
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!reply.ok) throw Error();
    const t = await reply.json();
    const { payload } = await jwtVerify(t.id_token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    if (
      payload.nonce !== s.nonce ||
      payload.email_verified !== true ||
      payload.email !== owner
    )
      return r.status(403).send("This account is not the portal owner.");
    const id = crypto.randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')",
      [id, { email: owner }],
    );
    r.cookie("edge_session", id, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 604800000,
    });
    r.redirect("/");
  } catch {
    r.status(400).send(
      "Google login failed. Check the registered callback and try again.",
    );
  }
});
app.post("/api/logout", async (q, r) => {
  if (q.headers.origin !== origin) return r.sendStatus(403);
  await db.query("DELETE FROM sessions WHERE id=$1", [cookie(q) || ""]);
  r.clearCookie("edge_session");
  r.json({ ok: true });
});
app.post("/api/import/request", async (q, r) => {
  if (q.headers.origin !== origin || (await session(q))?.email !== owner)
    return r.sendStatus(403);
  await db.query(
    "INSERT INTO refresh_request VALUES(1,now(),null) ON CONFLICT(id) DO UPDATE SET requested_at=CASE WHEN refresh_request.fulfilled_at IS NULL THEN refresh_request.requested_at ELSE now() END, fulfilled_at=null",
  );
  await db.query(
    "INSERT INTO events(status,message) VALUES('queued','Owner requested a Yahoo refresh.')",
  );
  r.json({
    ok: true,
    message:
      "Refresh queued. Your Mac checks within one minute while awake. Yahoo cooldowns still apply.",
  });
});
app.get("/api/import/request", async (q, r) => {
  if (!tokenOK(q) && (await session(q))?.email !== owner)
    return r.sendStatus(401);
  const row = (
    await db.query(
      "SELECT requested_at,fulfilled_at FROM refresh_request WHERE id=1",
    )
  ).rows[0];
  r.json({
    pending: !!row && !row.fulfilled_at,
    requestedAt: row?.requested_at || null,
    completedAt: row?.fulfilled_at || null,
  });
});
app.post("/api/import/heartbeat", async (q, r) => {
  if (!tokenOK(q)) return r.sendStatus(401);
  const state = {
    status: String(q.body.status || "idle").slice(0, 40),
    message: String(q.body.message || "").slice(0, 200),
    retryAt: typeof q.body.retryAt === "string" ? q.body.retryAt : null,
  };
  await db.query(
    "INSERT INTO worker_health VALUES(1,now(),$1) ON CONFLICT(id) DO UPDATE SET seen_at=now(),state=$1",
    [state],
  );
  r.json({ ok: true });
});
app.get("/api/import/operations", async (q, r) => {
  if ((await session(q))?.email !== owner) return r.sendStatus(401);
  const [worker, request, logs] = await Promise.all([
    db.query("SELECT seen_at,state FROM worker_health WHERE id=1"),
    db.query(
      "SELECT requested_at,fulfilled_at FROM refresh_request WHERE id=1",
    ),
    db.query(
      "SELECT id,created_at,status,message FROM events ORDER BY id DESC LIMIT 150",
    ),
  ]);
  r.json({
    worker: worker.rows[0] || null,
    request: request.rows[0] || null,
    logs: logs.rows,
  });
});
app.post("/api/import/status", async (q, r) => {
  if (!tokenOK(q)) return r.sendStatus(401);
  await db.query(
    "INSERT INTO worker_health VALUES(1,now(),$1) ON CONFLICT(id) DO UPDATE SET seen_at=now(),state=$1",
    [
      {
        status: String(q.body.status || "failed").slice(0, 40),
        message: String(q.body.message || "").slice(0, 200),
      },
    ],
  );
  const status = [
    "ok",
    "failed",
    "authentication_required",
    "running",
    "queued",
  ].includes(q.body.status)
    ? q.body.status
    : "failed";
  await db.query("INSERT INTO events(status,message) VALUES($1,$2)", [
    status,
    String(q.body.message || "").slice(0, 200),
  ]);
  r.json({ ok: true });
});
app.post(
  "/api/import/snapshot",
  express.raw({ type: "application/zip", limit: "8mb" }),
  async (q, r) => {
    if (!tokenOK(q)) return r.sendStatus(401);
    let payload = q.body;
    if (q.is("application/zip")) {
      try {
        payload = await unpackSnapshot(q.body);
      } catch {
        return r.status(400).json({ error: "Invalid ZIP snapshot package" });
      }
    }
    const parsed = Snapshot.safeParse(payload);
    if (!parsed.success)
      return r.status(400).json({ error: "Invalid snapshot schema" });
    const s = parsed.data;
    delete s.receivedAt;
    if (!completeYahooSnapshot(s))
      return r.status(422).json({
        error:
          "Incomplete Yahoo import. All league and player groups must finish; last complete data retained.",
      });
    if (
      Date.parse(s.capturedAt) > Date.now() + 300000 ||
      Date.parse(s.capturedAt) < Date.now() - 7 * 86400000
    )
      return r.status(400).json({ error: "Invalid capture time" });
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(s))
      .digest("hex");
    s.receivedAt = new Date().toISOString();
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const result = await c.query(
        "INSERT INTO snapshots(hash,captured_at,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id",
        [hash, s.capturedAt, s],
      );
      if (result.rows.length) {
        await c.query("INSERT INTO forecasts(snapshot_id,data) VALUES($1,$2)", [
          result.rows[0].id,
          {
            week: s.week,
            season: s.season,
            players: s.players
              .filter(
                (p) =>
                  !p.locked &&
                  (!p.kickoffAt || Date.parse(p.kickoffAt) > Date.now()),
              )
              .map((p) => ({ id: p.id, projected: p.projected })),
            advice: advice(s),
          },
        ]);
        await c.query("INSERT INTO events(status,message) VALUES($1,$2)", [
          "ok",
          `Complete snapshot saved: ${s.players.length} roster players, ${s.available.length} pool players. Data captured ${s.capturedAt}.`,
        ]);
      }
      if (result.rows.length)
        await c.query(
          "UPDATE refresh_request SET fulfilled_at=now() WHERE id=1 AND fulfilled_at IS NULL AND requested_at <= $1",
          [s.capturedAt],
        );
      await c.query("COMMIT");
      r.json({ ok: true, duplicate: !result.rows.length });
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  },
);
app.get("/api/dashboard", async (q, r) => {
  const row = (
    await db.query(
      "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
    )
  ).rows[0];
  const privateView = (await session(q))?.email === owner;
  if (!row)
    return r.json({
      snapshot: null,
      owner: privateView,
      history: [],
      advice: null,
      events: [],
      news: newsCache,
    });
  const s = row.data as SnapshotData;
  const historicalRows = (
    await db.query(
      "SELECT data FROM snapshots WHERE data->>'season'=$1 AND data->'team'->>'id'=$2 AND data->'league'->>'id'=$3 ORDER BY captured_at DESC LIMIT 1000",
      [String(s.season), s.team.id, s.league.id],
    )
  ).rows;
  const history = historicalRows.reverse().map((x) => ({
    capturedAt: x.data.capturedAt,
    week: x.data.week,
    players: x.data.players.map((p: any) => ({
      id: p.id,
      actual: p.actual,
      projected: p.projected,
      startPct: p.startPct,
      rosterPct: p.rosterPct,
    })),
  }));
  r.json({
    snapshot: privateView ? s : publicSnapshot(s),
    owner: privateView,
    advice: advice(s),
    history,
    league: leagueOverview(s, privateView),
    accuracy: accuracy(historicalRows.map((x) => x.data)),
    calibrated: calibratedForecast(
      s.players,
      accuracy(historicalRows.map((x) => x.data)),
    ),
    events: privateView
      ? (
          await db.query(
            "SELECT created_at,status,message FROM events ORDER BY id DESC LIMIT 50",
          )
        ).rows
      : [],
    news: newsCache,
    sources: sourceHealth,
  });
});
app.get("/api/players/:id/history", async (q, r) => {
  const latest = (
    await db.query(
      "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
    )
  ).rows[0]?.data;
  if (!latest) return r.json([]);
  const rows = (
    await db.query(
      `SELECT captured_at,data->>'week' AS week,p.item FROM snapshots CROSS JOIN LATERAL jsonb_array_elements((data->'players')||(data->'available')) AS p(item) WHERE data->>'season'=$1 AND data->'team'->>'id'=$2 AND data->'league'->>'id'=$3 AND p.item->>'id'=$4 ORDER BY captured_at DESC LIMIT 1000`,
      [String(latest.season), latest.team.id, latest.league.id, q.params.id],
    )
  ).rows;
  r.json(
    rows
      .reverse()
      .filter(
        (x, i, a) =>
          a.findIndex(
            (y) => String(y.captured_at) === String(x.captured_at),
          ) === i,
      )
      .map((x) => ({
        capturedAt: x.captured_at,
        week: Number(x.week),
        projected: x.item.projected,
        actual: x.item.actual,
        rosterPct: x.item.rosterPct,
        startPct: x.item.startPct,
      })),
  );
});
let newsCache: {
  source: string;
  title: string;
  url: string;
  publishedAt: string;
}[] = [];
const sourceHealth: Record<
  string,
  { updatedAt: string; status: string; articles: number }
> = {};
async function news() {
  const parser = new XMLParser();
  const feeds = [
    ["ESPN", "https://www.espn.com/espn/rss/nfl/news"],
    ["Yahoo Sports", "https://sports.yahoo.com/nfl/rss.xml"],
  ];
  const articles = [];
  for (const [source, url] of feeds) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw Error("Feed unavailable");
      const items = parser.parse(await r.text()).rss?.channel?.item;
      const feedItems = (
        Array.isArray(items) ? items : items ? [items] : []
      ).slice(0, 20);
      if (!feedItems.length) throw Error("Empty feed");
      for (const item of feedItems) {
        if (
          typeof item.title !== "string" ||
          typeof item.link !== "string" ||
          !item.link.startsWith("https://")
        )
          continue;
        articles.push({
          source,
          title: item.title.replace(/<[^>]*>/g, "").slice(0, 220),
          url: item.link,
          publishedAt: item.pubDate || "",
        });
      }
      sourceHealth[source] = {
        updatedAt: new Date().toISOString(),
        status: "ok",
        articles: feedItems.length,
      };
    } catch {
      articles.push(...newsCache.filter((n) => n.source === source));
      sourceHealth[source] = {
        updatedAt: sourceHealth[source]?.updatedAt || "",
        status: "failed",
        articles: newsCache.filter((n) => n.source === source).length,
      };
    }
  }
  newsCache = articles
    .filter(
      (x, i, a) =>
        a.findIndex((y) => y.url === x.url || y.title === x.title) === i,
    )
    .sort(
      (a, b) =>
        (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0),
    )
    .slice(0, 40);
}
void news();
setInterval(() => void news(), 3600000).unref();
setInterval(
  () => void db.query("DELETE FROM sessions WHERE expires_at<now()"),
  3600000,
).unref();
await installIntelligence(
  app,
  db,
  tokenOK,
  async (q) => (await session(q))?.email === owner,
  () => newsCache,
);
app.use(express.static("dist", { maxAge: "1h" }));
app.get("/{*path}", (_q, r) => r.sendFile("index.html", { root: "dist" }));
app.use(
  (
    e: any,
    _q: express.Request,
    r: express.Response,
    _n: express.NextFunction,
  ) => {
    console.error("Request failed", e.code || "internal");
    r.status(500).json({ error: "Request failed. Please retry." });
  },
);
app.listen(
  Number(process.env.PORT || 3101),
  process.env.HOST || "127.0.0.1",
  () => console.log("Edge v2 ready"),
);
