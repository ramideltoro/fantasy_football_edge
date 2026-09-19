import {
  UsageRadar,
  MatchupRadar,
  TradeFinder,
  WaiverCoach,
  PlayoffRace,
  DraftRoom,
} from "./EdgeLab";
import { recordSortValue } from "../shared/tableSort";
import { LineupRecommendations } from "./LineupRecommendations";
import {
  ChangesFeed,
  KickoffDesk,
  ThreeWeekPlanner,
  ProjectionReportCard,
  WeeklyRecap,
  useKickoffNotifications,
} from "./GamePlan";
import { SortableTable } from "./SortableTable";
import {
  PlayerProvider,
  PlayerTable,
  PlayerLink,
  usePlayers,
} from "./PlayerExperience";
import { waiverShortlist } from "../shared/shortlist";
import { NewsHub, NewsOperations, DecisionOverview } from "./NewsHub";
import { AnalysisRefresh } from "./AnalysisRefresh";
import { AIInsights } from "./AIInsights";
import { ImportOperations } from "./ImportOperations";
import { WaiverList } from "./WaiverList";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowUpRight,
  Shield,
  Users,
  ChartNoAxesCombined,
  RefreshCw,
  Lock,
  ChevronRight,
  Zap,
} from "lucide-react";
import type { PlayerData } from "../shared/model";
import { Scenario } from "./Scenario";
import { sections, pageLabels, validTab, sectionFor } from "./navigation";
import { WeeklyOverview } from "./WeeklyOverview";
import { TeamScoring } from "./TeamScoring";
import "./style.css";
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
function Dashboard({
  onPlayers,
}: {
  onPlayers: (players: PlayerData[]) => void;
}) {
  const { open: openPlayers } = usePlayers();
  const setSelected = (p: PlayerData | null) => p && openPlayers([p.id]);
  const [lab, setLab] = useState<any>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/edge-lab")
        .then((r) => (r.ok ? r.json() : null))
        .then(setLab)
        .catch(() => {});
    void load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  const refreshing = useRef(false);
  const [importState, setImportState] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [d, setD] = useState<any>(null),
    [error, setError] = useState(""),
    [tab, changeTab] = useState(() => validTab(window.location.hash));
  const setTab = (next: string) => {
    changeTab(next);
    window.location.hash = encodeURIComponent(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  useEffect(() => {
    const navigate = () => changeTab(validTab(window.location.hash));
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const notifications = useKickoffNotifications(d?.gamePlan, () =>
    setTab("Kickoff watch"),
  );
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const r = await fetch("/api/dashboard");
      if (!r.ok) throw Error();
      const body = await r.json();
      setD(body);

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
  useEffect(() => {
    const sources = [
      ...(lab?.players || []),
      ...(d?.snapshot?.players || []),
      ...(d?.snapshot?.available || []),
      ...(d?.gamePlan?.historyPlayers || []),
    ];
    const merged = new Map<string, PlayerData>();
    for (const p of sources) {
      const prior = merged.get(p.id);
      merged.set(p.id, {
        ...prior,
        ...p,
        research: { ...p.research, lab: (prior as any)?.lab || (p as any).lab },
      });
    }
    for (const p of lab?.draft?.players || [])
      if (![...merged.values()].some((r) => r.name === p.name))
        merged.set("ffc:" + p.player_id, {
          id: "ffc:" + p.player_id,
          name: p.name,
          position: p.position === "PK" ? "K" : p.position,
          team: p.team,
          slot: "",
          bye: p.bye,
          actual: null,
          projected: null,
          startPct: null,
          rosterPct: null,
          status: "",
          locked: false,
          kickoffAt: null,
          completed: false,
          availability: "Draft research",
          eligible: [p.position],
          stats: {},
        });
    onPlayers([...merged.values()]);
  }, [d, lab, onPlayers]);
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
    a = d?.advice;
  const activeSection = sectionFor(tab);
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
        <nav aria-label="Main sections">
          {sections.map(({ name: group, menus }) => (
            <button
              key={group}
              className={
                (group === activeSection.name ? "active " : "") +
                (group === "Operations" ? "operations-nav" : "")
              }
              onClick={() => setTab(menus[0].pages[0])}
              aria-current={group === activeSection.name ? "page" : undefined}
            >
              {
                {
                  Overview: <Activity />,
                  "My Team": <Users />,
                  Waivers: <Zap />,
                  League: <Shield />,
                  Research: <ChartNoAxesCombined />,
                  Operations: <RefreshCw />,
                }[group]
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
            <h1>{activeSection.name}</h1>
            <p className="section-description">{activeSection.description}</p>
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
        {activeSection.name !== "Overview" && (
          <div
            className="section-menu"
            role="navigation"
            aria-label={activeSection.name + " tools"}
          >
            {activeSection.menus.map((menu) => (
              <div className="section-menu-group" key={menu.name}>
                <span className="section-menu-label">{menu.name}</span>
                <div
                  className="section-menu-links"
                  role="group"
                  aria-label={menu.name}
                >
                  {menu.pages.map((page) => (
                    <button
                      key={page}
                      aria-pressed={tab === page}
                      onClick={() => setTab(page)}
                    >
                      {pageLabels[page] || page}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {s && activeSection.name === "Operations" && (
          <AnalysisRefresh
            owner={d.owner}
            snapshotAt={s.capturedAt}
            onOperations={() => setTab("Yahoo refresh")}
          />
        )}
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
                {activeSection.name !== "Operations" && (
                  <button
                    className="data-status-link"
                    onClick={() => setTab("Yahoo refresh")}
                  >
                    Sources & refresh <ChevronRight size={12} />
                  </button>
                )}
              </span>
            </div>
            {a.stale && (
              <div className="notice">
                This snapshot is over two hours old. Refresh Yahoo data before
                acting on a recommendation.
              </div>
            )}
            {tab === "Overview" && (
              <WeeklyOverview
                teamName={s.team.name}
                week={s.week}
                players={players}
                matchup={d.league?.matchup || null}
                commentary={d.matchupCommentary}
                navigate={setTab}
              />
            )}
            {tab === "Breakout radar" && <UsageRadar lab={lab} snapshot={s} />}
            {tab === "Matchup radar" && <MatchupRadar lab={lab} snapshot={s} />}
            {tab === "Trade finder" && <TradeFinder lab={lab} />}
            {tab === "Claim coach" && <WaiverCoach lab={lab} snapshot={s} />}
            {tab === "Playoff race" && <PlayoffRace lab={lab} />}
            {tab === "Draft Room" && <DraftRoom lab={lab} />}
            {tab === "My roster" && (
              <>
                <PlayerTable
                  players={players}
                  title="Your squad. Your call."
                  description="Set the tone. Check the matchups. Make the league sweat."
                />
                <TeamScoring
                  players={players}
                  matchup={d.league?.matchup || null}
                />
              </>
            )}

            {tab === "Waiver list" && (
              <>
                {" "}
                <details className="panel waiver-shortlist">
                  <summary>
                    Waiver shortlist{" "}
                    <span>
                      Quick picks · up to 3 QBs, then the best of the rest
                    </span>
                  </summary>
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
                </details>
                <WaiverList pool={pool} onPlayer={setSelected} />
              </>
            )}
            {tab === "Recommendations" && (
              <LineupRecommendations snapshot={s} />
            )}
            {tab === "Pickup impact" && (
              <Scenario snapshot={s} plan={d.gamePlan} />
            )}
            {tab === "Three-week plan" && (
              <ThreeWeekPlanner
                snapshot={s}
                plan={d.gamePlan}
                navigate={setTab}
              />
            )}
            {tab === "Kickoff watch" && (
              <KickoffDesk
                snapshot={s}
                plan={d.gamePlan}
                notifications={notifications}
                navigate={setTab}
              />
            )}
            {tab === "Kickoff watch" && (
              <details className="panel roster-flags">
                <summary>
                  All roster injury & bye flags{" "}
                  <span>Including your bench</span>
                </summary>
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
              </details>
            )}
            {tab === "Report card" && (
              <ProjectionReportCard plan={d.gamePlan} />
            )}
            {tab === "Weekly recap" && <WeeklyRecap plan={d.gamePlan} />}
            {tab === "What changed" && <ChangesFeed plan={d.gamePlan} />}
            {tab === "League" && (
              <>
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
