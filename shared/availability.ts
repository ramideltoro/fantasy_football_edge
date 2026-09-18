import type { PlayerData } from "./model.ts";
export const reserveSlots = new Set(["BN", "IR", "IR+", "NA"]);
export const unavailableStatuses = new Set(["O", "IR", "PUP", "SUSP"]);
export function gameLocked(p: PlayerData, now = Date.now()) {
  return (
    p.locked || p.completed || !!(p.kickoffAt && Date.parse(p.kickoffAt) <= now)
  );
}
export function effectiveStatus(p: PlayerData, now = Date.now()) {
  const live = p.gameDay;
  // A missing injury on a second source does not clear an explicit Yahoo absence.
  if (unavailableStatuses.has(p.status)) return p.status;
  if (live && !live.stale && now - Date.parse(live.checkedAt) <= 30 * 60_000) {
    if (unavailableStatuses.has(live.status)) return live.status;
    if (["Q", "D"].includes(live.status)) return live.status;
  }
  return p.status;
}
export function eligibleNow(p: PlayerData, week: number, now = Date.now()) {
  return (
    !gameLocked(p, now) &&
    p.bye !== week &&
    !unavailableStatuses.has(effectiveStatus(p, now)) &&
    !["IR", "IR+", "NA"].includes(p.slot)
  );
}
