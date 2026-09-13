import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  packSnapshot,
  unpackSnapshot,
  MAX_PACKAGE_BYTES,
} from "../shared/importPackage.ts";
test("ZIP round-trips one snapshot and compresses repetitive data", async () => {
  const s = { players: Array(100).fill({ name: "Player", points: 12 }) };
  const zip = packSnapshot(s);
  assert.deepEqual(await unpackSnapshot(zip), s);
  assert.ok(zip.length < JSON.stringify(s).length);
});
test("ZIP rejects malformed archives, extra files, wrong names and oversized output", async () => {
  for (const z of [
    Buffer.from("invalid"),
    Buffer.from(zipSync({ "wrong.json": strToU8("{}") })),
    Buffer.from(
      zipSync({ "snapshot.json": strToU8("{}"), "extra.txt": strToU8("x") }),
    ),
    Buffer.from(
      zipSync({ "snapshot.json": new Uint8Array(MAX_PACKAGE_BYTES + 1) }),
    ),
  ])
    await assert.rejects(unpackSnapshot(z));
});
