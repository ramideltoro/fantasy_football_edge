import { ChevronRight } from "lucide-react";
import { HealthBoard, PlayerText } from "./PlayerExperience";
import type { PlayerData } from "../shared/model";

export type WeeklyMatchup = {
  opponentName: string | null;
  ownActual: number | null;
  opponentActual: number | null;
  ownProjected: number | null;
  opponentProjected: number | null;
  ownOriginal: number | null;
  opponentOriginal: number | null;
};
const points = (value: number | null | undefined) =>
  value == null ? "—" : value.toFixed(1);

export function WeeklyOverview({
  teamName,
  week,
  players,
  matchup,
  commentary,
  navigate,
}: {
  teamName: string;
  week: number;
  players: PlayerData[];
  matchup: WeeklyMatchup | null;
  commentary?: string[];
  navigate: (tab: string) => void;
}) {
  const margin =
    matchup?.ownProjected != null && matchup.opponentProjected != null
      ? matchup.ownProjected - matchup.opponentProjected
      : null;
  return (
    <div className="weekly-overview">
      <HealthBoard players={players} />
      <section
        className="panel weekly-showdown"
        aria-labelledby="weekly-showdown-title"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">WEEK {week} · THE MATCHUP</span>
            <h2 id="weekly-showdown-title">This week’s showdown.</h2>
          </div>
          <button className="text-link" onClick={() => navigate("League")}>
            League standings <ChevronRight size={15} />
          </button>
        </div>
        {matchup ? (
          <>
            <div className="weekly-scoreboard">
              {[
                {
                  label: "Your team",
                  name: teamName,
                  actual: matchup.ownActual,
                  projected: matchup.ownProjected,
                },
                {
                  label: "Your opponent",
                  name: matchup.opponentName || "Opponent not available",
                  actual: matchup.opponentActual,
                  projected: matchup.opponentProjected,
                },
              ].map((team) => (
                <article className="weekly-team" key={team.label}>
                  <span className="eyebrow">{team.label}</span>
                  <h3>{team.name}</h3>
                  <div className="weekly-score">
                    <strong>{points(team.actual)}</strong>
                    <span>points scored</span>
                  </div>
                  <p>
                    <b>{points(team.projected)}</b>{" "}
                    <span>Yahoo live projection</span>
                  </p>
                </article>
              ))}
            </div>
            <p className="matchup-outlook">
              {margin == null
                ? "Waiting for both team projections."
                : Math.abs(margin) < 0.05
                  ? "Yahoo has this one neck and neck."
                  : margin > 0
                    ? `Yahoo projects a ${points(margin)}-point edge. Bring it home.`
                    : `Yahoo projects a ${points(-margin)}-point deficit. Time to make some noise.`}
              <small>
                Latest imported Yahoo matchup. Live projections include game
                results; they aren’t final scores.
              </small>
            </p>
          </>
        ) : (
          <p className="empty">
            This week’s matchup hasn’t arrived in the import yet. Your roster
            health is shown above.
          </p>
        )}
      </section>
      <section
        className="panel matchup-commentary weekly-read"
        aria-labelledby="weekly-read-title"
      >
        <span className="eyebrow">THE LOCKER-ROOM READ</span>
        <h2 id="weekly-read-title">Here’s how this week could go.</h2>
        {commentary?.length ? (
          commentary.map((p, i) => (
            <p key={i}>
              <PlayerText text={p} />
            </p>
          ))
        ) : (
          <p>
            The weekly read is waiting for matchup and roster data. Check back
            after the next refresh.
          </p>
        )}
        <small>
          Based on Yahoo matchup totals, your lineup and imported health flags.
          Forecasts can change.
        </small>
        <div className="overview-next-step">
          <button
            className="primary"
            onClick={() => navigate("Recommendations")}
          >
            Set this week’s lineup <ChevronRight size={16} />
          </button>
          <button
            className="text-link"
            onClick={() => navigate("Kickoff watch")}
          >
            Check kickoff flags <ChevronRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
