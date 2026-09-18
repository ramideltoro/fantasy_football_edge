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
      <h3>Qwen’s numbers, receipts included</h3>
      <p>
        Qwen calculates these forecasts from league scoring, actual player
        history, current roles and reporting. Yahoo’s projection is kept out of
        that calculation. These are model estimates, not promises.
      </p>
      <p role="status">
        {d?.players?.filter((p: any) => p.points !== null).length ?? 0}{" "}
        numerical estimates ready ·{" "}
        {d?.players?.filter((p: any) => p.points === null).length ?? 0} without
        a usable pregame estimate.{" "}
        {d?.status
          ?.map((s: any) => `${s.count} batches ${s.status}`)
          .join(" · ")}
      </p>
      <p>
        Lineup suggestions use a current Qwen estimate when available, otherwise
        a labeled Yahoo fallback. The roster keeps both sources in separate
        columns. Source links and the estimate’s timestamp are in player
        details.
      </p>
      {d?.accuracy && (
        <p>
          Scored pregame estimates: {d.accuracy.samples} · Qwen error:{" "}
          {d.accuracy.qwenMae?.toFixed(2) ?? "Awaiting results"} · Yahoo error:{" "}
          {d.accuracy.yahooMae?.toFixed(2) ?? "Awaiting results"}.{" "}
          {d.accuracy.method}
        </p>
      )}
    </section>
  );
}
