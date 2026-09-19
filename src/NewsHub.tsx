import { SortableTable } from "./SortableTable";
import { PlayerLink, PlayerText } from "./PlayerExperience";
import { useEffect, useState } from "react";
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
  ReferenceLine,
} from "recharts";
import { useAnalysis } from "./useAnalysis";
let cached: any = null,
  pending: Promise<any> | null = null,
  readAt = 0;
async function read() {
  if (pending) return pending;
  if (cached && Date.now() - readAt < 10000) return cached;
  pending = fetch("/api/news")
    .then((r) => {
      if (!r.ok) throw Error();
      return r.json();
    })
    .then((d) => {
      cached = d;
      readAt = Date.now();
      return d;
    })
    .finally(() => (pending = null));
  return pending;
}
export function useNews() {
  const [data, set] = useState(cached);
  useEffect(() => {
    let active = true;
    const tick = () =>
      read()
        .then((d) => active && set(d))
        .catch(() => {});
    void tick();
    const timer = setInterval(tick, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return data;
}
const date = (v: any) => (v ? new Date(v).toLocaleString() : "Not yet");
export function EventCard({
  event,
  onPlayer,
}: {
  event: any;
  onPlayer?: (id: string) => void;
}) {
  const e = event,
    a = e.assessment || e.previousAssessment;
  return (
    <article className="event-card">
      <div className="event-meta">
        <span className={"event-tag " + e.type}>{e.type}</span>
        <span>
          {e.kind === "reporting"
            ? "Reported · verify"
            : e.kind === "community"
              ? "Community · unverified"
              : "Opinion · unverified"}
        </span>
        <time>{date(e.publishedAt)}</time>
      </div>
      {onPlayer ? (
        <button className="text-link" onClick={() => onPlayer(e.playerId)}>
          {e.playerName}
        </button>
      ) : (
        <PlayerLink id={e.playerId} name={e.playerName} />
      )}
      <p>
        {a?.interpretation ||
          "New evidence awaiting AI review. Read the source before changing your team."}
      </p>
      {a && !e.assessment && (
        <small>Previous suggestion · not updated for this event</small>
      )}
      {e.conflicting && (
        <small>Conflicting reports: verify the latest official status.</small>
      )}
      {a?.changed && <small>{a.changed}</small>}
      <details>
        <summary>Why? Evidence and source</summary>
        <blockquote>{e.assessment?.quote || e.evidence}</blockquote>
        <a href={e.url} target="_blank" rel="noreferrer">
          {e.source} ↗
        </a>
        <p className="muted">
          {a?.uncertainty ||
            "A reported event is not an official availability confirmation."}
        </p>
        <small>
          {a ? "AI assessed " + date(a.generatedAt) : "Not analyzed yet"} ·
          Advice never changes Yahoo automatically.
        </small>
      </details>
    </article>
  );
}
export function NewsHub({ onPlayer }: { onPlayer: (id: string) => void }) {
  const n = useNews();
  const [filter, setFilter] = useState("all");
  const events = (n?.events || []).filter(
    (e: any) => !e.supersededAt && (filter === "all" || e.type === filter),
  );
  const unique = events.filter(
    (e: any, i: number) =>
      events.findIndex(
        (x: any) => x.playerId === e.playerId && x.articleId === e.articleId,
      ) === i,
  ) as any[];
  const [page, setPage] = useState(0);
  return (
    <section className="panel news-hub">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PLAYER INTELLIGENCE</span>
          <h3>The sideline wire</h3>
          <p>
            The group chat has opinions. We brought damn sources. Read the
            report before making the move.
          </p>
        </div>
        <small>News checked {date(n?.lastCollectedAt)}</small>
      </div>
      <div
        className="filter-pills"
        role="group"
        aria-label="News event category"
      >
        {[
          "all",
          "injury",
          "practice",
          "availability",
          "role",
          "workload",
          "transaction",
          "matchup",
        ].map((t) => (
          <button
            aria-pressed={filter === t}
            onClick={() => {
              setFilter(t);
              setPage(0);
            }}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {unique.length ? (
        <div className="news-grid">
          {unique.slice(page * 12, page * 12 + 12).map((e) => (
            <EventCard key={e.id} event={e} onPlayer={onPlayer} />
          ))}
        </div>
      ) : (
        <p className="empty">
          No substantive matching events in this category. Headline-only search
          results are not treated as evidence.
        </p>
      )}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>{unique.length} matched stories</span>
        <button
          disabled={(page + 1) * 12 >= unique.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      <details className="source-headlines">
        <summary>Recent source headlines & discovery links</summary>
        <p>Discovery links are not treated as verified player events.</p>
        {n?.articles?.map((a: any) => (
          <p key={a.id}>
            <a href={a.url} target="_blank" rel="noreferrer">
              {a.title}
            </a>
            <small>
              {" "}
              · {a.source} · {date(a.publishedAt)}
              {a.discoveryOnly ? " · discovery only" : ""}
            </small>
          </p>
        ))}
      </details>
      <MarketContext />
    </section>
  );
}
export function MarketContext() {
  const n = useNews();
  const games = n?.market?.games || [];
  return (
    <details className="market-context">
      <summary>NFL matchup & market context</summary>
      <p>
        Free ESPN scoreboard data · {date(n?.market?.updatedAt)}. Market totals
        are team scoring context, not player forecasts.
      </p>
      <div className="market-grid">
        {games.map((g: any) => (
          <article key={g.id}>
            <b>{g.name}</b>
            <small>{date(g.date)}</small>
            <p>
              {g.total != null
                ? `Total ${g.total} · Spread ${g.spread ?? "—"}`
                : "Market odds unavailable"}
            </p>
            <a href={g.url} target="_blank" rel="noreferrer">
              {g.provider || "ESPN matchup"} ↗
            </a>
          </article>
        ))}
      </div>
      {!games.length && <p>Market data unavailable.</p>}
    </details>
  );
}
export function NewsOperations({ owner }: { owner: boolean }) {
  const n = useNews();
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    if (!owner) return;
    let live = true;
    const read = () =>
      fetch("/api/ai/progress")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (live && d) setLogs(d.logs);
        })
        .catch(() => {});
    void read();
    const timer = setInterval(read, 5000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [owner]);
  return (
    <section className="panel">
      <h3>News & AI operations</h3>
      {owner && (
        <details>
          <summary>Live AI worker activity</summary>
          {logs[0] && (
            <p role="status">
              {logs[0].stage} · {date(logs[0].created_at)}
              {Date.now() - Date.parse(logs[0].created_at) > 120000
                ? " · No recent heartbeat; Mac may be asleep or offline."
                : ""}
            </p>
          )}
          {logs.map((l) => (
            <p key={l.id}>
              {date(l.created_at)} · {l.stage}
            </p>
          ))}
        </details>
      )}
      <p role="status">
        {n?.stage || "Waiting for collection"} · {n?.completed ?? 0}/
        {n?.total ?? 0} collection items · Last heartbeat {date(n?.heartbeat)}
      </p>
      <p>
        {n?.articleCount || 0} articles · {n?.eventCount || 0} cited events ·{" "}
        {n?.runs?.filter((r: any) => r.status === "complete").length || 0}/
        {n?.runs?.length || 0} recent AI batches complete
      </p>
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Last success</th>
              <th>Next check</th>
            </tr>
          </thead>
          <tbody>
            {n?.sources?.map((s: any) => (
              <tr key={s.source}>
                <td>{s.source}</td>
                <td>{s.status}</td>
                <td
                  data-sort-value={
                    s.updated_at ? Date.parse(s.updated_at) : null
                  }
                >
                  {date(s.updated_at)}
                </td>
                <td data-sort-value={s.next_at ? Date.parse(s.next_at) : null}>
                  {date(s.next_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
      <details>
        <summary>AI batch history</summary>
        {n?.runs?.map((r: any) => (
          <p key={r.id}>
            #{r.id} · {r.status} · {r.players} player ·{" "}
            {date(r.completed_at || r.created_at)} {r.error}
          </p>
        ))}
      </details>
    </section>
  );
}
export function DecisionOverview({
  dashboard,
  onPlayer,
  onLineup,
}: {
  dashboard: any;
  onPlayer: (id: string) => void;
  onLineup: () => void;
}) {
  const n = useNews(),
    s = dashboard.snapshot || dashboard.data || dashboard.s;
  const [since] = useState(() => {
    try {
      return localStorage.getItem("edge:v1:last-visit");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("edge:v1:last-visit", new Date().toISOString());
    } catch {}
  }, []);
  const roster = dashboard.snapshot?.players || [];
  const events = (n?.events || []).filter(
    (e: any) => !e.supersededAt && roster.some((p: any) => p.id === e.playerId),
  );
  const latest = events.filter(
    (e: any, i: number) =>
      events.findIndex((x: any) => x.playerId === e.playerId) === i,
  ) as any[];
  const m = dashboard.league?.matchup;
  const chart =
    m && m.ownProjected != null && m.opponentProjected != null
      ? [
          { team: "Your team", points: m.ownProjected },
          { team: m.opponentName || "Opponent", points: m.opponentProjected },
        ]
      : [];
  return (
    <section className="decision-grid">
      <article className="panel matchup-card">
        <span className="eyebrow">YOUR NEXT MATCHUP</span>
        <h2>Make the next move count.</h2>
        {chart.length ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit=" pts" />
                <YAxis type="category" dataKey="team" width={90} />
                <Tooltip />
                <Bar
                  isAnimationActive={false}
                  dataKey="points"
                  name="Yahoo projected points"
                  fill="#f5ad32"
                  radius={[0, 5, 5, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
            <small>
              Yahoo live matchup projections · {date(s?.capturedAt)} · not win
              probability
            </small>
          </>
        ) : (
          <p>Matchup projections are unavailable in this import.</p>
        )}
        <button className="primary" onClick={onLineup}>
          Review lineup gain{" "}
          {dashboard.advice?.delta != null
            ? `+${Math.max(0, dashboard.advice.delta).toFixed(1)} pts`
            : ""}
        </button>
      </article>
      <article className="panel priority-actions">
        <span className="eyebrow">THREE THINGS TO REVIEW</span>
        <h3>Three calls worth your damn attention</h3>
        <button className="action-row" onClick={onLineup}>
          <b>1 · Check your eligible lineup</b>
          <span>
            {dashboard.advice?.changes?.length || 0} slot changes to review
            together
          </span>
        </button>
        {latest.slice(0, 2).map((e, i) => (
          <button
            className="action-row"
            key={e.id}
            onClick={() => onPlayer(e.playerId)}
          >
            <b>
              {i + 2} · {e.playerName}
            </b>
            <span>
              {e.assessment?.action || "Read new " + e.type + " report"} ·{" "}
              {date(e.publishedAt)}
            </span>
          </button>
        ))}
        {latest.length < 2 && (
          <p>
            Review injury flags and waiver options before kickoff. No additional
            substantive roster news is available.
          </p>
        )}
      </article>
      <article className="panel recent-news">
        <h3>Since your last visit</h3>
        {latest
          .filter(
            (e) => !since || Date.parse(e.publishedAt) > Date.parse(since),
          )
          .slice(0, 3)
          .map((e) => (
            <EventCard key={e.id} event={e} onPlayer={onPlayer} />
          ))}
        {!latest.some(
          (e) => !since || Date.parse(e.publishedAt) > Date.parse(since),
        ) && <p>No new matching roster reports since your last visit.</p>}
      </article>
    </section>
  );
}
export function PlayerNews({
  player,
  history,
}: {
  player: any;
  history: any[];
}) {
  const [data, set] = useState<any>(null),
    [page, setPage] = useState(0);
  const analysis = useAnalysis();
  useEffect(() => {
    setPage(0);
    set(null);
  }, [player.id]);
  useEffect(() => {
    const c = new AbortController();
    fetch(
      "/api/players/" + encodeURIComponent(player.id) + "/news?page=" + page,
      { signal: c.signal },
    )
      .then((r) => r.json())
      .then(set)
      .catch(() => {});
    return () => c.abort();
  }, [player.id, page]);
  const points = history
    .map((h) => ({
      time: Date.parse(h.capturedAt),
      actual: h.actual,
      projected: h.projected,
    }))
    .sort((a, b) => a.time - b.time);
  const scores = (data?.scoreHistory || [])
    .map((r: any) => ({ time: Date.parse(r.created_at), score: r.pick.score }))
    .filter((r: any) => r.score != null)
    .reverse();
  const p = analysis?.data?.players?.find((p: any) => p.id === player.id);
  return (
    <section className="player-intelligence">
      <h3>The scouting report · Bring receipts.</h3>
      {p?.history?.length > 0 && (
        <>
          <h4>Historical fantasy points</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={p.history.map((h: any) => ({
                ...h,
                label: h.season + " W" + h.week,
              }))}
            >
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar
                isAnimationActive={false}
                dataKey="points"
                fill="#f5ad32"
                name="Fantasy points"
              />
            </BarChart>
          </ResponsiveContainer>
          <small>
            Statistical history · prior seasons are context, not current form
          </small>
        </>
      )}
      {points.length > 1 && (
        <>
          <h4>Imported points & news timeline</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points}>
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => new Date(v).toLocaleDateString()}
              />
              <YAxis unit=" pts" />
              <Tooltip labelFormatter={(v) => date(v)} />
              <Line
                isAnimationActive={false}
                dataKey="actual"
                name="Imported actual points"
                stroke="#65c5ac"
                connectNulls={false}
              />
              {data?.events
                ?.filter(
                  (e: any) =>
                    Date.parse(e.publishedAt) >= points[0].time &&
                    Date.parse(e.publishedAt) <= points.at(-1)!.time,
                )
                .slice(0, 8)
                .map((e: any) => (
                  <ReferenceLine
                    key={e.id}
                    x={Date.parse(e.publishedAt)}
                    stroke="#f5ad32"
                    strokeDasharray="3 3"
                    label={e.type}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
          <small>
            Yahoo import observations; amber markers are publication times, not
            proof of causation.
          </small>
        </>
      )}
      <h4>Qwen priority history</h4>
      {scores.length > 1 ? (
        <>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={scores}>
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => new Date(v).toLocaleTimeString()}
              />
              <YAxis domain={[0, 100]} />
              <Tooltip labelFormatter={(v) => date(v)} />
              <Line
                isAnimationActive={false}
                dataKey="score"
                name="Priority / 100"
                stroke="#f5ad32"
              />
            </LineChart>
          </ResponsiveContainer>
          <small>
            Subjective Qwen priority, not points · latest{" "}
            {date(scores.at(-1).time)}
          </small>
        </>
      ) : (
        <p>More saved recommendations are needed to show a trend.</p>
      )}
      <h4>News timeline & sources</h4>
      {data?.events?.map((e: any) => (
        <EventCard key={e.id} event={e} />
      ))}
      {!data?.events?.length && <p>No substantive matched news yet.</p>}
      <div className="pagination">
        <button disabled={!page} onClick={() => setPage((p) => p - 1)}>
          Newer
        </button>
        <button disabled={!data?.hasMore} onClick={() => setPage((p) => p + 1)}>
          Older
        </button>
      </div>
    </section>
  );
}
