import type { SnapshotData } from "./model.ts";
import { leagueOverview } from "./analytics.ts";
export function teamBriefFacts(s: SnapshotData, lineup: any) {
  const own = s.players;
  const active = own.filter((p) => !["BN", "IR", "IR+", "NA"].includes(p.slot));
  const name = (id: string) =>
    own.find((p) => p.id === id)?.name || "Unknown player";
  const m = leagueOverview(s).matchup;
  const facts: Record<string, string> = {
    roster: `${s.team.name} has ${own.length} imported players and ${active.length} active lineup slots for week ${s.week}.`,
    matchup:
      m && m.ownProjected !== null && m.opponentProjected !== null
        ? `Imported Yahoo matchup live projections: your team ${m.ownProjected.toFixed(2)}, opponent ${m.opponentProjected.toFixed(2)} points. These are projected final totals, not points remaining or a guaranteed result.`
        : "A structured matchup projection is unavailable in this import; opponent strength and win probability cannot be assessed reliably.",
    lineup: lineup.complete
      ? lineup.delta === null
        ? "An eligible lineup was found, but the projected improvement cannot be calculated because a current projection is missing."
        : lineup.delta > 0
          ? `The suggested eligible lineup increases projected points by ${lineup.delta.toFixed(2)} across unlocked slots. This is not an increase in win probability.`
          : "Your current unlocked lineup already matches the highest projected total available on your roster."
      : "A complete eligible lineup could not be calculated; check empty slots and player eligibility.",
    waivers: `The imported candidate list contains ${s.available.length} players from two W/R/T pages and one page each for QB, kicker and defense, sorted by weekly projection. This is a limited pool. Check claim timing, cost and a suitable roster spot before adding anyone.`,
    uncertainty:
      "Numerical forecasts are experimental and may retain Yahoo’s baseline. No measured improvement over Yahoo or reliable win probability is established. Refresh before lineup deadlines and check official inactive reports.",
  };
  const risks = active.filter((p) => p.status || p.bye === s.week);
  facts.risks = risks.length
    ? `Active-slot flags: ${risks.map((p) => `${p.name} (${p.bye === s.week ? "bye" : p.status})`).join(", ")}. Verify availability before kickoff; a questionable designation does not mean ruled out.`
    : "No injury or bye flags were imported for active slots. This does not confirm every player is healthy.";
  facts.changes = lineup.changes?.length
    ? `Suggested slot assignments: ${lineup.changes.map((x: any) => `${x.slot}: ${name(x.playerId)} instead of ${name(x.currentPlayerId)}`).join("; ")}. Apply the complete suggested lineup together; some changes can be slot rearrangements.`
    : "No projected lineup swaps are currently identified.";
  return facts;
}
