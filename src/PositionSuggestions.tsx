import { SortableTable } from "./SortableTable";
import {
  PlayerLink,
  PlayerText,
  PlayerChartTick,
  yahooPoints,
} from "./PlayerExperience";
import type { PlayerData } from "../shared/model";
import { useAnalysis } from "./useAnalysis";
import { useNews } from "./NewsHub";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
export function PositionSuggestions({
  pool,
  onPlayer,
}: {
  pool: PlayerData[];
  onPlayer: (p: PlayerData) => void;
}) {
  const state = useAnalysis(),
    news = useNews(),
    q = state?.data?.qwen || state?.previousQwen,
    picks = q?.waivers || [];
  const names: Record<string, string> = {
    QB: "Quarterbacks",
    RB: "Running backs",
    WR: "Wide receivers",
    TE: "Tight ends",
    K: "Kickers",
    DEF: "Defenses",
  };
  return (
    <section className="position-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SIX POSITION WATCHLISTS</span>
          <h3>Find the help. Skip the hype.</h3>
        </div>
        <p>
          Qwen priority / 100 and projected fantasy points are separate
          measures.
        </p>
      </div>
      <div className="position-grid">
        {Object.entries(names).map(([pos, label]) => {
          const ranked = pool
            .filter(
              (p) =>
                p.position === pos &&
                /^(FA|W)/.test(p.availability) &&
                !p.locked &&
                (!p.kickoffAt || Date.parse(p.kickoffAt) > Date.now()) &&
                p.bye !== state?.data?.week &&
                !["O", "IR", "PUP", "SUSP"].includes(p.status),
            )
            .sort(
              (a, b) =>
                (picks.find((x: any) => x.id === b.id)?.score ?? -1) -
                  (picks.find((x: any) => x.id === a.id)?.score ?? -1) ||
                (b.projected ?? -1) - (a.projected ?? -1),
            )
            .slice(0, 3);
          const lead = ranked[0],
            pick = picks.find((x: any) => x.id === lead?.id),
            event = news?.events?.find(
              (e: any) =>
                e.playerId === lead?.id && e.assessment && !e.supersededAt,
            );
          return (
            <article key={pos} className="panel position-card">
              <div className="section-heading">
                <h4>{label}</h4>
                <span className="position-badge">{pos}</span>
              </div>
              {lead ? (
                <>
                  <button
                    className="candidate-name"
                    onClick={() => onPlayer(lead)}
                  >
                    {lead.name} ↗
                  </button>
                  <small>
                    {lead.team} · {lead.availability}
                  </small>
                  <div className="candidate-numbers">
                    <div>
                      <strong>{pick?.score ?? "—"}</strong>
                      <span>Qwen / 100</span>
                    </div>
                    <div>
                      <strong>
                        {(lead.providerProjected ?? lead.projected)?.toFixed(
                          1,
                        ) ?? "—"}
                      </strong>
                      <span>Yahoo points</span>
                    </div>
                    <div>
                      <strong>
                        {lead.aiProjection?.points?.toFixed(1) ?? "—"}
                      </strong>
                      <span>Statistical points</span>
                    </div>
                  </div>
                  <small>
                    {state?.qwenUpdated ? "Updated" : "Not updated"} ·{" "}
                    {q?.generatedAt
                      ? new Date(q.generatedAt).toLocaleString()
                      : "Awaiting AI"}
                  </small>
                  {event && (
                    <p className="news-signal">
                      {event.assessment.action} · {event.type} report{" "}
                      <a href={event.url} target="_blank" rel="noreferrer">
                        Source ↗
                      </a>
                    </p>
                  )}
                  <details>
                    <summary>Why consider {lead.name.split(" ")[0]}?</summary>
                    <p>
                      {pick?.summary ||
                        "Available candidate ranked by current projection. Review roster fit, injury status and claim timing."}
                    </p>
                    <small>
                      {pick?.summaryKind || "Statistical shortlist"} · priority
                      is not win probability.
                    </small>
                    {event && <p>{event.assessment.interpretation}</p>}
                  </details>
                  <details>
                    <summary>Compare {ranked.length} candidates</summary>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart
                        data={ranked.map((p) => ({
                          name: p.name,
                          points: yahooPoints(p),
                        }))}
                      >
                        <XAxis dataKey="name" tick={<PlayerChartTick />} />
                        <YAxis />
                        <Tooltip />
                        <Bar
                          isAnimationActive={false}
                          dataKey="points"
                          name="Yahoo points"
                          fill="#f5ad32"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <small>
                      Yahoo weekly projections ·{" "}
                      {state?.snapshotAt
                        ? new Date(state.snapshotAt).toLocaleString()
                        : "unknown freshness"}
                    </small>
                    <div className="table-wrap">
                      <SortableTable>
                        <thead>
                          <tr>
                            <th>Player</th>
                            <th>Qwen /100</th>
                            <th>Yahoo pts</th>
                            <th>Qwen pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <button onClick={() => onPlayer(p)}>
                                  {p.name}
                                </button>
                              </td>
                              <td>
                                {picks.find((x: any) => x.id === p.id)?.score ??
                                  "Not scored"}
                              </td>
                              <td>{yahooPoints(p)?.toFixed(2) ?? "—"}</td>
                              <td>
                                {p.aiProjection?.points?.toFixed(2) ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </SortableTable>
                    </div>
                  </details>
                </>
              ) : (
                <p>No eligible imported candidates at this position.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
