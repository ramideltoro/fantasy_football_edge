import { useState } from "react";
import { RefreshCw, Activity } from "lucide-react";
import { useAnalysis } from "./useAnalysis";
import { useNews } from "./NewsHub";
export function AnalysisRefresh({
  owner,
  snapshotAt,
  onOperations,
}: {
  owner: boolean;
  snapshotAt: string;
  onOperations?: () => void;
}) {
  const state = useAnalysis(),
    news = useNews(),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const queued =
    news?.counts
      ?.filter((r: any) => r.status === "queued" || r.status === "analyzing")
      .reduce((n: number, r: any) => n + r.count, 0) || 0;
  const run =
    ["queued", "building", "ready", "analyzing"].includes(state?.status) ||
    news?.collecting ||
    queued > 0;
  async function request(kind: string) {
    setBusy(kind);
    try {
      const r = await fetch(
        kind === "news" ? "/api/news/refresh" : "/api/import/request",
        { method: "POST" },
      );
      if (!r.ok) throw Error();
      setNotice(
        kind === "news"
          ? "News refresh queued; unchanged evidence will be reused."
          : "Yahoo refresh queued.",
      );
    } catch {
      setNotice("Refresh unavailable. Check owner sign-in and Operations.");
    } finally {
      setBusy("");
    }
  }
  return (
    <details className="refresh-strip" aria-label="Data freshness">
      <summary className="intel-summary">
        <span>
          <span className={"status-dot " + (run ? "working" : "")} />
          {run ? "The film room is working" : "Your latest intel"}
        </span>
        <small>
          Yahoo{" "}
          {new Date(snapshotAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          · sources & refresh
        </small>
      </summary>
      <div>
        <span className={"status-dot " + (run ? "working" : "")} />
        <strong>
          {run ? "Updating intelligence" : "Your latest intelligence"}
        </strong>
        <small>
          Yahoo {new Date(snapshotAt).toLocaleString()} · Qwen{" "}
          {state?.data?.qwen?.generatedAt || state?.previousQwen?.generatedAt
            ? new Date(
                state?.data?.qwen?.generatedAt ||
                  state.previousQwen.generatedAt,
              ).toLocaleString()
            : "pending"}
          {!state?.qwenUpdated ? " · previous advice / not updated" : ""}
        </small>
        <small>
          News{" "}
          {news?.lastCollectedAt
            ? new Date(news.lastCollectedAt).toLocaleString()
            : "pending"}
          {run
            ? " · " +
              (news?.collecting
                ? news.stage
                : queued +
                  " news batches pending · Qwen " +
                  (state?.status || "waiting"))
            : ""}
        </small>
      </div>
      <div className="refresh-actions">
        <button disabled={!owner || !!busy} onClick={() => request("news")}>
          <RefreshCw size={14} className={busy === "news" ? "spin" : ""} />
          Refresh news & AI
        </button>
        <button disabled={!owner || !!busy} onClick={() => request("yahoo")}>
          Refresh Yahoo
        </button>
        <button
          onClick={onOperations}
          aria-label="Open Operations and live logs"
        >
          <Activity size={16} />
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
