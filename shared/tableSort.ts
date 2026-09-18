export type SortValue = string | number | null;
export type TableSort = {
  column: number;
  direction: "ascending" | "descending";
};
export function recordSortValue(record: string | undefined): number | null {
  const match = record?.match(/^(\d+)-(\d+)-(\d+)$/);
  if (!match) return null;
  const [, wins, losses, ties] = match.map(Number);
  const games = wins + losses + ties;
  return games ? (wins + ties / 2) / games : 0;
}
const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
export function sortValue(value: unknown): SortValue {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text || /^(—|–|-|N\/A|Unknown|Not scored)$/i.test(text)) return null;
  const numeric = text.replace(/,/g, "");
  if (/^[+−-]?\d+(\.\d+)?%?$/.test(numeric))
    return Number(numeric.replace("%", "").replace("−", "-"));
  return text;
}
export function compareValues(
  a: SortValue,
  b: SortValue,
  direction: TableSort["direction"],
) {
  // Missing values belong at the bottom in either direction, including negative scores.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : collator.compare(String(a), String(b));
  return direction === "ascending" ? order : -order;
}
