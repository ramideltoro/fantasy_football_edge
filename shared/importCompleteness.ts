import type { SnapshotData } from "./model.ts";
export const requiredYahooCoverage = [
  "roster",
  "league",
  "matchups",
  "settings",
  "transactions",
  "schedule",
  "draft",
  "research",
  "players-O",
  "players-K",
  "players-DEF",
];
export function completeYahooSnapshot(s: SnapshotData) {
  return (
    s.source !== "yahoo-browser" ||
    requiredYahooCoverage.every((kind) =>
      s.coverage.some(
        (c) =>
          c.kind === kind &&
          c.complete &&
          c.pages > 0 &&
          (!kind.startsWith("players-") || c.rows > 0),
      ),
    )
  );
}
