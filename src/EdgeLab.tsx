import { useMemo, useState } from "react";
import { PlayerLink, usePlayers } from "./PlayerExperience";
import { SortableTable } from "./SortableTable";
import {
  bestTeam,
  tradeImpact,
  type LabPlayer,
  type LabTeam,
} from "../shared/edgeLab";
import { reserveSlots } from "../shared/availability";
const n = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));
const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v * 100)}%`;
export function LabStatus({ lab }: { lab: any }) {
  return (
    <p className="lab-status">
      {lab ? (
        <>
          Scouting updated {new Date(lab.generatedAt).toLocaleString()} ·{" "}
          {lab.coverage.rosters}/{lab.coverage.teams} league rosters
          {lab.stale ? " · Refreshing stale inputs" : ""}
          {lab.sources.some((s: any) => s.stale)
            ? " · Some source refreshes failed; cached evidence shown"
            : ""}
        </>
      ) : (
        "The scouting desk is collecting its first data. This page updates automatically."
      )}
    </p>
  );
}
export function LabActions({
  lab,
  navigate,
}: {
  lab: any;
  navigate: (s: string) => void;
}) {
  return (
    <section className="panel edge-lab-actions">
      <span className="eyebrow">FIND YOUR NEXT EDGE</span>
      <h3>The box score doesn’t tell the whole story.</h3>
      <div className="lab-tiles">
        {[
          [
            "Breakout radar",
            "Who’s getting fed?",
            "Spot rising workloads before the waiver stampede.",
          ],
          [
            "Matchup radar",
            "Pick your battles.",
            "See defensive matchups and game conditions.",
          ],
          [
            "Trade finder",
            "Work the phones. Bring a real damn offer.",
            "Find roster fits that help both sides.",
          ],
        ].map(([tab, title, copy]) => (
          <button key={tab} onClick={() => navigate(tab)}>
            <strong>{title}</strong>
            <span>{copy}</span>
            <b>Open {tab.toLowerCase()} →</b>
          </button>
        ))}
      </div>
      <LabStatus lab={lab} />
    </section>
  );
}
export function UsageRadar({ lab, snapshot }: { lab: any; snapshot: any }) {
  const [scope, setScope] = useState("available"),
    [position, setPosition] = useState("ALL");
  const ids = new Set<string>(
    (scope === "owned"
      ? snapshot.players
      : scope === "available"
        ? snapshot.available
        : lab?.players || []
    ).map((p: any) => p.id),
  );
  const players: LabPlayer[] = (lab?.players || [])
    .filter(
      (p: LabPlayer) =>
        ids.has(p.id) &&
        ["RB", "WR", "TE"].includes(p.position) &&
        (position === "ALL" || p.position === position),
    )
    .sort(
      (a: LabPlayer, b: LabPlayer) =>
        (b.lab.usage?.opportunityDelta ?? -999) -
        (a.lab.usage?.opportunityDelta ?? -999),
    );
  return (
    <section className="panel">
      <span className="eyebrow">OPPORTUNITY BEFORE HYPE</span>
      <h2>Who’s getting fed?</h2>
      <p>
        Follow the touches. Hype doesn’t carry the damn football. Find growing
        roles before the group chat catches on.
      </p>
      <div className="lab-controls">
        <label>
          Player pool
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="available">Available in my league</option>
            <option value="owned">My team</option>
            <option value="league">Entire imported league</option>
          </select>
        </label>
        <label>
          Position
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            {["ALL", "RB", "WR", "TE"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <LabStatus lab={lab} />
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Player</th>
              <th>Signal</th>
              <th>Targets</th>
              <th>Carries</th>
              <th>Inside-20 targets</th>
              <th>Inside-5 carries</th>
              <th>Target share</th>
              <th>Air-yard share</th>
              <th>Snap share</th>
              <th>Opportunity change</th>
              <th>Opportunity points</th>
              <th>Actual points</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const u = p.lab.usage;
              return (
                <tr key={p.id}>
                  <td data-sort-value={p.name}>
                    <PlayerLink id={p.id} />
                    <small>
                      {p.position} ·{" "}
                      {u ? `${u.latestSeason} W${u.latestWeek}` : "No history"}
                    </small>
                  </td>
                  <td>{u?.trend || "Waiting for data"}</td>
                  <td>{n(u?.targets)}</td>
                  <td>{n(u?.carries)}</td>
                  <td>{n(u?.redZoneTargets)}</td>
                  <td>{n(u?.goalLineCarries)}</td>
                  <td data-sort-value={u?.targetShare}>
                    {pct(u?.targetShare)}
                  </td>
                  <td data-sort-value={u?.airShare}>{pct(u?.airShare)}</td>
                  <td data-sort-value={u?.snaps}>{pct(u?.snaps)}</td>
                  <td>{n(u?.opportunityDelta)}</td>
                  <td>{n(u?.expected)}</td>
                  <td>{n(u?.actual)}</td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
      {!players.length && (
        <p className="empty">No matching players in this imported pool.</p>
      )}
      <details>
        <summary>Show the receipts</summary>
        <p>
          Latest completed prior-week game versus the preceding four available
          games. Older-season samples are included when needed. Opportunity
          points multiply targets and carries by position-wide receiving/rushing
          production per opportunity, using your league’s scoring. They exclude
          passing, turnovers and return points; the actual total includes all
          scoring categories. This is a descriptive workload estimate, not a
          Qwen forecast or a route-participation metric.
        </p>
        <p>
          Source:{" "}
          <a
            href="https://github.com/nflverse/nflverse-data"
            target="_blank"
            rel="noreferrer"
          >
            nflverse player stats and snap counts
          </a>
          . Click a player for the sample and projection details.
        </p>
      </details>
    </section>
  );
}
export function MatchupRadar({ lab, snapshot }: { lab: any; snapshot: any }) {
  const [scope, setScope] = useState("owned");
  const ids = new Set(
    (scope === "owned" ? snapshot.players : snapshot.available).map(
      (p: any) => p.id,
    ),
  );
  const players: LabPlayer[] = (lab?.players || []).filter((p: LabPlayer) =>
    ids.has(p.id),
  );
  return (
    <section className="panel">
      <span className="eyebrow">KNOW THE TERRAIN</span>
      <h2>BBQ chicken or brick wall?</h2>
      <p>
        Find the soft spots before we charge into a brick wall. Opponent
        strength is adjusted for the players they have faced.
      </p>
      <div className="filter-pills">
        {[
          ["owned", "My team"],
          ["available", "Available pickups"],
        ].map(([v, label]) => (
          <button
            key={v}
            aria-pressed={scope === v}
            onClick={() => setScope(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <LabStatus lab={lab} />
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Player</th>
              {[0, 1, 2].map((i) => (
                <th key={i}>Week {snapshot.week + i}</th>
              ))}
              <th>This week’s conditions</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const weather = lab.weather.find(
                (w: any) =>
                  w.teams.includes(p.team.toUpperCase()) ||
                  w.teams.includes(
                    p.team.toUpperCase() === "JAX"
                      ? "JAX"
                      : p.team.toUpperCase() === "JAC"
                        ? "JAX"
                        : p.team.toUpperCase() === "WAS"
                          ? "WSH"
                          : p.team.toUpperCase(),
                  ),
              );
              return (
                <tr key={p.id}>
                  <td data-sort-value={p.name}>
                    <PlayerLink id={p.id} />
                    <small>{p.position}</small>
                  </td>
                  {p.lab.matchups.slice(0, 3).map((m) => (
                    <td key={m.week} data-sort-value={m.adjustment}>
                      <span
                        className={
                          "matchup-chip " +
                          (m.label === "Friendly"
                            ? "good"
                            : m.label === "Tough"
                              ? "tough"
                              : "")
                        }
                      >
                        {m.bye ? "BYE" : `${m.opponent || "TBD"} · ${m.label}`}
                      </span>
                      <small>
                        {m.adjustment === null
                          ? "Limited evidence"
                          : `${m.adjustment >= 0 ? "+" : ""}${n(m.adjustment)} pts · ${m.samples} player-games`}
                      </small>
                    </td>
                  ))}
                  <td>
                    {weather ? (
                      <>
                        <strong>{weather.venue}</strong>
                        <small>
                          {weather.indoor
                            ? "Indoor venue; roof position unconfirmed"
                            : weather.description || "Forecast unavailable"}
                          {!weather.indoor && weather.temperature != null
                            ? ` · ${weather.temperature}°F`
                            : ""}
                        </small>
                        <a
                          href={weather.source}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Forecast source ↗
                        </a>
                      </>
                    ) : (
                      "Game conditions unavailable"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
      <details>
        <summary>How the matchup adjustment works</summary>
        <p>
          For each position, compare fantasy points scored against this defense
          with those players’ averages in other available games. Shrink the
          difference toward zero with 20 neutral player-game equivalents.
          Prior-season evidence is included. The number is an experimental
          contextual adjustment; it does not change Yahoo or Qwen forecasts.
          K/DEF adjustments remain unavailable where comparable evidence is
          absent.
        </p>
        <p>
          Weather comes from ESPN’s venue forecast. Missing wind or
          roof-position information stays unknown. No automatic weather points
          penalty is applied.
        </p>
      </details>
    </section>
  );
}
export function TradeFinder({ lab }: { lab: any }) {
  const [otherKey, setOther] = useState(""),
    [out, setOut] = useState<string[]>([]),
    [incoming, setIncoming] = useState<string[]>([]);
  const { open } = usePlayers();
  const teams: LabTeam[] = lab?.teams || [],
    own = teams.find((t) => t.own),
    others = teams.filter((t) => !t.own),
    other = others.find((t) => t.key === otherKey) || others[0];
  const result = useMemo(
    () =>
      own && other
        ? tradeImpact(own, other, out, incoming, lab.slots, lab.week, [])
        : null,
    [lab, own, other, out, incoming],
  );
  const toggle = (id: string, selected: string[], set: (v: string[]) => void) =>
    set(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : selected.length < 3
          ? [...selected, id]
          : selected,
    );
  return (
    <section className="panel">
      <span className="eyebrow">THE TRADE DESK</span>
      <h2>Work the phones. Bring a real damn offer.</h2>
      <p>
        Nobody wants three bench ornaments for their best player. Find a real
        roster fit and check what both sides gain over the next three weeks.
      </p>
      <LabStatus lab={lab} />
      {!!lab?.proposals?.length && (
        <details open>
          <summary>Deals that help both lineups</summary>
          <div className="lab-tiles">
            {lab.proposals.slice(0, 6).map((r: any, i: number) => (
              <button
                key={i}
                onClick={() => {
                  setOther(r.otherKey);
                  setOut(r.outgoing);
                  setIncoming(r.incoming);
                }}
              >
                <strong>{teams.find((t) => t.key === r.otherKey)?.name}</strong>
                <span>
                  Your lineup +{n(r.ownGain)} · their lineup +{n(r.otherGain)}{" "}
                  over three weeks
                </span>
                <b>Inspect deal →</b>
              </button>
            ))}
          </div>
        </details>
      )}
      <label className="lab-field">
        Trade partner
        <select
          value={other?.key || ""}
          onChange={(e) => {
            setOther(e.target.value);
            setIncoming([]);
          }}
        >
          {others.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
              {!t.players.length ? " · roster pending" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="lab-columns">
        {[
          [own, out, setOut, "You send"],
          [other, incoming, setIncoming, "You receive"],
        ].map(([team, selected, set, title]: any) => (
          <div key={title}>
            <h3>
              {title} <small>up to 3 players</small>
            </h3>
            <div className="trade-picker">
              {team?.players?.map((p: LabPlayer) => (
                <div key={p.id}>
                  <input
                    type="checkbox"
                    aria-label={`${title} ${p.name}`}
                    checked={selected.includes(p.id)}
                    onChange={() => toggle(p.id, selected, set)}
                    disabled={p.locked || ["IR", "IR+", "NA"].includes(p.slot)}
                  />
                  <PlayerLink id={p.id} />
                  <span>
                    {p.position} · {n(p.lab.baseline)} baseline
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {result ? (
        <div className="trade-verdict" role="status">
          <h3>Your three-week change: {n(result.ownGain)} points</h3>
          <p>
            {other?.name}: {n(result.otherGain)} points.{" "}
            {result.ownGain !== null &&
            result.otherGain !== null &&
            result.ownGain > 0 &&
            result.otherGain >= 0
              ? "Both lineups have a reason to listen."
              : "A starting-lineup improvement for both sides is not established."}
          </p>
          <button onClick={() => open([...out, ...incoming])}>
            Compare the players ↗
          </button>
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Your before</th>
                  <th>Your after</th>
                  <th>Their before</th>
                  <th>Their after</th>
                </tr>
              </thead>
              <tbody>
                {result.ownWeeks.map((w, i) => (
                  <tr key={w.week}>
                    <td>{w.week}</td>
                    <td>{n(w.before?.points)}</td>
                    <td>{n(w.after?.points)}</td>
                    <td>{n(result.otherWeeks[i].before?.points)}</td>
                    <td>{n(result.otherWeeks[i].after?.points)}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
          {[...result.ownDrops, ...result.otherDrops].length > 0 && (
            <p>
              Roster-space drops modeled:{" "}
              {[...result.ownDrops, ...result.otherDrops].map((id) => (
                <PlayerLink key={id} id={id} />
              ))}
              . Verify Yahoo’s cut restrictions.
            </p>
          )}
          <p>
            Open slots afterward: you {result.ownOpenSlots}, them{" "}
            {result.otherOpenSlots}. A freed slot is left empty; no successful
            waiver claim is assumed.
          </p>
        </div>
      ) : (
        <p className="empty">
          Select players on both sides. Started games, reserve-slot players,
          missing rosters or an impossible roster-space adjustment cannot
          produce a deal estimate.
        </p>
      )}
      <details>
        <summary>Projection and depth assumptions</summary>
        <p>
          Uses the next three weeks after the current week, with
          recency-weighted historical league-scored production (or a labeled
          current Yahoo carry-forward when history is missing), confirmed byes
          and conservative matchup adjustments. Current injury exclusions carry
          forward; recovery is not assumed. The weakest eligible bench player is
          dropped when a deal exceeds the current roster size. These are
          experimental statistical estimates, not Qwen forecasts, rest-of-season
          trade values, or probabilities that another manager will accept. No
          trade is submitted to Yahoo.
        </p>
      </details>
    </section>
  );
}
export function WaiverCoach({ lab, snapshot }: { lab: any; snapshot: any }) {
  const [selected, setSelected] = useState("");
  const own: LabTeam | undefined = lab?.teams?.find((t: LabTeam) => t.own);
  const pool: LabPlayer[] = (lab?.players || []).filter((p: LabPlayer) =>
    snapshot.available.some((a: any) => a.id === p.id),
  );
  const candidate = pool.find((p) => p.id === selected) || pool[0];
  const slots = lab?.slots || [];
  const ranked = useMemo(() => {
    if (!own || !candidate) return [];
    const before = bestTeam(own.players, slots, lab.week + 1, lab.week);
    return own.players
      .filter((p) => p.slot === "BN" && !p.locked)
      .map((drop) => {
        const after = bestTeam(
          [
            ...own.players.filter((p) => p.id !== drop.id),
            { ...candidate, slot: "BN" },
          ],
          slots,
          lab.week + 1,
          lab.week,
        );
        return {
          drop,
          delta: before && after ? after.points - before.points : null,
        };
      })
      .sort((a, b) => (b.delta ?? -999) - (a.delta ?? -999));
  }, [own, candidate, lab]);
  const best = ranked[0];
  const competing = (candidate ? lab?.teams || [] : [])
    .filter((t: LabTeam) => !t.own && t.players.length)
    .filter((t: LabTeam) => {
      const before = bestTeam(t.players, slots, lab.week + 1, lab.week),
        after = bestTeam(
          [...t.players, { ...candidate!, slot: "BN" }],
          slots,
          lab.week + 1,
          lab.week,
        );
      return before && after && after.points > before.points + 1;
    });
  return (
    <section className="panel">
      <span className="eyebrow">MAKE THE CLAIM COUNT</span>
      <h2>Don’t blow your claim on a shiny helmet.</h2>
      <p>
        {lab?.settings?.waiverType || "Waiver rules pending"} · Your imported
        priority: {own?.waiver ?? "unknown"}
      </p>
      <label className="lab-field">
        Available player
        <select
          value={candidate?.id || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {pool.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.position}
            </option>
          ))}
        </select>
      </label>
      {candidate && (
        <div className="trade-verdict">
          <h3>
            <PlayerLink id={candidate.id} />
          </h3>
          <p>
            {best?.delta != null && best.delta > 2
              ? "Worth a serious claim."
              : best?.delta != null && best.delta > 0
                ? "A small upgrade. Keep your priority in mind."
                : "A starting-lineup upgrade is not established. Consider depth and injury cover."}
          </p>
          {best && (
            <p>
              Best modeled bench replacement: <PlayerLink id={best.drop.id} /> ·
              next-week lineup change {n(best.delta)} points.
            </p>
          )}
          <p>
            {competing.length} imported opposing rosters gain more than one
            projected starting point from adding this player.{" "}
            {
              competing.filter(
                (t: LabTeam) =>
                  t.waiver !== null &&
                  own?.waiver != null &&
                  t.waiver < own.waiver,
              ).length
            }{" "}
            have higher imported waiver priority.
          </p>
          <small>
            This is roster need, not a prediction that they will claim him.
            Competing-team calculation assumes they can create a roster slot.
            Confirm availability and cut restrictions in Yahoo.
          </small>
        </div>
      )}
      <LabStatus lab={lab} />
      <p>
        Your league uses rolling priority, so Edge gives claim guidance rather
        than inventing a dollar bid. Rankings use next-week statistical
        baselines; future availability and claims are not guaranteed.
      </p>
    </section>
  );
}
export function PlayoffRace({ lab }: { lab: any }) {
  const teams: LabTeam[] = lab?.teams || [];
  return (
    <section className="panel">
      <span className="eyebrow">THE LONG GAME</span>
      <h2>Get in the dance. Then raise hell.</h2>
      <p>
        {lab?.settings?.playoffTeams || "—"} playoff spots · starts week{" "}
        {lab?.settings?.playoffWeek || "—"} ·{" "}
        {lab?.settings?.median
          ? "Head-to-head plus a league-median result each week"
          : "Head-to-head results"}
      </p>
      <p className="notice">
        Experimental scenario: current rosters and injury exclusions stay fixed,
        and unfilled bye slots score zero. These percentages are not calibrated
        playoff odds.
      </p>
      <LabStatus lab={lab} />
      {lab?.playoffs?.reason && <p className="notice">{lab.playoffs.reason}</p>}
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Team</th>
              <th>Record</th>
              <th>Current-week optimized</th>
              <th>Next-week baseline</th>
              <th>Simulated playoff chance</th>
              <th>Expected final win-equivalents</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const strength = lab.strengths.find((r: any) => r.key === t.key),
                result = lab.playoffs.rows.find((r: any) => r.key === t.key);
              return (
                <tr key={t.key}>
                  <td>
                    {t.name}
                    {t.own ? " · YOU" : ""}
                  </td>
                  <td>{t.record}</td>
                  <td>{n(strength?.weekly?.points)}</td>
                  <td>{n(strength?.next?.points)}</td>
                  <td data-sort-value={result?.chance}>
                    {result ? `${n(result.chance)}%` : "Pending inputs"}
                  </td>
                  <td>{n(result?.expectedWins)}</td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
      {lab?.baselineReport?.length > 0 && (
        <details>
          <summary>Historical baseline report card</summary>
          <p>
            Rolling-origin test: each game is predicted from the preceding 4–8
            scored games only. This checks the historical baseline, not
            playoff-probability calibration, matchup adjustments or Yahoo
            fallback forecasts. Small-role players are included.
          </p>
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Held-out games</th>
                  <th>Average miss</th>
                  <th>Bias</th>
                </tr>
              </thead>
              <tbody>
                {lab.baselineReport.map((r: any) => (
                  <tr key={r.position}>
                    <td>{r.position}</td>
                    <td>{r.samples}</td>
                    <td>{n(r.mae)}</td>
                    <td>{n(r.bias)}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        </details>
      )}
      <details>
        <summary>Simulation assumptions — read before victory laps</summary>
        <p>
          {lab?.playoffs?.iterations || 0} seeded simulations of the actual
          remaining regular-season schedule. Future scores use each roster’s
          best eligible lineup, historical league-scored baselines, matchup
          adjustments and historical variability. The model preserves bye weeks,
          current injury exclusions and median results. Final seeding uses
          win-equivalents then points for. Playoff-game tiebreakers do not
          determine regular-season qualification.
        </p>
        <p>
          Experimental model; probabilities are not calibrated or guarantees.{" "}
          {lab?.playoffs?.emptySlots || 0} unfilled starting slots across the
          remaining team-weeks score zero; successful pickups are not assumed.
          No future trades, injury recovery, new injuries or successful waiver
          pickups are assumed. Player scores are modeled independently, so
          teammate/opponent correlations are not captured. Incomplete required
          data withholds probabilities.
        </p>
      </details>
    </section>
  );
}
export function DraftRoom({ lab }: { lab: any }) {
  const [taken, setTaken] = useState<string[]>([]),
    [position, setPosition] = useState("ALL"),
    [pick, setPick] = useState(1),
    [notes, setNotes] = useState<Record<string, string>>({});
  const rows = (lab?.draft?.players || []).filter(
    (p: any) =>
      !taken.includes(String(p.player_id)) &&
      (position === "ALL" || p.position === position),
  );
  return (
    <section className="panel">
      <span className="eyebrow">DRAFT PRACTICE · LOCAL SESSION</span>
      <h2>Build the monster.</h2>
      <p>
        Practice the draft before the clock makes you do dumb shit. Mark players
        taken, compare tiers and leave notes for your future panicking self.
      </p>
      <div className="lab-controls">
        <label>
          Position
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            {["ALL", "QB", "RB", "WR", "TE", "PK", "DEF"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Your next overall pick
          <input
            type="number"
            min={1}
            max={500}
            value={pick}
            onChange={(e) => setPick(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <button
          onClick={() => setTaken(taken.slice(0, -1))}
          disabled={!taken.length}
        >
          Undo last pick
        </button>
        <button
          onClick={() => {
            setTaken([]);
            setNotes({});
          }}
        >
          Reset practice
        </button>
      </div>
      <p>
        {taken.length} players marked taken · ADP sample{" "}
        {lab?.draft?.meta?.start_date || "pending"}–
        {lab?.draft?.meta?.end_date || "pending"} ·{" "}
        {lab?.draft?.meta?.total_drafts ?? 0} mock drafts.{" "}
        {lab?.draft?.stale ? "Source refresh failed; showing cached data." : ""}
      </p>
      <div className="table-wrap">
        <SortableTable>
          <thead>
            <tr>
              <th>Player</th>
              <th>Position</th>
              <th>ADP</th>
              <th>Market tier</th>
              <th>Availability at your pick</th>
              <th>Your notes</th>
              <th>Draft action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => {
              const known: LabPlayer | undefined = lab.players.find(
                (r: LabPlayer) => r.name === p.name,
              );
              return (
                <tr key={p.player_id}>
                  <td data-sort-value={p.name}>
                    <PlayerLink
                      id={known?.id || `ffc:${p.player_id}`}
                      name={p.name}
                    />
                  </td>
                  <td>{p.position}</td>
                  <td>{n(p.adp)}</td>
                  <td>{Math.ceil(p.adp / 12)}</td>
                  <td>
                    {p.high > pick
                      ? "Often later"
                      : p.low < pick
                        ? "Usually gone"
                        : "Could go either way"}
                  </td>
                  <td>
                    <input
                      aria-label={`Notes for ${p.name}`}
                      value={notes[p.player_id] || ""}
                      onChange={(e) =>
                        setNotes({ ...notes, [p.player_id]: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => setTaken([...taken, String(p.player_id)])}
                    >
                      Mark taken
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
      <p>
        Market tiers are 12-pick ADP bands, not player-value grades.
        Availability uses observed earliest/latest draft positions, not a
        calibrated probability. Practice state resets on leaving this page. No
        live Yahoo picks are submitted.
      </p>
      <a
        href="https://fantasyfootballcalculator.com/adp"
        target="_blank"
        rel="noreferrer"
      >
        ADP provided by Fantasy Football Calculator ↗
      </a>
    </section>
  );
}
