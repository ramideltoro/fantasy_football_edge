import type { SnapshotData } from "./model.ts";
export function applyProjections(
  s: SnapshotData,
  map: Map<string, any>,
): SnapshotData {
  const apply = (p: any) => {
    const f = map.get(p.id);
    const compatible =
      f &&
      f.team === p.team &&
      (f.injury === undefined || f.injury === p.status);
    const valid = compatible && !f.stale && f.points !== null;
    return {
      ...p,
      providerProjected: p.projected,
      projected: valid ? f.points : p.projected,
      projectionSource: valid ? f.label || "Qwen" : "Yahoo fallback",
      aiProjection: compatible ? f : null,
    };
  };
  return {
    ...s,
    players: s.players.map(apply),
    available: s.available.map(apply),
  };
}
