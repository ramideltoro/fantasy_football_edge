import { ProjectionValue } from "./ProjectionValue";
import { PositionSuggestions } from "./PositionSuggestions";
import { WaiverBrief } from "./WaiverBrief";
import { useEffect, useMemo, useState } from "react";
import type { PlayerData } from "../shared/model";
export function WaiverList({
  pool,
  onPlayer,
}: {
  pool: PlayerData[];
  onPlayer: (p: PlayerData) => void;
}) {
  const [depth, setDepth] = useState<any>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/depth", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDepth)
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => setPage(0), [search, filter]);
  const candidates = useMemo(
    () =>
      pool
        .filter(
          (p) =>
            /^(FA|W)/.test(p.availability) &&
            (filter === "all" ||
              (filter === "waivers"
                ? p.availability.startsWith("W")
                : p.availability === "FA")) &&
            `${p.name} ${p.position} ${p.team}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort(
          (a, b) => (b.projected ?? -Infinity) - (a.projected ?? -Infinity),
        ),
    [pool, search, filter],
  );
  function role(p: PlayerData) {
    if (p.position === "DEF") return { label: "Team defense", source: "" };
    const aliases: Record<string, string> = {
      JAC: "JAX",
      WAS: "WSH",
      LA: "LAR",
    };
    const team =
      depth?.teams?.[aliases[p.team.toUpperCase()] || p.team.toUpperCase()];
    const key = p.name
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
    const rank = team?.ranks?.[key];
    return {
      label: rank === 1 ? "Starter" : rank > 1 ? `Backup (${rank})` : "Unknown",
      source: team?.source || "",
    };
  }
  return (
    <>
      <PositionSuggestions pool={pool} onPlayer={onPlayer} />
      <WaiverBrief pool={pool} onPlayer={onPlayer} />
      <section className="panel">
        <h3>Waiver list</h3>
        <p className="subtitle">
          Two Yahoo W/R/T pages plus the first QB, K and DEF pages, sorted by
          weekly projected points. NFL starter/backup roles come from ESPN depth
          charts; Unknown means no matching entry. Depth order does not
          guarantee playing time.
        </p>
        <div className="scenario">
          <label>
            Find a player
            <input
              placeholder="Search name, position or team"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Availability
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Free agents & waivers</option>
              <option value="waivers">On waivers</option>
              <option value="free">Free agents</option>
            </select>
          </label>
        </div>
        <p>
          {candidates.length} players ·{" "}
          {depth
            ? "Depth charts fetched " +
              new Date(depth.fetchedAt).toLocaleString()
            : "Depth charts loading or unavailable"}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NFL starter / backup</th>
                <th>Player</th>
                <th>Position</th>
                <th>Team</th>
                <th>Availability</th>
                <th>Injury status</th>
                <th>Bye</th>
                <th>Projected points</th>
                <th>Rostered %</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(page * 50, (page + 1) * 50).map((p) => {
                const r = role(p);
                return (
                  <tr key={p.id}>
                    <td>
                      {r.source ? (
                        <a href={r.source} target="_blank" rel="noreferrer">
                          {r.label}
                        </a>
                      ) : (
                        r.label
                      )}
                    </td>
                    <td>
                      <button onClick={() => onPlayer(p)}>{p.name}</button>
                    </td>
                    <td>{p.position}</td>
                    <td>{p.team}</td>
                    <td>{p.availability}</td>
                    <td>{p.status || "—"}</td>
                    <td>{p.bye ?? "—"}</td>
                    <td>
                      <ProjectionValue player={p} />
                    </td>
                    <td>{p.rosterPct == null ? "—" : p.rosterPct + "%"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!candidates.length && <p>No players match your filters.</p>}
        <div className="scenario">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(candidates.length / 50))}
          </span>
          <button
            disabled={(page + 1) * 50 >= candidates.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
}
