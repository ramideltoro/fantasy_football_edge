import { useEffect, useState } from "react";
import type { PlayerData } from "../shared/model";
type Depth = {
  teams: Record<
    string,
    { ranks: Record<string, number>; source: string; asOf: string }
  >;
};
export function useNflDepth(enabled: boolean) {
  const [depth, setDepth] = useState<Depth | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/depth", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDepth)
      .catch(() => {});
    return () => controller.abort();
  }, [enabled]);
  return depth;
}
export function nflRole(player: PlayerData, depth: Depth | null) {
  if (player.position === "DEF") return { label: "Team defense", source: "" };
  const aliases: Record<string, string> = { JAC: "JAX", WAS: "WSH", LA: "LAR" };
  const team =
    depth?.teams[
      aliases[player.team.toUpperCase()] || player.team.toUpperCase()
    ];
  const key = player.name
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  const rank = team?.ranks[key];
  return {
    label:
      rank === 1
        ? "Starter"
        : rank && rank > 1
          ? `Backup (${rank})`
          : "Unknown",
    source: team?.source || "",
  };
}
