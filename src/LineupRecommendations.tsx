import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import type { SnapshotData } from "../shared/model";
import {
  projectionModes,
  type ProjectionMode,
} from "../shared/lineupProjections";
import { strategyLineup, type RiskMode } from "../shared/strategy";
import { effectiveStatus } from "../shared/availability";
import { PlayerLink } from "./PlayerExperience";
import { SortableTable } from "./SortableTable";
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));

export function LineupRecommendations({
  snapshot,
}: {
  snapshot: SnapshotData;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const constraints = useMemo(
    () => ({
      pinned: Object.keys(choices).filter((id) => choices[id] === "pin"),
      excluded: Object.keys(choices).filter((id) => choices[id] === "exclude"),
    }),
    [choices],
  );
  const [mode, setMode] = useState<ProjectionMode>("yahoo");
  const [risk, setRisk] = useState<RiskMode>("balanced");
  const a = useMemo(
    () => strategyLineup(snapshot, mode, risk, constraints),
    [snapshot, mode, risk, constraints],
  );
  const players = new Map(snapshot.players.map((p) => [p.id, p]));
  const unlocked = snapshot.players.filter(
    (p) => !p.locked && (!p.kickoffAt || Date.parse(p.kickoffAt) > Date.now()),
  );
  const eligible = unlocked.filter(
    (p) =>
      !["IR", "IR+", "NA"].includes(p.slot) &&
      !["O", "IR", "PUP", "SUSP"].includes(effectiveStatus(p)) &&
      p.bye !== snapshot.week,
  );
  const missing = eligible.filter((p) => a.projections[p.id].points === null);
  return (
    <section className="panel lineup-recommendations">
      <div className="panel-head">
        <div>
          <h3>Put your heavy hitters in.</h3>
          <p>
            Four playbooks. One lineup. Pick your numbers and make the damn
            call.
          </p>
        </div>
      </div>
      <div
        className="projection-modes"
        role="group"
        aria-label="Lineup projection source"
      >
        {(
          Object.entries(projectionModes) as [
            ProjectionMode,
            (typeof projectionModes)[ProjectionMode],
          ][]
        ).map(([key, value]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
          >
            {value.label}
          </button>
        ))}
      </div>
      <details className="lineup-receipts">
        <summary>My call · pin or bench a player</summary>
        <p>
          Game locks still apply. Conflicting choices leave the lineup unfilled
          instead of ignoring your instructions.
        </p>
        <div className="lab-controls">
          {snapshot.players.map((p) => (
            <label key={p.id}>
              <PlayerLink id={p.id} />
              <select
                aria-label={"Lineup choice for " + p.name}
                value={choices[p.id] || "auto"}
                disabled={
                  p.locked ||
                  (!!p.kickoffAt && Date.parse(p.kickoffAt) <= Date.now())
                }
                onChange={(e) =>
                  setChoices({ ...choices, [p.id]: e.target.value })
                }
              >
                <option value="auto">Coach decides</option>
                <option value="pin">Keep this guy in</option>
                <option value="exclude">Bench this guy</option>
              </select>
            </label>
          ))}
        </div>
        <button onClick={() => setChoices({})}>Clear my choices</button>
      </details>
      <div className="risk-controls">
        <span className="eyebrow">HOW DO YOU WANT TO PLAY IT?</span>
        <div
          className="filter-pills"
          role="group"
          aria-label="Lineup risk preference"
        >
          {(
            [
              ["balanced", "Most projected points"],
              ["protect", "Protect the lead"],
              ["chase", "Swing for the fences"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={a.risk === key}
              disabled={mode === "bookies" && key !== "balanced"}
              onClick={() => setRisk(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <p>
          {a.risk === "balanced"
            ? "Start with the highest total from your selected projection source."
            : a.risk === "protect"
              ? "Favor the lower end of each player’s historical scoring range. A steadier lineup can mean fewer expected points."
              : "Favor the upper end of each player’s historical scoring range. More upside can mean a rougher floor."}
        </p>
        {mode === "bookies" ? (
          <small>
            Risk preferences need full fantasy scores. Bookies mode includes
            partial props, so it uses the selected scores directly.
          </small>
        ) : (
          <small>
            Ranges use the last 5–8 available games, scored for your league and
            shifted around this forecast. They describe past variation, not
            guaranteed floors, ceilings or win odds. Players without enough
            history use their point forecast.
          </small>
        )}
      </div>
      <div className="lineup-mode-summary" role="status">
        <strong>{projectionModes[mode].label}</strong>
        <p>{a.method}</p>
        <small>
          {eligible.length - missing.length} of {eligible.length} eligible,
          unlocked players have usable numbers. Locked starters stay put.
        </small>
      </div>
      {a.stale && (
        <p className="notice">
          The roster import is over two hours old. Refresh Yahoo before setting
          your lineup.
        </p>
      )}
      {!!missing.length && (
        <p className="notice">
          No usable {projectionModes[mode].label.toLowerCase()} number for{" "}
          {missing.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? ", " : ""}
              <PlayerLink id={p.id} />
            </span>
          ))}
          . These players are excluded from this calculation; missing does not
          mean zero.
        </p>
      )}
      {a.changes.map((change) => (
        <div className="watch" key={change.slot + change.playerId}>
          <span className="player-icon">{change.slot}</span>
          <div>
            <PlayerLink id={change.playerId} />
            <p>
              Move from {players.get(change.playerId)?.slot} to {change.slot};
              replaces <PlayerLink id={change.currentPlayerId} /> (
              {fmt(a.projections[change.currentPlayerId]?.points)}) with{" "}
              {fmt(a.projections[change.playerId]?.points)}{" "}
              {mode === "bookies" ? "bookies score" : "points"}.
            </p>
          </div>
        </div>
      ))}
      {!a.complete ? (
        <p className="empty">
          This source can’t fill every open slot with a usable projection. Try
          another playbook or check the missing coverage above.
        </p>
      ) : (
        <>
          {!a.changes.length && (
            <p className="lineup-no-change">
              Your current starters lead this playbook. Keep the big dogs on the
              field.
            </p>
          )}
          <div className="lineup">
            {a.lineup.map((x, i) => (
              <div className="lineup-pick" key={x.playerId + i}>
                <em>{x.slot}</em>
                <PlayerLink id={x.playerId} />
                <span>
                  {x.locked ? (
                    <>
                      <Lock size={14} /> Locked
                    </>
                  ) : (
                    fmt(a.projections[x.playerId]?.points)
                  )}
                </span>
                {!x.locked && (
                  <small>
                    {mode === "combined"
                      ? `${a.projections[x.playerId].sourceCount}/3 sources`
                      : a.projections[x.playerId].partial
                        ? "Partial props"
                        : mode === "bookies"
                          ? "Modeled"
                          : projectionModes[mode].label}
                  </small>
                )}
                {!x.locked && mode !== "bookies" && (
                  <small className="range-label">
                    {a.ranges[x.playerId]?.low == null
                      ? "Range pending · limited history"
                      : `${fmt(a.ranges[x.playerId].low)}–${fmt(a.ranges[x.playerId].high)} middle range · ${a.ranges[x.playerId].samples} games`}
                  </small>
                )}
              </div>
            ))}
          </div>
          <p className="lineup-gain">
            {mode === "bookies"
              ? "Bookies score improvement"
              : "Expected points change"}
            :{" "}
            <strong>
              {a.delta == null
                ? "Unavailable"
                : `${a.delta >= 0 ? "+" : ""}${fmt(a.delta)}`}
            </strong>
            {a.delta == null
              ? " · Current starters have missing coverage."
              : mode === "bookies"
                ? " · Mixed partial props and specialist estimates; not a full fantasy-points gain."
                : " points across all suggested moves."}
          </p>
        </>
      )}
      <details className="lineup-receipts">
        <summary>Show the receipts · every roster option</summary>
        <p>
          The selected source and risk preference set the lineup. A dash means
          unavailable. In combined mode, missing sources are omitted from the
          average.
        </p>
        {mode === "combined" && (
          <p>
            Book-informed points = partial props + historical points from
            scoring categories those props do not cover. The completed
            book-informed forecast, Yahoo and Qwen each get one equal vote.
            K/DEF models enter directly. If the historical remainder is
            unavailable, offensive bookies data is excluded. This blend is not
            proven more accurate.
          </p>
        )}
        <div className="table-wrap">
          <SortableTable key={mode}>
            <thead>
              <tr>
                <th>Player</th>
                <th>Fantasy slot</th>
                <th>Yahoo</th>
                <th>Qwen</th>
                <th>Bookies</th>
                {mode === "combined" && <th>Book-informed full estimate</th>}
                <th>Selected score</th>
                {mode !== "bookies" && <th>Historical middle range</th>}
                <th>Availability</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.players.map((p) => {
                const v = a.projections[p.id];
                const locked =
                  p.locked ||
                  !!(p.kickoffAt && Date.parse(p.kickoffAt) <= Date.now());
                return (
                  <tr key={p.id}>
                    <td data-sort-value={p.name}>
                      <PlayerLink id={p.id} />
                    </td>
                    <td>{p.slot}</td>
                    <td>{fmt(v.yahoo)}</td>
                    <td>{fmt(v.qwen)}</td>
                    <td data-sort-value={v.bookies}>
                      {fmt(v.bookies)}
                      {v.bookies !== null && (
                        <small>
                          {p.sportsbook?.partial ? "Partial props" : "Modeled"}
                        </small>
                      )}
                    </td>
                    {mode === "combined" && (
                      <td data-sort-value={v.bookInformed}>
                        {fmt(v.bookInformed)}
                        {v.remainder !== null && (
                          <small>
                            {fmt(v.bookies)} props + {fmt(v.remainder)}{" "}
                            historical remainder
                          </small>
                        )}
                      </td>
                    )}
                    <td data-sort-value={locked ? null : v.points}>
                      {locked ? "—" : fmt(v.points)}
                      {!locked && mode === "combined" && (
                        <small>{v.sourceCount}/3 sources</small>
                      )}
                    </td>
                    {mode !== "bookies" && (
                      <td data-sort-value={a.ranges[p.id]?.low}>
                        {a.ranges[p.id]?.low == null
                          ? "—"
                          : `${fmt(a.ranges[p.id].low)}–${fmt(a.ranges[p.id].high)}`}
                        <small>
                          {a.ranges[p.id]?.samples || 0} games
                          {a.ranges[p.id]?.priorSeason
                            ? " · includes prior season"
                            : ""}
                        </small>
                      </td>
                    )}
                    <td>
                      {locked
                        ? "Game locked"
                        : p.bye === snapshot.week
                          ? "Bye"
                          : effectiveStatus(p) || "No injury flag"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </SortableTable>
        </div>
      </details>
      <p className="muted">
        Review injury news and kickoff times before making changes in Yahoo.
        Apply the complete set of suggested moves; slot changes can depend on
        each other.
      </p>
    </section>
  );
}
