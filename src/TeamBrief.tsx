import { PlayerLink, PlayerText } from "./PlayerExperience";
export function TeamBrief({ data: d, status }: { data: any; status: string }) {
  const brief = d.qwen?.teamBrief;
  const labels: Record<string, string> = {
    roster: "Who we’re rolling with",
    matchup: "This week’s matchup",
    risks: "Availability watch",
    lineup: "Points worth chasing",
    changes: "Suggested changes",
    waivers: "Waiver strategy",
    uncertainty: "What we still don’t know",
  };
  return (
    <section className="panel ai-brief">
      <div className="ai-heading">
        <div>
          <span className="ai-eyebrow">YOUR WEEKLY GAME PLAN</span>
          <h3>The locker-room talk</h3>
        </div>
        <span className="ai-badge">Week {d.week}</span>
      </div>
      {brief ? (
        <>
          <p className="ai-intro">
            Pull up a damn bench. Here’s what the numbers say, where we can
            improve, and what still needs a closer look.
          </p>
          <div className="ai-card-grid">
            {brief.priorities.map((x: any, i: number) => (
              <article className="ai-pick" key={x.key}>
                <span className="ai-eyebrow">PRIORITY {i + 1}</span>
                <h4>{labels[x.key] || x.key}</h4>
                <p>
                  <PlayerText text={x.text} />
                </p>
              </article>
            ))}
          </div>
          <details className="ai-evidence">
            <summary>Full roster and matchup assessment</summary>
            <div className="ai-card-grid">
              {Object.entries(brief.facts)
                .filter(
                  ([key]) => !brief.priorities.some((x: any) => x.key === key),
                )
                .map(([key, text]) => (
                  <article key={key}>
                    <h4>{labels[key] || key}</h4>
                    <p>
                      <PlayerText text={String(text)} />
                    </p>
                  </article>
                ))}
            </div>
          </details>
          <small>
            Roster: {new Date(d.snapshotAt).toLocaleString()} · Qwen:{" "}
            {new Date(d.qwen.generatedAt).toLocaleString()}. Check current locks
            before acting.
          </small>
        </>
      ) : (
        <p>
          {status === "failed"
            ? "The film room hit a snag. Retry analysis above."
            : "Qwen’s in the film room. The game plan is coming."}
        </p>
      )}
    </section>
  );
}
