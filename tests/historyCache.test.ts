import { test } from "node:test";
import assert from "node:assert/strict";
import { createHistoryCache } from "../server/historyQueries.ts";

test("history reads remain single-flight when loading exceeds the TTL", async () => {
  let now = 0,
    calls = 0;
  const cached = createHistoryCache<number>(1000, () => now);
  let finish!: (value: number) => void;
  const load = () => {
    calls++;
    return new Promise<number>((resolve) => {
      finish = resolve;
    });
  };
  const first = cached("scope", load);
  await Promise.resolve();
  now = 5000;
  const second = cached("scope", load);
  assert.equal(first, second);
  assert.equal(calls, 1);
  finish(42);
  assert.equal(await second, 42);
  now = 5500;
  assert.equal(await cached("scope", async () => 7), 42);
  now = 6001;
  assert.equal(await cached("scope", async () => 7), 7);
});
test("failed history reads can retry and different league keys never share results", async () => {
  const cached = createHistoryCache<number>();
  await assert.rejects(
    cached("a", async () => {
      throw Error("offline");
    }),
  );
  assert.equal(await cached("a", async () => 1), 1);
  assert.equal(await cached("b", async () => 2), 2);
  assert.equal(await cached("a", async () => 3), 1);
});
