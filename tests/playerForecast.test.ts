import test from "node:test";
import assert from "node:assert/strict";
import { forecastPlayer, scoreRow } from "../shared/playerForecast.ts";
import type { SnapshotData, PlayerData } from "../shared/model.ts";
const rules = {
  "Passing Yards": 0.04,
  "Passing Touchdowns": 4,
  Interceptions: -1,
  "Rushing Yards": 0.1,
  "Rushing Touchdowns": 6,
  Receptions: 1,
  "Receiving Yards": 0.1,
  "Receiving Touchdowns": 6,
  "Fumbles Lost": -2,
};
const s = {
  season: 2026,
  week: 4,
  sections: [
    {
      kind: "settings",
      tables: [
        {
          rows: Object.entries(rules).map(([k, v]) => ({
            cells: [k, String(v)],
          })),
        },
      ],
    },
  ],
} as SnapshotData;
const p = {
  id: "p",
  name: "Test Player",
  position: "WR",
  projected: 12,
  team: "ATL",
  status: "",
  kickoffAt: null,
} as PlayerData;
test("league scoring honors custom interception and PPR rules", () => {
  assert.equal(
    scoreRow(
      {
        passing_yards: 250,
        passing_tds: 2,
        passing_interceptions: 1,
        receptions: 4,
        receiving_yards: 50,
      },
      rules,
    ),
    26,
  );
  assert.equal(scoreRow({}, {}), null);
});
test("future and prior-season games cannot become current form", () => {
  const rows = [
    {
      season: "2025",
      week: "18",
      season_type: "REG",
      player_display_name: p.name,
      position: "WR",
      receptions: 20,
    },
    {
      season: "2026",
      week: "4",
      season_type: "REG",
      player_display_name: p.name,
      position: "WR",
      receptions: 40,
    },
  ];
  const f = forecastPlayer(p, s, rows, [], null);
  assert.equal(f.projection, 12);
  assert.equal(f.currentSamples, 0);
  assert.equal(f.history.length, 1);
});
test("three prior current-season games enable transparent baseline blend", () => {
  const rows = [1, 2, 3].map((week) => ({
    season: "2026",
    week: String(week),
    season_type: "REG",
    player_display_name: p.name,
    position: "WR",
    receptions: 4,
    receiving_yards: 60,
  }));
  const f = forecastPlayer(p, s, rows, [], null);
  assert.equal(f.projection, 11.5);
  assert.equal(f.currentSamples, 3);
});
