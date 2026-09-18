import { PlayerLink, PlayerText, PlayerChartTick } from "./PlayerExperience";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
export function DecisionCharts({
  data,
  mode = "waivers",
}: {
  data: any;
  mode?: "waivers" | "team";
}) {
  const picks =
    mode === "waivers" ? data.qwen?.waivers || [] : data.qwen?.insights || [];
  const rows = picks.map((x: any) => {
    const p = data.players.find((p: any) => p.id === x.id);
    return {
      name: p?.name || x.id,
      points: p?.projection ?? null,
      reports: x.news?.length || 0,
    };
  });
  return (
    <div className="decision-visuals">
      <figure className="ai-chart">
        <figcaption>Projected points · Week {data.week}</figcaption>
        <p>
          Shown in Qwen’s review order. Points are model estimates, not AI
          confidence.
        </p>
        {rows.some((r: any) => r.points !== null) ? (
          <ResponsiveContainer
            width="100%"
            height={Math.max(200, rows.length * 44)}
          >
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ left: 8, right: 24 }}
            >
              <CartesianGrid stroke="#29313c" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#aeb8c7", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={<PlayerChartTick vertical />}
              />
              <Tooltip
                contentStyle={{
                  background: "#171d27",
                  border: "1px solid #475367",
                  borderRadius: 8,
                }}
                formatter={(value: any) => [
                  Number(value).toFixed(2),
                  "Projected points",
                ]}
              />
              <Bar
                dataKey="points"
                fill="#eeb34f"
                radius={[0, 5, 5, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p>No numerical projections available.</p>
        )}
        <details>
          <summary>View chart values</summary>
          {rows.map((r: any) => (
            <p key={r.name}>
              <PlayerLink name={r.name} />:{" "}
              {r.points?.toFixed(2) ?? "unavailable"} points
            </p>
          ))}
        </details>
      </figure>
      <figure className="ai-chart">
        <figcaption>How the recommendation is formed</figcaption>
        <ol className="decision-flow">
          <li>
            <b>01 · Your available players</b>
            <span>Imported availability, position and game locks</span>
          </li>
          <li>
            <b>02 · Supporting evidence</b>
            <span>Projections, depth roles and recent news excerpts</span>
          </li>
          <li>
            <b>03 · Qwen’s assessment</b>
            <span>Ranks candidates and explains tradeoffs</span>
          </li>
          <li>
            <b>04 · Your decision</b>
            <span>Review roster fit, injury updates and claim timing</span>
          </li>
        </ol>
        <small>
          Source count measures coverage, not agreement or likelihood of
          success.
        </small>
      </figure>
    </div>
  );
}
