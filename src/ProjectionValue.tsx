import type { PlayerData } from "../shared/model";
export function ProjectionValue({ player: p }: { player: PlayerData }) {
  return (
    <span
      title={p.aiProjection?.reason || "Qwen estimate pending or unavailable"}
    >
      {p.projected?.toFixed(2) ?? "—"}
      <small style={{ display: "block" }}>
        {p.projectionSource || "Yahoo"}
      </small>
    </span>
  );
}
export function ProjectionDetails({ player: p }: { player: PlayerData }) {
  return (
    <div className="ai-evidence">
      <b>{p.projectionSource || "Yahoo"} · projected points</b>
      <p>Yahoo comparison: {p.providerProjected?.toFixed(2) ?? "—"}</p>
      {p.aiProjection && (
        <>
          <p>{p.aiProjection.reason}</p>
          <p>
            Qwen range: {p.aiProjection.low ?? "—"}–{p.aiProjection.high ?? "—"}{" "}
            · illustrative, not calibrated confidence.
          </p>
          <small>
            Generated {new Date(p.aiProjection.generatedAt).toLocaleString()}.{" "}
            {p.aiProjection.method}
          </small>
          <details>
            <summary>Research links</summary>
            <a
              href="https://github.com/nflverse/nflverse-data/releases"
              target="_blank"
              rel="noreferrer"
            >
              nflverse statistical history
            </a>
            {p.aiProjection.sources?.map((n: any) => (
              <p key={n.url}>
                <a href={n.url} target="_blank" rel="noreferrer">
                  {n.title}
                </a>{" "}
                · {n.source}
              </p>
            ))}
          </details>
        </>
      )}
    </div>
  );
}
