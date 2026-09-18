import type { SnapshotData } from "./model.ts";
import { leagueOverview } from "./analytics.ts";
export function matchupCommentary(s: SnapshotData) {
  const m = leagueOverview(s).matchup,
    own = s.players,
    active = own.filter((p) => !["BN", "IR", "IR+", "NA"].includes(p.slot));
  const points = (n: number) => n.toFixed(2),
    yahoo = (p: any) =>
      p.providerProjected !== undefined ? p.providerProjected : p.projected;
  const paragraphs: string[] = [];
  if (m && m.ownProjected != null && m.opponentProjected != null) {
    const gap = m.ownProjected - m.opponentProjected;
    paragraphs.push(
      `Alright, ${s.team.name}—Week ${s.week} is a scrap with ${m.opponentName}. Yahoo’s live finish has you at ${points(m.ownProjected)} and them at ${points(m.opponentProjected)}. ${Math.abs(gap) < 5 ? "That’s a coin-flip kind of scoreboard. Keep the snacks close." : gap > 0 ? `You’ve got a ${points(gap)}-point projected edge. Good position; save the victory dance for the final whistle.` : `You’re chasing ${points(-gap)} projected points. Time for your lineup to earn its parking spot.`}`,
    );
    if (m.ownActual != null && m.opponentActual != null)
      paragraphs.push(
        `The points already banked: ${points(m.ownActual)} for you, ${points(m.opponentActual)} for them. Those are actuals; the live forecast above is the expected final total.`,
      );
  } else
    paragraphs.push(
      `Alright, ${s.team.name}—Week ${s.week} needs a full-team effort. The opponent’s matchup data hasn’t landed yet, so there’s no honest score prediction to call.`,
    );
  const remaining = active
    .filter((p) => !p.locked && yahoo(p) != null)
    .sort((a, b) => yahoo(b) - yahoo(a))
    .slice(0, 2);
  if (remaining.length)
    paragraphs.push(
      `${remaining.map((p) => p.name).join(" and ")} carry your biggest remaining Yahoo projections. That’s where the heavy lifting starts.`,
    );
  const injured = active.filter(
    (p) => !p.locked && !p.completed && (p.status || p.bye === s.week),
  );
  const benchFlags = own.filter((p) => !active.includes(p) && p.status);
  paragraphs.push(
    injured.length
      ? `Lineup watch: ${injured
          .slice(0, 2)
          .map((p) => `${p.name} (${p.bye === s.week ? "bye" : p.status})`)
          .join(", ")}. Check the final inactive reports before locking it in.`
      : benchFlags.length
        ? `Your remaining starters have no imported injury flags, but the bench is bruised: ${benchFlags
            .slice(0, 2)
            .map((p) => `${p.name} (${p.status})`)
            .join(", ")}. Protect your depth.`
        : "Your active lineup has no imported injury flags. Keep an eye on final inactive reports—Sunday loves a plot twist.",
  );
  paragraphs.push(
    "My read: stay ready, favor confirmed workloads, and make them beat your best available lineup.",
  );
  let words = 0;
  return paragraphs.filter((p) => {
    const n = p.split(/\s+/).length;
    if (words + n > 200) return false;
    words += n;
    return true;
  });
}
