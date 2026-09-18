import { load } from "cheerio";
import {
  GAME_SOURCE,
  MARKET_LABELS,
  PROP_SOURCE,
  type OddsBoard,
  type OddsQuote,
  type GameQuote,
  type PropMarket,
} from "../shared/sportsbook.ts";

const bookName = (raw: string) =>
  ({
    bet365: "Bet365",
    betmgm: "BetMGM",
    draftkings: "DraftKings",
    caesars: "Caesars",
    fanduel: "FanDuel",
    hardrock: "Hard Rock",
    fanatics: "Fanatics",
    riverscasino: "BetRivers",
    betrivers: "BetRivers",
    prizepicks: "PrizePicks",
    sleeper: "Sleeper",
    open: "Open",
    consensus: "Consensus",
  })[raw.toLowerCase().replace(/\s/g, "")] || raw.trim();
const pickem = (book: string) => ["PrizePicks", "Sleeper"].includes(book);
const american = (s: string) => {
  if (/^(even|evs)$/i.test(s)) return 100;
  if (!/^[+-]?\d+$/.test(s) || Math.abs(Number(s)) < 100) return null;
  return Number(s);
};
function lineValue(s: string) {
  const m = s.replace(/\s/g, "").match(/^([ou])?([+-]?\d+(?:\.\d+)?)$/i);
  return m
    ? {
        line: Number(m[2]),
        side:
          m[1]?.toLowerCase() === "u" ? ("under" as const) : ("over" as const),
      }
    : null;
}
export function parseProps(html: string): OddsQuote[] {
  const $ = load(html),
    out: OddsQuote[] = [];
  for (const market of Object.keys(MARKET_LABELS) as PropMarket[]) {
    const table = $(`table#table-${market}`);
    if (table.length !== 1)
      throw Error(`Missing or duplicate player market: ${market}`);
    const headers = table
      .find("thead tr")
      .first()
      .children("th,td")
      .map((_, e) => bookName($(e).text()))
      .get();
    if (
      new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
    )
      throw Error("Duplicate book headers");
    table.find("tr[data-name]").each((_, row) => {
      const player = $(row).find("td.game-team").text().trim();
      $(row)
        .children("td")
        .each((index, cell) => {
          if (!$(cell).hasClass("game-odds")) return;
          if (
            $(cell).hasClass("blank") &&
            !$(cell).find(".data-value,.data-moneyline,.data-odds").length
          )
            return;
          const book = headers[index];
          if (!book || book === "Time")
            throw Error("Unaligned player book columns");
          const vs = $(cell)
            .find(".data-value")
            .map((_, e) => $(e).text().trim())
            .get();
          const price =
            market === "touchdowns"
              ? $(cell).find(".data-moneyline").first().text().trim()
              : vs[1];
          const odds = american(price || "");
          const l =
            market === "touchdowns"
              ? { line: null, side: "yes" as const }
              : lineValue(vs[0] || "");
          if (odds == null || !l || !player) return;
          out.push({
            player,
            market,
            book,
            kind: pickem(book) ? "pickem" : "sportsbook",
            ...l,
            odds,
            raw: [...(market === "touchdowns" ? [] : [vs[0]]), price].join(" "),
          });
        });
    });
  }
  if (!out.length) throw Error("No usable player odds");
  const keys = out.map((q) => `${q.player}|${q.market}|${q.book}`);
  if (new Set(keys).size !== keys.length)
    throw Error("Duplicate player/book market rows");
  return out;
}
export function parseGames(html: string): {
  week: number;
  season: number;
  games: GameQuote[];
} {
  const $ = load(html),
    out: GameQuote[] = [];
  const week = Number(
    $("h1")
      .text()
      .match(/week\s+(\d+)/i)?.[1],
  );
  if (!week || week > 25) throw Error("NFL board week missing");
  for (const market of ["spread", "total", "moneyline"] as const) {
    const body = $(`tbody#odds-table-${market}--0`);
    if (body.length !== 1) throw Error(`Missing game market: ${market}`);
    const headers = body
      .closest("table")
      .find("thead tr")
      .first()
      .children("th,td")
      .map((_, e) => bookName($(e).text()))
      .get();
    let eventId = "",
      kickoff = "";
    body.children("tr").each((_, row) => {
      const time = $(row).find("td.game-time");
      if (time.length) {
        eventId =
          time.attr("data-content")?.match(/\/events\/(\d+)\//)?.[1] || "";
        kickoff = time.find('[data-role="localtime"]').attr("data-value") || "";
        return;
      }
      const team = $(row).find(".team-name").attr("data-abbr");
      if (!team || !eventId || !Number.isFinite(Date.parse(kickoff))) return;
      $(row)
        .children("td")
        .each((index, cell) => {
          if (!$(cell).hasClass("game-odds")) return;
          if (
            $(cell).hasClass("blank") &&
            !$(cell).find(".data-value,.data-moneyline,.data-odds").length
          )
            return;
          const book = headers[index];
          if (!book || book === "Time")
            throw Error("Unaligned game book columns");
          const value = $(cell).find(".data-value").first().text().trim();
          const price = $(cell)
            .find(market === "moneyline" ? ".data-moneyline" : ".data-odds")
            .first()
            .text()
            .trim();
          const odds = american(price);
          const line = market === "moneyline" ? null : lineValue(value)?.line;
          if (odds == null || line === undefined) return;
          out.push({
            eventId,
            kickoff,
            team,
            market,
            book,
            kind: ["Open", "Consensus"].includes(book)
              ? "reference"
              : "sportsbook",
            line,
            odds,
            raw: [value, price].filter(Boolean).join(" "),
          });
        });
    });
  }
  if (!out.length) throw Error("No usable game odds");
  const seasons = [
    ...new Set(
      out.map((g) => {
        const d = new Date(g.kickoff);
        return d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
      }),
    ),
  ];
  if (seasons.length !== 1) throw Error("Mixed seasons on NFL board");
  const keys = out.map((g) => `${g.eventId}|${g.team}|${g.market}|${g.book}`);
  if (new Set(keys).size !== keys.length)
    throw Error("Duplicate game/book market rows");
  return { week, season: seasons[0], games: out };
}
export function parseBoard(
  propsHtml: string,
  gamesHtml: string,
  fetchedAt = new Date().toISOString(),
): OddsBoard {
  const props = parseProps(propsHtml),
    games = parseGames(gamesHtml);
  return {
    version: 1,
    fetchedAt,
    ...games,
    props,
    books: [
      ...new Set(
        [...props, ...games.games]
          .filter((q) => q.kind === "sportsbook")
          .map((q) => q.book),
      ),
    ].sort(),
    pickem: [
      ...new Set(props.filter((q) => q.kind === "pickem").map((q) => q.book)),
    ].sort(),
  };
}
async function readPage(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: {
      "User-Agent": "FantasyFootballEdge/2.0 (NFL odds dashboard)",
      Accept: "text/html",
    },
  });
  if (!r.ok) throw Error(`VegasInsider HTTP ${r.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!r.body) throw Error("Empty source response");
  for await (const chunk of r.body as any) {
    size += chunk.length;
    if (size > 12_000_000) throw Error("Source page exceeded size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function fetchOddsBoard() {
  const props = await readPage(PROP_SOURCE);
  const games = await readPage(GAME_SOURCE);
  return parseBoard(props, games);
}
