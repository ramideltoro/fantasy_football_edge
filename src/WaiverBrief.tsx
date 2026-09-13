import { DecisionCharts } from "./DecisionCharts";
import { useEffect, useState } from "react";
import type { PlayerData } from "../shared/model";
export function WaiverBrief({
  pool,
  onPlayer,
}: {
  pool: PlayerData[];
  onPlayer: (p: PlayerData) => void;
}) {
  const [state, setState] = useState<any>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const r = await fetch("/api/intelligence", { signal: c.signal });
        if (!r.ok) throw Error();
        setState(await r.json());
        setError(false);
      } catch {
        if (!c.signal.aborted) setError(true);
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
    picks = d?.qwen?.waivers;
  return (
    <section className="panel ai-brief">
      <div className="ai-heading">
        <div>
          <span className="ai-eyebrow">WAIVER INTELLIGENCE</span>
          <h3>Who deserves a closer look?</h3>
        </div>
        <span className="ai-badge">Qwen · Week {d?.week || "—"}</span>
      </div>
      <p>
        Players to consider, ranked by Qwen using projected points, NFL roles
        and recent reporting. Research covers the top 12 eligible imported
        candidates plus players with matching news, up to 20. Predictions and
        reported opinions are uncertain.
      </p>
      <p role="status">
        {error
          ? "Unable to refresh analysis."
          : `Analysis: ${state?.status || "loading"}`}
      </p>
      {picks ? (
        <>
          <p>
            Qwen selected {picks.length} candidates. Compare roster fit and
            claim deadlines before making a move; these are suggestions, not
            automatic transactions.
          </p>
          <DecisionCharts data={d} />
          <ol className="ai-card-grid">
            {picks.map((x: any, rank: number) => {
              const p = pool.find((p) => p.id === x.id);
              const unavailable = !p || !/^(FA|W)/.test(p.availability);
              const locked =
                p?.locked ||
                (p?.kickoffAt && Date.parse(p.kickoffAt) <= Date.now());
              return (
                <li key={x.id} className="ai-pick">
                  <div>
                    <b>
                      {p ? (
                        <button onClick={() => onPlayer(p)}>
                          #{rank + 1} {p.name} · {p.position}
                        </button>
                      ) : (
                        "Player no longer in imported pool"
                      )}
                    </b>
                    {(unavailable || locked) && (
                      <p className="notice">
                        {unavailable
                          ? "Availability has changed."
                          : "Game locked; do not treat this as a current-week lineup addition."}
                      </p>
                    )}
                    <div className="ai-assessment">
                      <span className="ai-eyebrow">
                        WHY CONSIDER THIS PLAYER
                      </span>
                      <p>{x.summary || x.reason}</p>
                    </div>
                    <small>
                      AI interpretation · verify against the evidence below.
                    </small>
                    <details className="ai-evidence">
                      <summary>Facts behind this pick</summary>
                      <p>{x.reason}</p>
                    </details>
                    {x.news.length ? (
                      <details className="ai-evidence">
                        <summary>{x.news.length} reporting sources</summary>
                        <small>
                          Reporting Qwen used (headlines and RSS excerpts; not
                          independently confirmed):
                        </small>
                        {x.news.map((n: any) => (
                          <p key={n.url}>
                            <a href={n.url} target="_blank" rel="noreferrer">
                              {n.title}
                            </a>{" "}
                            · {n.source}
                            {n.searchPlayer
                              ? " · Player-search result; relevance needs review"
                              : ""}{" "}
                            · {new Date(n.publishedAt).toLocaleString()}
                          </p>
                        ))}
                      </details>
                    ) : (
                      <p>
                        No matching news cited for this pick; its rationale uses
                        statistical and roster evidence only.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {!picks.length && (
            <p>Qwen did not identify a supported addition in this run.</p>
          )}
          <small>
            Roster snapshot: {new Date(d.snapshotAt).toLocaleString()} · Qwen:{" "}
            {new Date(d.qwen.generatedAt).toLocaleString()}
          </small>
        </>
      ) : (
        <p>
          {state?.status === "failed"
            ? "The analysis failed. Retry from AI insights."
            : "The news-backed waiver briefing is being prepared."}
        </p>
      )}
      <details>
        <summary>News coverage and freshness</summary>
        <p>
          Feeds are checked at most hourly during research. Only dated items
          from the past seven days are considered. Player-search results can
          cover several players and require relevance review. Missing news does
          not mean there is no news. Qwen ranks candidates; numerical
          projections remain the statistical model’s estimates.
        </p>
        {d?.newsSources?.map((s: any) => (
          <p key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.source}
            </a>{" "}
            · {s.status} ·{" "}
            {s.updatedAt
              ? new Date(s.updatedAt).toLocaleString()
              : "Unavailable"}
          </p>
        ))}
      </details>
    </section>
  );
}
