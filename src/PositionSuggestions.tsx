import type { PlayerData } from "../shared/model";
import {
  positionShortlist,
  waiverForecast,
  waiverPositions,
} from "../shared/shortlist";
const names: Record<string, string> = {
  QB: "Quarterbacks",
  RB: "Running backs",
  WR: "Wide receivers",
  TE: "Tight ends",
  K: "Kickers",
  DEF: "Defenses",
};
const points = (value: number | null | undefined) =>
  value == null ? "—" : value.toFixed(2);
export function PositionSuggestions({
  pool,
  week,
  snapshotAt,
  onPlayer,
}: {
  pool: PlayerData[];
  week: number;
  snapshotAt: string;
  onPlayer: (p: PlayerData) => void;
}) {
  return (
    <section className="position-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SIX POSITION SHORTLISTS</span>
          <h3>The best available help at every position.</h3>
        </div>
      </div>
      <p>
        Top three eligible imported options per position, refreshed with the
        dashboard. QB, RB, WR, TE and K use current Qwen forecasts when
        available, otherwise Yahoo. DEF prioritizes the current-season matchup
        model; fallback-only options appear after supported estimates.
      </p>
      <small>
        Availability from Yahoo: {new Date(snapshotAt).toLocaleString()}.
        Confirm availability and claim timing before adding a player.
      </small>
      <div className="position-grid">
        {waiverPositions.map((pos) => {
          const ranked = positionShortlist(pool, pos, week),
            lead = ranked[0],
            model = lead?.research?.defenseForecast;
          return (
            <article key={pos} className="panel position-card">
              <div className="section-heading">
                <h4>{names[pos]}</h4>
                <span className="position-badge">{pos}</span>
              </div>
              {lead ? (
                <>
                  <small>
                    {waiverForecast(lead, week).points == null
                      ? "Projection unavailable · review candidates"
                      : "Top projected pickup"}
                  </small>
                  <button
                    className="candidate-name"
                    onClick={() => onPlayer(lead)}
                  >
                    {lead.name} ↗
                  </button>
                  <p>
                    {lead.team} · {lead.availability}
                    {lead.research?.opponent
                      ? ` · vs ${lead.research.opponent}`
                      : ""}
                  </p>
                  <div className="candidate-numbers">
                    <div>
                      <strong>
                        {points(waiverForecast(lead, week).points)}
                      </strong>
                      <span>
                        {waiverForecast(lead, week).source} · projected points
                      </span>
                    </div>
                  </div>
                  {pos === "DEF" && (
                    <>
                      {model?.points != null ? (
                        <p>
                          {points(model.defenseAverage)} DEF points/game × 50% +{" "}
                          {points(model.opponentAverage)} allowed by{" "}
                          {model.opponent} × 50% ={" "}
                          <b>{points(model.points)} projected points</b>. Uses{" "}
                          {model.ownGames.length} defensive games and{" "}
                          {model.opponentGames.length} opponent games from{" "}
                          {model.season}.
                        </p>
                      ) : (
                        <p>
                          Not enough current-season data for both the defense
                          and its opponent. The displayed forecast is a labeled
                          fallback.
                        </p>
                      )}
                      <small>
                        {model?.limitation || "Matchup research pending."}
                      </small>
                    </>
                  )}
                  <ol>
                    {ranked.map((p, i) => {
                      const forecast = waiverForecast(p, week),
                        d = p.research?.defenseForecast;
                      return (
                        <li key={p.id}>
                          <div className="watch">
                            <button onClick={() => onPlayer(p)}>
                              {p.name}
                            </button>
                            <span>
                              {points(forecast.points)} pts · {forecast.source}
                            </span>
                          </div>
                          {pos === "DEF" && (
                            <>
                              <small>
                                Next:{" "}
                                {d?.opponent ||
                                  p.research?.defenseMatchup?.opponent ||
                                  "Pending"}{" "}
                                · DEF avg {points(d?.defenseAverage)} · Opponent
                                allows {points(d?.opponentAverage)}
                              </small>
                              {d?.points != null && (
                                <details>
                                  <summary>
                                    Show current-season game calculation
                                  </summary>
                                  <p>
                                    {d.method}. {d.limitation}
                                  </p>
                                  <p>
                                    <b>{p.name} performance:</b>{" "}
                                    {d.ownGames
                                      .map(
                                        (g: any) =>
                                          `W${g.week} vs ${g.opponent}: ${points(g.points)}`,
                                      )
                                      .join("; ")}{" "}
                                    fantasy points.
                                  </p>
                                  <p>
                                    <b>
                                      {d.opponent} allowed to opposing defenses:
                                    </b>{" "}
                                    {d.opponentGames
                                      .map(
                                        (g: any) =>
                                          `W${g.week} ${g.defense}: ${points(g.points)}`,
                                      )
                                      .join("; ")}{" "}
                                    fantasy points.
                                  </p>
                                  <small>
                                    League scoring · research{" "}
                                    {p.research?.generatedAt
                                      ? new Date(
                                          p.research.generatedAt,
                                        ).toLocaleString()
                                      : "pending"}
                                    . Statistics:{" "}
                                    <a
                                      href={`https://github.com/nflverse/nflverse-data/releases/tag/stats_team`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      nflverse team game data
                                    </a>
                                    .
                                  </small>
                                </details>
                              )}
                            </>
                          )}
                          {i === 0 &&
                            pos === "DEF" &&
                            d?.points != null &&
                            ranked[1]?.research?.defenseForecast?.points !=
                              null && (
                              <small>
                                {points(
                                  d.points -
                                    ranked[1].research.defenseForecast.points,
                                )}{" "}
                                points ahead of {ranked[1].name} in this model.
                              </small>
                            )}
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : (
                <p>
                  No eligible imported candidates at this position. Locked
                  games, byes and unavailable players are excluded.
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
