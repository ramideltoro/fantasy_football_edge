import type { Express, Request } from "express";
import type { Pool } from "pg";
import { fetchOddsBoard } from "./vegasInsider.ts";
import { ODDS_INTERVAL, type OddsState } from "../shared/sportsbook.ts";

export async function installSportsbook(
  app: Express,
  db: Pool,
  authorized: (q: Request) => Promise<boolean>,
) {
  await db.query(`CREATE TABLE IF NOT EXISTS sportsbook_state (
    id integer PRIMARY KEY CHECK(id=1), board jsonb, attempted_at timestamptz,
    next_at timestamptz NOT NULL DEFAULT now(), error text, failures integer NOT NULL DEFAULT 0
  ); INSERT INTO sportsbook_state(id) VALUES(1) ON CONFLICT DO NOTHING;
  CREATE TABLE IF NOT EXISTS sportsbook_history (
    id bigserial PRIMARY KEY, fetched_at timestamptz NOT NULL, data jsonb NOT NULL
  );`);
  async function state(): Promise<OddsState> {
    const {
      rows: [row],
    } = await db.query("SELECT * FROM sportsbook_state WHERE id=1");
    return {
      board: row.board,
      nextAt: row.next_at?.toISOString() || null,
      attemptedAt: row.attempted_at?.toISOString() || null,
      error: row.error,
    };
  }
  let running = false;
  async function refresh(force = false) {
    if (running) return;
    running = true;
    const c = await db.connect().catch(() => {
      running = false;
      return null;
    });
    if (!c) return;
    let acquired = false;
    try {
      acquired = (
        await c.query("SELECT pg_try_advisory_lock(78194623) AS locked")
      ).rows[0].locked;
      if (!acquired) return;
      const row = (
        await c.query("SELECT next_at FROM sportsbook_state WHERE id=1")
      ).rows[0];
      if (!force && new Date(row.next_at).getTime() > Date.now()) return;
      await c.query(
        "UPDATE sportsbook_state SET attempted_at=now() WHERE id=1",
      );
      const board = await fetchOddsBoard();
      await c.query("BEGIN");
      await c.query(
        "UPDATE sportsbook_state SET board=$1,next_at=$2,error=NULL,failures=0 WHERE id=1",
        [
          JSON.stringify(board),
          new Date(Date.parse(board.fetchedAt) + ODDS_INTERVAL),
        ],
      );
      await c.query(
        "INSERT INTO sportsbook_history(fetched_at,data) VALUES($1,$2)",
        [board.fetchedAt, JSON.stringify(board)],
      );
      await c.query(
        "DELETE FROM sportsbook_history WHERE fetched_at < now()-interval '30 days'",
      );
      await c.query("COMMIT");
      console.log(
        `VegasInsider refreshed: ${board.props.length} player quotes, ${board.games.length} game quotes, ${board.books.length} books`,
      );
    } catch (e) {
      await c.query("ROLLBACK").catch(() => {});
      // Keep the last complete board; a failed source page must never replace it with a partial scrape.
      const message =
        e instanceof Error &&
        /^(VegasInsider HTTP \d+|Missing |Duplicate |Unaligned |No usable |NFL board week missing|Mixed seasons|Source page exceeded|Empty source)/.test(
          e.message,
        )
          ? e.message.slice(0, 160)
          : "VegasInsider refresh failed; retry scheduled.";
      await c
        .query(
          "UPDATE sportsbook_state SET error=$1,failures=failures+1,next_at=now()+CASE WHEN failures>=3 THEN interval '1 hour' ELSE interval '15 minutes' END WHERE id=1",
          [message],
        )
        .catch(() => {});
      console.error("VegasInsider refresh failed; previous snapshot retained");
    } finally {
      if (acquired)
        await c.query("SELECT pg_advisory_unlock(78194623)").catch(() => {});
      c.release();
      running = false;
    }
  }
  app.get("/api/sportsbook", async (_q, r) => {
    const s = await state(),
      b = s.board;
    r.json({
      source: "VegasInsider",
      intervalHours: 6,
      fetchedAt: b?.fetchedAt || null,
      nextAt: s.nextAt,
      attemptedAt: s.attemptedAt,
      error: s.error,
      refreshing: running,
      stale:
        !b || Date.now() - Date.parse(b.fetchedAt) > ODDS_INTERVAL + 5 * 60_000,
      week: b?.week,
      season: b?.season,
      books: b?.books || [],
      pickem: b?.pickem || [],
      players: b ? new Set(b.props.map((q) => q.player)).size : 0,
      playerQuotes: b?.props.length || 0,
      games: b ? new Set(b.games.map((q) => q.eventId)).size : 0,
      gameQuotes: b?.games.length || 0,
    });
  });
  app.get("/api/sportsbook/board", async (_q, r) => r.json(await state()));
  app.post("/api/sportsbook/refresh", async (q, r) => {
    if (!(await authorized(q)))
      return r.status(403).json({ error: "Owner access required" });
    // The normal due check makes external heartbeat requests idempotent.
    void refresh(q.body?.force === true);
    r.status(202).json({ status: "Refresh check queued" });
  });
  setTimeout(() => void refresh(), 1000).unref();
  setInterval(() => void refresh(), 60_000).unref();
  return { state, refresh };
}
