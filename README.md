# Fantasy Football Edge

An amber fantasy-football command center with a provider-independent snapshot API, local Yahoo browser imports, PostgreSQL history, lineup optimization and prospective forecast evaluation.

Production: https://fantasy.ramideltoro.com  
Documentation: https://github.com/ramideltoro/fantasy_football_edge_wiki

## Game-day tools

Overview surfaces the next useful actions. My Team contains source/risk lineup controls, the three-week planner, kickoff watch and FLEX contingencies. Waivers contains the immediate player comparison and multi-week pickup impact. Research contains the persistent forecast report card, weekly recaps and changes since the last visit. See the [game-plan guide](https://github.com/ramideltoro/fantasy_football_edge_wiki/blob/main/Game-Plan-and-Receipts.md).

The backend checks availability independently of the browser; optional browser notifications require an open page. Future-week planning uses labeled historical baselines. Qwen/combined accuracy accumulates prospectively from saved pregame forecasts.

## Develop

Requires Node.js 24+, PostgreSQL 17+, and Chrome on the importing Mac.

```sh
npm ci
npm test
npm run build
DATABASE_URL=postgres://user:password@localhost/edge npm start
# In another terminal for frontend development:
npm run dev
```

Set `APP_ORIGIN`, `DATABASE_URL`, `IMPORT_TOKEN` (at least 32 random characters), `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` in the server environment. Never commit credentials. Google callback is `/auth/google/callback`; only verified `rami.deltoro@gmail.com` can access private league sections.

## Local importer

Private configuration belongs in `~/Library/Application Support/FantasyFootballEdge/config.json`. It contains the portal endpoint, import token, Yahoo roster URL and explicitly selected read-only league pages. See the documentation repository for the schema. Yahoo cookies stay in the sibling `browser` directory.

```sh
npm run login:yahoo
npm run import -- --force
npm run install:importer
```

The launch agent checks every 15 minutes. Normal imports are throttled to hourly; imported kickoff windows and conservative football windows use 15 minutes. The Mac must be awake and online. A reauthentication requirement stops the run and preserves the last successful snapshot.

## Modules

- `src`: responsive React dashboard, Recharts graphs, roster and comparison views.
- `shared/model.ts`: versioned canonical schema and Yahoo DOM adapter.
- `shared/advice.ts`: lineup optimization with eligibility, bye, injury and kickoff locks.
- `shared/strategy.ts`, `gamePlanAudit.ts`, `gamePlanChanges.ts`: planning, risk preferences, forecast/decision receipts and material alerts.
- `server/gamePlanService.ts`: persistent source checks, schedule cache, pregame ledger and public game-plan API.
- `shared/analytics.ts`: privacy-aware league summaries and prospective forecast scoring.
- `server`: Express API, PostgreSQL persistence, Google OIDC, RSS headline ingestion.
- `importer`: local Playwright reader and macOS launch-agent installer.
- `tests`: validation, privacy, lineup and forecast tests.

## Deploy

Use `compose.yaml` with a private `.env` containing `DB_PASSWORD`, `IMPORT_TOKEN` and Google OAuth settings. Web binds only to VPS loopback port 3102; PostgreSQL has no published port. Put an HTTPS reverse proxy in front. Back up the database volume before upgrades. `GET /healthz` checks database connectivity.

All recommendations are advisory. Yahoo projections and imported Yahoo matchup probabilities are labeled as such. Accuracy appears only after a forecast was stored before game start and a completed result arrives. No Yahoo lineup, transaction or trade write operation is implemented.

## Yahoo authorized connection

Operations now includes an owner-only Connect Yahoo flow and a server-side API adapter. Configure `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, and a persistent random 32-byte hex `YAHOO_TOKEN_KEY`; callback `/auth/yahoo/callback`. Tokens are encrypted at rest. Successful API syncs run every 15 minutes and supersede browser uploads.

**Current rollout is blocked by Yahoo application permissions.** Live OAuth succeeds, but league discovery returns HTTP 403: “This application is not authorized to perform this action.” Existing browser sync remains active until an API snapshot succeeds. Do not remove the Mac app: its separate AI worker must also be migrated. See [authorized-sync status and verification](https://github.com/ramideltoro/fantasy_football_edge_wiki/blob/main/Yahoo-Authorized-Sync.md).
