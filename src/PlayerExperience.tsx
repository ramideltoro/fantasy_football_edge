import {
  SportsbookButton,
  SportsbookDetails,
  SportsbookFeed,
  SportsbookNumber,
} from "./Sportsbook";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Shield,
  X,
  Zap,
  Activity,
  HeartPulse,
} from "lucide-react";
import type { PlayerData } from "../shared/model";
import { PlayerNews } from "./NewsHub";
export const points = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(2);
export const yahooPoints = (p: PlayerData) =>
  p.providerProjected !== undefined ? p.providerProjected : p.projected;
const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n)}%`;
const currentQwen = (p: PlayerData) =>
  p.aiProjection?.label === "Qwen" && !p.aiProjection.stale
    ? p.aiProjection
    : null;
const PlayerContext = createContext<{
  players: PlayerData[];
  open: (ids: string[]) => void;
}>({ players: [], open: () => {} });
export function PlayerProvider({
  players,
  children,
}: {
  players: PlayerData[];
  children: React.ReactNode;
}) {
  const [ids, setIds] = useState<string[]>([]);
  const selected = ids
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as PlayerData[];
  return (
    <PlayerContext.Provider value={{ players, open: setIds }}>
      {children}
      {selected.length > 0 && (
        <PlayerDialog players={selected} close={() => setIds([])} />
      )}
    </PlayerContext.Provider>
  );
}
export function usePlayers() {
  return useContext(PlayerContext);
}
export function PlayerLink({
  id,
  name,
  children,
}: {
  id?: string;
  name?: string;
  children?: React.ReactNode;
}) {
  const { players, open } = usePlayers();
  const p = players.find((p) => (id ? p.id === id : p.name === name));
  return p ? (
    <button
      type="button"
      className="player-name"
      onClick={() => open([p.id])}
      title={`${p.team} · ${p.position} · Open player dossier`}
    >
      {children || p.name}
    </button>
  ) : (
    <>{children || name || id}</>
  );
}
export function PlayerText({ text }: { text: string }) {
  const { players } = usePlayers();
  const names = [...new Set(players.map((p) => p.name))].sort(
    (a, b) => b.length - a.length,
  );
  const pattern = useMemo(
    () =>
      names.length
        ? new RegExp(
            `(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
            "g",
          )
        : null,
    [names.join("|")],
  );
  return (
    <>
      {pattern
        ? text
            .split(pattern)
            .map((s, i) =>
              names.includes(s) ? <PlayerLink key={i} name={s} /> : s,
            )
        : text}
    </>
  );
}
export function PlayerChartTick({ x, y, payload, vertical = false }: any) {
  const { players, open } = usePlayers();
  const p = players.find((p) => p.name === payload?.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        dy={vertical ? 4 : 16}
        textAnchor={vertical ? "end" : "middle"}
        fill="currentColor"
        fontSize={11}
        role={p ? "button" : undefined}
        tabIndex={p ? 0 : undefined}
        aria-label={p ? `Open player details for ${p.name}` : undefined}
        style={{ cursor: p ? "pointer" : undefined }}
        onClick={() => p && open([p.id])}
        onKeyDown={(e) => {
          if (p && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            open([p.id]);
          }
        }}
      >
        <title>{p?.name || payload?.value}</title>
        {vertical
          ? payload?.value
          : String(payload?.value || "")
              .split(" ")
              .slice(-1)[0]}
      </text>
    </g>
  );
}
export function Portrait({
  player: p,
  large = false,
}: {
  player: PlayerData;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p.profile?.photo]);
  return (
    <span className={"portrait " + (large ? "portrait-large" : "")}>
      {p.profile?.photo && !failed ? (
        <img
          src={p.profile.photo}
          alt={p.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Shield aria-label="Player photo unavailable" size={large ? 44 : 22} />
      )}
    </span>
  );
}
export function Role({ player: p }: { player: PlayerData }) {
  const f = currentQwen(p);
  const unavailable = ["O", "IR", "PUP", "SUSP"].includes(p.status);
  const probability = f?.startProbability;
  return (
    <span
      className={
        "role-chip " +
        (unavailable ? "role-out" : p.nflRole?.rank === 1 ? "role-starter" : "")
      }
    >
      <span>
        {unavailable ? "Unavailable" : p.nflRole?.label || "Checking role"}
      </span>
      <small>
        {p.position === "DEF"
          ? "Team unit · individual probability N/A"
          : probability != null
            ? `${pct(probability)} to start · Qwen`
            : p.locked
              ? "Game locked"
              : "Start probability pending"}
      </small>
    </span>
  );
}
export function Started({ player: p }: { player: PlayerData }) {
  const r = p.profile?.starts;
  return (
    <span
      title={
        r?.percent != null
          ? `${r.starts} NFL starts / ${r.games} games played in ${p.profile.season}. ${r.stale ? "Source needs a refresh. " : ""}ESPN · ${r.asOf}`
          : "Verified current-season NFL starts are not available. Yahoo fantasy start percentage is a different metric."
      }
    >
      {p.position === "DEF" ? "N/A" : pct(r?.percent)}
      {r?.percent != null && (
        <small>
          {r.starts}/{r.games} games{r.stale ? " · stale" : ""}
        </small>
      )}
    </span>
  );
}
export function PlayerTable({
  players,
  title,
  description,
  waivers = false,
}: {
  players: PlayerData[];
  title: string;
  description: string;
  waivers?: boolean;
}) {
  const { open } = usePlayers();
  const [selected, setSelected] = useState<string[]>([]);
  const [position, setPosition] = useState("ALL");
  const [page, setPage] = useState(0);
  const filtered = players.filter(
    (p) => position === "ALL" || p.position === position,
  );
  const checked = selected.filter((id) => players.some((p) => p.id === id));
  useEffect(() => setPage(0), [position]);
  useEffect(
    () =>
      setPage((p) =>
        Math.min(p, Math.max(0, Math.ceil(filtered.length / 30) - 1)),
      ),
    [filtered.length],
  );
  return (
    <section className="roster-section">
      <div className="section-heading roster-heading">
        <div>
          <span className="eyebrow">
            {waivers ? "FIND YOUR NEXT PROBLEM FOR THE LEAGUE" : "THE SQUAD"}
          </span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="roster-count">
          {players.length}
          <small>PLAYERS</small>
        </span>
      </div>
      <SportsbookFeed />
      <div className="roster-controls">
        <div className="filter-pills" aria-label="Position filter">
          {["ALL", "QB", "RB", "WR", "TE", "K", "DEF"].map((pos) => (
            <button
              key={pos}
              aria-pressed={position === pos}
              onClick={() => setPosition(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
        <span className="muted">
          {checked.length
            ? `${checked.length} selected`
            : "Check two or more. Let them square up."}
        </span>
      </div>
      {checked.length >= 2 && (
        <div className="compare-bar" role="status">
          <span>
            <ArrowLeftRight size={18} /> {checked.length} players. One showdown.
          </span>
          <button className="primary" onClick={() => open(checked)}>
            Compare players <ArrowUpRight size={16} />
          </button>
          <button
            onClick={() => setSelected([])}
            aria-label="Clear comparison selection"
          >
            Clear
          </button>
        </div>
      )}
      <div
        className="table-wrap roster-table"
        tabIndex={0}
        aria-label={`${title} player table; scroll horizontally for all columns`}
      >
        <table>
          <thead>
            <tr>
              <th>Compare</th>
              <th>NFL Starter / Backup</th>
              <th>Fantasy position</th>
              <th>Player</th>
              <th>Slot</th>
              <th>Yahoo projected</th>
              <th>Qwen projected</th>
              <th>
                Bookies projected<small>Partial points · tap for math</small>
              </th>
              <th>Rostered</th>
              <th title="Actual NFL starts divided by games played this season">
                Started<small>This NFL season</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(page * 30, (page + 1) * 30).map((p) => (
              <tr
                key={p.id}
                className={checked.includes(p.id) ? "selected-row" : ""}
              >
                <td data-label="Compare">
                  <input
                    type="checkbox"
                    aria-label={`Compare ${p.name}`}
                    checked={checked.includes(p.id)}
                    onChange={() =>
                      setSelected(
                        checked.includes(p.id)
                          ? checked.filter((id) => id !== p.id)
                          : [...checked, p.id],
                      )
                    }
                  />
                </td>
                <td data-label="NFL role">
                  <button
                    className="role-button"
                    onClick={() => open([p.id])}
                    aria-label={`NFL role and start probability for ${p.name}`}
                  >
                    <Role player={p} />
                  </button>
                </td>
                <td data-label="Fantasy position">
                  <span
                    className={"slot-tag " + (p.slot === "BN" ? "bench" : "")}
                  >
                    {p.slot || p.availability || "Pool"}
                  </span>
                </td>
                <td data-label="Player">
                  <button className="player-cell" onClick={() => open([p.id])}>
                    <Portrait player={p} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.team}
                        {p.research?.opponent
                          ? ` · vs ${p.research.opponent}`
                          : ""}
                        {p.status ? ` · ${p.status}` : ""}
                        {p.locked ? " · LOCKED" : ""}
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                </td>
                <td data-label="Slot">{p.position}</td>
                <td className="point-cell" data-label="Yahoo projected">
                  {points(yahooPoints(p))}
                </td>
                <td
                  className="point-cell qwen-number"
                  data-label="Qwen projected"
                >
                  <button
                    onClick={() => open([p.id])}
                    aria-label={`Qwen forecast details for ${p.name}`}
                  >
                    {points(currentQwen(p)?.points)}
                    {!currentQwen(p) && (
                      <small>
                        {p.locked
                          ? "Game locked"
                          : p.aiProjection?.stale
                            ? "Refresh pending"
                            : "Calculating"}
                      </small>
                    )}
                  </button>
                </td>
                <td
                  className="point-cell sportsbook-cell"
                  data-label="Bookies projected"
                >
                  <SportsbookButton player={p} />
                </td>
                <td data-label="Rostered">{pct(p.rosterPct)}</td>
                <td data-label="Started this NFL season">
                  <Started player={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="empty">Nobody here yet. Try another position.</p>
      )}
      {filtered.length > 30 && (
        <div className="pagination">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page + 1} / {Math.ceil(filtered.length / 30)}
          </span>
          <button
            disabled={(page + 1) * 30 >= filtered.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      <p className="table-note">
        Yahoo and Qwen are separate full forecasts. Bookies shows a partial
        subtotal from available props. Tap the number for the math. NFL start
        probabilities are Qwen estimates from sourced evidence; “Started” is a
        historical record.
      </p>
    </section>
  );
}
function PlayerDialog({
  players,
  close,
}: {
  players: PlayerData[];
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const comparing = players.length > 1;
  useEffect(() => {
    const d = ref.current!;
    const before = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    d.showModal();
    return () => {
      d.close();
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"player-dialog " + (comparing ? "comparison-dialog" : "")}
      aria-labelledby="dossier-title"
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-top">
          <div>
            <span className="eyebrow">
              {comparing ? "TALE OF THE TAPE" : "PLAYER DOSSIER"}
            </span>
            <h2 id="dossier-title">
              {comparing ? "Who’s bringing the heat?" : players[0].name}
            </h2>
            <p>
              {comparing
                ? "Same week. Every detail. You make the call."
                : "All the intel. Zero scavenger hunt."}
            </p>
          </div>
          <button
            className="close-dialog icon"
            onClick={close}
            aria-label="Close player details"
          >
            <X />
          </button>
        </div>
        {comparing && (
          <div className="comparison-scores">
            <span>
              {players.length === 2
                ? "First selected → second selected"
                : "Player comparison"}
            </span>
            {players.length === 2 && (
              <span>
                Yahoo difference:{" "}
                <b>
                  {yahooPoints(players[0]) != null &&
                  yahooPoints(players[1]) != null
                    ? `${yahooPoints(players[1])! - yahooPoints(players[0])! >= 0 ? "+" : ""}${points(yahooPoints(players[1])! - yahooPoints(players[0])!)}`
                    : "—"}
                </b>{" "}
                pts
              </span>
            )}
            <small>
              Check game locks, position eligibility and waiver status before a
              move.
            </small>
          </div>
        )}
        <div
          className="dossier-grid"
          style={{
            gridTemplateColumns: comparing
              ? `repeat(${players.length}, minmax(310px, 1fr))`
              : "1fr",
          }}
        >
          {players.map((p) => (
            <PlayerDossier key={p.id} player={p} />
          ))}
        </div>
      </div>
    </dialog>
  );
}
function PlayerDossier({ player: p }: { player: PlayerData }) {
  const [history, setHistory] = useState<any[] | null>(null);
  const [error, setError] = useState(false);
  const q = p.aiProjection?.label === "Qwen" ? p.aiProjection : null;
  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/players/${encodeURIComponent(p.id)}/history`, {
      signal: c.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setHistory)
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, [p.id]);
  return (
    <article className="dossier">
      <div className="dossier-identity">
        <Portrait player={p} large />
        <div>
          <span className="eyebrow">
            {p.team} · {p.position}
            {p.profile?.jersey ? ` · #${p.profile.jersey}` : ""}
          </span>
          <h3>
            <PlayerLink id={p.id} />
          </h3>
          <span
            className={"status-label " + (p.status ? "injured" : "healthy")}
          >
            {p.status || "No injury flag"}
          </span>
        </div>
      </div>
      <div className="dossier-projections">
        <div>
          <small>YAHOO PROJECTED</small>
          <strong>{points(yahooPoints(p))}</strong>
          <span>fantasy points</span>
        </div>
        <div>
          <small>QWEN PROJECTED</small>
          <strong>{points(currentQwen(p)?.points)}</strong>
          <span>{q?.stale ? "Refresh pending" : "fantasy points"}</span>
        </div>
        <div>
          <small>BOOKIES PROJECTED</small>
          <SportsbookNumber projection={p.sportsbook} />
        </div>
      </div>
      <details className="dossier-section">
        <summary>Sportsbook receipts · see calculation</summary>
        <SportsbookDetails projection={p.sportsbook} />
      </details>
      <dl className="detail-grid">
        <div>
          <dt>Fantasy position</dt>
          <dd>{p.slot || p.availability || "Pool"}</dd>
        </div>
        <div>
          <dt>NFL position</dt>
          <dd>{p.position}</dd>
        </div>
        <div>
          <dt>NFL role</dt>
          <dd>
            <Role player={p} />
          </dd>
        </div>
        <div>
          <dt>Chance to play</dt>
          <dd>
            {pct(currentQwen(p)?.playProbability)}
            <small>Qwen estimate</small>
          </dd>
        </div>
        <div>
          <dt>Rostered</dt>
          <dd>{pct(p.rosterPct)}</dd>
        </div>
        <div>
          <dt>NFL starts this season</dt>
          <dd>
            <Started player={p} />
          </dd>
        </div>
        <div>
          <dt>Opponent</dt>
          <dd>{p.research?.opponent || "Not confirmed"}</dd>
        </div>
        <div>
          <dt>Bye week</dt>
          <dd>{p.bye ?? "—"}</dd>
        </div>
        <div>
          <dt>Actual points</dt>
          <dd>{points(p.actual)}</dd>
        </div>
        <div>
          <dt>Kickoff / game lock</dt>
          <dd>
            {p.kickoffAt
              ? new Date(p.kickoffAt).toLocaleString()
              : "Not confirmed"}
            <small>{p.locked ? "Game locked" : "Not locked"}</small>
          </dd>
        </div>
        <div>
          <dt>Eligible slots</dt>
          <dd>{p.eligible.join(", ")}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>{p.slot ? "On your roster" : p.availability || "Unconfirmed"}</dd>
        </div>
      </dl>
      <section className="dossier-section">
        <h4>
          <Zap size={17} /> Qwen’s read
        </h4>
        {q ? (
          <>
            <p>{q.reason}</p>
            <p>
              Qwen’s forecast is an estimate. Play and start percentages are
              subjective model estimates, not official probabilities.
            </p>
            <small>
              {q.stale ? "Previous forecast · " : ""}
              {new Date(q.generatedAt).toLocaleString()} · {q.method}
            </small>
            {q.sources?.length > 0 && (
              <ul className="source-list">
                {q.sources.map((n: any, i: number) => (
                  <li key={i}>
                    <a href={n.url} target="_blank" rel="noreferrer">
                      {n.source}: {n.title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p>
            {p.locked
              ? "Game locked. No new pregame forecast can be recorded for this game."
              : "The film room is working. A number appears here only after Qwen calculates it."}
          </p>
        )}
      </section>
      <section className="dossier-section">
        <h4>Role & health receipts</h4>
        <p>
          {p.nflRole?.source ? (
            <a href={p.nflRole.source} target="_blank" rel="noreferrer">
              ESPN depth chart ↗
            </a>
          ) : (
            "No verified depth chart match."
          )}
          {p.nflRole?.asOf && (
            <small>Checked {new Date(p.nflRole.asOf).toLocaleString()}</small>
          )}
        </p>
        {p.profile?.injuries?.map((i: any, n: number) => (
          <p key={n}>
            {i.status}: {i.comment || i.detail}
            {i.date && <small>{new Date(i.date).toLocaleString()}</small>}
          </p>
        ))}
        {p.profile?.starts?.source && (
          <p>
            <a href={p.profile.starts.source} target="_blank" rel="noreferrer">
              NFL starts source · ESPN ↗
            </a>
          </p>
        )}
        <p className="muted">
          A depth-chart starter is not a promise of snaps. Start/play
          percentages are Qwen’s subjective estimates, not official NFL
          probabilities.
        </p>
      </section>
      {p.profile && (
        <section className="dossier-section">
          <h4>The player behind the points</h4>
          <dl className="detail-grid">
            {Object.entries({
              Age: p.profile.age,
              Height: p.profile.height,
              Weight: p.profile.weight,
              College: p.profile.college,
              "NFL seasons": p.profile.experience,
            }).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v == null ? "—" : String(v)}</dd>
              </div>
            ))}
          </dl>
          <a href={p.profile.source} target="_blank" rel="noreferrer">
            ESPN player profile ↗
          </a>
        </section>
      )}
      <PlayerNews player={p} history={history || []} />
      <details className="dossier-section">
        <summary>All imported stats</summary>
        <dl className="detail-grid">
          {Object.entries(p.stats)
            .filter(([, v]) => v !== null)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        <small>
          {p.slot ? "Yahoo imported results" : "Yahoo projected statistics"} ·
          Yahoo fantasy started: {pct(p.startPct)} (not NFL starts).
        </small>
      </details>
      <details className="dossier-section">
        <summary>Recent game history</summary>
        {p.research?.history?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Season / week</th>
                  <th>Points</th>
                  <th>Targets</th>
                  <th>Carries</th>
                  <th>Snaps</th>
                </tr>
              </thead>
              <tbody>
                {p.research.history.map((h: any) => (
                  <tr key={`${h.season}-${h.week}`}>
                    <td>
                      {h.season} / {h.week}
                    </td>
                    <td>{points(h.points)}</td>
                    <td>{h.targets ?? "—"}</td>
                    <td>{h.carries ?? "—"}</td>
                    <td>{pct(h.snapPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Verified game history is not available yet.</p>
        )}
      </details>
      <details className="dossier-section">
        <summary>Yahoo projection movement</summary>
        {error ? (
          <p>History is unavailable. Close and reopen to retry.</p>
        ) : history === null ? (
          <p>Loading history…</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Imported</th>
                  <th>Week</th>
                  <th>Projected</th>
                  <th>Actual</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(-12).map((h: any, i: number) => (
                  <tr key={i}>
                    <td>{new Date(h.capturedAt).toLocaleString()}</td>
                    <td>{h.week}</td>
                    <td>{points(h.projected)}</td>
                    <td>{points(h.actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </article>
  );
}
export function HealthBoard({ players }: { players: PlayerData[] }) {
  const { open } = usePlayers();
  const healthy = players.filter(
    (p) =>
      !p.status &&
      !!p.profile &&
      !p.profile.stale &&
      !p.profile.injuries?.length,
  );
  const watch = players.filter(
    (p) => !!p.status || p.profile?.injuries?.length,
  );
  const out = players.filter(
    (p) =>
      currentQwen(p)?.playProbability != null &&
      currentQwen(p).playProbability < 50,
  );
  const unknown = players.length - healthy.length - watch.length;
  return (
    <section className="health-board" aria-label="Team health">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE AVAILABILITY CHECK</span>
          <h2>Who’s ready to rumble?</h2>
          <p>Before the hype, check who can actually suit up.</p>
        </div>
      </div>
      <div className="health-boxes">
        {[
          {
            tone: "green",
            title: "Good to go",
            label: "Healthy · no injury flags",
            list: healthy,
            icon: <Shield />,
          },
          {
            tone: "yellow",
            title: "Ice-pack crew",
            label: "Injury / availability flags",
            list: watch,
            icon: <HeartPulse />,
          },
          {
            tone: "red",
            title: "Qwen says: likely out",
            label: "Model play probability below 50%",
            list: out,
            icon: <Activity />,
          },
        ].map((g) => (
          <button
            key={g.tone}
            className={`health-box ${g.tone}`}
            disabled={!g.list.length}
            onClick={() => open(g.list.map((p) => p.id))}
          >
            <span>
              {g.icon}
              {g.title}
            </span>
            <strong>{g.list.length.toString().padStart(2, "0")}</strong>
            <small>{g.label}</small>
            <span className="health-preview">
              {g.list
                .slice(0, 3)
                .map((p) => p.name)
                .join(" · ") || "Nobody in this group"}
              {g.list.length > 3 ? ` +${g.list.length - 3}` : ""}
            </span>
          </button>
        ))}
      </div>
      <p className="table-note">
        Qwen’s count uses current model availability forecasts and may overlap
        the injury group. A missing forecast is never counted as “out.”
        {unknown > 0
          ? ` ${unknown} player${unknown === 1 ? "" : "s"} still need a verified health check.`
          : ""}
      </p>
    </section>
  );
}
