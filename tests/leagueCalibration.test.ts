import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreStatLine,
  scoringStatLine,
  sumComponents,
  calibratedBaseline,
  actualPoints,
} from "../shared/leagueScoring.ts";
import {
  projectionRequest,
  validateQwenPoints,
  forecastOptions,
} from "../shared/qwenCalibrated.ts";
import { specialistBooks } from "../shared/specialistBooks.ts";
const rules: Record<string, number> = {
  "Passing Yards": 0.04,
  "Passing Touchdowns": 4,
  Interceptions: -1,
  "Rushing Yards": 0.1,
  "Rushing Touchdowns": 6,
  Receptions: 1,
  "Receiving Yards": 0.1,
  "Receiving Touchdowns": 6,
  "Fumbles Lost": -2,
  "2-Point Conversions": 2,
  "Field Goals 0-19 Yards": 3,
  "Field Goals 20-29 Yards": 3,
  "Field Goals 30-39 Yards": 3,
  "Field Goals 40-49 Yards": 4,
  "Field Goals 50+ Yards": 5,
  "Point After Attempt Made": 1,
  Sack: 1,
  Interception: 2,
  "Fumble Recovery": 2,
  Touchdown: 6,
  Safety: 2,
  "Block Kick": 2,
  "Points Allowed 0 points": 10,
  "Points Allowed 1-6 points": 7,
  "Points Allowed 7-13 points": 4,
  "Points Allowed 14-20 points": 1,
  "Points Allowed 21-27 points": 0,
  "Points Allowed 28-34 points": -1,
  "Points Allowed 35+ points": -4,
};
const kicker = {
  season: 2026,
  week: 1,
  fg_made_30_39: 1,
  fg_made_50_59: 2,
  pat_made: 2,
  teamPoints: 25,
};
const peer = {
  season: 2025,
  week: 1,
  fg_made_30_39: 1,
  fg_made_40_49: 1,
  pat_made: 2,
  teamPoints: 24,
};
test("Jason Sanders specialist stats score 15 league points, not a 44.5 NFL game total", () => {
  assert.equal(
    sumComponents(scoreStatLine("K", scoringStatLine(kicker), rules)!),
    15,
  );
  const baseline = calibratedBaseline(
    "K",
    [kicker],
    [peer, peer, peer],
    rules,
  )!;
  assert.equal(baseline.points, 10.5);
  assert.equal(
    baseline.components.reduce((n, c) => n + c.points, 0),
    baseline.points,
  );
  const p = {
    id: "sanders",
    position: "K",
    injury: "NA",
    nflRole: "Starter",
    baseline,
  };
  const input = { week: 2, players: [p], scoring: rules };
  assert.equal(
    projectionRequest(
      input,
    ).format.properties.sanders.properties.points.enum.includes(44.5),
    false,
  );
  assert.throws(
    () =>
      validateQwenPoints(
        {
          sanders: {
            points: 44.5,
            playProbability: 98,
            startProbability: 95,
            factors: ["baseline"],
          },
        },
        input,
      ),
    /outside/,
  );
  const result = validateQwenPoints(
    {
      sanders: {
        points: 10.5,
        playProbability: 98,
        startProbability: 95,
        factors: ["baseline", "role"],
      },
    },
    input,
  )[0];
  assert.equal(result.points, 10.5);
  assert.match(result.startReason, /95%/);
  assert.equal(result.calculation.components.length, 6);
});
test("defenses score sacks, turnovers, blocks and the proper points-allowed bracket", () => {
  const line = scoringStatLine({
    def_sacks: 3,
    def_interceptions: 1,
    fumble_recovery_opp: 1,
    pointsAllowed: 14,
  });
  assert.equal(sumComponents(scoreStatLine("DEF", line, rules)!), 8);
  const b = calibratedBaseline(
    "DEF",
    [{ def_sacks: 3, pointsAllowed: 14 }],
    [{ def_sacks: 2, pointsAllowed: 20 }],
    rules,
  )!;
  assert.ok(b.points > 0);
  assert.equal(scoreStatLine("DEF", line, {}), null);
});
test("PPR and custom league coefficients change the baseline, including penalties", () => {
  const line = scoringStatLine({
    rushing_yards: 52,
    receiving_yards: 61,
    receptions: 6,
    receiving_tds: 1,
  });
  assert.equal(
    Math.round(sumComponents(scoreStatLine("RB", line, rules)!) * 100) / 100,
    23.3,
  );
  assert.equal(
    Math.round(
      sumComponents(scoreStatLine("RB", line, { ...rules, Receptions: 0.5 })!) *
        100,
    ) / 100,
    20.3,
  );
  assert.equal(actualPoints({ actual: -0.1 }, rules).points, -0.1);
  assert.equal(
    actualPoints({ actual: null, locked: false }, rules).points,
    null,
  );
});
test("Qwen cannot swap identities, exceed role/availability choices, or forecast locked games", () => {
  const baseline = calibratedBaseline("K", [kicker], [peer], rules);
  const p = { id: "one", position: "K", baseline, nflRole: "Starter" };
  const input = { week: 2, scoring: rules, players: [p] },
    x = {
      points: 10.5,
      playProbability: 95,
      startProbability: 98,
      factors: ["baseline"],
    };
  assert.throws(() => validateQwenPoints({ one: x }, input), /Starting/);
  assert.throws(
    () => validateQwenPoints({ wrong: { ...x, startProbability: 95 } }, input),
    /coverage/,
  );
  assert.deepEqual(forecastOptions({ ...p, locked: true }, 2), [null]);
  assert.deepEqual(forecastOptions({ ...p, injury: "IR" }, 2), [0]);
});
const base: any = {
  reason:
    "This board does not publish the scoring props needed for this position.",
  games: ["One", "Two", "Three"].flatMap((book) => [
    { book, kind: "sportsbook", market: "total", line: 44 },
    { book, kind: "sportsbook", market: "spread", line: 4 },
  ]),
  components: [],
  missing: [],
  points: null,
  partial: true,
};
test("K and DEF book projections use every comparable line and explicitly identify the hybrid model", () => {
  const b = calibratedBaseline("K", [kicker], [peer], rules)!;
  const research = {
    specialist: {
      baseline: b,
      teamHistory: [kicker],
      source: "https://github.com/nflverse/nflverse-data",
    },
  };
  const r = specialistBooks({ position: "K" }, research, rules, base);
  assert.ok(r.points! > 0 && r.points! < 15);
  assert.equal(r.model!.perBook.length, 3);
  assert.equal(r.partial, false);
  assert.equal(
    r.points,
    Math.round(((20 * b.points) / b.expected.teamPoints) * 100) / 100,
  );
  const d = calibratedBaseline(
    "DEF",
    [{ def_sacks: 3, pointsAllowed: 14 }],
    [{ def_sacks: 2, pointsAllowed: 20 }],
    rules,
  )!;
  const def = specialistBooks(
    { position: "DEF" },
    { specialist: { ...research.specialist, baseline: d } },
    rules,
    base,
  );
  assert.ok(Number.isFinite(def.points));
  assert.match(def.model!.formula, /10-point/);
  assert.equal(
    specialistBooks({ position: "K" }, research, rules, {
      ...base,
      stale: true,
      reason: "Odds are overdue",
    }).points,
    null,
  );
  assert.equal(
    specialistBooks({ position: "K" }, research, rules, {
      ...base,
      games: base.games.slice(0, 4),
    }).points,
    null,
  );
});
import { displayTeamName, leagueOverview } from "../shared/analytics.ts";
import { matchupCommentary } from "../shared/matchupCommentary.ts";
test("team display aliases are exact and weekly commentary remains under 200 words", () => {
  assert.equal(displayTeamName("ashokkumar's Legit Team"), "ashok Legit Team");
  assert.equal(
    displayTeamName("Sekou Batchelor's Superb Team"),
    "Sekou Superb Team",
  );
  assert.equal(displayTeamName("Another Team"), "Another Team");
  const s: any = {
    season: 2026,
    week: 2,
    team: { id: "1", name: "Tampa Bay Mustangs" },
    players: [
      {
        name: "Test Star",
        slot: "QB",
        projected: 20,
        actual: null,
        locked: false,
        status: "",
      },
    ],
    available: [],
    sections: [
      {
        kind: "matchups",
        tables: [],
        text: "23.2 vs 17.2 113.18 Live Proj 132.04",
      },
    ],
  };
  const text = matchupCommentary(s).join(" ");
  assert.ok(text.split(/\s+/).length <= 200);
  assert.match(text, /18.86/);
  assert.match(text, /23.20/);
  assert.match(text, /Test Star/);
});
