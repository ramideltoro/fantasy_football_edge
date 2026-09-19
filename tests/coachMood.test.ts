import { test } from "node:test";
import assert from "node:assert/strict";
import { coachMood } from "../shared/coachMood.ts";
import { coachReaction } from "../src/coachReactions.ts";

test("reaction follows the coach's projection boundaries without calling a win", () => {
  for (const phase of ["pregame", "live"]) {
    for (const [margin, expected] of [
      [-20, "underdog"],
      [-5.01, "underdog"],
      [-5, "nailbiter"],
      [0, "nailbiter"],
      [5, "nailbiter"],
      [5.01, "favorite"],
      [80, "favorite"],
    ] as const)
      assert.equal(coachMood({ stale: false, phase, margin }), expected);
  }
});
test("only an explicit final result can select a postgame reaction", () => {
  assert.equal(
    coachMood({ stale: false, phase: "final", result: "W", margin: -30 }),
    "win",
  );
  assert.equal(
    coachMood({ stale: false, phase: "final", result: "L", margin: 30 }),
    "loss",
  );
  assert.equal(
    coachMood({ stale: false, phase: "final", result: "T", margin: 30 }),
    "tie",
  );
  assert.equal(
    coachMood({ stale: false, phase: "final", margin: 30 }),
    "check-film",
  );
});
test("stale or missing evidence prevents a misleading reaction", () => {
  assert.equal(
    coachMood({ stale: true, phase: "final", result: "W", margin: 30 }),
    "check-film",
  );
  assert.equal(
    coachMood({ stale: false, phase: "waiting", margin: 30 }),
    "check-film",
  );
  for (const margin of [null, NaN, Infinity])
    assert.equal(
      coachMood({ stale: false, phase: "live", margin }),
      "check-film",
    );
});
test("every narrative state has an attributed GIF and a separate static image", () => {
  for (const mood of [
    "check-film",
    "underdog",
    "nailbiter",
    "favorite",
    "win",
    "loss",
    "tie",
  ] as const) {
    const reaction = coachReaction(mood);
    assert.equal(new URL(reaction.gif).origin, "https://media.giphy.com");
    assert.equal(new URL(reaction.still).origin, "https://media.giphy.com");
    assert.notEqual(reaction.gif, reaction.still);
    assert.ok(reaction.still.endsWith("_s.gif"));
    assert.equal(new URL(reaction.source).origin, "https://giphy.com");
    assert.ok(reaction.alt && reaction.creator && reaction.caption);
  }
});
