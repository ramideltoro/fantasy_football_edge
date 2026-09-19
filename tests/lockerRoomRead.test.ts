import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Snapshot,
  Player,
  type SnapshotData,
  type PageCapture,
} from "../shared/model.ts";
import {
  completedTeamGames,
  recentForm,
  opponentMatchupRoster,
} from "../shared/opponentHistory.ts";
import { lockerRoomRead } from "../shared/lockerRoomRead.ts";
const now = Date.now();
const player = (id: string, slot = "QB", projected: number | null = 10) =>
  Player.parse({
    id,
    name:
      id === "yahoo:1"
        ? "Our Starter"
        : id === "yahoo:2"
          ? "Bench Hero"
          : "Their Starter",
    slot,
    position: "QB",
    team: "DET",
    eligible: ["QB"],
    projected,
    providerProjected: projected,
    actual: null,
    bye: 9,
    startPct: null,
    rosterPct: null,
    status: "",
    locked: false,
    kickoffAt: new Date(now + 7 * 86400000).toISOString(),
    stats: {},
  });
const schedule = (id: string, rows: string[][]): PageCapture => ({
  kind: id === "1" ? "schedule" : "league-schedule",
  title: "Schedule",
  url: "https://football.fantasysports.yahoo.com/f1/9/",
  text: "",
  filters: { teamId: id, capturedAt: new Date(now - 1000).toISOString() },
  tables: [
    {
      caption: "",
      headers: ["Wk", "Opponent", "Result", "Score"].map((text) => ({
        text,
        title: "",
      })),
      rows: rows.map((cells) => ({
        cells,
        links: [
          {
            text: "Other Team\nPrivate manager",
            url: "https://football.fantasysports.yahoo.com/f1/9/3",
          },
        ],
      })),
    },
  ],
});
const snapshot = (): SnapshotData =>
  Snapshot.parse({
    version: 1,
    source: "test",
    season: 2026,
    week: 2,
    capturedAt: new Date(now - 1000).toISOString(),
    team: { id: "1", name: "Our Team" },
    league: { id: "9", name: "Private League" },
    players: [player("yahoo:1"), player("yahoo:2", "BN", 15)],
    available: [],
    sections: [
      {
        kind: "matchups",
        title: "Matchup",
        url: "https://football.fantasysports.yahoo.com/f1/9/matchup",
        text: "23.20 vs 17.20 120.00 Orig Proj 110.00 100.00 Live Proj 120.00",
        tables: [
          {
            caption: "",
            headers: [],
            rows: [
              {
                cells: [],
                links: [
                  {
                    text: "Their Team\nSecret manager",
                    url: "https://football.fantasysports.yahoo.com/f1/9/2",
                  },
                ],
              },
            ],
          },
        ],
      },
      schedule("2", [
        [
          "1",
          "Other Team\nMedian",
          "Loss\nLoss",
          "106.70 - 164.16\n106.70 - 136.66",
        ],
      ]),
      schedule("1", [
        [
          "1",
          "Other Team\nMedian",
          "Win\nWin",
          "154.20 - 139.10\n154.20 - 136.66",
        ],
      ]),
    ],
    leagueRosters: [
      {
        teamId: "1",
        name: "Our Team",
        capturedAt: new Date(now - 1000).toISOString(),
        players: [player("yahoo:1")],
        schedule: [{ week: 2, opponent: "2" }],
      },
      {
        teamId: "2",
        name: "Their Team",
        capturedAt: new Date(now - 1000).toISOString(),
        players: [player("yahoo:3", "QB", 21)],
        schedule: [{ week: 2, opponent: "1" }],
      },
    ],
  });
const fullText = (read: ReturnType<typeof lockerRoomRead>) =>
  [
    read.headline,
    ...read.main.map((s) => s.text),
    ...read.extra.map((s) => s.text),
  ].join(" ");

