import { test } from "node:test";
import assert from "node:assert/strict";
import { depthForDashboard, depthCharts } from "../server/depth.ts";
test("dashboard returns immediately while depth collection runs and reuses its result", async () => {
  const original = globalThis.fetch;
  let calls = 0,
    finish!: (r: Response) => void;
  globalThis.fetch = (() => {
    calls++;
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  }) as typeof fetch;
  try {
    assert.equal(depthForDashboard(), null);
    assert.equal(depthForDashboard(), null);
    assert.equal(calls, 1);
    finish(
      new Response(JSON.stringify({ sports: [{ leagues: [{ teams: [] }] }] }), {
        status: 200,
      }),
    );
    const result = await depthCharts();
    assert.equal(depthForDashboard(), result);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
