import type { PlayerData } from "./model.ts";
export function waiverShortlist(players: PlayerData[], limit = 10) {
  const candidates = players
    .filter((p) => p.projected !== null && /^(FA|W)/.test(p.availability))
    .sort((a, b) => b.projected! - a.projected!);
  return [
    ...candidates.filter((p) => p.position === "QB").slice(0, 3),
    ...candidates.filter((p) => p.position !== "QB"),
  ].slice(0, limit);
}
