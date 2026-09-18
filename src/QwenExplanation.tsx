import { SortableTable } from "./SortableTable";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Zap } from "lucide-react";
import type { PlayerData } from "../shared/model";
const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));
export function QwenValue({
  player: p,
  kind = "points",
}: {
  player: PlayerData;
  kind?: "points" | "start";
}) {
  const [open, setOpen] = useState(false),
    q =
      p.aiProjection?.label === "Qwen" && !p.aiProjection.stale
        ? p.aiProjection
        : null;
  const value =
    kind === "start"
      ? p.position === "DEF"
        ? "N/A"
        : q?.startProbability == null
          ? "—"
          : `${q.startProbability}%`
      : fmt(q?.points);
  return (
    <>
      <button
        className="qwen-explain-number"
        onClick={() => setOpen(true)}
        aria-label={`Why Qwen ${kind === "start" ? "start probability" : "projected points"} for ${p.name}`}
      >
        <strong>{value}</strong>
        {(value === "—" || value === "N/A") && (
          <small>
            {q ? "See coverage" : p.locked ? "Game locked" : "Recalculating"}
          </small>
        )}
      </button>
      {open && (
        <QwenDialog player={p} kind={kind} close={() => setOpen(false)} />
      )}
    </>
  );
}
function QwenDialog({
  player: p,
  kind,
  close,
}: {
  player: PlayerData;
  kind: "points" | "start";
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!,
      before = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    d.showModal();
    return () => {
      d.close();
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="player-dialog qwen-dialog"
      aria-labelledby="qwen-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-top">
          <div>
            <span className="eyebrow">QWEN · SHOW YOUR WORK</span>
            <h2 id="qwen-dialog-title">{p.name}</h2>
            <p>
              {kind === "start"
                ? "Will he get the nod?"
                : "Points with receipts."}
            </p>
          </div>
          <button
            className="close-dialog icon"
            aria-label="Close Qwen explanation"
            onClick={close}
          >
            <X />
          </button>
        </div>
        <QwenDetails player={p} kind={kind} />
      </div>
    </dialog>,
    document.body,
  );
}
export function QwenDetails({
  player: p,
  kind = "points",
}: {
  player: PlayerData;
  kind?: "points" | "start";
}) {
  const q = p.aiProjection?.label === "Qwen" ? p.aiProjection : null,
    c = q?.calculation;
  return (
    <section className="qwen-explanation">
      <div className="qwen-explanation-score">
        <Zap size={24} />
        <div>
          <small>
            {kind === "start"
              ? "QWEN CHANCE TO START"
              : "QWEN PROJECTED POINTS"}
          </small>
          <strong>
            {q?.stale
              ? "—"
              : kind === "start"
                ? p.position === "DEF"
                  ? "N/A"
                  : q?.startProbability == null
                    ? "—"
                    : `${q.startProbability}%`
                : fmt(q?.points)}
          </strong>
        </div>
      </div>
      {!q ? (
        <p>
          {p.locked
            ? "The game has started. New pregame forecasts are closed."
            : "Qwen is recalculating this player against your league’s scoring. A new number appears only after validation."}
        </p>
      ) : (
        <>
          {q.stale && (
            <p className="notice">
              The previous forecast needs a refresh. The explanation below is
              from that earlier run.
            </p>
          )}
          <p>{kind === "start" ? q.startReason || q.reason : q.reason}</p>
          <dl className="detail-grid">
            <div>
              <dt>ESPN NFL role</dt>
              <dd>{p.nflRole?.label || q.role || "Unconfirmed"}</dd>
            </div>
            <div>
              <dt>Yahoo availability</dt>
              <dd>{p.status || "No injury flag"}</dd>
            </div>
            <div>
              <dt>Chance to play</dt>
              <dd>
                {q.playProbability == null ? "N/A" : `${q.playProbability}%`}
              </dd>
            </div>
            <div>
              <dt>Opponent</dt>
              <dd>{p.research?.opponent || "Unconfirmed"}</dd>
            </div>
          </dl>
          {kind === "start" && (
            <p>
              Qwen chooses a whole-number estimate from the supplied role and
              health evidence. This is a subjective prediction of the upcoming
              game’s role, not the historical NFL “Started” percentage. A
              starting role does not guarantee a full workload.
            </p>
          )}
          {c && q.points != null && (
            <>
              <h4>Your league’s scoring, step by step</h4>
              <p>
                {c.samples} recent player/team games contribute{" "}
                {fmt(c.ownWeight)} effective game-weights; the positional
                history contributes {c.priorWeight} game-weights from{" "}
                {c.peerSamples} observed games. Baseline: <b>{fmt(c.points)}</b>
                . Qwen adjustment:{" "}
                <b>
                  {c.adjustment >= 0 ? "+" : ""}
                  {fmt(c.adjustment)}
                </b>
                . Final: <b>{fmt(c.selectedPoints)}</b>.
              </p>
              <div
                className="table-wrap"
                tabIndex={0}
                aria-label="Qwen league scoring calculation"
              >
                <SortableTable>
                  <thead>
                    <tr>
                      <th>Scoring category</th>
                      <th>Expected quantity</th>
                      <th>League points each</th>
                      <th>Contribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.components
                      .filter((x: any) => Math.abs(x.points) > 0.001)
                      .map((x: any) => (
                        <tr key={x.stat}>
                          <td>{x.rule}</td>
                          <td>{fmt(x.quantity)}</td>
                          <td>{x.multiplier}</td>
                          <td>{fmt(x.points)}</td>
                        </tr>
                      ))}
                  </tbody>
                </SortableTable>
              </div>
              <p>
                {c.method} The baseline is scored from expected statistics
                before Qwen’s adjustment; it does not copy Yahoo’s projection.
              </p>
              {c.limitation && <p className="muted">{c.limitation}</p>}
              <details>
                <summary>Recent league-scored game samples</summary>
                <p>
                  {c.history
                    .map(
                      (h: any) =>
                        `${h.season} W${h.week}: ${fmt(h.points)} points`,
                    )
                    .join(" · ") ||
                    "No individual samples; the positional prior is used."}
                </p>
              </details>
            </>
          )}
          <div className="source-list">
            <a
              href="https://github.com/nflverse/nflverse-data"
              target="_blank"
              rel="noreferrer"
            >
              nflverse statistical history ↗
            </a>
            {p.nflRole?.source && (
              <p>
                <a href={p.nflRole.source} target="_blank" rel="noreferrer">
                  ESPN depth chart ↗
                </a>
              </p>
            )}
            {q.sources?.map((n: any, i: number) => (
              <p key={i}>
                <a href={n.url} target="_blank" rel="noreferrer">
                  {n.source}: {n.title} ↗
                </a>
              </p>
            ))}
          </div>
          <small>
            Qwen calculated {new Date(q.generatedAt).toLocaleString()}.
            Forecasts are estimates, not guaranteed scores.
          </small>
        </>
      )}
    </section>
  );
}
