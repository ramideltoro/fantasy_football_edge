import { z } from "zod";
export function evidenceFor(p: any) {
  const facts: Record<string, string> = {
    role: `NFL depth-chart role: ${p.nflRole}.`,
    projection:
      p.projection === null
        ? "No numerical projection is available."
        : `Current-week projection: ${p.projection.toFixed(2)} points. ${p.method}.`,
    availability: p.slot
      ? `On your roster in slot ${p.slot}.`
      : `Imported availability: ${p.available || "unknown"}.`,
    samples: `${p.currentSamples} usable current-season games.`,
    injury: p.injury
      ? `Imported injury designation: ${p.injury}.`
      : "No injury designation was present in the import.",
  };
  if (p.opponent) facts.opponent = `Scheduled opponent: ${p.opponent}.`;
  if (p.history.length) {
    const h = p.history;
    facts.history = `The displayed history spans ${h[0].season} week ${h[0].week} through ${h.at(-1).season} week ${h.at(-1).week}; it is not necessarily current-season form.`;
    const last = h.at(-1);
    facts.usage = `In ${last.season} week ${last.week}: ${last.targets} targets and ${last.carries} carries.`;
    if (last.snapPct !== null)
      facts.snaps = `Offensive snap share in ${last.season} week ${last.week}: ${last.snapPct.toFixed(1)}%.`;
  }
  return facts;
}
const Output = z.object({
  insights: z
    .array(
      z.object({
        id: z.string(),
        action: z.enum([
          "start",
          "consider waiver",
          "hold",
          "avoid",
          "monitor",
        ]),
        evidence: z.array(z.string()).min(1).max(4),
      }),
    )
    .min(1)
    .max(10),
});
export function groundAnalysis(raw: unknown, data: any) {
  const parsed = Output.parse(raw);
  const seen = new Set<string>();
  const insights = parsed.insights
    .filter((x) => {
      if (seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    })
    .map((x) => {
      const p = data.players.find((p: any) => p.id === x.id);
      if (!p || !data.shortlist.includes(x.id)) throw Error("Unknown player");
      const facts = evidenceFor(p);
      if (x.evidence.some((k) => !facts[k])) throw Error("Unknown evidence");
      let action = x.action;
      const locked =
        p.locked || (p.kickoffAt && Date.parse(p.kickoffAt) <= Date.now());
      if (
        locked ||
        p.bye === data.week ||
        ["O", "IR", "SUSP", "PUP"].includes(p.injury)
      )
        action = "avoid";
      else if (
        action === "start" &&
        (!p.slot || !data.lineup.lineup.some((l: any) => l.playerId === p.id))
      )
        action = "monitor";
      else if (
        action === "consider waiver" &&
        (p.slot || !/^(FA|W)/.test(p.available))
      )
        action = "monitor";
      return {
        id: x.id,
        action,
        reason: x.evidence.map((k) => facts[k]).join(" "),
        uncertainty:
          p.currentSamples < 3
            ? "Insufficient current-season samples; Yahoo baseline retained. Depth role does not guarantee playing time."
            : "Experimental blend; no measured improvement over Yahoo is established.",
      };
    });
  return {
    summary: `Qwen selected ${insights.length} players for review. Explanations below use only supplied evidence; review the suggested lineup and injury flags before acting.`,
    insights,
  };
}
