import { useEffect, useState } from "react";
export function YahooConnection({ owner }: { owner: boolean }) {
  const [data, setData] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!owner) return;
    const c = new AbortController();
    const poll = () =>
      fetch("/api/yahoo/status", { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then(setData)
        .catch(() => {});
    void poll();
    const timer = setInterval(poll, 5000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [owner]);
  if (!owner || !data) return null;
  const states: Record<string, string> = {
    disconnected: "Not connected",
    authorized: "Checking Yahoo access",
    syncing: "Syncing on the server",
    connected: "Connected · automatic sync every 15 minutes",
    select_league: "Choose a league",
    approval_required: "Yahoo API approval required",
    reconnect: "Reconnect Yahoo",
    cooldown: "Waiting for Yahoo cooldown",
    failed: "Sync failed · previous data retained",
  };
  async function post(url: string, body: any = {}) {
    setBusy(true);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Request failed");
      setNotice("Saved. Connection status will update shortly.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h3>Yahoo connection</h3>
      <p>{states[data.status] || data.status}</p>
      <p>
        Authorize Yahoo once to sync your league directly on the server, even
        when your Mac is off.
      </p>
      {["approval_required", "reconnect", "cooldown", "failed"].includes(
        data.status,
      ) && <p className="notice">{data.message}</p>}
      {data.configured ? (
        <a className="button" href="/auth/yahoo">
          {data.authorized ? "Reconnect Yahoo" : "Connect Yahoo"}
        </a>
      ) : (
        <p>Yahoo application configuration is required.</p>
      )}
      {data.authorized && (
        <button
          disabled={busy || data.status === "syncing"}
          onClick={() => void post("/api/yahoo/disconnect")}
        >
          Disconnect Yahoo
        </button>
      )}
      {data.leagues.length > 0 && (
        <label>
          League{" "}
          <select
            value={data.leagueKey || ""}
            disabled={busy || data.status === "syncing"}
            onChange={(e) =>
              void post("/api/yahoo/league", { key: e.target.value })
            }
          >
            <option value="" disabled>
              Select your league
            </option>
            {data.leagues.map((l: any) => (
              <option key={l.key} value={l.key}>
                {l.name} · {l.season}
              </option>
            ))}
          </select>
        </label>
      )}
      {data.lastSuccess && (
        <p>
          Last successful API sync:{" "}
          {new Date(data.lastSuccess).toLocaleString()}
        </p>
      )}
      <p>
        Read-only access. Your lineup and transactions remain under your control
        in Yahoo.
      </p>
      <p role="status">{notice}</p>
    </section>
  );
}
