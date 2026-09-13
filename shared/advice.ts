import type { PlayerData, SnapshotData } from "./model.ts";
const reserve = new Set(["BN", "IR", "IR+", "NA"]);
export function fits(p: PlayerData, slot: string) {
  return slot === "W/R/T"
    ? p.eligible.some((x) => ["WR", "RB", "TE"].includes(x))
    : slot === "W/R"
      ? p.eligible.some((x) => ["WR", "RB"].includes(x))
      : slot === "Q/W/R/T"
        ? p.eligible.some((x) => ["QB", "WR", "RB", "TE"].includes(x))
        : p.eligible.includes(slot);
}
export function advice(
  s: Pick<SnapshotData, "players" | "capturedAt" | "week">,
) {
  s = {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      locked:
        p.locked ||
        (p.kickoffAt !== null && Date.parse(p.kickoffAt) <= Date.now()),
    })),
  };
  const stale = Date.now() - Date.parse(s.capturedAt) > 2 * 3600000;
  const starters = s.players.filter((p) => !reserve.has(p.slot));
  const locked = starters.filter((p) => p.locked);
  const slots = starters.filter((p) => !p.locked).map((p) => p.slot);
  const pool = s.players.filter(
    (p) =>
      p.bye !== s.week &&
      !p.locked &&
      !["IR", "IR+", "NA"].includes(p.slot) &&
      !["O", "IR", "SUSP", "PUP"].includes(p.status) &&
      p.projected !== null,
  );
  let best = -Infinity,
    bestPlayers: PlayerData[] = [];
  const memo = new Map<string, number>();
  function search(i: number, used: bigint, total: number, picks: PlayerData[]) {
    if (i === slots.length) {
      if (total > best) {
        best = total;
        bestPlayers = [...picks];
      }
      return;
    }
    const k = i + ":" + used;
    if ((memo.get(k) ?? -Infinity) >= total) return;
    memo.set(k, total);
    for (let j = 0; j < pool.length; j++) {
      const bit = 1n << BigInt(j);
      if (!(used & bit) && fits(pool[j], slots[i]))
        search(i + 1, used | bit, total + pool[j].projected!, [
          ...picks,
          pool[j],
        ]);
    }
  }
  search(0, 0n, 0, []);
  const complete = best !== -Infinity;
  const current = starters
    .filter((p) => !p.locked)
    .reduce((n, p) => n + (p.projected ?? 0), 0);
  return {
    method:
      "Maximize imported Yahoo projected points across eligible unlocked roster slots. Not an independent forecast.",
    stale,
    complete,
    delta:
      complete &&
      starters.filter((p) => !p.locked).every((p) => p.projected !== null)
        ? Math.round((best - current) * 100) / 100
        : null,
    lineup: complete
      ? [
          ...locked.map((p) => ({
            slot: p.slot,
            playerId: p.id,
            locked: true,
          })),
          ...bestPlayers.map((p, i) => ({
            slot: slots[i],
            playerId: p.id,
            locked: false,
          })),
        ]
      : [],
    alerts: s.players
      .filter((p) => p.status || p.bye === s.week)
      .map((p) => ({
        playerId: p.id,
        message:
          p.bye === s.week
            ? "Bye this week"
            : `${p.status} status — check the latest report${p.locked ? "; game already started or finished" : ""}`,
      })),
    changes: complete
      ? bestPlayers
          .map((p, i) => ({
            slot: slots[i],
            playerId: p.id,
            currentPlayerId: starters.filter((x) => !x.locked)[i]?.id,
          }))
          .filter((x) => x.playerId !== x.currentPlayerId)
      : [],
  };
}
