export type CoachMood =
  "check-film" | "underdog" | "nailbiter" | "favorite" | "win" | "loss" | "tie";

// Use the same evidence as the read. A projection must never become a victory GIF.
export function coachMood({
  stale,
  phase,
  result,
  margin,
}: {
  stale: boolean;
  phase: string;
  result?: "W" | "L" | "T";
  margin: number | null;
}): CoachMood {
  if (stale || phase === "waiting") return "check-film";
  if (phase === "final")
    return result === "W"
      ? "win"
      : result === "L"
        ? "loss"
        : result === "T"
          ? "tie"
          : "check-film";
  if (margin == null || !Number.isFinite(margin)) return "check-film";
  return margin < -5 ? "underdog" : margin <= 5 ? "nailbiter" : "favorite";
}
