import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellOff,
  ArrowUpRight,
  Clock3,
  ShieldCheck,
  CalendarDays,
  ReceiptText,
} from "lucide-react";
import type { SnapshotData, PlayerData } from "../shared/model";
import { kickoffAlerts } from "../shared/gamePlanChanges";
import { flexPlan, teamCode, weeklyPlan } from "../shared/strategy";
import { effectiveStatus } from "../shared/availability";
import { lineupAdvice } from "../shared/lineupProjections";
import { PlayerLink } from "./PlayerExperience";
import { SortableTable } from "./SortableTable";
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));
const stamp = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not checked yet";
const safeRead = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeWrite = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
const visitBaselines = new Map<string, string | null>();
export function Deadline({ at }: { at: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!at) return <span>Kickoff unconfirmed</span>;
  const minutes = Math.ceil((Date.parse(at) - now) / 60_000);
  return (
    <span title={new Date(at).toLocaleString()}>
      {minutes <= 0
        ? "Locked"
        : minutes < 60
          ? `${minutes}m until lock`
          : minutes < 1440
            ? `${Math.floor(minutes / 60)}h ${minutes % 60}m until lock`
            : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h until lock`}
    </span>
  );
}
export function useKickoffNotifications(plan: any, open: () => void) {
  const [enabled, setEnabled] = useState(
    () => safeRead("edge:browser-alerts:v1") === "on",
  );
  const [message, setMessage] = useState("");
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (
      !enabled ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !plan ||
      plan.stale ||
      Date.now() - Date.parse(plan.snapshotAt) > 2 * 3600000
    )
      return;
    const key = `edge:alert-receipts:v1:${plan.scope}`;
    let seen: string[] = [];
    try {
      seen = JSON.parse(safeRead(key) || "[]");
    } catch {}
    if (!Array.isArray(seen)) seen = [];
    for (const alert of plan.alerts || []) {
      const until = alert.kickoffAt
        ? Date.parse(alert.kickoffAt) - Date.now()
        : Infinity;
      if (
        alert.level !== "urgent" ||
        until <= 0 ||
        until > 90 * 60_000 ||
        seen.includes(alert.id)
      )
        continue;
      try {
        const notice = new Notification(alert.title, {
          body: `${alert.name}: ${alert.status}. ${alert.replacements[0] ? `Review ${alert.replacements[0].name} as a replacement.` : "Check your available replacements."}`,
          tag: alert.id,
        });
        notice.onclick = () => {
          window.focus();
          openRef.current();
          notice.close();
        };
        seen.push(alert.id);
      } catch {
        setMessage(
          "This browser could not display a notification. Kickoff watch remains available here.",
        );
      }
    }
    safeWrite(key, JSON.stringify(seen.slice(-100)));
  }, [enabled, plan?.generatedAt]);
  async function toggle() {
    if (enabled) {
      setEnabled(false);
      safeWrite("edge:browser-alerts:v1", "off");
      setMessage("Browser alerts turned off. In-site alerts remain on.");
      return;
    }
    if (!("Notification" in window)) {
      setMessage(
        "Use the in-site alerts in this browser; system notifications are unavailable.",
      );
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setEnabled(permission === "granted");
      safeWrite(
        "edge:browser-alerts:v1",
        permission === "granted" ? "on" : "off",
      );
      setMessage(
        permission === "granted"
          ? "Browser alerts are on while this page stays open."
          : "Notifications weren’t enabled. Your in-site alerts still work.",
      );
    } catch {
      setMessage(
        "Browser alerts are unavailable here. Use Kickoff watch for your latest checks.",
      );
    }
  }
  return { enabled, message, toggle };
}
export function ActionBrief({
  snapshot: s,
  plan,
  navigate,
}: {
  snapshot: SnapshotData;
  plan: any;
  navigate: (tab: string) => void;
}) {
  const alerts = useMemo(() => kickoffAlerts(s), [s]),
    flex = useMemo(() => flexPlan(s), [s]),
    lineup = useMemo(() => lineupAdvice(s, "combined"), [s]);
  const cards: Array<{
    title: string;
    text: string;
    tab: string;
    label: string;
    urgent?: boolean;
  }> = [];
  if (alerts.length)
    cards.push({
      title: alerts[0].title,
      text: `${alerts[0].name} needs a ${alerts[0].level === "urgent" ? "replacement" : "backup plan"}. ${alerts.length > 1 ? `${alerts.length} starters need a look.` : "Check the source and lock time."}`,
      tab: "Kickoff watch",
      label: "Check kickoff watch",
      urgent: alerts.some((a) => a.level === "urgent"),
    });
  if (lineup.complete && (lineup.delta ?? 0) >= 1)
    cards.push({
      title: "Points sitting on the bench.",
      text: `Combined mode finds ${fmt(lineup.delta)} more projected points. Review the full set of moves.`,
      tab: "Recommendations",
      label: "See lineup moves",
    });
  if (flex.changes.length)
    cards.push({
      title: "Give Sunday less room to screw you.",
      text: "A later starter can move into FLEX without changing who starts. Keep your replacement options open.",
      tab: "Kickoff watch",
      label: "See FLEX moves",
    });
  cards.push({
    title: "Get ahead of next Sunday.",
    text: "Spot bye-week gaps and test a pickup before the rest of the league wakes up.",
    tab: "Three-week plan",
    label: "Open three-week plan",
  });
  if (cards.length < 3)
    cards.push({
      title: "Make the numbers earn your trust.",
      text: "Compare recorded forecasts with final scores. No hindsight victory laps.",
      tab: "Report card",
      label: "Open projection report card",
    });
  if (cards.length < 3)
    cards.push({
      title: "Bring the Monday receipts.",
      text: "Your MVP, missed opportunities and calls that deserved better.",
      tab: "Weekly recap",
      label: "Read weekly recap",
    });
  return (
    <section className="gameplan-brief" aria-labelledby="next-moves-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR NEXT THREE MOVES</span>
          <h2 id="next-moves-title">Coach, start here.</h2>
        </div>
        <button onClick={() => navigate("Kickoff watch")}>
          <Bell size={16} /> {alerts.length} kickoff flags
        </button>
      </div>
      <div className="action-card-grid">
        {cards.slice(0, 3).map((c, i) => (
          <article
            className={`action-card ${c.urgent ? "urgent" : ""}`}
            key={c.title}
          >
            <span className="action-number">0{i + 1}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            <button onClick={() => navigate(c.tab)}>
              {c.label} <ArrowUpRight size={16} />
            </button>
          </article>
        ))}
      </div>
      {!plan && (
        <p className="muted">
          The game-day desk is starting its first source check. Current lineup
          information is still shown above.
        </p>
      )}
    </section>
  );
}
export function ChangesFeed({
  plan,
  compact = false,
  navigate,
}: {
  plan: any;
  compact?: boolean;
  navigate?: (tab: string) => void;
}) {
  const [since, setSince] = useState<string | null>(null),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    if (!plan?.scope) return;
    const key = `edge:last-visit:v1:${plan.scope}`;
    if (!visitBaselines.has(key)) visitBaselines.set(key, safeRead(key));
    setSince(visitBaselines.get(key) || null);
    safeWrite(key, new Date().toISOString());
  }, [plan?.scope]);
  const all = (plan?.changes || []).filter(
    (c: any) => !since || Date.parse(c.at) > Date.parse(since),
  );
  const changes = all.filter((c: any) => filter === "all" || c.kind === filter);
  function read() {
    const at = new Date().toISOString(),
      key = `edge:last-visit:v1:${plan.scope}`;
    setSince(at);
    visitBaselines.set(key, at);
    safeWrite(key, at);
  }
  return (
    <section className="panel changes-feed">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE CATCH-UP</span>
          <h3>What the hell did I miss?</h3>
          <p>
            {since
              ? `Since ${stamp(since)} · this browser`
              : "Changes collected since the game-day desk started."}
          </p>
        </div>
        <span className="count-badge">{all.length} updates</span>
      </div>
      {!compact && (
        <div className="filter-pills" aria-label="Change type">
          {["all", "health", "role", "projection", "waiver", "roster"].map(
            (kind) => (
              <button
                key={kind}
                aria-pressed={filter === kind}
                onClick={() => setFilter(kind)}
              >
                {kind}
              </button>
            ),
          )}
        </div>
      )}
      <div className="change-list">
        {changes.slice(0, compact ? 3 : 50).map((c: any) => (
          <article key={c.id}>
            <span className={`change-kind ${c.kind}`}>{c.kind}</span>
            <div>
              <PlayerLink id={c.playerId} name={c.name} />
              <p>{c.text}</p>
              <small>
                {c.source} · source {stamp(c.sourceAt)} · noticed {stamp(c.at)}
              </small>
            </div>
          </article>
        ))}
      </div>
      {!changes.length && (
        <p className="empty">
          No new changes in this view. The desk is watching; you can enjoy the
          game.
        </p>
      )}
      <div className="panel-actions">
        {compact && (
          <button onClick={() => navigate?.("What changed")}>
            See the full catch-up <ArrowUpRight size={15} />
          </button>
        )}
        {all.length > 0 && <button onClick={read}>I’m caught up</button>}
      </div>
      {(plan?.stale || plan?.error) && (
        <p className="notice">
          The latest desk check is delayed. Last success:{" "}
          {stamp(plan.generatedAt)}.
        </p>
      )}
    </section>
  );
}
export function KickoffDesk({
  snapshot: s,
  plan,
  notifications,
  navigate,
}: {
  snapshot: SnapshotData;
  plan: any;
  notifications: ReturnType<typeof useKickoffNotifications>;
  navigate: (tab: string) => void;
}) {
  const alerts = kickoffAlerts(s),
    flex = flexPlan(s);
  return (
    <div className="gameplan-stack">
      <section className="panel kickoff-desk">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE SUNDAY SEATBELT</span>
            <h2>Tape the ankles. Warm up Plan B.</h2>
            <p>Availability, replacements and lock times in one place.</p>
          </div>
          <button onClick={notifications.toggle}>
            {notifications.enabled ? <BellOff size={16} /> : <Bell size={16} />}
            {notifications.enabled
              ? "Turn off browser alerts"
              : "Enable browser alerts"}
          </button>
        </div>
        <p className="muted">
          The server keeps checking while you’re away. Browser notifications
          require this page to stay open and cover urgent starter alerts within
          90 minutes of kickoff.
        </p>
        <p role="status">{notifications.message}</p>
        <div className="source-health-line">
          <Clock3 size={15} /> Desk checked {stamp(plan?.generatedAt)} · ESPN
          checks {plan?.intervalMinutes || 30} min apart, tightening to 5 min
          near kickoff. Yahoo imported {stamp(s.capturedAt)}.
        </div>
        {(plan?.stale ||
          plan?.error ||
          plan?.sources?.some((x: any) => x.stale)) && (
          <p className="notice">
            Some checks are delayed. Verify the source timestamps before making
            a move.
          </p>
        )}
        {!alerts.length && (
          <div className="quiet-state">
            <ShieldCheck />
            <div>
              <h3>No starter flags right now.</h3>
              <p>
                Good. Keep the damn headset on. That’s the report, not a
                guarantee; check again before your first kickoff.
              </p>
            </div>
          </div>
        )}
        {alerts.map((a) => (
          <article className={`kickoff-alert ${a.level}`} key={a.id}>
            <div>
              <span className="eyebrow">
                {a.level === "urgent" ? "ACTION NEEDED" : "KEEP AN EYE ON HIM"}
              </span>
              <h3>{a.title}</h3>
              <PlayerLink id={a.playerId} name={a.name} /> · {a.status || "Bye"}
              <p>
                <Deadline at={a.kickoffAt} />
              </p>
            </div>
            <div>
              <b>
                {a.replacements.length
                  ? "Eligible bench options"
                  : "No direct bench replacement found"}
              </b>
              {a.replacements.map((r) => (
                <p key={r.id}>
                  <PlayerLink id={r.id} name={r.name} /> · {fmt(r.points)}{" "}
                  combined · <Deadline at={r.kickoffAt} />
                </p>
              ))}
              <button
                onClick={() =>
                  navigate(
                    a.replacements.length ? "Recommendations" : "Pickup impact",
                  )
                }
              >
                {a.replacements.length
                  ? "Review the full lineup"
                  : "Find a pickup"}{" "}
                <ArrowUpRight size={15} />
              </button>
            </div>
            <small>
              {a.source} · {stamp(a.sourceAt)}
              {a.sourceUrl && (
                <>
                  {" "}
                  ·{" "}
                  <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                    Source ↗
                  </a>
                </>
              )}
            </small>
          </article>
        ))}
        <details>
          <summary>Source checks by NFL team</summary>
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Last checked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {plan?.sources?.map((x: any) => (
                  <tr key={x.team}>
                    <td>{x.team}</td>
                    <td
                      data-sort-value={
                        x.checkedAt ? Date.parse(x.checkedAt) : null
                      }
                    >
                      {stamp(x.checkedAt)}
                    </td>
                    <td>{x.stale ? "Delayed" : "Current"}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        </details>
      </section>
      <section className="panel flex-desk">
        <span className="eyebrow">KEEP YOUR FLEX FLEXIBLE</span>
        <h2>Give Sunday less room to screw you.</h2>
        <p>
          Put later games in flexible slots when the same starters still fit.
          This changes your options, not your projected points.
        </p>
        {flex.changes.length ? (
          <div className="flex-moves">
            {flex.changes.map((x) => (
              <article key={x.playerId}>
                <PlayerLink id={x.playerId} />
                <span>
                  {x.from} → <b>{x.slot}</b>
                </span>
                <small>{stamp(x.kickoffAt)}</small>
              </article>
            ))}
            <p className="muted">
              Apply all listed slot moves together in Yahoo. Locked players stay
              put.
            </p>
          </div>
        ) : (
          <p className="empty">
            Your current slots don’t offer a verified later-game FLEX swap.
          </p>
        )}
        <h3>Your questionable-player backup plans</h3>
        {!flex.contingencies.length && (
          <p>No unlocked starters currently need an injury contingency.</p>
        )}
        {flex.contingencies.map((c) => (
          <article className="contingency-card" key={c.playerId}>
            <PlayerLink id={c.playerId} /> · <Deadline at={c.kickoffAt} />
            <p>
              {c.late.length
                ? "If you wait for his game, these bench options kick off at the same time or later:"
                : "No healthy direct bench option remains if you wait until his kickoff."}
            </p>
            {c.late.map((x) => (
              <p key={x.id}>
                <PlayerLink id={x.id} /> · <Deadline at={x.kickoffAt} />
              </p>
            ))}
            {!!c.early.length && (
              <div className="notice">
                Decide earlier to use{" "}
                {c.early.map((x, i) => (
                  <span key={x.id}>
                    {i ? "; " : ""}
                    <PlayerLink id={x.id} /> (<Deadline at={x.kickoffAt} />)
                  </span>
                ))}
                .
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
export function ThreeWeekPlanner({
  snapshot: s,
  plan,
  navigate,
}: {
  snapshot: SnapshotData;
  plan: any;
  navigate: (tab: string) => void;
}) {
  const weeks = [s.week, s.week + 1, s.week + 2].filter((w) => w <= 18);
  const plans = useMemo(
    () => weeks.map((w) => weeklyPlan(s, w, plan?.schedule || {})),
    [s, plan?.generatedAt],
  );
  return (
    <section className="panel three-week-planner">
      <div className="section-heading">
        <div>
          <span className="eyebrow">GET THERE BEFORE THE GROUP CHAT</span>
          <h2>Next three Sundays.</h2>
          <p>
            Find the bye-week holes now. Future you has enough shit to deal
            with.
          </p>
        </div>
        <CalendarDays />
      </div>
      <div className="planner-week-grid">
        {plans.map((p) => (
          <article className={p.gaps.length ? "has-gaps" : ""} key={p.week}>
            <span>
              WEEK {p.week}
              {p.week === s.week ? " · NOW" : ""}
            </span>
            <h3>
              {p.gaps.length
                ? `${p.gaps.length} open slot${p.gaps.length > 1 ? "s" : ""}`
                : "Lineup covered"}
            </h3>
            <strong>
              {fmt(p.total)}{" "}
              <small>
                {p.week === s.week ? "live + projected" : "planning points"}
              </small>
            </strong>
            <p>
              {p.byes.length} players on bye · {p.uncertain.length} injury/data
              flags
            </p>
            {p.pickups.map((pick) => (
              <div key={pick.slot}>
                <b>{pick.slot} help</b>
                {pick.candidates.length ? (
                  pick.candidates.map((c) => (
                    <p key={c.id}>
                      <PlayerLink id={c.id} /> · {fmt(c.points)}
                    </p>
                  ))
                ) : (
                  <p>No verified pickup in the imported pool.</p>
                )}
              </div>
            ))}
            <button onClick={() => navigate("Pickup impact")}>
              Test an add/drop <ArrowUpRight size={14} />
            </button>
          </article>
        ))}
      </div>
      <p className="notice">
        Future weeks use league-scored historical baselines and confirmed
        schedules—not future Yahoo, Qwen or sportsbook forecasts. Current
        injuries remain unresolved until a source clears them. A dash means the
        lineup cannot be fully estimated.
      </p>
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Player</th>
              <th>Position</th>
              {weeks.map((w) => (
                <th key={w}>Week {w}</th>
              ))}
              <th>Availability</th>
            </tr>
          </thead>
          <tbody>
            {s.players.map((p) => (
              <tr key={p.id}>
                <td data-sort-value={p.name}>
                  <PlayerLink id={p.id} />
                </td>
                <td>{p.position}</td>
                {weeks.map((w) => {
                  const game = plan?.schedule?.[teamCode(p.team)]?.find(
                      (g: any) => g.week === w,
                    ),
                    bye = p.bye === w || game?.bye;
                  return (
                    <td
                      key={w}
                      data-sort-value={bye ? "BYE" : game?.opponent || null}
                    >
                      <span className={bye ? "bye-chip" : ""}>
                        {bye
                          ? "BYE"
                          : game?.opponent
                            ? `vs ${game.opponent}`
                            : "Schedule pending"}
                      </span>
                      {game?.kickoffAt && (
                        <small>{stamp(game.kickoffAt)}</small>
                      )}
                    </td>
                  );
                })}
                <td>{effectiveStatus(p) || "No injury flag"}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
      <small>
        Schedule checked {stamp(plan?.scheduleAt)} ·{" "}
        <a
          href={
            plan?.scheduleSource || "https://github.com/nflverse/nflverse-data"
          }
          target="_blank"
          rel="noreferrer"
        >
          nflverse schedules ↗
        </a>
        {plan?.scheduleStale ? " · Schedule refresh needed" : ""}
      </small>
    </section>
  );
}
const names: Record<string, string> = {
  yahoo: "Yahoo",
  qwen: "Qwen",
  combined: "Combined",
  bookies: "Bookies",
};
export function ProjectionReportCard({ plan }: { plan: any }) {
  const [position, setPosition] = useState("ALL"),
    [common, setCommon] = useState(false);
  const report = plan?.report,
    rows = report?.rows || [];
  const summary = (report?.summary || []).filter(
    (r: any) => r.position === position && r.mode !== "bookies",
  );
  return (
    <section className="panel report-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">NO HIDING FROM THE BOX SCORE</span>
          <h2>Who’s actually cooking?</h2>
          <p>
            Everybody’s a genius before kickoff. Here are the saved forecasts
            and the actual receipts.
          </p>
        </div>
        <ReceiptText />
      </div>
      <div className="report-controls">
        <div className="filter-pills">
          {["ALL", "QB", "RB", "WR", "TE", "K", "DEF"].map((p) => (
            <button
              key={p}
              aria-pressed={position === p}
              onClick={() => setPosition(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            checked={common}
            onChange={(e) => setCommon(e.target.checked)}
          />{" "}
          Compare only games all three forecasted
        </label>
      </div>
      <div className="report-source-grid">
        {["yahoo", "qwen", "combined"].map((mode) => {
          const r = summary.find((x: any) => x.mode === mode),
            count = common ? r?.commonSamples || 0 : r?.samples || 0;
          return (
            <article key={mode}>
              <span>{names[mode]}</span>
              <strong>{fmt(common ? r?.commonMae : r?.mae)}</strong>
              <b>average miss · points</b>
              <small>
                {count} completed player-games
                {count < 10 ? " · early sample" : ""}
              </small>
              {!common && (
                <p>
                  Bias: {fmt(r?.bias)}
                  <small>Positive = too high; negative = too low</small>
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="notice">
        Lower average miss is better. Use shared games for a fair head-to-head
        comparison; different samples can give a misleading winner. These are
        first saved pregame forecasts, not the last number before kickoff. Stat
        corrections can update results.
      </p>
      <p>
        {report?.captured || 0} forecasts stored · {report?.awaiting || 0} await
        a final result or matching component stats. Qwen and combined results
        accumulate from the new ledger; earlier Yahoo snapshots can be scored
        because they were actually recorded.
      </p>
      <details open>
        <summary>Sportsbook receipts · evaluated separately</summary>
        <p>
          Offensive partial totals are checked only against the same scored
          categories. K/DEF models are checked against full fantasy totals.
          Neither is silently placed in the full-forecast leaderboard.
        </p>
        <div className="table-wrap">
          <SortableTable>
            <thead>
              <tr>
                <th>Coverage</th>
                <th>Position</th>
                <th>Samples</th>
                <th>Average miss</th>
                <th>Bias</th>
              </tr>
            </thead>
            <tbody>
              {["QB", "RB", "WR", "TE", "K", "DEF"]
                .filter((p) => position === "ALL" || position === p)
                .map((p) => {
                  const r = report?.summary?.find(
                    (r: any) => r.mode === "bookies" && r.position === p,
                  );
                  return (
                    <tr key={p}>
                      <td>
                        {["K", "DEF"].includes(p)
                          ? "Full specialist model"
                          : "Quoted categories only"}
                      </td>
                      <td>{p}</td>
                      <td>{r?.samples || 0}</td>
                      <td>{fmt(r?.mae)}</td>
                      <td>{fmt(r?.bias)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </SortableTable>
        </div>
      </details>
      <details>
        <summary>Show the player-by-player receipts</summary>
        <p>
          Latest {rows.length} of {report?.rowCount ?? rows.length} scored
          forecasts. Position filter applies here; shared-game comparison
          applies to the three summary cards above.
        </p>
        <div className="table-wrap">
          <SortableTable>
            <thead>
              <tr>
                <th>Player</th>
                <th>Week</th>
                <th>Source</th>
                <th>Forecast</th>
                <th>Scored result</th>
                <th>Error</th>
                <th>Saved before kickoff</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter(
                  (r: any) => position === "ALL" || r.position === position,
                )
                .slice(-500)
                .map((r: any) => (
                  <tr key={`${r.week}:${r.id}:${r.mode}`}>
                    <td data-sort-value={r.name}>
                      <PlayerLink id={r.id} name={r.name} />
                    </td>
                    <td>{r.week}</td>
                    <td>
                      {names[r.mode]}
                      {r.partial && <small>Partial categories</small>}
                    </td>
                    <td>{fmt(r.points)}</td>
                    <td>{fmt(r.actual)}</td>
                    <td>{fmt(r.error)}</td>
                    <td data-sort-value={Date.parse(r.capturedAt)}>
                      {stamp(r.capturedAt)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </SortableTable>
        </div>
      </details>
    </section>
  );
}
export function WeeklyRecap({ plan }: { plan: any }) {
  const [week, setWeek] = useState<number | null>(null);
  const recaps = plan?.recaps || [],
    recap =
      recaps.find((r: any) => r.week === week) ||
      recaps.find((r: any) => r.complete) ||
      recaps[0];
  return (
    <section className="panel weekly-recap">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE MONDAY RECEIPTS</span>
          <h2>Game balls. Gut punches. Who owes lunch?</h2>
        </div>
        <label>
          Week
          <select
            aria-label="Recap week"
            value={recap?.week || ""}
            onChange={(e) => setWeek(Number(e.target.value))}
          >
            {recaps.map((r: any) => (
              <option key={r.week} value={r.week}>
                Week {r.week}
                {r.complete ? " · Final" : " · In progress"}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!recap ? (
        <p>
          The first recap arrives when we have scored roster results. No made-up
          victory lap.
        </p>
      ) : (
        <>
          <div className="recap-banner">
            <strong>{fmt(recap.points)} points banked</strong>
            <span>
              {recap.completedStarters}/{recap.starterCount} starters have final
              scores ·{" "}
              {recap.complete
                ? "Week complete"
                : "Live chapter — not the final recap"}
            </span>
          </div>
          <div className="recap-card-grid">
            <article>
              <span>ROSTER MVP</span>
              {recap.mvp ? (
                <>
                  <h3>
                    <PlayerLink id={recap.mvp.id} name={recap.mvp.name} />
                  </h3>
                  <strong>{fmt(recap.mvp.points)} points</strong>
                  <p>Showed up with the rent money.</p>
                </>
              ) : (
                <p>Waiting for a final score.</p>
              )}
            </article>
            <article>
              <span>ROUGH DAY AT THE OFFICE</span>
              {recap.letdown ? (
                <>
                  <h3>
                    <PlayerLink
                      id={recap.letdown.id}
                      name={recap.letdown.name}
                    />
                  </h3>
                  <strong>{fmt(recap.letdown.difference)} vs Yahoo</strong>
                  <p>
                    {fmt(recap.letdown.actual)} actual;{" "}
                    {fmt(recap.letdown.expected)} in the last recorded pregame
                    roster.
                  </p>
                </>
              ) : (
                <p>No recorded projection miss to call out.</p>
              )}
            </article>
            <article>
              <span>NEW GUY ENERGY</span>
              {recap.pickup ? (
                <>
                  <h3>
                    <PlayerLink id={recap.pickup.id} name={recap.pickup.name} />
                  </h3>
                  <strong>{fmt(recap.pickup.points)} points</strong>
                  <p>New since the previous recorded week.</p>
                </>
              ) : (
                <p>
                  {recap.pickupKnown
                    ? "No newly added player has a final score to spotlight."
                    : "A previous-week roster is needed to identify a pickup."}
                </p>
              )}
            </article>
            <article>
              <span>BEST READ OF THE WEEK</span>
              <h3>
                {recap.bestSource
                  ? names[recap.bestSource]
                  : "Still earning the receipts"}
              </h3>
              <p>
                {recap.bestSource
                  ? `Lowest error on ${recap.commonSamples} shared player-games. One week is not a track record.`
                  : "At least three completed games forecasted by all three full models are needed for a weekly comparison."}
              </p>
            </article>
          </div>
          <h3>Bad bounce or bad call? Watch the damn film.</h3>
          <p>
            A better bench result alone doesn’t make the decision bad. These
            checks compare the last recorded pregame Yahoo projections and legal
            direct substitutes.
          </p>
          {recap.decisions.length ? (
            <div className="decision-receipts">
              {recap.decisions.map((d: any) => (
                <article key={d.id}>
                  <b>{d.kind}</b>
                  <p>
                    <PlayerLink id={d.id} name={d.name} /> started;{" "}
                    <PlayerLink id={d.benchId} name={d.benchName} /> was an
                    eligible bench alternative.
                  </p>
                  <small>
                    Bench minus starter: {fmt(d.expectedGap)} projected
                    beforehand · {fmt(d.actualGap)} in the final score. Slot
                    combinations and your own risk preference can change the
                    call.
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p>
              No complete pregame-and-final pair is available for grading a
              start/sit decision.
            </p>
          )}
          <small>
            Results as of {stamp(recap.updatedAt)}. Scoring corrections can
            revise this recap.
          </small>
        </>
      )}
    </section>
  );
}
