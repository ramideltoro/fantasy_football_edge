import type { Pool } from "pg";
import type { SnapshotData } from "../shared/model.ts";
import type { OddsState } from "../shared/sportsbook.ts";
import { applyProjections } from "../shared/applyProjections.ts";
import { projectionMap } from "./projections.ts";
import { scoring } from "../shared/playerForecast.ts";
import { sportsbookProjection } from "../shared/sportsbook.ts";
import { specialistBooks } from "../shared/specialistBooks.ts";
import { actualPoints } from "../shared/leagueScoring.ts";
import { depthCharts } from "./depth.ts";
export async function enrichSnapshot(
  db: Pool,
  raw: SnapshotData,
  oddsState: OddsState,
) {
  const s = applyProjections(
    raw,
    await projectionMap(db, raw.season, raw.week),
  );
  const intelligence = (
    await db.query(
      "SELECT data FROM intelligence WHERE data IS NOT NULL AND (data->>'season')::int=$1 AND (data->>'week')::int=$2 ORDER BY snapshot_id DESC LIMIT 1",
      [raw.season, raw.week],
    )
  ).rows[0]?.data;
  const rules = scoring(raw);
  const odds = oddsState;
  const depth = await depthCharts().catch(() => null);
  const teamAliases: Record<string, string> = {
    JAC: "JAX",
    WAS: "WSH",
    LA: "LAR",
  };
  for (const p of [...s.players, ...s.available]) {
    p.sportsbook = sportsbookProjection(p, raw, odds);
    const research = intelligence?.players?.find(
      (r: any) => r.id === p.id && r.team === p.team,
    );
    p.sportsbook = specialistBooks(p, research, rules, p.sportsbook!);
    p.actual = actualPoints(p, rules).points;
    p.profile = research?.profile || null;
    p.research = research
      ? {
          history: research.history,
          scoringHistory: research.baseline?.history || [],
          baselinePoints: research.baseline?.points ?? null,
          opponent: research.opponent,
          headlines: research.headlines,
          generatedAt: intelligence.generatedAt,
        }
      : null;
    const t =
      depth?.teams?.[teamAliases[p.team.toUpperCase()] || p.team.toUpperCase()];
    const key = p.name
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
    const rank = t?.ranks?.[key];
    p.nflRole = {
      rank: rank ?? null,
      label:
        p.position === "DEF"
          ? "Team defense"
          : rank === 1
            ? "Starter"
            : rank > 1
              ? "Backup"
              : "Unconfirmed",
      source: t?.source,
      asOf: t?.asOf,
    };
  }

  return s;
}
