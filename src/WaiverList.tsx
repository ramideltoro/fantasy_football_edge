import { PlayerTable } from "./PlayerExperience";
import { PositionSuggestions } from "./PositionSuggestions";
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
        title="Somebody left these guys here."
        description="Same scouting board. Fresh possibilities. Find the pickup that makes your group chat nervous."
        waivers
      />
      <details className="panel">
        <summary>Position picks · Qwen’s waiver board</summary>
        <PositionSuggestions pool={pool} onPlayer={onPlayer} />
      </details>
      <details className="panel">
        <summary>The full waiver briefing & sources</summary>
        <WaiverBrief pool={pool} onPlayer={onPlayer} />
      </details>
    </>
  );
}
