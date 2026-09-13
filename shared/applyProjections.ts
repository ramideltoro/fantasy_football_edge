import type { SnapshotData } from "./model.ts";
export function applyProjections(
  s: SnapshotData,
  map: Map<string, any>,
): SnapshotData {
  const apply = (p: any) => {
    const f = map.get(p.id);
    const valid = f && f.team === p.team && f.points !== null;
    return {
      ...p,
      providerProjected: p.projected,
      projected: valid ? f.points : p.projected,
      projectionSource: valid ? "Qwen" : "Yahoo fallback",
      aiProjection: f || null,
    };
  };
  return {
    ...s,
    players: s.players.map(apply),
    available: s.available.map(apply),
  };
}
