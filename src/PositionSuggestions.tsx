import type { PlayerData } from "../shared/model";
import { ProjectionValue } from "./ProjectionValue";
export function PositionSuggestions({
  pool,
  onPlayer,
}: {
  pool: PlayerData[];
  onPlayer: (p: PlayerData) => void;
}) {
  return (
    <section className="panel ai-brief">
      <h3>Quarterback, kicker & defense options</h3>
      <p>
        Top three eligible imported options at each position, ranked by the
        active projection. Qwen estimates are experimental; pending estimates
        retain a labeled Yahoo fallback. Check roster fit and claim timing.
      </p>
      <div className="ai-card-grid">
        {["QB", "K", "DEF"].map((pos) => (
          <article className="ai-pick" key={pos}>
            <h4>
              {pos === "K"
                ? "Kickers"
                : pos === "DEF"
                  ? "Team defenses"
                  : "Quarterbacks"}
            </h4>
            {pool
              .filter(
                (p) =>
                  p.position === pos &&
                  /^(FA|W)/.test(p.availability) &&
                  !p.locked &&
                  (!p.kickoffAt || Date.parse(p.kickoffAt) > Date.now()) &&
                  !["O", "IR", "PUP", "SUSP"].includes(p.status),
              )
              .sort(
                (a, b) =>
                  (b.projected ?? -Infinity) - (a.projected ?? -Infinity),
              )
              .slice(0, 3)
              .map((p) => (
                <div className="ai-evidence" key={p.id}>
                  <button onClick={() => onPlayer(p)}>{p.name}</button>
                  <ProjectionValue player={p} />
                  <p>
                    {p.aiProjection?.points !== null && p.aiProjection?.reason
                      ? p.aiProjection.reason
                      : "Independent Qwen estimate pending or unavailable; this ranking currently uses Yahoo."}
                  </p>
                </div>
              ))}
            {!pool.some((p) => p.position === pos) && (
              <p>Waiting for the first {pos} page import.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
