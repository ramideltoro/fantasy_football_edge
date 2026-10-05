import { test } from "node:test";
import assert from "node:assert/strict";
import { backgroundReport } from "../server/backgroundReport.ts";
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("historical audit never blocks current data and retains a completed scorecard while refreshing", async () => {
  let now = 0,
    calls = 0,
    finish!: (value: number) => void;
  const report = backgroundReport(
    () => {
      calls++;
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    },
    1000,
    () => now,
  );
  assert.deepEqual(report(), {
    value: null,
    updatedAt: null,
    pending: true,
    error: null,
  });
  await flush();
  report();
  assert.equal(calls, 1);
  finish(15);
  await flush();
  assert.equal(report().value, 15);
  now = 1001;
  assert.equal(report().value, 15);
  assert.equal(report().pending, true);
  await flush();
  assert.equal(calls, 2);
  finish(16);
  await flush();
  assert.equal(report().value, 16);
});
test("failed audit is explicit, preserves old data, and retries after backoff", async () => {
  let now = 0,
    calls = 0;
  const report = backgroundReport(
    async () => {
      calls++;
      if (calls === 2) throw Error("offline");
      return 12;
    },
    1000,
    () => now,
  );
  report();
  await flush();
  now = 1001;
  report();
  await flush();
  const failure = report();
  assert.equal(failure.value, 12);
  assert.ok(failure.error);
  assert.equal(failure.pending, false);
  assert.equal(calls, 2);
  now = 61002;
  report();
  await flush();
  assert.equal(report().error, null);
  assert.equal(calls, 3);
});
