import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Coins, X } from "lucide-react";
import type { PlayerData } from "../shared/model";
import {
  GAME_SOURCE,
  MARKET_LABELS,
  PROP_SOURCE,
  type SportsbookProjection,
} from "../shared/sportsbook";
const number = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2);
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "Pending";

export function SportsbookFeed() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    const c = new AbortController();
    const refresh = () =>
      fetch("/api/sportsbook", { signal: c.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setData(d);
        })
        .catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="sportsbook-feed">
      <Coins size={22} aria-hidden="true" />
      <div>
        <strong>The books brought receipts.</strong>
        <span>
          {data?.fetchedAt
            ? `${data.books.length} sportsbooks · ${data.players} players on the board · Refreshes every 6 hours`
            : "VegasInsider odds · Refreshes every 6 hours"}
        </span>
      </div>
      <div className="sportsbook-feed-time">
        <b>
          {data?.stale
            ? "Refresh overdue"
            : data?.error
              ? "Retry queued"
              : "THE MARKET CHECK"}
        </b>
        <small>Pulled: {date(data?.fetchedAt || null)}</small>
        <small>Next: {date(data?.nextAt || null)}</small>
      </div>
    </div>
  );
}
export function SportsbookNumber({
  projection: s,
}: {
  projection?: SportsbookProjection;
}) {
  return (
    <>
      <strong>{number(s?.points)}</strong>
      <small>
        {s?.points != null
          ? `${s.model ? "Modeled" : "Partial"} · ${s.books.length} books`
          : s?.stale
            ? "Refresh pending"
            : "See coverage"}
      </small>
    </>
  );
}
export function SportsbookButton({ player }: { player: PlayerData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="sportsbook-number"
        aria-label={`Sportsbook projection and calculation for ${player.name}`}
        onClick={() => setOpen(true)}
      >
        <SportsbookNumber projection={player.sportsbook} />
      </button>
      {open && (
        <SportsbookDialog player={player} close={() => setOpen(false)} />
      )}
    </>
  );
}
function SportsbookDialog({
  player,
  close,
}: {
  player: PlayerData;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement,
      d = ref.current!,
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
      className="player-dialog sportsbook-dialog"
      aria-labelledby="sportsbook-title"
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
            <span className="eyebrow">FOLLOW THE NUMBERS</span>
            <h2 id="sportsbook-title">{player.name}</h2>
            <p>The books have a take. Here’s the math.</p>
          </div>
          <button
            className="close-dialog icon"
            aria-label="Close sportsbook details"
            onClick={close}
          >
            <X />
          </button>
        </div>
        <SportsbookDetails projection={player.sportsbook} />
      </div>
    </dialog>,
    document.body,
  );
}
export function SportsbookDetails({
  projection: s,
}: {
  projection?: SportsbookProjection;
}) {
  if (s?.model) return <SpecialistBookDetails projection={s} />;
  if (!s)
    return (
      <section className="dossier-section">
        <h4>Sportsbook receipts</h4>
        <p>The odds desk is warming up.</p>
      </section>
    );
  return (
    <section className="dossier-section sportsbook-details">
      <div className="sportsbook-total">
        <Coins size={25} />
        <div>
          <span className="eyebrow">BOOKIES PROJECTED · PARTIAL</span>
          <strong>
            {number(s.points)} <small>pts</small>
          </strong>
        </div>
        <span>
          {s.books.length} contributing books
          <br />
          {s.matchup || "Matchup unconfirmed"}
        </span>
      </div>
      {s.reason && (
        <p className="sportsbook-warning" role="status">
          {s.reason}
        </p>
      )}
      <p>
        This is a subtotal from available player props, calculated with your
        league’s scoring. It is not a complete fantasy forecast or a points
        total published by a sportsbook.
      </p>
      <p>
        <b>Still off the board:</b> {s.missing.join(" · ")}. Missing stats are
        unknown, not zero. Don’t compare this subtotal directly with the full
        Yahoo or Qwen forecast.
      </p>
      {s.components.length > 0 && (
        <div className="table-wrap sportsbook-calculation">
          <table>
            <caption>
              {s.points == null
                ? "Previous / reference calculation — not an active prediction"
                : "How the subtotal adds up"}
            </caption>
            <thead>
              <tr>
                <th>Market</th>
                <th>Book average</th>
                <th>League points</th>
                <th>Contribution</th>
              </tr>
            </thead>
            <tbody>
              {s.components.map((c) => (
                <tr key={c.market}>
                  <td>
                    {c.label}
                    <small>{c.books.length} books</small>
                  </td>
                  <td>
                    {number(c.mean)}
                    <small>
                      {c.market === "touchdowns" ? "estimated TDs" : "yards"}
                    </small>
                  </td>
                  <td>× {c.multiplier}</td>
                  <td>{number(c.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="sportsbook-method">
        <summary>Show the math, coach</summary>
        <p>
          For each market, we average the usable quotes from every available
          sportsbook, then multiply by the league’s scoring value. Each market
          needs at least three books. The displayed total is the sum of those
          contributions; book coverage can differ by market.
        </p>
        <p>
          Yardage lines are used as yardage proxies, not statistical means.
          Anytime touchdown odds become an implied probability: 100 / (odds +
          100) for positive odds, or |odds| / (|odds| + 100) for negative odds.
          We estimate a non-passing TD count with −ln(1 − probability), a
          Poisson-model assumption. This does not include passing touchdowns.
          One-sided prices retain bookmaker margin; this is not a no-vig
          estimate.
        </p>
        <p>
          Pick’em operators are shown but excluded from the sportsbook average.
          Touchdown probabilities more than 25 percentage points from the
          median, and yardage lines more than max(15 yards, 50% of the median)
          away, are flagged when at least three books quote that market.
        </p>
        <p>
          VegasInsider’s combined player board does not label each prop with a
          game ID or quote time. We associate names with the current board’s
          week and the player’s NFL team schedule; the source does not verify
          that association. The time below records our collection, not when an
          individual book moved its line.
        </p>
      </details>
      <details className="sportsbook-receipts" open>
        <summary>Every player quote · {s.quotes.length} receipts</summary>
        {s.quotes.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book / operator</th>
                  <th>Market</th>
                  <th>Quote</th>
                  <th>Calculation status</th>
                </tr>
              </thead>
              <tbody>
                {s.quotes.map((q) => (
                  <tr
                    key={`${q.book}-${q.market}`}
                    className={q.exclusion ? "quote-excluded" : ""}
                  >
                    <td>
                      {q.book}
                      {q.kind === "pickem" && <small>Pick’em</small>}
                    </td>
                    <td>{MARKET_LABELS[q.market]}</td>
                    <td className="odds-raw">{q.raw}</td>
                    <td>
                      {q.used
                        ? s.points == null
                          ? "Eligible input; estimate withheld"
                          : "Included"
                        : q.exclusion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No player quotes listed.</p>
        )}
      </details>
      <details className="sportsbook-receipts">
        <summary>
          Game lines · {s.games.filter((g) => g.kind === "sportsbook").length}{" "}
          sportsbook quotes
        </summary>
        <p>
          Matchup context only. Game spreads, totals and moneylines are not
          converted into player fantasy points.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Book</th>
                <th>Market</th>
                <th>{s.games[0]?.team || "Team"} quote</th>
              </tr>
            </thead>
            <tbody>
              {s.games.map((g) => (
                <tr key={`${g.eventId}-${g.book}-${g.market}`}>
                  <td>
                    {g.book}
                    {g.kind === "reference" && (
                      <small>Reference, not a book</small>
                    )}
                  </td>
                  <td>{g.market}</td>
                  <td className="odds-raw">{g.raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="sportsbook-sources">
        <a href={PROP_SOURCE} target="_blank" rel="noreferrer">
          VegasInsider player props <ArrowUpRight size={14} />
        </a>
        <a href={GAME_SOURCE} target="_blank" rel="noreferrer">
          NFL game odds <ArrowUpRight size={14} />
        </a>
      </div>
      <small className="muted">
        Week {s.week ?? "—"} · {s.season ?? "—"} · Collected {date(s.fetchedAt)}{" "}
        · Next refresh {date(s.nextAt)}
        {s.error ? ` · ${s.error}` : ""}
      </small>
    </section>
  );
}

function SpecialistBookDetails({
  projection: s,
}: {
  projection: SportsbookProjection;
}) {
  const m = s.model!;
  return (
    <section className="dossier-section sportsbook-details">
      <div className="sportsbook-total">
        <Coins size={25} />
        <div>
          <span className="eyebrow">BOOKIES PROJECTED · MODELED</span>
          <strong>
            {number(s.points)} <small>pts</small>
          </strong>
        </div>
        <span>
          {s.books.length} books
          <br />
          {s.matchup}
        </span>
      </div>
      <h4>{m.name}</h4>
      <p>{m.limitation}</p>
      <p>{m.formula}</p>
      <p>
        {m.historyGames} recent team games, shrunk toward {m.peerGames} league
        team-games. Each sportsbook gets equal weight.
      </p>
      <div
        className="table-wrap"
        tabIndex={0}
        aria-label="Sportsbook specialist calculation"
      >
        <table>
          <thead>
            <tr>
              <th>Book</th>
              <th>Game total</th>
              <th>Team spread</th>
              <th>Implied team / opponent</th>
              <th>Fantasy points</th>
            </tr>
          </thead>
          <tbody>
            {m.perBook.map((b) => (
              <tr key={b.book}>
                <td>{b.book}</td>
                <td>{number(b.total)}</td>
                <td>{number(b.spread)}</td>
                <td>
                  {number(b.impliedOwn)} / {number(b.impliedOpponent)}
                </td>
                <td>{number(b.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table>
          <caption>Consensus contribution</caption>
          <thead>
            <tr>
              <th>Component</th>
              <th>Input average</th>
              <th>Multiplier</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {s.components.map((c) => (
              <tr key={c.market}>
                <td>{c.label}</td>
                <td>
                  {number(c.mean)}
                  <small>{c.unit}</small>
                </td>
                <td>{c.multiplier.toFixed(4)}</td>
                <td>{number(c.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="sportsbook-receipts">
        <summary>All posted game odds · {s.games.length} receipts</summary>
        <p>
          Spreads and totals feed this model. Moneylines and reference columns
          are shown for context.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Book / source</th>
                <th>Market</th>
                <th>{s.games[0]?.team || "Team"} quote</th>
              </tr>
            </thead>
            <tbody>
              {s.games.map((g) => (
                <tr key={`${g.eventId}-${g.book}-${g.market}`}>
                  <td>
                    {g.book}
                    {g.kind === "reference" && (
                      <small>Reference, not a book</small>
                    )}
                  </td>
                  <td>{g.market}</td>
                  <td className="odds-raw">{g.raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="sportsbook-sources">
        <a href={GAME_SOURCE} target="_blank" rel="noreferrer">
          VegasInsider game lines ↗
        </a>
        <a href={m.source} target="_blank" rel="noreferrer">
          nflverse team history ↗
        </a>
      </div>
      <small>
        Week {s.week} · Collected {date(s.fetchedAt)} · Next refresh{" "}
        {date(s.nextAt)}
      </small>
    </section>
  );
}
