import { ChevronRight, ClipboardList } from "lucide-react";
import type { LockerRoomRead } from "../shared/lockerRoomRead";
import { PlayerText } from "./PlayerExperience";
import { SortableTable } from "./SortableTable";
const stamp = (value: string | null) =>
  value
    ? new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not available";
export function CoachRead({
  read,
  navigate,
}: {
  read: LockerRoomRead;
  navigate: (tab: string) => void;
}) {
  const phase = {
    pregame: "Pregame huddle",
    live: "Games underway",
    final: "Postgame huddle",
    waiting: "Waiting for matchup",
  }[read.phase];
  const games = [
    ...read.receipts.own.games.map((g) => ({ ...g, team: "Your team" })),
    ...(read.receipts.opponent?.games || []).map((g) => ({
      ...g,
      team: read.opponentName,
    })),
  ];
  return (
    <section
      className="panel matchup-commentary weekly-read coach-read"
      aria-labelledby="weekly-read-title"
      data-read-revision={read.revision}
    >
      <div className="coach-masthead">
        <span className="eyebrow">
          <ClipboardList size={15} /> THE LOCKER-ROOM READ
        </span>
        <span className={"coach-phase " + (read.stale ? "delayed" : "")}>
          {read.stale ? "Older data" : phase}
        </span>
      </div>
      <h2 id="weekly-read-title">{read.headline}</h2>
      <p className="coach-updated">
        <span className={"dot " + (read.stale ? "warn" : "")} /> Read updated{" "}
        <time dateTime={read.updatedAt}>{stamp(read.updatedAt)}</time>
      </p>
      <div className="coach-sections">
        {read.main.map((section) => (
          <div
            key={section.key}
            className={"coach-section coach-" + section.key}
          >
            <h3>{section.label}</h3>
            <p>
              <PlayerText text={section.text} />
            </p>
          </div>
        ))}
      </div>
      <details className="coach-film">
        <summary>
          Open the full scouting report{" "}
          <span>Playmakers, availability & game receipts</span>
        </summary>
        {read.extra.map((section) => (
          <div key={section.key} className="coach-section">
            <h3>{section.label}</h3>
            <p>
              <PlayerText text={section.text} />
            </p>
          </div>
        ))}
        <h3>The numbers behind the mouth</h3>
        <p className="table-note">
          Up to four completed games per team, before this week. Head-to-head
          results only; the league-median result is not counted as another game.
        </p>
        {games.length ? (
          <div className="table-wrap">
            <SortableTable>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Week</th>
                  <th>Opponent</th>
                  <th>Result</th>
                  <th>Scored</th>
                  <th>Allowed</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => (
                  <tr key={g.team + ":" + g.week}>
                    <td>{g.team}</td>
                    <td>{g.week}</td>
                    <td>{g.opponentName}</td>
                    <td>{g.result}</td>
                    <td>{g.points.toFixed(2)}</td>
                    <td>{g.against.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>
        ) : (
          <p>No completed-game receipts are available yet.</p>
        )}
        <p className="coach-source">
          Your schedule: {stamp(read.receipts.own.sourceAt)}
          <br />
          Opponent schedule: {stamp(read.receipts.opponent?.sourceAt || null)}
          <br />
          Opponent roster: {stamp(read.receipts.opponentRosterAt)}
        </p>
        <p className="table-note">{read.method}</p>
      </details>
      <p className="coach-source">
        Yahoo matchup: {stamp(read.snapshotAt)}. Latest input check:{" "}
        {stamp(read.evidenceAt)}. Updates as new data arrives; a fresh huddle
        every {read.refreshMinutes} minutes. Forecasts can change.
      </p>
      <div className="overview-next-step">
        <button
          className="primary"
          onClick={() =>
            navigate(
              read.phase === "final" ? "Weekly recap" : "Recommendations",
            )
          }
        >
          {read.phase === "final"
            ? "Review the week"
            : "Set this week’s lineup"}
          <ChevronRight size={16} />
        </button>
        <button className="text-link" onClick={() => navigate("Kickoff watch")}>
          Check kickoff flags <ChevronRight size={15} />
        </button>
      </div>
    </section>
  );
}
