import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LabelList,
} from "recharts";
import { PlayerChartTick, yahooPoints } from "./PlayerExperience";
import type { PlayerData } from "../shared/model";
import type { WeeklyMatchup } from "./WeeklyOverview";
export function TeamScoring({
  players,
  matchup,
}: {
  players: PlayerData[];
  matchup: WeeklyMatchup | null;
}) {
  const [open, setOpen] = useState(false);
  const starters = players.filter(
    (p) => !["BN", "IR", "IR+", "NA"].includes(p.slot),
  );
  return (
    <details
      className="panel roster-scoring"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        Weekly scoring breakdown{" "}
        <span>Player points & matchup projections</span>
      </summary>
      {open && (
        <div className="scoring-content">
          <h3>Who’s carrying the cooler?</h3>
          <p className="subtitle">
            Current starters · Yahoo projections and scored actuals. Unplayed
            games have no actual score yet.
          </p>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart
              className="cooler-chart"
              margin={{ top: 28, right: 12, bottom: 8, left: 0 }}
              data={starters.map((p) => ({
                name: p.name,
                Projected: yahooPoints(p),
                Actual: p.actual,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={<PlayerChartTick />} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar
                isAnimationActive={false}
                dataKey="Projected"
                fill="#ffbb38"
                legendType="square"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                isAnimationActive={false}
                dataKey="Actual"
                fill="#83d5af"
                legendType="square"
                minPointSize={3}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="Actual"
                  position="top"
                  fill="#83d5af"
                  fontSize={11}
                  formatter={(v: any) =>
                    v == null ? "" : Number(v).toFixed(2)
                  }
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {matchup && (
            <>
              <h3>How the matchup is moving</h3>
              <p className="subtitle">
                Original versus live Yahoo projections. Live projections include
                current game results.
              </p>{" "}
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  layout="vertical"
                  data={[
                    {
                      name: "Your team",
                      Original: matchup.ownOriginal,
                      Live: matchup.ownProjected,
                    },
                    {
                      name: matchup.opponentName || "Opponent",
                      Original: matchup.opponentOriginal,
                      Live: matchup.opponentProjected,
                    },
                  ]}
                >
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" />
                  <Tooltip />
                  <Legend />
                  <Bar
                    isAnimationActive={false}
                    dataKey="Original"
                    fill="#60697f"
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey="Live"
                    fill="#f5ad32"
                  />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </details>
  );
}
