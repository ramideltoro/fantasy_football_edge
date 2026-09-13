import test from "node:test";
import assert from "node:assert/strict";
import { parseDepth, nameKey } from "../server/depth.ts";
test("depth roles use minimum position rank and ignore defensive/specialist listings", () => {
  const d = parseDepth({
    depthchart: [
      {
        positions: {
          wr: {
            position: { abbreviation: "WR" },
            athletes: [
              { displayName: "A. Brown Jr." },
              { displayName: "B Jones" },
            ],
          },
          wr2: {
            position: { abbreviation: "WR" },
            athletes: [{ displayName: "B Jones" }],
          },
          pr: {
            position: { abbreviation: "PR" },
            athletes: [{ displayName: "C Smith" }],
          },
        },
      },
    ],
  });
  assert.equal(d[nameKey("A Brown")], 1);
  assert.equal(d[nameKey("B Jones")], 1);
  assert.equal(d[nameKey("C Smith")], undefined);
});
