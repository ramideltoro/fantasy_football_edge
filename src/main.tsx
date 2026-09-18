import { recordSortValue } from "../shared/tableSort";
import { LineupRecommendations } from "./LineupRecommendations";
import { SortableTable } from "./SortableTable";
import {
  PlayerProvider,
  PlayerChartTick,
  yahooPoints,
  PlayerTable,
  PlayerLink,
  PlayerText,
  HealthBoard,
  usePlayers,
} from "./PlayerExperience";
import { waiverShortlist } from "../shared/shortlist";
import {
  NewsHub,
  NewsOperations,
  DecisionOverview,
  PlayerNews,
} from "./NewsHub";
import { AnalysisRefresh } from "./AnalysisRefresh";
import { ProjectionValue, ProjectionDetails } from "./ProjectionValue";
import { AIInsights } from "./AIInsights";
import { ImportOperations } from "./ImportOperations";
import { useNflDepth, nflRole } from "./nflRole";
import { WaiverList } from "./WaiverList";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  LabelList,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  Shield,
  Users,
  ChartNoAxesCombined,
  RefreshCw,
  Search,
  Lock,
  ChevronRight,
  Zap,
} from "lucide-react";
import type { PlayerData } from "../shared/model";
import { Scenario } from "./Scenario";
import "./style.css";
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const groups: Record<string, string[]> = {
  Overview: ["Overview"],
  "My Team": ["My roster", "Recommendations", "AI insights"],
  Waivers: ["Waiver list"],
  Research: ["News & trends"],
  League: ["League"],
  Operations: ["Yahoo refresh", "Import health"],
};
const labels: Record<string, string> = {
  "My roster": "Roster",
  Recommendations: "Lineup & decisions",
  "AI insights": "Team analysis",
  "Waiver list": "Waivers",
  "News & trends": "News intelligence",
  "Yahoo refresh": "Worker activity",
  "Import health": "Import health",
};
function Dashboard({
  onPlayers,
}: {
  onPlayers: (players: PlayerData[]) => void;
}) {
  const { open: openPlayers } = usePlayers();
  const setSelected = (p: PlayerData | null) => p && openPlayers([p.id]);
  const refreshing = useRef(false);
  const [importState, setImportState] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [d, setD] = useState<any>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Overview");
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw Error();
      const body = await r.json();
      setD(body);
      onPlayers([
        ...(body.snapshot?.players || []),
        ...(body.snapshot?.available || []),
      ]);
      if (body.owner) {
        const request = await fetch("/api/import/request");
        if (request.ok) {
          const state = await request.json();
          const ops = await fetch("/api/import/operations");
          if (ops.ok) setImportState(await ops.json());
          setRequestMessage(
            state.pending
              ? "Refresh pending. Your Mac checks every minute while awake; Yahoo cooldowns still apply."
              : state.requestedAt
                ? "Last requested refresh completed at " +
                  new Date(state.completedAt).toLocaleString()
                : "",
          );
        }
      }
      setError("");
    } catch {
      setError("Unable to load your dashboard. Try refreshing.");
    } finally {
      refreshing.current = false;
    }
  }
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, []);
  const s = d?.snapshot,
    players: PlayerData[] = s?.players || [],
    pool: PlayerData[] = useMemo(
      () => [
        ...new Map(
          [...(s?.available || []), ...players].map((p) => [p.id, p]),
        ).values(),
      ],
      [s],
    ),
    starters = players.filter(
      (p) => !["BN", "IR", "IR+", "NA"].includes(p.slot),
    ),
    sum = (key: "actual" | "projected") =>
      starters.reduce((a, p) => a + (p[key] || 0), 0),
    a = d?.advice,
    changes = a?.changes || [],
    name = (id: string) => pool.find((p) => p.id === id)?.name || id;
  return (
    <div className="app">
      <aside>
        <a className="brand" href="/">
          <span className="brand-icon">
            <Zap size={24} />
          </span>
          <span>
            FANTASY FOOTBALL
            <b>
              EDGE<span>●</span>
            </b>
          </span>
        </a>
        <div className="nav-label">WELCOME TO THE BIG LEAGUES</div>
        <nav>
          {Object.entries(groups).map(([group, items], i) => (
            <button
              key={group}
              className={
                (items.includes(tab) ? "active " : "") +
                (group === "Operations" ? "operations-nav" : "")
              }
              onClick={() => setTab(items[0])}
            >
              {
                [
                  <Activity />,
                  <Users />,
                  <Zap />,
                  <ChartNoAxesCombined />,
                  <Shield />,
                  <RefreshCw />,
                ][i]
              }
              {group}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="dot" /> TALK IS CHEAP. POINTS AREN’T.
          <p>Bring the noise. Bring the receipts.</p>
          <a href="/auth/google">
            <Lock size={13} />
            {d?.owner ? "Owner session active" : "Owner sign in"}
          </a>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">SUNDAY IS A CONTACT SPORT</span>
            <h1>
              {Object.entries(groups).find(([, items]) =>
                items.includes(tab),
              )?.[0] || tab}
            </h1>
          </div>
          <div className="header-right">
            {d?.owner ? (
              <button
                className="icon"
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  await refresh();
                }}
                aria-label="Sign out of owner account"
              >
                <Lock size={16} />
              </button>
            ) : (
              <a
                className="icon"
                href="/auth/google"
                aria-label="Owner sign in"
              >
                <Lock size={16} />
              </a>
            )}
            <span className="season">
              {s ? `${s.season} SEASON · WEEK ${s.week}` : "FANTASY FOOTBALL"}
            </span>
            <button
              className="icon"
              onClick={refresh}
              aria-label="Reload dashboard"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>
        {s && (
          <div className="game-day-banner">
            <span className="game-day-kicker">
              WEEK {s.week} · THE HEAT IS ON
            </span>
            <strong>
              {tab === "My roster"
                ? "BENCH THE DOUBT."
                : tab === "Waiver list"
                  ? "GO FIND A MENACE."
                  : tab === "News & trends"
                    ? "CHECK THE RECEIPTS."
                    : "BRING THE NOISE."}
            </strong>
            <span>
              {tab === "My roster"
                ? "Big names are cute. Big points pay the rent."
                : tab === "Waiver list"
                  ? "One manager’s leftovers. Your next victory lap."
                  : "Your league called. They’d like you to stop getting better."}
            </span>
            <Zap className="banner-zap" aria-hidden="true" />
          </div>
        )}
        {s && (
          <AnalysisRefresh
            owner={d.owner}
            snapshotAt={s.capturedAt}
            onOperations={() => setTab("Yahoo refresh")}
          />
        )}
        <div className="section-tabs">
          {Object.values(groups)
            .find((items) => items.includes(tab))
            ?.filter(
              () =>
                Object.values(groups).find((items) => items.includes(tab))!
                  .length > 1,
            )
            .map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
              >
                {labels[t] || t}
              </button>
            ))}
        </div>
        {error && <div className="notice">{error}</div>}
        {!d && !error ? (
          <div className="loading">Taping ankles. Loading the squad…</div>
        ) : !s ? (
          <section className="hero">
            <span className="eyebrow">READY FOR YOUR LEAGUE</span>
            <h2>
              Your next advantage
              <br />
              starts with real data.
            </h2>
            <p>
              The dashboard is ready. Connect the Mac importer to bring in your
              Yahoo roster, projections and league pages.
            </p>
            <a className="primary" href="/auth/google">
              Owner sign in <ArrowUpRight size={16} />
            </a>
          </section>
        ) : (
          <>
            <div className="context">
              <span>
                <span className={"dot " + (a.stale ? "warn" : "")} />
                {s.team.name}
              </span>
              <span>
                Imported {new Date(s.capturedAt).toLocaleString()}{" "}
                {a.stale && "· Refresh overdue"}
              </span>
            </div>
            {a.stale && (
              <div className="notice">
                This snapshot is over two hours old. Refresh Yahoo data before
                acting on a recommendation.
              </div>
            )}
            {tab === "Overview" && (
              <>
                <HealthBoard players={players} />
                <section className="panel matchup-commentary">
                  <span className="eyebrow">
                    WEEK {s.week} · THE LOCKER-ROOM READ
                  </span>
                  <h2>Here’s how this week could go.</h2>
                  {d.matchupCommentary?.map((p: string, i: number) => (
                    <p key={i}>
                      <PlayerText text={p} />
                    </p>
                  ))}
                  <small>
                    Based on current Yahoo matchup totals, your lineup and
                    imported health flags. Forecasts can change.
                  </small>
                </section>
                <div className="metrics">
                  <Metric
                    label="Points so far"
                    value={fmt(sum("actual"))}
                    note="Imported starter totals"
                  />
                  <button
                    className="gain-link"
                    onClick={() => setTab("Recommendations")}
                    aria-label="View potential lineup gain and required changes"
                  >
                    <Metric
                      label="Potential lineup gain"
                      value={
                        a.delta == null ? "—" : `+${fmt(Math.max(0, a.delta))}`
                      }
                      note={
                        a.complete
                          ? "Eligible, unlocked positions"
                          : "Missing eligible projections"
                      }
                    />
                  </button>
                  <Metric
                    label="Roster watch"
                    value={String(a.alerts.length)}
                    note="Injury statuses and bye weeks"
                  />
                  <Metric
                    label="Players tracked"
                    value={String(pool.length)}
                    note="Roster + imported player pool"
                  />
                </div>
                <div className="grid">
                  <Panel
                    title="Who’s carrying the cooler?"
                    subtitle="Current week · Yahoo projections and scored actuals. Unplayed games have no actual score yet."
                  >
                    <ResponsiveContainer width="100%" height={290}>
                      <BarChart
                        className="cooler-chart"
                        margin={{ top: 28, right: 12, bottom: 8, left: 0 }}
                        data={starters.map((p) => ({
                          name: p.name,
                          Projected: yahooPoints(p),
                          Actual: p.actual,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={<PlayerChartTick />} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar
                          isAnimationActive={false}
                          dataKey="Projected"
                          fill="#ffbb38"
                          legendType="square"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          isAnimationActive={false}
                          dataKey="Actual"
                          fill="#83d5af"
                          legendType="square"
                          minPointSize={3}
                          radius={[4, 4, 0, 0]}
                        >
                          <LabelList
                            dataKey="Actual"
                            position="top"
                            fill="#83d5af"
                            fontSize={11}
                            formatter={(v: any) =>
                              v == null ? "" : Number(v).toFixed(2)
                            }
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel
                    title="Hold up. Check these guys."
                    subtitle="Check these before kickoff"
                  >
                    {a.alerts.length ? (
                      a.alerts.slice(0, 6).map((x: any) => (
                        <div className="watch" key={x.playerId}>
                          <span className="player-icon">
                            {pool.find((p) => p.id === x.playerId)?.position}
                          </span>
                          <div>
                            <PlayerLink id={x.playerId} />
                            <p>{x.message}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="empty">
                        No injury or bye flags in the imported roster.
                      </p>
                    )}
                  </Panel>
                </div>
              </>
            )}
            {tab === "My roster" && (
              <PlayerTable
                players={players}
                title="Your squad. Your call."
                description="Set the tone. Check the matchups. Make the league sweat."
              />
            )}

            {tab === "Waiver list" && (
              <WaiverList pool={pool} onPlayer={setSelected} />
            )}
            {tab === "Recommendations" && (
              <>
                <LineupRecommendations snapshot={s} />
                <Panel
                  title="Waiver shortlist"
                  subtitle="Up to three quarterbacks, then the best of the rest. We’re building a roster, not a QB convention."
                >
                  {s.available.length ? (
                    waiverShortlist(s.available).map((p: PlayerData) => (
                      <div className="watch" key={p.id}>
                        <PlayerLink id={p.id} />
                        <span>
                          {p.position} · {fmt(p.projected)} projected
                        </span>
                        <button onClick={() => setSelected(p)}>
                          Inspect <ChevronRight size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="empty">
                      The next player-pool import will populate this list.
                      Availability must be checked in Yahoo before a claim.
                    </p>
                  )}
                </Panel>
              </>
            )}
            {tab === "Recommendations" && (
              <Scenario players={players} pool={pool} />
            )}
            {tab === "League" && (
              <>
                <Panel
                  title="Weekly matchup"
                  subtitle="Know who’s across the field. Team names are public; manager identities stay private."
                >
                  {d.league?.matchup ? (
                    <>
                      <div className="metrics">
                        <Metric
                          label="Your live projection"
                          value={fmt(d.league.matchup.ownProjected)}
                          note="Includes current game results"
                        />
                        <Metric
                          label={
                            (d.league.matchup.opponentName || "Opponent") +
                            " projection"
                          }
                          value={fmt(d.league.matchup.opponentProjected)}
                          note="Yahoo live projection"
                        />
                        <Metric
                          label="Your points"
                          value={fmt(d.league.matchup.ownActual)}
                          note="Latest imported score"
                        />
                        <Metric
                          label="Yahoo win probability"
                          value={
                            d.league.matchup.winProbability == null
                              ? "—"
                              : d.league.matchup.winProbability + "%"
                          }
                          note="Provider estimate, not a guarantee"
                        />
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart
                          layout="vertical"
                          data={[
                            {
                              name: "Your team",
                              Original: d.league.matchup.ownOriginal,
                              Live: d.league.matchup.ownProjected,
                            },
                            {
                              name: d.league.matchup.opponentName || "Opponent",
                              Original: d.league.matchup.opponentOriginal,
                              Live: d.league.matchup.opponentProjected,
                            },
                          ]}
                        >
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" />
                          <Tooltip />
                          <Legend />
                          <Bar
                            isAnimationActive={false}
                            dataKey="Original"
                            fill="#60697f"
                          />
                          <Bar
                            isAnimationActive={false}
                            dataKey="Live"
                            fill="#f5ad32"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <p className="empty">
                      Matchup summary is unavailable in this import.
                    </p>
                  )}
                </Panel>
                <Panel
                  title="League standings"
                  subtitle={
                    d.owner
                      ? "Owner view · league standings"
                      : "Team names on the board. Manager identities stay in the locker room."
                  }
                >
                  <div className="table-wrap">
                    <SortableTable>
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>Record</th>
                          <th>Points for</th>
                          <th>Points against</th>
                          <th>Waiver</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.league?.standings.map((r: any, i: number) => (
                          <tr key={i}>
                            <td className={r.own ? "amber" : ""}>{r.name}</td>
                            <td data-sort-value={recordSortValue(r.record)}>
                              {r.record}
                            </td>
                            <td>{fmt(r.pointsFor)}</td>
                            <td>{fmt(r.pointsAgainst)}</td>
                            <td>{r.waiver ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </SortableTable>
                  </div>
                </Panel>
              </>
            )}
            {tab === "League" &&
              (!d.owner ? (
                <Panel
                  title="League details are private"
                  subtitle="Only your own roster and analysis appear publicly."
                >
                  <a className="primary" href="/auth/google">
                    Sign in as owner <Lock size={16} />
                  </a>
                </Panel>
              ) : (
                <>
                  {s.sections
                    .filter((x: any) => !["roster", "players"].includes(x.kind))
                    .map((section: any, i: number) => (
                      <details className="panel" key={i}>
                        <summary>
                          {section.kind.toUpperCase()} · {section.title}
                        </summary>
                        <a href={section.url} target="_blank" rel="noreferrer">
                          Open in Yahoo <ArrowUpRight size={14} />
                        </a>
                        <pre>
                          {section.text
                            .replaceAll(
                              "ashokkumar's Legit Team",
                              "ashok Legit Team",
                            )
                            .replaceAll(
                              "Sekou Batchelor's Superb Team",
                              "Sekou Superb Team",
                            )}
                        </pre>
                      </details>
                    ))}
                </>
              ))}
            {tab === "News & trends" && (
              <>
                <DecisionOverview
                  dashboard={d}
                  onPlayer={(id) =>
                    setSelected(pool.find((p) => p.id === id) || null)
                  }
                  onLineup={() => setTab("Recommendations")}
                />
              </>
            )}
            {tab === "News & trends" && (
              <NewsHub
                onPlayer={(id) =>
                  setSelected(pool.find((p) => p.id === id) || null)
                }
              />
            )}
            {tab === "AI insights" && <AIInsights owner={d.owner} />}
            {tab === "Yahoo refresh" && (
              <>
                <NewsOperations owner={d.owner} />
                <ImportOperations owner={d.owner} />
              </>
            )}
            {tab === "Import health" && (
              <>
                <div className="metrics">
                  <Metric
                    label="Source"
                    value="Yahoo"
                    note="Browser snapshot from your Mac"
                  />
                  <Metric
                    label="Last imported"
                    value={new Date(s.capturedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    note={new Date(s.capturedAt).toLocaleDateString()}
                  />
                  <Metric
                    label="History samples"
                    value={String(d.history.length)}
                    note="Latest 1,000 stored snapshots"
                  />
                  <Metric
                    label="Freshness"
                    value={a.stale ? "Overdue" : "Current"}
                    note="Freshness threshold: 2 hours"
                  />
                </div>
                <Panel
                  title="How your data arrives"
                  subtitle="Local authenticated browser → validated snapshot → portal database"
                >
                  <p>
                    Yahoo login stays on your Mac. Imports run while the Mac is
                    awake, with faster checks during configured football
                    windows. Failed imports preserve the last good snapshot.
                  </p>
                  <p>
                    Forecasts are recorded when imported before a player's game
                    is marked started. Accuracy requires later completed-game
                    results; no retrospective performance claims are shown.
                  </p>
                </Panel>
                <Panel
                  title="News source health"
                  subtitle="Feed availability and last successful refresh"
                >
                  {Object.entries(d.sources || {}).map(([name, state]: any) => (
                    <div className="watch" key={name}>
                      <b>{name}</b>
                      <span>
                        {state.status === "ok" ? "Connected" : "Refresh failed"}{" "}
                        · {state.articles} headlines ·{" "}
                        {state.updatedAt
                          ? new Date(state.updatedAt).toLocaleString()
                          : "Awaiting first success"}
                      </span>
                    </div>
                  ))}
                </Panel>
                <Panel
                  title="Import coverage"
                  subtitle="Which page groups completed in the latest import"
                >
                  <div className="table-wrap">
                    <SortableTable>
                      <thead>
                        <tr>
                          <th>Page group</th>
                          <th>Pages</th>
                          <th>Rows</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(s.coverage || []).map((c: any) => (
                          <tr key={c.kind}>
                            <td>{c.kind}</td>
                            <td>{c.pages}</td>
                            <td>{c.rows}</td>
                            <td>{c.complete ? "Complete" : "Partial"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </SortableTable>
                  </div>
                </Panel>
                {d.owner && (
                  <Panel title="Import activity" subtitle="Most recent events">
                    {d.events.map((e: any, i: number) => (
                      <div className="watch" key={i}>
                        <span>{new Date(e.created_at).toLocaleString()}</span>
                        <b>{e.status}</b>
                        <span>{e.message}</span>
                      </div>
                    ))}
                  </Panel>
                )}
              </>
            )}
            <footer>
              FANTASY FOOTBALL EDGE{" "}
              <span>Big talk. Real sources. Your roster, your call.</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="subtitle">{subtitle}</p>
      {children}
    </section>
  );
}
function App() {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  return (
    <PlayerProvider players={players}>
      <Dashboard onPlayers={setPlayers} />
    </PlayerProvider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
