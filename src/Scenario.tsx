import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import type { SnapshotData } from "../shared/model";
import { waiverImpact } from "../shared/strategy";
import { SortableTable } from "./SortableTable";
import { PlayerLink, PlayerTable, usePlayers } from "./PlayerExperience";
export function Scenario({
  snapshot,
  plan,
}: {
  snapshot: SnapshotData;
  plan: any;
}) {
  const players = snapshot.players,
    pool = snapshot.available;
  const [outId, setOut] = useState(""),
    [inId, setIn] = useState("");
  const { open } = usePlayers();
  const impact = useMemo(
    () => waiverImpact(snapshot, outId, inId, plan?.schedule || {}),
    [snapshot, outId, inId, plan?.generatedAt],
  );
  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toFixed(2);
  const choices = pool
    .filter(
      (p) =>
        /^(FA|W)/.test(p.availability) && !players.some((x) => x.id === p.id),
    )
    .sort(
      (a, b) =>
        a.position.localeCompare(b.position) ||
        (b.projected ?? -Infinity) - (a.projected ?? -Infinity),
    );
  function choose(out: string, incoming: string) {
    setOut(out);
    setIn(incoming);
    if (out && incoming) open([out, incoming]);
  }
  return (
    <section className="panel scenario-panel">
      <span className="eyebrow">THE FRONT OFFICE</span>
      <h2>New guy wants a locker? Prove it.</h2>
      <p className="subtitle">
        Don’t cut a player because Sunday hurt your feelings. Pick who goes and
        who comes in; compare them, then check your next three lineups.
      </p>
      <div className="scenario-picks">
        <label>
          <span>
            <b>01</b> Outgoing player
          </span>
          <select
            aria-label="Outgoing player"
            value={outId}
            onChange={(e) => choose(e.target.value, inId)}
          >
            <option value="">Choose from your roster</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.position} · {p.slot}
              </option>
            ))}
          </select>
        </label>
        <ArrowRight className="swap-arrow" />
        <label>
          <span>
            <b>02</b> Incoming player
          </span>
          <select
            aria-label="Incoming player"
            value={inId}
            disabled={!outId}
            onChange={(e) => choose(outId, e.target.value)}
          >
            <option value="">
              {outId
                ? "Choose your next playmaker"
                : "Pick your outgoing player first"}
            </option>
            {["QB", "RB", "WR", "TE", "K", "DEF"].map((pos) => (
              <optgroup label={pos} key={pos}>
                {choices
                  .filter((p) => p.position === pos)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.team} · {p.availability}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {outId && inId && (
        <div className="scenario-ready">
          <span>
            <PlayerLink id={outId} /> → <PlayerLink id={inId} />
          </span>
          <button className="primary" onClick={() => open([outId, inId])}>
            <ArrowLeftRight size={17} /> Reopen comparison
          </button>
        </div>
      )}
      {impact && (
        <div className="waiver-impact" aria-live="polite">
          <div className="impact-headline">
            <span>THREE-WEEK LINEUP CHANGE</span>
            <strong>
              {impact.total == null
                ? "Coverage incomplete"
                : `${impact.total >= 0 ? "+" : ""}${fmt(impact.total)} points`}
            </strong>
            <p>
              Best eligible lineup before and after the add/drop, including the
              player you give up.
            </p>
          </div>
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Difference</th>
                  <th>Open slots before → after</th>
                  <th>Basis</th>
                </tr>
              </thead>
              <tbody>
                {impact.weeks.map((w) => (
                  <tr key={w.week}>
                    <td>{w.week}</td>
                    <td>{fmt(w.before.total)}</td>
                    <td>{w.locked ? "—" : fmt(w.after.total)}</td>
                    <td data-sort-value={w.delta}>
                      {w.delta == null
                        ? "—"
                        : `${w.delta >= 0 ? "+" : ""}${fmt(w.delta)}`}
                    </td>
                    <td>
                      {w.before.gaps.length} → {w.after.gaps.length}
                    </td>
                    <td>
                      {w.locked
                        ? "Player locked · no current-week claim"
                        : w.week === snapshot.week
                          ? "Combined + locked actuals"
                          : "Historical planning baseline"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
          {players.find((p) => p.id === outId)?.slot.startsWith("IR") && (
            <p className="notice">
              This scenario removes an IR player. The incoming player is modeled
              on your bench; Yahoo roster limits may require an additional move.
            </p>
          )}
          <p className="notice">
            Future weeks use league-scored historical baselines, confirmed
            schedules and today’s injury flags. They are planning estimates, not
            future-week model forecasts. Missing coverage stays blank; a locked
            player prevents a current-week gain claim.
          </p>
          <div className="depth-changes">
            <b>Depth you’re trading away</b>
            {impact.depth.length ? (
              impact.depth.map((x) => (
                <span key={x.position}>
                  {x.position}: {x.before} → {x.after}
                </span>
              ))
            ) : (
              <span>
                Same position counts. Check the player comparison for the change
                in quality.
              </span>
            )}
          </div>
          {impact.weeks.map((w) => (
            <details key={w.week}>
              <summary>Week {w.week} · inspect both lineups</summary>
              {w.locked ? (
                <p>
                  The current-week move is locked. See later weeks for its
                  planning impact.
                </p>
              ) : (
                <div className="lineup-comparison">
                  {(
                    [
                      ["Before", w.before],
                      ["After", w.after],
                    ] as const
                  ).map(([label, lineup]) => (
                    <div key={label}>
                      <h3>{label}</h3>
                      {lineup.lineup.map((p, i) => (
                        <p key={p.playerId + i}>
                          <b>{p.slot}</b> <PlayerLink id={p.playerId} />
                          {p.locked && <small> · Locked</small>}
                        </p>
                      ))}
                      {!!lineup.gaps.length && (
                        <p className="notice">
                          Unfilled: {lineup.gaps.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </details>
          ))}
        </div>
      )}
      <p className="table-note">
        This is a look before you leap. Make roster moves in Yahoo; checking a
        scenario never submits one.
      </p>
      <details className="candidate-disclosure">
        <summary>
          Browse the candidate list <span>{choices.length} players</span>
        </summary>
        <PlayerTable
          players={choices}
          title="The free-agent aisle"
          description="Kick the tires. Check the damn engine. Open a player for the full scouting report."
          waivers
        />
      </details>
    </section>
  );
}
