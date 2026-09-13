import test from "node:test";
import assert from "node:assert/strict";
import {
  completeYahooSnapshot,
  requiredYahooCoverage,
} from "../shared/importCompleteness.ts";
import type { SnapshotData } from "../shared/model.ts";
test("Yahoo refresh requires all league sections and the requested top-two-page W/R/T scope", () => {
  const s = {
    source: "yahoo-browser",
    coverage: requiredYahooCoverage.map((kind) => ({
      kind,
      complete: true,
      pages: 1,
      rows: 1,
    })),
  } as SnapshotData;
  assert.equal(completeYahooSnapshot(s), true);
  for (const kind of requiredYahooCoverage)
    assert.equal(
      completeYahooSnapshot({
        ...s,
        coverage: s.coverage.filter((c) => c.kind !== kind),
      }),
      false,
      kind,
    );
  assert.equal(
    completeYahooSnapshot({
      ...s,
      coverage: s.coverage.map((c) =>
        c.kind === "players-WRT-top2" ? { ...c, rows: 0 } : c,
      ),
    }),
    false,
  );
  assert.equal(
    completeYahooSnapshot({
      ...s,
      coverage: s.coverage.map((c) =>
        c.kind === "players-WRT-top2" ? { ...c, complete: false } : c,
      ),
    }),
    false,
  );
});
