import { useEffect, useState } from "react";
export function ProjectionStatus() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const c = new AbortController();
    let t: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const r = await fetch("/api/projections", { signal: c.signal });
        if (r.ok) setD(await r.json());
      } catch {
      } finally {
        if (!c.signal.aborted) t = setTimeout(read, 10000);
      }
    }
    void read();
    return () => {
      c.abort();
      clearTimeout(t);
    };
  }, []);
  return (
    <section className="panel">
      <h3>Statistical projections</h3>
      <p>
        Calculated from recent current-season statistics and league scoring.
        Yahoo projections are excluded from the calculation. Qwen supplies separate news commentary. Experimental estimates
        and illustrative ranges are not guarantees.
      </p>
      <p role="status">
        {d?.players?.filter((p: any) => p.points !== null).length ?? 0}{" "}
        numerical estimates ready ·{" "}
        {d?.players?.filter((p: any) => p.points === null).length ?? 0} with
        insufficient evidence.{" "}
        {d?.status
          ?.map((s: any) => `${s.count} batches ${s.status}`)
          .join(" · ")}
      </p>
      <p>
        Player views use statistical forecasts when available, otherwise a labeled Yahoo
        fallback. Source links and the estimate’s timestamp are in player
        details.
      </p>
      {d?.accuracy && (
        <p>
          Scored pregame estimates: {d.accuracy.samples} · Statistical error:{" "}
          {d.accuracy.qwenMae?.toFixed(2) ?? "Awaiting results"} · Yahoo error:{" "}
          {d.accuracy.yahooMae?.toFixed(2) ?? "Awaiting results"}.{" "}
          {d.accuracy.method}
        </p>
      )}
    </section>
  );
}
