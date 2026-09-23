import { PlayerTable } from "./PlayerExperience";
import { WaiverBrief } from "./WaiverBrief";
import type { PlayerData } from "../shared/model";
export function WaiverList({
  pool,
  onPlayer,
}: {
  pool: PlayerData[];
  onPlayer: (p: PlayerData) => void;
}) {
  const candidates = pool
    .filter((p) => /^(FA|W)/.test(p.availability))
    .sort((a, b) => (b.projected ?? -Infinity) - (a.projected ?? -Infinity));
  return (
    <>
      <PlayerTable
        players={candidates}
        title="Their leftovers. Our next headache for the league."
        description="Quit shopping for a famous name. Find a role, check the points, and make the pickup earn its damn locker."
        waivers
      />
      <details className="panel">
        <summary>The full waiver briefing & sources</summary>
        <WaiverBrief pool={pool} onPlayer={onPlayer} />
      </details>
    </>
  );
}
