import { SortableTable } from "./SortableTable";
import { useEffect, useState } from "react";
export function ImportOperations({ owner }: { owner: boolean }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!owner) return;
    const c = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const r = await fetch("/api/import/operations", { signal: c.signal });
        if (!r.ok) throw Error();
        setData(await r.json());
        setError("");
      } catch {
        if (!c.signal.aborted)
          setError("Operation logs are temporarily unavailable.");
      } finally {
        if (!c.signal.aborted) timer = setTimeout(poll, 5000);
      }
    }
    void poll();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [owner]);
  if (!owner)
    return (
      <section className="panel">
        <h3>Yahoo refresh</h3>
        <p>Sign in as the owner to refresh Yahoo data and view worker logs.</p>
        <a href="/auth/google">Owner sign in</a>
      </section>
    );
  const pending = data?.request && !data.request.fulfilled_at;
  return (
    <section className="panel">
      <h3>Yahoo refresh</h3>
      <p>
        Your Mac imports Yahoo data while awake and online. Requests wait
        through Yahoo cooldowns. Logs update every five seconds.
      </p>
      <button
        disabled={busy || !!pending}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/import/request", { method: "POST" });
            if (!r.ok) throw Error();
            setNotice("Refresh queued for the Mac worker.");
          } catch {
            setNotice("Unable to queue refresh. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {pending ? "Refresh queued" : busy ? "Queuing…" : "Refresh Yahoo now"}
      </button>
      <p role="status">{notice}</p>
      {error && <p className="notice">{error}</p>}
      <div className="metrics">
        <div className="metric">
          <span>Worker last seen</span>
          <strong>
            {data?.worker
              ? new Date(data.worker.seen_at).toLocaleTimeString()
              : "Not yet seen"}
          </strong>
          <small>
            {data?.worker
              ? new Date(data.worker.seen_at).toLocaleDateString()
              : "Waiting for your Mac"}
          </small>
        </div>
        <div className="metric">
          <span>Last reported state</span>
          <strong>{data?.worker?.state.status || "Unknown"}</strong>
          <small>{data?.worker?.state.message}</small>
        </div>
        <div className="metric">
          <span>Refresh request</span>
          <strong>
            {pending ? "Pending" : data?.request ? "Completed" : "None"}
          </strong>
          <small>
            {data?.request &&
              new Date(data.request.requested_at).toLocaleString()}
          </small>
        </div>
      </div>
      {data?.worker?.state.retryAt && (
        <p className="notice">
          Yahoo cooldown until{" "}
          {new Date(data.worker.state.retryAt).toLocaleString()}.
        </p>
      )}
      <h3>Operation logs</h3>
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Time</th>
              <th>Status</th>
              <th>Operation</th>
            </tr>
          </thead>
          <tbody>
            {(data?.logs || []).map((log: any) => (
              <tr key={log.id}>
                <td data-sort-value={Date.parse(log.created_at)}>
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td>{log.status}</td>
                <td>{log.message}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      </div>
      {data && !data.logs.length && <p>No operations recorded yet.</p>}
    </section>
  );
}
