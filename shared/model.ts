import { z } from "zod";
export const Player = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string(),
  team: z.string(),
  slot: z.string(),
  bye: z.number().nullable(),
  actual: z.number().nullable(),
  projected: z.number().nullable(),
  startPct: z.number().nullable(),
  rosterPct: z.number().nullable(),
  status: z.string(),
  locked: z.boolean(),
  kickoffAt: z.iso.datetime().nullable().default(null),
  completed: z.boolean().default(false),
  availability: z.string().default(""),
  eligible: z.array(z.string()),
  stats: z.record(z.string(), z.number().nullable()),
});
const Link = z.object({
  text: z.string(),
  url: z.string(),
  id: z.string().optional(),
});
const Row = z.object({ cells: z.array(z.string()), links: z.array(Link) });
const Table = z.object({
  caption: z.string(),
  headers: z.array(z.object({ text: z.string(), title: z.string() })),
  rows: z.array(Row),
});
const Section = z.object({
  kind: z.string(),
  title: z.string(),
  url: z.url(),
  text: z.string(),
  filters: z.record(z.string(), z.string()).default({}),
  tables: z.array(Table),
});
export const Snapshot = z.object({
  version: z.literal(1),
  source: z.string(),
  capturedAt: z.iso.datetime(),
  receivedAt: z.iso.datetime().optional(),
  season: z.number().int(),
  week: z.number().int().min(1).max(25),
  team: z.object({ id: z.string(), name: z.string() }),
  league: z.object({ id: z.string(), name: z.string() }),
  players: z.array(Player).min(1),
  available: z.array(Player),
  coverage: z
    .array(
      z.object({
        kind: z.string(),
        pages: z.number(),
        rows: z.number(),
        complete: z.boolean(),
      }),
    )
    .default([]),
  sections: z.array(Section),
});
export type SnapshotData = z.infer<typeof Snapshot>;
export type PlayerData = z.infer<typeof Player>;
export type PageCapture = SnapshotData["sections"][number];
export const number = (v: string | undefined) => {
  if (v == null || !/^[-+]?\d+(\.\d+)?%?$/.test(v.trim())) return null;
  return Number(v.replace("%", ""));
};
export function kickoff(links: { url: string; text: string }[]): string | null {
  for (const l of links) {
    const date = l.url.match(/-(\d{4})(\d{2})(\d{2})\d{3}\/?$/),
      time = l.text.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (!date || !time) continue;
    const noon = new Date(
      date[1] + "-" + date[2] + "-" + date[3] + "T12:00:00Z",
    );
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
    })
      .formatToParts(noon)
      .find((p) => p.type === "timeZoneName")
      ?.value.match(/GMT([+-]\d+)/);
    if (!offset) continue;
    const hour =
      (Number(time[1]) % 12) +
      (time[3].toLowerCase() === "pm" ? 12 : 0) -
      Number(offset[1]);
    return new Date(
      Date.UTC(
        Number(date[1]),
        Number(date[2]) - 1,
        Number(date[3]),
        hour,
        Number(time[2]),
      ),
    ).toISOString();
  }
  return null;
}
export function parsePlayers(p: PageCapture): PlayerData[] {
  const out = new Map<string, PlayerData>();
  for (const t of p.tables) {
    const headers = t.headers.map((h) => h.title || h.text);
    for (const r of t.rows) {
      const a = r.links.find(
        (l) =>
          /^playernote-\d+$/.test(l.id || "") && !/note|forecast/i.test(l.text),
      );
      if (!a) continue;
      const id = a.id!.replace("playernote-", "yahoo:");
      const ci = r.cells.findIndex((c) => c.includes(a.text));
      const cell = r.cells[ci] || "";
      const pos = cell.match(/\n([A-Za-z0-9]+) - ([A-Z,/]+)(?:\n|$)/);
      if (!pos) continue;
      const get = (...names: string[]) =>
        number(r.cells[headers.findIndex((h) => names.includes(h))]);
      const slot = headers[0] === "Position" ? r.cells[0].trim() : "";
      const filter =
        p.filters?.stat1 || new URL(p.url).searchParams.get("stat1") || "";
      const projectedPool = p.kind === "players" && /^S_PW_/.test(filter);
      const rawAvailability = r.cells[headers.indexOf("Roster Status")] || "";
      const availability = /^(FA|W(?:\s|$))/.test(rawAvailability)
        ? rawAvailability
        : rawAvailability
          ? "Taken"
          : "";
      const kickoffAt = kickoff(r.links);
      const afterName = cell
        .slice(cell.indexOf(a.text) + a.text.length)
        .split("\n")[0];
      out.set(id, {
        id,
        name: a.text,
        team: pos[1],
        position: pos[2],
        slot,
        bye: get("Bye Week"),
        actual: projectedPool ? null : get("Fantasy Points"),
        projected: projectedPool
          ? get("Fantasy Points")
          : get("Projected Points"),
        availability,
        kickoffAt,
        completed: /\bFinal\b/.test(cell),
        startPct: get("Percent Started"),
        rosterPct: get("Percent player is rostered in Yahoo leagues"),
        status:
          afterName.match(
            /^(IR|O|Q|D|PUP|SUSP|NA)(?=Video|Player|New|No|\s|$)/,
          )?.[1] || "",
        locked:
          /\bFinal\b|\b[1-4](st|nd|rd|th)\b|Halftime/.test(cell) ||
          (kickoffAt !== null && Date.parse(kickoffAt) <= Date.now()),
        eligible: pos[2].split(/[,/]/),
        stats: Object.fromEntries(
          headers.map((h, i) => [h, number(r.cells[i])]).filter(([h]) => !!h),
        ),
      });
    }
  }
  return [...out.values()];
}
export function normalize(
  pages: PageCapture[],
  capturedAt = new Date().toISOString(),
): SnapshotData {
  const roster = pages.find((p) => p.kind === "roster");
  if (!roster) throw Error("Missing roster");
  const ids = new URL(roster.url).pathname.match(/\/f1\/(\d+)\/(\d+)/);
  if (!ids) throw Error("Unexpected roster URL");
  const caption = roster.tables.find((t) =>
    /roster for week/i.test(t.caption),
  )?.caption;
  if (!caption)
    throw Error("Yahoo roster table not found; reconnect or update parser");
  return Snapshot.parse({
    version: 1,
    source: "yahoo-browser",
    capturedAt,
    season:
      new Date(capturedAt).getUTCFullYear() -
      (new Date(capturedAt).getUTCMonth() < 3 ? 1 : 0),
    week: Number(caption.match(/week (\d+)/i)?.[1] || 1),
    team: { id: ids[2], name: caption.split("'s ")[0] },
    league: { id: ids[1], name: roster.title.split(" - ")[0] },
    players: parsePlayers(roster),
    available: [
      ...new Map(
        pages
          .filter((p) => p.kind === "players")
          .flatMap(parsePlayers)
          .map((p) => [p.id, p]),
      ).values(),
    ],
    sections: pages,
  });
}
export function publicSnapshot(s: SnapshotData) {
  return {
    version: s.version,
    source: s.source,
    capturedAt: s.capturedAt,
    season: s.season,
    week: s.week,
    team: { name: s.team.name },
    players: s.players.map((p) => ({ ...p })),
    available: s.available.map((p) => ({ ...p })),
    coverage: s.coverage || [],
  };
}
