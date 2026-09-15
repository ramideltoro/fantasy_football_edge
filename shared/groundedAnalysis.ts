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
  waivers: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().max(500).optional(),
        score: z.number().min(0).max(100).optional(),
        evidence: z.array(z.string()).min(1).max(3),
        news: z.array(z.number().int().min(0).max(2)).max(3),
      }),
    )
    .max(6)
    .optional(),
  priorities: z
    .array(
      z.enum([
        "roster",
        "matchup",
        "risks",
        "lineup",
        "changes",
        "waivers",
        "uncertainty",
      ]),
    )
    .min(1)
    .max(7)
    .optional(),
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
  const waivers = [
    ...new Map((parsed.waivers || []).map((x) => [x.id, x])).values(),
  ].map((x) => {
    const p = data.players.find((p: any) => p.id === x.id);
    if (
      !p ||
      !data.waiverCandidates?.includes(x.id) ||
      p.slot ||
      !/^(FA|W)/.test(p.available)
    )
      throw Error("Unavailable waiver candidate");
    const facts = evidenceFor(p);
    if (
      x.evidence.some((k) => !facts[k]) ||
      x.news.some((i) => !p.headlines[i])
    )
      throw Error("Unsupported waiver evidence");
    return {
      id: x.id,
      score: x.score ?? null,
      summary: usefulAssessment(x.summary, p)
        ? x.summary!
        : waiverCase(p, data),
      summaryKind: usefulAssessment(x.summary, p)
        ? "Qwen interpretation"
        : "Evidence summary",
      reason: [...new Set(["projection", "role", ...x.evidence])]
        .map((k) => facts[k])
        .join(" "),
      news: [...new Set(x.news)].map((i) => p.headlines[i]),
      projection: p.projection,
    };
  });
  return {
    waivers,
    teamBrief: data.teamFacts
      ? {
          priorities: [
            ...new Set(parsed.priorities || ["risks", "lineup", "matchup"]),
          ].map((key) => ({ key, text: data.teamFacts[key] })),
          facts: data.teamFacts,
        }
      : null,
    summary: `Qwen selected ${insights.length} players for review. Explanations below use only supplied evidence; review the suggested lineup and injury flags before acting.`,
    insights,
  };
}

export function waiverCase(p: any, data: any) {
  const peers = data.players
    .filter(
      (x: any) =>
        !x.slot && /^(FA|W)/.test(x.available) && x.projection !== null,
    )
    .sort((a: any, b: any) => b.projection - a.projection);
  const rank = peers.findIndex((x: any) => x.id === p.id) + 1;
  const value =
    p.projection === null
      ? "No numerical forecast is available."
      : p.name +
        " projects for " +
        p.projection.toFixed(2) +
        " points this week" +
        (rank
          ? " (rank " +
            rank +
            " of " +
            peers.length +
            " imported available players with projections)."
          : ".");
  const role =
    p.nflRole === "Starter"
      ? "His listed NFL starting role makes him worth reviewing for roster depth, although it does not guarantee touches or targets."
      : p.nflRole === "Backup"
        ? "His backup role makes playing time the main limitation; treat him as a depth option to investigate rather than a confirmed starter."
        : "His NFL role is unconfirmed, so verify his expected playing time before adding him.";
  return (
    value +
    " " +
    role +
    " " +
    (p.injury
      ? "The imported " + p.injury + " designation needs review. "
      : "") +
    "Compare him with your existing options and check the claim deadline. News coverage alone does not establish an advantage."
  );
}

export function usefulAssessment(text: any, p: any) {
  return (
    typeof text === "string" &&
    text.length >= 80 &&
    /\b(because|however|but|risk|upside|uncertain|limitation|consider)\b/i.test(
      text,
    ) &&
    !["QB", "RB", "WR", "TE", "K", "DEF"].some(
      (pos) => pos !== p.position && text.includes("(" + pos + ")"),
    )
  );
}
