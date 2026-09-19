import crypto from "node:crypto";
import type express from "express";
import type pg from "pg";
import { advice } from "../shared/advice.ts";
import {
  exchangeToken,
  openToken,
  sealToken,
  yahooGet,
  YahooError,
  yahooMessage,
} from "./yahooApi.ts";
import { discoverLeagues, fetchYahooSnapshot } from "./yahooSnapshot.ts";
export async function installYahoo(
  app: express.Express,
  db: pg.Pool,
  isOwner: (q: express.Request) => Promise<boolean>,
  sessionId: (q: express.Request) => string | undefined,
) {
  const origin = process.env.APP_ORIGIN || "http://localhost:3101";
  const clientId = process.env.YAHOO_CLIENT_ID || "",
    secret = process.env.YAHOO_CLIENT_SECRET || "",
    key = process.env.YAHOO_TOKEN_KEY || "";
  const configured = !!clientId && !!secret && /^[a-f0-9]{64}$/i.test(key);
  await db.query(
    `CREATE TABLE IF NOT EXISTS yahoo_connection(id integer PRIMARY KEY CHECK(id=1), token text, leagues jsonb NOT NULL DEFAULT '[]', league_key text, team_id text, status text NOT NULL DEFAULT 'disconnected', last_success timestamptz, next_run timestamptz, updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS yahoo_states(state text PRIMARY KEY,session_hash text NOT NULL,expires_at timestamptz NOT NULL);`,
  );
  const current = async () =>
    (await db.query("SELECT * FROM yahoo_connection WHERE id=1")).rows[0];
  const sid = (q: express.Request) =>
    crypto
      .createHash("sha256")
      .update(sessionId(q) || "")
      .digest("hex");
  const event = async (status: string, message: string) => {
    await db.query("INSERT INTO events(status,message) VALUES($1,$2)", [
      status,
      message,
    ]);
    await db.query(
      "INSERT INTO worker_health VALUES(1,now(),$1) ON CONFLICT(id) DO UPDATE SET seen_at=now(),state=$1",
      [{ status, message, provider: "yahoo-api" }],
    );
  };
  async function client(c: any) {
    if (!configured || !c?.token) throw new YahooError("reconnect");
    let token = openToken(c.token, key);
    if (token.expires_at < Date.now() + 60000) {
      token = await exchangeToken(
        { grant_type: "refresh_token", refresh_token: token.refresh_token },
        clientId,
        secret,
        token,
      );
      await db.query(
        "UPDATE yahoo_connection SET token=$1,updated_at=now() WHERE id=1",
        [sealToken(token, key)],
      );
    }
    return (path: string) => yahooGet(path, token.access_token);
  }
  let running = false;
  async function run(force = false) {
    if (running || !configured) return;
    running = true;
    let connection: pg.PoolClient;
    try {
      connection = await db.connect();
    } catch {
      running = false;
      return;
    }
    let locked = false;
    try {
      locked = (
        await connection.query(
          "SELECT pg_try_advisory_lock(69201918) AS locked",
        )
      ).rows[0].locked;
      if (!locked) return;
      const c = await current();
      if (
        !c?.token ||
        ["reconnect", "approval_required", "disconnected"].includes(c.status)
      )
        return;
      if (
        c.next_run &&
        Date.parse(c.next_run) > Date.now() &&
        (!force || c.status === "cooldown")
      )
        return;
      await db.query("UPDATE yahoo_connection SET status='syncing' WHERE id=1");
      await event(
        "running",
        "Yahoo API: retrieving authorized league data on the server.",
      );
      const get = await client(c),
        leagues = await discoverLeagues(get);
      await db.query("UPDATE yahoo_connection SET leagues=$1 WHERE id=1", [
        JSON.stringify(leagues),
      ]);
      const previous = (
        await db.query(
          "SELECT data FROM snapshots ORDER BY captured_at DESC LIMIT 1",
        )
      ).rows[0]?.data;
      const selected = c.league_key
        ? leagues.find((l) => l.key === c.league_key)
        : leagues.find(
            (l) => l.key.split(".").at(-1) === previous?.league?.id,
          ) || (leagues.length === 1 ? leagues[0] : null);
      if (!selected) {
        await db.query(
          "UPDATE yahoo_connection SET status='select_league',next_run=now()+interval '1 hour' WHERE id=1",
        );
        await event(
          "select_league",
          "Select a Yahoo league in Operations to begin syncing.",
        );
        return;
      }
      const s = await fetchYahooSnapshot(
        get,
        selected.key,
        c.team_id ||
          (selected.key.split(".").at(-1) === previous?.league?.id
            ? previous?.team?.id
            : undefined),
      );
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(s))
        .digest("hex");
      s.receivedAt = new Date().toISOString();
      await connection.query("BEGIN");
      const saved = await connection.query(
        "INSERT INTO snapshots(hash,captured_at,data) VALUES($1,$2,$3) RETURNING id",
        [hash, s.capturedAt, s],
      );
      await connection.query(
        "INSERT INTO forecasts(snapshot_id,data) VALUES($1,$2)",
        [
          saved.rows[0].id,
          {
            week: s.week,
            season: s.season,
            players: s.players
              .filter((p) => !p.locked && p.projected !== null)
              .map((p) => ({ id: p.id, projected: p.projected })),
            advice: advice(s),
          },
        ],
      );
      await connection.query(
        "UPDATE yahoo_connection SET league_key=$1,team_id=$2,status='connected',last_success=now(),next_run=now()+interval '15 minutes' WHERE id=1",
        [selected.key, s.team.id],
      );
      await connection.query(
        "UPDATE refresh_request SET fulfilled_at=now() WHERE id=1 AND requested_at<=$1",
        [s.capturedAt],
      );
      await connection.query("COMMIT");
      await event(
        "ok",
        `Yahoo API sync complete: ${s.players.length} roster players and ${s.available.length} available players. Runs on the server every 15 minutes.`,
      );
    } catch (e) {
      await connection.query("ROLLBACK").catch(() => {});
      const kind = e instanceof YahooError ? e.kind : "failed";
      await db.query(
        "UPDATE yahoo_connection SET status=$1,next_run=now()+($2 * interval '1 second') WHERE id=1",
        [kind, e instanceof YahooError ? e.retrySeconds : 900],
      );
      await event(kind, yahooMessage(kind));
    } finally {
      if (locked) await connection.query("SELECT pg_advisory_unlock(69201918)");
      connection.release();
      running = false;
    }
  }
  app.get("/api/yahoo/status", async (q, r) => {
    if (!(await isOwner(q))) return r.sendStatus(401);
    const c = await current();
    r.json({
      configured,
      status: c?.status || "disconnected",
      authorized: !!c?.token,
      lastSuccess: c?.last_success || null,
      nextRun: c?.next_run || null,
      leagues: c?.leagues || [],
      leagueKey: c?.league_key || null,
      message: yahooMessage(c?.status),
    });
  });
  app.get("/auth/yahoo", async (q, r) => {
    r.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    if (!(await isOwner(q))) return r.redirect("/auth/google");
    if (!configured)
      return r.status(503).send("Yahoo connection is not configured.");
    const state = crypto.randomBytes(32).toString("hex");
    await db.query(
      "DELETE FROM yahoo_states WHERE expires_at<now() OR session_hash=$1",
      [sid(q)],
    );
    await db.query(
      "INSERT INTO yahoo_states VALUES($1,$2,now()+interval '10 minutes')",
      [state, sid(q)],
    );
    r.redirect(
      "https://api.login.yahoo.com/oauth2/request_auth?" +
        new URLSearchParams({
          client_id: clientId,
          redirect_uri: origin + "/auth/yahoo/callback",
          response_type: "code",
          state,
        }),
    );
  });
  app.get("/auth/yahoo/callback", async (q, r) => {
    r.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer");
    if (!(await isOwner(q)) || typeof q.query.state !== "string")
      return r
        .status(400)
        .send(
          "Invalid or expired authorization. Return to Operations and connect again.",
        );
    const consumed = await db.query(
      "DELETE FROM yahoo_states WHERE state=$1 AND session_hash=$2 AND expires_at>now() RETURNING state",
      [q.query.state, sid(q)],
    );
    if (!consumed.rowCount)
      return r.status(400).send("Invalid or expired authorization.");
    if (q.query.error || typeof q.query.code !== "string")
      return r.redirect("/?yahoo=denied");
    if (running)
      return r
        .status(409)
        .send("Sync is running. Try connecting again shortly.");
    try {
      const t = await exchangeToken(
        {
          grant_type: "authorization_code",
          code: q.query.code,
          redirect_uri: origin + "/auth/yahoo/callback",
        },
        clientId,
        secret,
      );
      await db.query(
        "INSERT INTO yahoo_connection(id,token,status,next_run) VALUES(1,$1,'authorized',now()) ON CONFLICT(id) DO UPDATE SET token=$1,status='authorized',next_run=now(),updated_at=now()",
        [sealToken(t, key)],
      );
      void run().catch(() => {});
      r.redirect("/?yahoo=authorized");
    } catch {
      r.redirect("/?yahoo=authfailed");
    }
  });
  app.post("/api/yahoo/league", async (q, r) => {
    if (q.headers.origin !== origin || !(await isOwner(q)))
      return r.sendStatus(403);
    if (running)
      return r
        .status(409)
        .json({ error: "Sync is running. Try again shortly." });
    const c = await current();
    if (!c?.leagues.some((l: any) => l.key === q.body.key))
      return r.status(400).json({ error: "Select an authorized league." });
    await db.query(
      "UPDATE yahoo_connection SET league_key=$1,team_id=null,status='authorized',next_run=now() WHERE id=1",
      [q.body.key],
    );
    void run().catch(() => {});
    r.json({ ok: true });
  });
  app.post("/api/yahoo/disconnect", async (q, r) => {
    if (q.headers.origin !== origin || !(await isOwner(q)))
      return r.sendStatus(403);
    if (running)
      return r
        .status(409)
        .json({ error: "Sync is running. Try again shortly." });
    await db.query("DELETE FROM yahoo_connection WHERE id=1");
    await db.query("DELETE FROM yahoo_states WHERE session_hash=$1", [sid(q)]);
    r.json({ ok: true });
  });
  // Register before the legacy queue route. Once authorized, requests use the server.
  app.post("/api/import/request", async (q, r, next) => {
    const c = await current();
    if (
      !c?.token ||
      (!c.last_success &&
        ["approval_required", "reconnect", "failed", "select_league"].includes(
          c.status,
        ))
    )
      return next();
    if (q.headers.origin !== origin || !(await isOwner(q)))
      return r.sendStatus(403);
    if (["approval_required", "reconnect", "select_league"].includes(c.status))
      return r.status(409).json({ error: yahooMessage(c.status) });
    if (c.status === "cooldown" && Date.parse(c.next_run) > Date.now())
      return r.status(429).json({ error: yahooMessage("cooldown") });
    if (c.last_success && Date.now() - Date.parse(c.last_success) < 60000)
      return r.json({
        ok: true,
        message: "Yahoo data was synced less than a minute ago.",
      });
    await db.query(
      "INSERT INTO refresh_request VALUES(1,now(),null) ON CONFLICT(id) DO UPDATE SET requested_at=now(),fulfilled_at=null",
    );
    void run(true).catch(() => {});
    r.json({
      ok: true,
      message: "Yahoo refresh started on the server. Your Mac is not required.",
    });
  });
  app.post(
    ["/api/import/snapshot", "/api/import/heartbeat", "/api/import/status"],
    async (_q, r, next) => {
      const c = await current();
      if (c?.last_success && c?.token)
        return r.status(409).json({
          error: "Yahoo API sync is active; the browser importer is retired.",
        });
      next();
    },
  );
  setInterval(() => void run().catch(() => {}), 60000).unref();
  setTimeout(() => void run().catch(() => {}), 5000).unref();
}
