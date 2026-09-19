import type { SnapshotData } from "./model.ts";
import { leagueOverview } from "./analytics.ts";
export function teamBriefFacts(s: SnapshotData, lineup: any) {
  const own = s.players;
  const active = own.filter((p) => !["BN", "IR", "IR+", "NA"].includes(p.slot));
  const name = (id: string) =>
    own.find((p) => p.id === id)?.name || "Unknown player";
  const m = leagueOverview(s).matchup;
  const facts: Record<string, string> = {
    roster: `${s.team.name} has ${own.length} imported players and ${active.length} active lineup slots for week ${s.week}. That’s the crew. Make every damn slot earn its keep.`,
    matchup:
      m && m.ownProjected !== null && m.opponentProjected !== null
        ? `Scoreboard first. Imported Yahoo live projections: your team ${m.ownProjected.toFixed(2)}, opponent ${m.opponentProjected.toFixed(2)} points. These are projected final totals, not points remaining or a guaranteed result.`
        : "The matchup forecast hasn’t arrived. Coach can yell, but can’t invent the damn numbers; opponent strength and win probability cannot be assessed reliably.",
    lineup: lineup.complete
      ? lineup.delta === null
        ? "An eligible lineup was found, but the projected improvement cannot be calculated because a current projection is missing."
        : lineup.delta > 0
          ? `The suggested eligible lineup increases projected points by ${lineup.delta.toFixed(2)} across unlocked slots. This is not an increase in win probability.`
          : "Your current unlocked lineup already matches the highest projected total available on your roster. No magic points hiding on that bench. Check the injury reports and hold your nerve."
      : "We can’t field a complete eligible lineup from these inputs. Check empty slots and player eligibility before Sunday hands us an avoidable headache.",
    waivers: `The imported candidate list contains ${s.available.length} players from two W/R/T pages and one page each for QB, kicker and defense, sorted by weekly projection. This is a limited pool, not every player on the planet. Check claim timing, cost and a suitable roster spot. Make the new guy earn his locker.`,
    uncertainty:
      "Numerical forecasts are experimental and may retain Yahoo’s baseline. No measured improvement over Yahoo or reliable win probability is established. Refresh before lineup deadlines and check official inactive reports.",
  };
  const risks = active.filter((p) => p.status || p.bye === s.week);
  facts.risks = risks.length
    ? `Active-slot flags: ${risks.map((p) => `${p.name} (${p.bye === s.week ? "bye" : p.status})`).join(", ")}. Check the damn availability report before kickoff; questionable does not mean ruled out.`
    : "No injury or bye flags were imported for active slots. Good start. It doesn’t confirm everyone is healthy; keep an eye on the inactive reports.";
  facts.changes = lineup.changes?.length
    ? `Suggested slot assignments: ${lineup.changes.map((x: any) => `${x.slot}: ${name(x.playerId)} instead of ${name(x.currentPlayerId)}`).join("; ")}. Apply the complete suggested lineup together; some changes can be slot rearrangements.`
    : "No projected lineup swaps are currently identified. Don’t shuffle the chairs just because the group chat is yelling.";
  return facts;
}
