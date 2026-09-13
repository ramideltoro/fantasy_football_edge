import { useState, useEffect } from "react";
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
  const [depth, setDepth] = useState<any>(null),
    [page, setPage] = useState(0),
    [availability, setAvailability] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/depth", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDepth)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => setPage(0), [search, availability]);
  const nameKey = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const role = (p: PlayerData) => {
    if (p.position === "DEF") return { label: "Team defense", source: "" };
    const aliases: Record<string, string> = {
      JAC: "JAX",
      WAS: "WSH",
      LA: "LAR",
    };
    const team =
      depth?.teams?.[aliases[p.team.toUpperCase()] || p.team.toUpperCase()];
    const rank = team?.ranks?.[nameKey(p.name)];
    return {
      label:
        rank === 1 ? "Starter" : rank > 1 ? "Backup (" + rank + ")" : "Unknown",
      source: team?.source || "",
      asOf: team?.asOf,
    };
  };
  const outgoing = players.find((p) => p.id === outId),
    incoming = pool.find((p) => p.id === inId);
  const choices = pool.filter(
    (p) =>
      !players.some((x) => x.id === p.id) &&
      (availability === "all" ||
        (availability === "free"
          ? /^(FA|W)/.test(p.availability)
          : p.availability === "Taken")) &&
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
            placeholder="Search the imported W/R/T shortlist"
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
      <h3>Imported waiver candidates</h3>
      <p className="subtitle">
        NFL role comes from ESPN depth-chart order, not fantasy start
        percentage. Multiple receivers can be starters; depth order does not
        guarantee snaps. Unknown means no matching depth-chart entry.
      </p>
      <label>
        Availability{" "}
        <select
          value={availability}
          onChange={(e) => setAvailability(e.target.value)}
        >
          <option value="all">All candidates</option>
          <option value="free">Free agents & waivers</option>
          <option value="taken">Rostered trade candidates</option>
        </select>
      </label>
      <p>
        {choices.length} candidates ·{" "}
        {depth
          ? "Depth charts fetched " + new Date(depth.fetchedAt).toLocaleString()
          : "Depth charts loading or unavailable"}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Position</th>
              <th>NFL team</th>
              <th>Availability</th>
              <th>NFL role</th>
              <th>Projection</th>
              <th>Compare</th>
            </tr>
          </thead>
          <tbody>
            {choices.slice(page * 50, (page + 1) * 50).map((p) => {
              const info = role(p);
              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.team}</td>
                  <td>{p.availability || "Unknown"}</td>
                  <td>
                    {info.source ? (
                      <a
                        href={info.source}
                        target="_blank"
                        rel="noreferrer"
                        title={
                          info.asOf ? "Source updated " + info.asOf : undefined
                        }
                      >
                        {info.label}
                      </a>
                    ) : (
                      info.label
                    )}
                  </td>
                  <td>{p.projected?.toFixed(1) ?? "—"}</td>
                  <td>
                    <button onClick={() => setIn(p.id)}>
                      {inId === p.id ? "Selected" : "Select"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="scenario">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {Math.max(1, Math.ceil(choices.length / 50))}
        </span>
        <button
          disabled={(page + 1) * 50 >= choices.length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
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
