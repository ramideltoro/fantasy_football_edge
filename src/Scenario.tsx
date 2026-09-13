import { useState } from "react";
import type { PlayerData } from "../shared/model";
export function Scenario({
  players,
  pool,
}: {
  players: PlayerData[];
  pool: PlayerData[];
}) {
  const [outId, setOut] = useState(""),
    [inId, setIn] = useState(""),
    [search, setSearch] = useState("");
  const outgoing = players.find((p) => p.id === outId),
    incoming = pool.find((p) => p.id === inId);
  const choices = pool.filter(
    (p) =>
      !players.some((x) => x.id === p.id) &&
      (p.name + " " + p.position).toLowerCase().includes(search.toLowerCase()),
  );
  const delta =
    outgoing?.projected != null && incoming?.projected != null
      ? incoming.projected - outgoing.projected
      : null;
  return (
    <section className="panel">
      <h3>Trade & waiver scenario</h3>
      <p className="subtitle">
        Compare a proposed outgoing and incoming player using the same imported
        week. This is a points comparison, not a season-long trade valuation.
      </p>
      <div className="scenario">
        <label>
          Outgoing player
          <select value={outId} onChange={(e) => setOut(e.target.value)}>
            <option value="">Choose from your roster</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.position}
              </option>
            ))}
          </select>
        </label>
        <label>
          Find incoming player
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the imported player pool"
          />
          <select
            aria-label="Incoming player"
            value={inId}
            onChange={(e) => setIn(e.target.value)}
          >
            <option value="">Choose an incoming player</option>
            {choices.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.position} · {p.availability}
              </option>
            ))}
          </select>
        </label>
      </div>
      {incoming && outgoing && (
        <>
          <div className="metrics">
            <div className="metric">
              <span>{outgoing.name}</span>
              <strong>{outgoing.projected?.toFixed(1) ?? "—"}</strong>
              <small>Outgoing projected points</small>
            </div>
            <div className="metric">
              <span>{incoming.name}</span>
              <strong>{incoming.projected?.toFixed(1) ?? "—"}</strong>
              <small>Incoming projected points</small>
            </div>
            <div className="metric">
              <span>Projected difference</span>
              <strong>
                {delta == null
                  ? "—"
                  : (delta > 0 ? "+" : "") + delta.toFixed(1)}
              </strong>
              <small>Incoming minus outgoing</small>
            </div>
          </div>
          <p className="notice">
            {outgoing.locked || incoming.locked
              ? "A game has started or finished. This is not an actionable current-week lineup swap. "
              : ""}
            {incoming.status
              ? `${incoming.name} has ${incoming.status} status. `
              : ""}
            {incoming.position !== outgoing.position
              ? "Positions differ; review roster eligibility and depth. "
              : ""}
            {incoming.availability === "Taken"
              ? "This player is rostered. Any trade requires the other manager’s agreement."
              : "Check current waiver status, priority and roster space in Yahoo."}{" "}
            No transaction will be submitted.
          </p>
        </>
      )}
    </section>
  );
}
