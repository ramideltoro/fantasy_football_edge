import { ProjectionValue, ProjectionDetails } from "./ProjectionValue";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
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
const tabs = [
  "Overview",
  "My roster",
  "Player lab",
  "Waiver list",
  "Recommendations",
  "League",
  "News & trends",
  "Import health",
  "Yahoo refresh",
  "AI insights",
];
function App() {
  const refreshing = useRef(false);
  const [importState, setImportState] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [d, setD] = useState<any>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Overview"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<PlayerData | null>(null),
    [playerHistory, setPlayerHistory] = useState<any[]>([]),
    [historyError, setHistoryError] = useState(false),
    [pageIndex, setPageIndex] = useState(0),
    [compare, setCompare] = useState<string[]>([]);
  const rosterDepth = useNflDepth(tab === "My roster");
  useEffect(() => {
    setPageIndex(0);
  }, [tab, query]);
  useEffect(() => {
    setPlayerHistory([]);
    setHistoryError(false);
    if (!selected) return;
    const controller = new AbortController();
    fetch("/api/players/" + encodeURIComponent(selected.id) + "/history", {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setPlayerHistory)
      .catch(() => {
        if (!controller.signal.aborted) setHistoryError(true);
      });
    return () => controller.abort();
  }, [selected?.id, d?.snapshot?.capturedAt]);
  useEffect(() => {
    setSelected((p) =>
      p
        ? [
            ...(d?.snapshot?.players || []),
            ...(d?.snapshot?.available || []),
          ].find((x) => x.id === p.id) || p
        : null,
    );
  }, [d?.snapshot?.capturedAt]);
  useEffect(() => {
    if (!selected) return;
    const prior = document.activeElement as HTMLElement;
    const drawer = document.querySelector<HTMLElement>(".drawer");
    drawer?.querySelector<HTMLButtonElement>("button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
      if (e.key === "Tab" && drawer) {
        const elements = Array.from(
          drawer.querySelectorAll<HTMLElement>(
            'button,a,input,select,[tabindex="0"]',
          ),
        );
        if (e.shiftKey && document.activeElement === elements[0]) {
          e.preventDefault();
          elements.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === elements.at(-1)) {
          e.preventDefault();
          elements[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prior?.focus();
    };
  }, [selected?.id]);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw Error();
      const body = await r.json();
      setD(body);
      setSelected(current => current ? [...(body.snapshot?.players || []),...(body.snapshot?.available || [])].find(p=>p.id===current.id) || current : null);
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
    filtered = (tab === "Player lab" ? pool : players).filter((p) =>
      (p.name + " " + p.position + " " + p.team)
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    sum = (key: "actual" | "projected") =>
      starters.reduce((a, p) => a + (p[key] || 0), 0),
    a = d?.advice,
    changes = a?.changes || [],
    name = (id: string) => pool.find((p) => p.id === id)?.name || id;
  const series = (p: PlayerData) =>
    playerHistory
      .filter((h: any) => h.week === s.week)
      .map((h: any) => ({
        time: new Date(h.capturedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        ...h,
      }));
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
        <div className="nav-label">YOUR COMMAND CENTER</div>
        <nav>
          {tabs.map((t, i) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {
                [
                  <Activity />,
                  <Users />,
                  <ChartNoAxesCombined />,
                  <Users />,

                  <Zap />,
                  <Shield />,
                  <ArrowUpRight />,
                  <RefreshCw />,
                  <RefreshCw />,
                  <Zap />,
                ][i]
              }
              {t}
              {t === "Recommendations" && changes.length > 0 && (
                <em>{changes.length}</em>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="dot" /> ADVICE MODE
          <p>Your decisions. Better informed.</p>
          <a href="/auth/google">
            <Lock size={13} />
            {d?.owner ? "Owner session active" : "Owner sign in"}
          </a>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="eyebrow">THE WEEKLY ADVANTAGE</span>
            <h1>{tab}</h1>
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
        {d?.owner && (
          <div className="notice">
            <button
              disabled={requesting}
              onClick={async () => {
                setRequesting(true);
                try {
                  const r = await fetch("/api/import/request", {
                    method: "POST",
                  });
                  if (!r.ok) throw Error();
                  const body = await r.json();
                  setRequestMessage(body.message);
                } catch {
                  setRequestMessage(
                    "Unable to queue refresh. Please try again.",
                  );
                } finally {
                  setRequesting(false);
                }
              }}
            >
              {requesting ? "Queuing…" : "Refresh from Yahoo"}
            </button>{" "}
            <span role="status">
              {requestMessage || "Ask your Mac worker to import fresh data."}
            </span>
          </div>
        )}
        {s && (
          <div className="notice">
            Yahoo roster data; player projections use Qwen when ready, otherwise labeled Yahoo fallback:{" "}
            <strong>{new Date(s.capturedAt).toLocaleString()}</strong>.{" "}
            {importState?.worker?.state.status === "cooldown"
              ? "Fresh import blocked by Yahoo until " +
                new Date(importState.worker.state.retryAt).toLocaleString() +
                ". Previous data remains displayed."
              : importState?.request && !importState.request.fulfilled_at
                ? "Refresh pending or running. These views update together only after every required page finishes."
                : ""}
          </div>
        )}
        {error && <div className="notice">{error}</div>}
        {!d && !error ? (
          <div className="loading">Loading your edge…</div>
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
                <section className="hero">
                  <div>
                    <span className="eyebrow">WEEK {s.week} · GAME PLAN</span>
                    <h2>
                      Know your roster.
                      <br />
                      <span>Find your edge.</span>
                    </h2>
                    <p>
                      {changes.length
                        ? `${changes.length} lineup assignments to review based on the latest imported projections.`
                        : "Your lineup, player trends and next decisions — in one place."}
                    </p>
                    <button
                      className="primary"
                      onClick={() => setTab("Recommendations")}
                    >
                      Review your game plan <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="hero-score">
                    <span>STARTING LINEUP PROJECTION</span>
                    <strong>{fmt(sum("projected"))}</strong>
                    <small>Yahoo imported points · not a win guarantee</small>
                    <svg viewBox="0 0 300 60">
                      <path d="M0 55 L35 43 L65 49 L100 22 L130 32 L160 18 L190 25 L230 5 L270 12 L300 1" />
                    </svg>
                  </div>
                </section>
                <div className="metrics">
                  <Metric
                    label="Points so far"
                    value={fmt(sum("actual"))}
                    note="Imported starter totals"
                  />
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
                    title="Your scoring engine"
                    subtitle="Current week · imported Yahoo projections"
                  >
                    <ResponsiveContainer width="100%" height={290}>
                      <BarChart
                        data={starters.map((p) => ({
                          name: p.name.split(" ").slice(-1)[0],
                          Projected: p.projected,
                          Actual: p.actual,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar
                          dataKey="Projected"
                          fill="#f5ad32"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="Actual"
                          fill="#6d7488"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel
                    title="Priority watch"
                    subtitle="Check these before kickoff"
                  >
                    {a.alerts.length ? (
                      a.alerts.slice(0, 6).map((x: any) => (
                        <div className="watch" key={x.playerId}>
                          <span className="player-icon">
                            {pool.find((p) => p.id === x.playerId)?.position}
                          </span>
                          <div>
                            <b>{name(x.playerId)}</b>
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
            {(tab === "My roster" || tab === "Player lab") && (
              <>
                <div className="toolbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder="Search name, team or position"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <span>
                    {filtered.length} players · select up to 3 to compare
                  </span>
                </div>
                {tab === "Player lab" && (
                  <Panel
                    title="Opportunity map"
                    subtitle="Roster popularity against this week’s projection"
                  >
                    <ResponsiveContainer width="100%" height={280}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          dataKey="rosterPct"
                          name="Rostered"
                          unit="%"
                        />
                        <YAxis
                          type="number"
                          dataKey="projected"
                          name="Projection"
                        />
                        <ZAxis range={[55, 55]} />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 3" }}
                          content={({ active, payload }: any) =>
                            active && payload?.[0] ? (
                              <div className="chart-tooltip">
                                {payload[0].payload.name}
                                <br />
                                {fmt(payload[0].payload.projected)} projected
                                points
                              </div>
                            ) : null
                          }
                        />
                        <Scatter
                          data={filtered.filter(
                            (p) => p.projected !== null && p.rosterPct !== null,
                          )}
                          fill="#f5ad32"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </Panel>
                )}
                {compare.length > 0 && (
                  <Panel
                    title="Player comparison"
                    subtitle="Same imported week and scoring context"
                  >
                    <div className="compare">
                      {compare.map((id) => {
                        const p = pool.find((p) => p.id === id)!;
                        return (
                          <div key={id}>
                            <b>{p.name}</b>
                            <p>
                              {p.position} · {p.team}
                            </p>
                            <strong><ProjectionValue player={p}/></strong>
                            <p>projected · {fmt(p.actual)} actual</p>
                            <button
                              onClick={() =>
                                setCompare(compare.filter((x) => x !== id))
                              }
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                )}
                <div className="panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {tab === "My roster" && <th>NFL starter / backup</th>}
                        <th>Compare</th>
                        <th>Player</th>
                        <th>Slot</th>
                        <th>Projected</th>
                        <th>Actual</th>
                        <th>Rostered</th>
                        <th>Started</th>
                        <th>Bye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice(pageIndex * 50, (pageIndex + 1) * 50)
                        .map((p) => (
                          <tr key={p.id}>
                            {tab === "My roster" && (
                              <td>
                                {nflRole(p, rosterDepth).source ? (
                                  <a
                                    href={nflRole(p, rosterDepth).source}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {nflRole(p, rosterDepth).label}
                                  </a>
                                ) : (
                                  nflRole(p, rosterDepth).label
                                )}
                              </td>
                            )}
                            <td>
                              <input
                                type="checkbox"
                                aria-label={"Compare " + p.name}
                                checked={compare.includes(p.id)}
                                disabled={
                                  compare.length >= 3 && !compare.includes(p.id)
                                }
                                onChange={() =>
                                  setCompare(
                                    compare.includes(p.id)
                                      ? compare.filter((x) => x !== p.id)
                                      : [...compare, p.id],
                                  )
                                }
                              />
                            </td>
                            <td>
                              <button
                                className="player-name"
                                onClick={() => setSelected(p)}
                              >
                                {p.name} {p.locked && <Lock size={12} />}{" "}
                                {p.status && <em>{p.status}</em>}
                              </button>
                              <small>
                                {p.team} · {p.position}
                              </small>
                            </td>
                            <td>{p.slot || "Pool"}</td>
                            <td className="amber"><ProjectionValue player={p}/></td>
                            <td>{fmt(p.actual)}</td>
                            <td>
                              {p.rosterPct == null ? "—" : p.rosterPct + "%"}
                            </td>
                            <td>
                              {p.startPct == null ? "—" : p.startPct + "%"}
                            </td>
                            <td>{p.bye ?? "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {filtered.length > 50 && (
                    <div className="toolbar pagination">
                      <button
                        disabled={pageIndex === 0}
                        onClick={() => setPageIndex(pageIndex - 1)}
                      >
                        ← Previous
                      </button>
                      <span>
                        Page {pageIndex + 1} of{" "}
                        {Math.ceil(filtered.length / 50)}
                      </span>
                      <button
                        disabled={(pageIndex + 1) * 50 >= filtered.length}
                        onClick={() => setPageIndex(pageIndex + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                  {!filtered.length && (
                    <p className="empty">
                      No matching players have been imported.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "Waiver list" && (
              <WaiverList pool={pool} onPlayer={setSelected} />
            )}
            {tab === "Recommendations" && (
              <>
                <Panel title="Your optimal eligible lineup" subtitle={a.method}>
                  {changes.map((change: any, i: number) => (
                    <div className="watch" key={i}>
                      <span className="player-icon">{change.slot}</span>
                      <div>
                        <b>{name(change.playerId)}</b>
                        <p>
                          Replaces {name(change.currentPlayerId)} in this slot
                        </p>
                      </div>
                    </div>
                  ))}
                  <p className="notice">
                    Review current injury news and kickoff times before making
                    changes in Yahoo. Locked players stay in place.
                  </p>
                  {!a.complete ? (
                    <p className="empty">
                      A complete eligible lineup cannot be calculated from the
                      available projections.
                    </p>
                  ) : (
                    <>
                      <div className="lineup">
                        {a.lineup.map((x: any, i: number) => (
                          <button
                            key={i}
                            onClick={() =>
                              setSelected(
                                pool.find((p) => p.id === x.playerId)!,
                              )
                            }
                          >
                            <em>{x.slot}</em>
                            <b>{name(x.playerId)}</b>
                            <span>
                              {x.locked ? (
                                <Lock size={15} />
                              ) : (
                                fmt(
                                  pool.find((p) => p.id === x.playerId)
                                    ?.projected,
                                )
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="muted">
                        Projected improvement: {fmt(a.delta)} points. These are
                        provider projections, not independent predictions.
                      </p>
                    </>
                  )}
                </Panel>
                <Panel
                  title="Waiver shortlist"
                  subtitle="Available imported players ranked by projected points"
                >
                  {s.available.length ? (
                    s.available
                      .filter(
                        (p: PlayerData) =>
                          p.projected !== null &&
                          /^(FA|W)/.test(p.availability),
                      )
                      .sort(
                        (a: PlayerData, b: PlayerData) =>
                          b.projected! - a.projected!,
                      )
                      .slice(0, 10)
                      .map((p: PlayerData) => (
                        <div className="watch" key={p.id}>
                          <b>{p.name}</b>
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
                  subtitle="Imported Yahoo matchup forecasts; opponent identity is hidden publicly."
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
                          label="Opponent projection"
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
                              name: "Opponent",
                              Original: d.league.matchup.opponentOriginal,
                              Live: d.league.matchup.opponentProjected,
                            },
                          ]}
                        >
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Original" fill="#60697f" />
                          <Bar dataKey="Live" fill="#f5ad32" />
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
                      ? "Full owner view"
                      : "Opponent names are anonymized"
                  }
                >
                  <div className="table-wrap">
                    <table>
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
                            <td>{r.record}</td>
                            <td>{fmt(r.pointsFor)}</td>
                            <td>{fmt(r.pointsAgainst)}</td>
                            <td>{r.waiver ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                        <pre>{section.text}</pre>
                      </details>
                    ))}
                </>
              ))}
            {tab === "News & trends" && (
              <>
                <Panel
                  title="Around the league"
                  subtitle="Linked headlines from ESPN and Yahoo Sports. Publication dates come from each feed."
                >
                  <div className="news">
                    {d.news.length ? (
                      d.news.map((n: any) => (
                        <a
                          key={n.url}
                          href={n.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span className="eyebrow">{n.source}</span>
                          <h3>{n.title}</h3>
                          <small>
                            {n.publishedAt
                              ? new Date(n.publishedAt).toLocaleString()
                              : "Date unavailable"}
                          </small>
                          <ArrowUpRight size={18} />
                        </a>
                      ))
                    ) : (
                      <p className="empty">
                        News feeds are currently unavailable.
                      </p>
                    )}
                  </div>
                </Panel>
                <Panel
                  title="Players in the headlines"
                  subtitle="Article counts across the linked source feeds; attention is not a performance forecast."
                >
                  {pool
                    .map((p) => ({
                      player: p,
                      articles: d.news.filter((n: any) =>
                        n.title.toLowerCase().includes(p.name.toLowerCase()),
                      ),
                    }))
                    .filter((x) => x.articles.length)
                    .sort((a, b) => b.articles.length - a.articles.length)
                    .slice(0, 12)
                    .map((x) => (
                      <div className="watch" key={x.player.id}>
                        <button onClick={() => setSelected(x.player)}>
                          <b>{x.player.name}</b>
                        </button>
                        <span>
                          {x.articles.length} headlines ·{" "}
                          {[
                            ...new Set(x.articles.map((n: any) => n.source)),
                          ].join(", ")}
                        </span>
                      </div>
                    ))}
                </Panel>
                <Panel
                  title="Trend evidence"
                  subtitle="Historical changes become available after repeated imports."
                >
                  <p>
                    Open any player in the roster to see projection and
                    roster-percentage movement. One snapshot is a baseline, not
                    a trend.
                  </p>
                </Panel>
              </>
            )}
            {tab === "Player lab" && (
              <Panel
                title="Forecast scorecard"
                subtitle={
                  d.accuracy?.method ||
                  "Prospective forecasts compared with completed games."
                }
              >
                {d.accuracy?.sampleSize ? (
                  <>
                    <div className="metrics">
                      <Metric
                        label="Mean absolute error"
                        value={fmt(d.accuracy.mae)}
                        note="Points per forecast"
                      />
                      <Metric
                        label="Forecast bias"
                        value={fmt(d.accuracy.bias)}
                        note="Actual minus predicted"
                      />
                      <Metric
                        label="Scored forecasts"
                        value={String(d.accuracy.sampleSize)}
                        note="Stored before game start"
                      />
                    </div>
                    <ResponsiveContainer width="100%" height={250}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          dataKey="projected"
                          name="Predicted points"
                        />
                        <YAxis
                          type="number"
                          dataKey="actual"
                          name="Actual points"
                        />
                        <Tooltip />
                        <Scatter data={d.accuracy.points} fill="#f5ad32" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <p className="empty">
                    No completed outcomes yet for forecasts stored before
                    kickoff. This scorecard will fill automatically as games
                    finish and new imports arrive.
                  </p>
                )}
              </Panel>
            )}
            {tab === "Player lab" && (
              <Panel
                title="Calibrated prediction ranges"
                subtitle={
                  d.calibrated?.reason || "Waiting for scored forecasts."
                }
              >
                {d.calibrated?.available ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Provider</th>
                          <th>Calibrated</th>
                          <th>Empirical 80% range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.calibrated.players.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>{fmt(p.providerProjection)}</td>
                            <td>{fmt(p.calibratedProjection)}</td>
                            <td>
                              {fmt(p.lower)}–{fmt(p.upper)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty">
                    {d.calibrated?.sampleSize || 0} of 30 required scored
                    forecasts collected. No artificial confidence ranges are
                    shown.
                  </p>
                )}
              </Panel>
            )}
            {tab === "AI insights" && <AIInsights owner={d.owner} />}
            {tab === "Yahoo refresh" && <ImportOperations owner={d.owner} />}
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
                    <table>
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
                    </table>
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
              <span>
                Source: Yahoo browser import · Advice depends on data freshness
                and completeness.
              </span>
            </footer>
          </>
        )}
      </main>
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              onClick={() => setSelected(null)}
              aria-label="Close player details"
            >
              ×
            </button>
            <span className="eyebrow">
              {selected.team} · {selected.position}
            </span>
            <h2 id="player-title">{selected.name}</h2>
            <div className="metrics">
              <Metric
                label="Projected"
                value={fmt(selected.projected)}
                note={selected.projectionSource || "Yahoo"}
              />
              <Metric
                label="Actual"
                value={fmt(selected.actual)}
                note={
                  selected.locked ? "Game started or finished" : "Awaiting game"
                }
              />
            </div>
            <ProjectionDetails player={selected}/>
            <h3>Historical Yahoo projection movement · week {s.week}</h3>
            {series(selected).length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={series(selected)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    dataKey="projected"
                    stroke="#f5ad32"
                    connectNulls={false}
                  />
                  <Line
                    dataKey="actual"
                    stroke="#65c5ac"
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="empty">
                {historyError
                  ? "Player history is temporarily unavailable."
                  : "Waiting for another import to measure movement."}
              </p>
            )}
            <h3>Roster popularity</h3>
            {series(selected).length > 1 && (
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={series(selected)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Line
                    dataKey="rosterPct"
                    name="Rostered %"
                    stroke="#f5ad32"
                    connectNulls={false}
                  />
                  <Line
                    dataKey="startPct"
                    name="Started %"
                    stroke="#65c5ac"
                    connectNulls={false}
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            )}
            <h3>
              {selected.slot
                ? "Imported statistics"
                : "Projected statistics · current week"}
            </h3>
            <div className="stat-list">
              {Object.entries(selected.stats)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}
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
createRoot(document.getElementById("root")!).render(<App />);
