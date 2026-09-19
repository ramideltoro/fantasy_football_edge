import { SortableTable } from "./SortableTable";
import { PlayerLink, PlayerText, usePlayers } from "./PlayerExperience";
import { ProjectionStatus } from "./ProjectionStatus";
import { TeamBrief } from "./TeamBrief";
import { DecisionCharts } from "./DecisionCharts";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
export function AIInsights({ owner }: { owner: boolean }) {
  const { open } = usePlayers();
  const [state, setState] = useState<any>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState("");
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const r = await fetch("/api/intelligence", { signal: c.signal });
        if (!r.ok) throw Error();
        setState(await r.json());
        setError("");
      } catch {
        if (!c.signal.aborted) setError("Analysis is temporarily unavailable.");
      } finally {
        if (!c.signal.aborted) timer = setTimeout(read, 10000);
      }
    }
    void read();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, []);
  const d = state?.data,
    p = d?.players.find((p: any) => p.id === selected),
    fmt = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(2));
  return (
    <>
      <ProjectionStatus />
      <section className="panel">
        <h3>Qwen’s film room · Show your damn work.</h3>
        <p>
          Qwen watches the numbers. You wear the headset. No gold stars for a
          pretty forecast: check the evidence. Point forecasts use player
          history, league scoring, ESPN roles and current reporting; Yahoo stays
          separate.
        </p>
        <p role="status">
          Analysis: {state?.status || "Loading"} · Snapshot:{" "}
          {state?.snapshotAt
            ? new Date(state.snapshotAt).toLocaleString()
            : "Waiting"}
          {state?.error ? " · " + state.error : ""}
        </p>
        {error && <p className="notice">{error}</p>}
        {owner && state?.status === "failed" && (
          <button
            onClick={async () => {
              await fetch("/api/intelligence/retry", { method: "POST" });
            }}
          >
            Retry analysis
          </button>
        )}
        <p>
          The Qwen worker requires your Mac and Qwen server to be online. The
          roster’s Qwen points are calculated by Qwen from supplied evidence.
        </p>
      </section>
      {d && (
        <>
          <TeamBrief data={d} status={state.status} />
          <section className="panel">
            <h3>The calls. The receipts.</h3>
            {d.qwen && <DecisionCharts data={d} mode="team" />}
            {d.qwen ? (
              <>
                <p>
                  <PlayerText text={d.qwen.summary} />
                </p>
                <small>
                  {d.qwen.model} ·{" "}
                  {new Date(d.qwen.generatedAt).toLocaleString()}
                </small>
                {d.qwen.insights.map((x: any) => {
                  const player = d.players.find((p: any) => p.id === x.id);
                  const locked =
                    player?.locked ||
                    (player?.kickoffAt &&
                      Date.parse(player.kickoffAt) <= Date.now());
                  return (
                    <div className="ai-pick ai-action" key={x.id}>
                      <div>
                        <b>
                          <PlayerLink id={x.id} /> ·{" "}
                          {locked ? "Game locked" : x.action}
                        </b>
                        <p>
                          <PlayerText text={x.reason} />
                        </p>
                        <small>Uncertainty: {x.uncertainty}</small>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <p>
                Statistical evidence is ready. Qwen commentary is{" "}
                {state.status === "failed"
                  ? "unavailable; use Retry analysis"
                  : "queued or processing"}
                .
              </p>
            )}
          </section>
          <section className="panel">
            <h3>Start, waiver and risk comparison</h3>
            <p>
              Ranked by active projected points: independent Qwen estimates when
              ready, otherwise Yahoo fallback. Qwen uses online statistical
              history and reporting, without receiving Yahoo’s projection.
              Prior-season games remain historical context; superiority is not
              established.
            </p>
            <label>
              Search player
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search AI player analysis"
              />
            </label>
            <div className="table-wrap">
              <SortableTable>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Position / role</th>
                    <th>Yahoo</th>
                    <th>Model</th>
                    <th>Current samples</th>
                    <th>Opponent</th>
                    <th>Injury / availability</th>
                  </tr>
                </thead>
                <tbody>
                  {d.players
                    .filter((p: any) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .sort(
                      (a: any, b: any) =>
                        (b.projection ?? -Infinity) -
                        (a.projection ?? -Infinity),
                    )
                    .map((p: any) => (
                      <tr key={p.id}>
                        <td>
                          <button
                            onClick={() => {
                              setSelected(p.id);
                              open([p.id]);
                            }}
                          >
                            {p.name}
                          </button>
                        </td>
                        <td>
                          {p.position} · {p.nflRole}
                        </td>
                        <td>{fmt(p.providerProjection)}</td>
                        <td>{fmt(p.projection)}</td>
                        <td>{p.currentSamples}</td>
                        <td>{p.opponent || "Unknown"}</td>
                        <td>
                          {p.injury || "No imported injury flag"} ·{" "}
                          {p.slot || p.available}
                          {p.locked ||
                          (p.kickoffAt && Date.parse(p.kickoffAt) <= Date.now())
                            ? " · Game locked"
                            : ""}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </SortableTable>
            </div>
          </section>
          {p && (
            <section className="panel">
              <h3>
                <PlayerLink id={p.id} />: usage and recent results
              </h3>
              <p>{p.method}</p>
              {p.missing.length > 0 && (
                <p>Missing evidence: {p.missing.join(", ")}</p>
              )}
              {p.history.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={p.history.map((x: any) => ({
                        ...x,
                        label: x.season + " W" + x.week,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        name="League-scored points"
                        dataKey="points"
                        stroke="#f5ad32"
                        connectNulls={false}
                      />
                      <Line name="Targets" dataKey="targets" stroke="#71c7bd" />
                      <Line name="Carries" dataKey="carries" stroke="#a995ea" />
                    </LineChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={p.history.map((x: any) => ({
                        ...x,
                        label: x.season + " W" + x.week,
                      }))}
                    >
                      <XAxis dataKey="label" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Line
                        name="Offensive snap %"
                        dataKey="snapPct"
                        stroke="#f5ad32"
                        connectNulls={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <p>No matched history is available.</p>
              )}
              {p.headlines.length ? (
                p.headlines.map((n: any) => (
                  <p key={n.url}>
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.title}
                    </a>{" "}
                    · {n.source}
                  </p>
                ))
              ) : (
                <p>No matching headline in the current feeds.</p>
              )}
            </section>
          )}
          <section className="panel">
            <h3>Suggested lineup</h3>
            <p>
              Uses the research-time lineup within your eligible, unlocked
              roster slots. Review injuries and current game locks before
              acting.
            </p>
            {d.lineup.lineup.map((x: any) => (
              <div className="watch" key={x.slot + x.playerId}>
                <b>{x.slot}</b>
                <span>
                  <PlayerLink id={x.playerId} />
                  {x.locked ? " · locked" : ""}
                </span>
              </div>
            ))}
          </section>
          <section className="panel">
            <h3>Historical statistical-blend accuracy versus Yahoo</h3>
            <div className="metrics">
              <div className="metric">
                <span>Scored forecasts</span>
                <strong>{state.accuracy.sampleSize}</strong>
              </div>
              <div className="metric">
                <span>Model mean absolute error</span>
                <strong>{fmt(state.accuracy.modelMae)}</strong>
              </div>
              <div className="metric">
                <span>Yahoo mean absolute error</span>
                <strong>{fmt(state.accuracy.yahooMae)}</strong>
              </div>
            </div>
            <p>
              {state.accuracy.method} Lower error is better.{" "}
              {state.accuracy.sampleSize === 0
                ? "Awaiting completed games after pregame forecasts were stored."
                : ""}
            </p>
          </section>
          <section className="panel">
            <h3>Evidence sources</h3>
            <p>
              nflverse player statistics and snap counts are cached for 24
              hours. ESPN supplies depth order; Yahoo supplies projections,
              roster state and league scoring. Opponent adjustments require
              enough current-season observations.
            </p>
            {d.sources.map((s: any) => (
              <p key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.url.split("/").pop()}
                </a>{" "}
                · {s.status} ·{" "}
                {s.updatedAt
                  ? new Date(s.updatedAt).toLocaleString()
                  : "Unavailable"}
              </p>
            ))}
            <a
              href="https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html"
              target="_blank"
              rel="noreferrer"
            >
              nflverse data availability
            </a>
          </section>
        </>
      )}
    </>
  );
}
