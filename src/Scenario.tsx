import { useState } from "react";
import { ArrowLeftRight, ArrowRight } from "lucide-react";
import type { PlayerData } from "../shared/model";
import { PlayerLink, PlayerTable, usePlayers } from "./PlayerExperience";
export function Scenario({
  players,
  pool,
}: {
  players: PlayerData[];
  pool: PlayerData[];
}) {
  const [outId, setOut] = useState(""),
    [inId, setIn] = useState("");
  const { open } = usePlayers();
  const choices = pool
    .filter((p) => !players.some((x) => x.id === p.id))
    .sort(
      (a, b) =>
        a.position.localeCompare(b.position) ||
        (b.projected ?? -Infinity) - (a.projected ?? -Infinity),
    );
  function choose(out: string, incoming: string) {
    setOut(out);
    setIn(incoming);
    if (out && incoming) open([out, incoming]);
  }
  return (
    <section className="panel scenario-panel">
      <span className="eyebrow">THE FRONT OFFICE</span>
      <h2>Trade & waiver scenario</h2>
      <p className="subtitle">
        Who’s out? Who’s in? Pick both and let the numbers talk.
      </p>
      <div className="scenario-picks">
        <label>
          <span>
            <b>01</b> Outgoing player
          </span>
          <select
            aria-label="Outgoing player"
            value={outId}
            onChange={(e) => choose(e.target.value, inId)}
          >
            <option value="">Choose from your roster</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.position} · {p.slot}
              </option>
            ))}
          </select>
        </label>
        <ArrowRight className="swap-arrow" />
        <label>
          <span>
            <b>02</b> Incoming player
          </span>
          <select
            aria-label="Incoming player"
            value={inId}
            disabled={!outId}
            onChange={(e) => choose(outId, e.target.value)}
          >
            <option value="">
              {outId
                ? "Choose your next playmaker"
                : "Pick your outgoing player first"}
            </option>
            {["QB", "RB", "WR", "TE", "K", "DEF"].map((pos) => (
              <optgroup label={pos} key={pos}>
                {choices
                  .filter((p) => p.position === pos)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.team} · {p.availability}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {outId && inId && (
        <div className="scenario-ready">
          <span>
            <PlayerLink id={outId} /> → <PlayerLink id={inId} />
          </span>
          <button className="primary" onClick={() => open([outId, inId])}>
            <ArrowLeftRight size={17} /> Reopen comparison
          </button>
        </div>
      )}
      <p className="table-note">
        This is a look before you leap. Make roster moves in Yahoo; checking a
        scenario never submits one.
      </p>
      <details className="candidate-disclosure">
        <summary>
          Browse the candidate list <span>{choices.length} players</span>
        </summary>
        <PlayerTable
          players={choices}
          title="The free-agent aisle"
          description="Kick the tires. Open any player for the full dossier."
          waivers
        />
      </details>
    </section>
  );
}