test("opponent film ignores median rows, unplayed weeks and results without final confirmation", () => {
  const s = snapshot();
  s.sections.push(
    schedule("4", [
      ["1", "Other", "Win\nLoss", "0 - -3\n0 - 40"],
      ["2", "Other", "", "100 - 80"],
      ["3", "Other", "Win", "999 - 0"],
    ]),
  );
  const games = completedTeamGames(s, "4");
  assert.equal(games.length, 1);
  assert.equal(games[0].points, 0);
  assert.equal(games[0].against, -3);
  assert.equal(games[0].result, "W");
  assert.equal(recentForm(s, "2").games.length, 1);
  assert.equal(recentForm(s, "2").average, 106.7);
  assert.equal(recentForm(s, "2").losses, 1);
  assert.equal(completedTeamGames(s, "2")[0].opponentName, "Other Team");
});
test("ambiguous score/result combinations and missing scores cannot become film", () => {
  const s = snapshot();
  s.sections.push(schedule("4", [["1", "Other", "Win", "10 - 20"]]));
  assert.deepEqual(completedTeamGames(s, "4"), []);
  s.leagueRosters![1].schedule.push({
    week: 1,
    opponent: "3",
    completed: true,
    ownPoints: null,
    opponentPoints: 100,
  });
  assert.equal(recentForm(s, "2").average, 106.7);
});
test("recent form is the latest four completed weeks, with one head-to-head per week", () => {
  const s = snapshot();
  s.week = 7;
  s.leagueRosters![1].schedule = [1, 2, 3, 4, 5, 6].map((week) => ({
    week,
    opponent: "3",
    completed: week !== 5,
    ownPoints: week * 10,
    opponentPoints: 0,
  }));
  const f = recentForm(s, "2");
  assert.deepEqual(
    f.games.map((g) => g.week),
    [6, 4, 3, 2],
  );
  assert.equal(f.average, 37.5);
  assert.equal(f.wins, 4);
});
test("coach evaluates the exact projected margin, swing, completed opponent game and legal Yahoo gain", () => {
  const read = lockerRoomRead(snapshot(), now),
    text = fullText(read);
  assert.equal(read.metrics.projectedMargin, -20);
  assert.equal(read.metrics.projectionSwing, -30);
  assert.equal(read.metrics.yahooLineupGain, 5);
  assert.match(text, /106\.70–164\.16/);
  assert.match(text, /13\.30 above/);
  assert.match(text, /one game of evidence/);
  assert.match(text, /5\.00 potential points/);
  assert.match(text, /23\.20–17\.20/);
  assert.equal(read.phase, "live");
  assert.doesNotMatch(
    JSON.stringify(read),
    /Secret manager|Private manager|Private League|football\.fantasysports|teamId|leagueId/,
  );
});
test("read stays stable between changes but responds to scores and each new huddle", () => {
  const s = snapshot();
  const at = Math.floor(now / (30 * 60000)) * 30 * 60000 + 60000;
  s.capturedAt = new Date(at - 1000).toISOString();
  const a = lockerRoomRead(s, at),
    b = lockerRoomRead(s, at + 10000),
    c = lockerRoomRead(s, at + 30 * 60000);
  assert.equal(a.revision, b.revision);
  assert.notEqual(a.revision, c.revision);
  assert.deepEqual(a.metrics, c.metrics);
  s.sections[0].text = s.sections[0].text.replace("100.00 Live", "105.00 Live");
  const changed = lockerRoomRead(s, at);
  assert.notEqual(a.revision, changed.revision);
  assert.equal(changed.metrics.projectedMargin, -15);
});
test("missing forecasts and history are called out without pretending they are zero", () => {
  const s = snapshot();
  s.sections = [];
  s.leagueRosters = [];
  s.players[0].projected = null;
  s.players[0].providerProjected = null;
  const read = lockerRoomRead(s, now);
  assert.equal(read.phase, "waiting");
  assert.equal(read.metrics.projectedMargin, null);
  assert.match(fullText(read), /no verified completed games/i);
  assert.match(fullText(read), /hasn’t landed/);
});
test("stale evidence changes the coaching call and excludes newly ruled-out leaders", () => {
  const s = snapshot();
  s.capturedAt = new Date(now - 3 * 3600000).toISOString();
  s.players[0].gameDay = {
    status: "O",
    checkedAt: new Date(now - 1000).toISOString(),
    stale: false,
  };
  const read = lockerRoomRead(s, now);
  assert.equal(read.stale, true);
  assert.match(read.main.find((x) => x.key === "call")!.text, /before acting/);
  assert.ok(!read.extra.some((x) => x.key === "weapons"));
  assert.match(fullText(read), /Our Starter \(O\)/);
});
test("a recorded final produces a postgame assessment, not a continued comeback prediction", () => {
  const s = snapshot();
  s.leagueRosters![0].schedule[0] = {
    week: 2,
    opponent: "2",
    completed: true,
    ownPoints: 100,
    opponentPoints: 95,
  };
  const read = lockerRoomRead(s, now);
  assert.equal(read.phase, "final");
  assert.match(read.main[0].text, /100\.00–95\.00/);
  assert.match(read.main[0].text, /a win/);
  assert.doesNotMatch(
    read.main.find((x) => x.key === "call")!.text,
    /projected underdog|beat our forecast/,
  );
});
function matchupTable(flipped = false): PageCapture["tables"][number] {
  const columns = [
    "Stats",
    "Player",
    "Proj",
    "Fan Pts",
    "Pos",
    "Pos",
    "Pos",
    "Fan Pts",
    "Proj",
    "Player",
    "Stats",
  ];
  const own = ["Our Starter\nDET - QB\nSun 1:00 pm", "10", "–"],
    opp = ["Their Starter\nDAL - QB\nSun 4:25 pm", "21.33", "–"];
  const [left, right] = flipped ? [opp, own] : [own, opp];
  return {
    caption: "",
    headers: columns.map((text) => ({ text, title: "" })),
    rows: [
      {
        cells: [
          "",
          left[0],
          left[1],
          left[2],
          "QB",
          "QB",
          "QB",
          right[2],
          right[1],
          right[0],
          "",
        ],
        links: [
          {
            text: "Our Starter",
            id: "playernote-1",
            url: "https://sports.yahoo.com/nfl/players/1",
          },
          {
            text: "Their Starter",
            id: "playernote-3",
            url: "https://sports.yahoo.com/nfl/players/3",
          },
        ],
      },
    ],
  };
}
test("opponent playmakers come from current matchup columns on either side, matched by player ID", () => {
  for (const flipped of [false, true]) {
    const s = snapshot();
    s.sections[0].tables.push(matchupTable(flipped));
    const players = opponentMatchupRoster(s);
    assert.equal(players.length, 1);
    assert.equal(players[0].id, "yahoo:3");
    assert.equal(players[0].projected, 21.33);
    assert.equal(players[0].slot, "QB");
    const read = lockerRoomRead(s, now);
    assert.match(
      read.extra.find((x) => x.key === "threats")!.text,
      /current imported matchup.*21\.33/,
    );
  }
});
test("ambiguous matchup identity is withheld rather than swapping the two teams", () => {
  const s = snapshot();
  s.sections[0].tables.push(matchupTable());
  s.players.push(player("yahoo:3"));
  assert.equal(opponentMatchupRoster(s).length, 0);
});
