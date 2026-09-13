import { XMLParser } from "fast-xml-parser";
import type { Pool } from "pg";
export const waiverFeeds = [
  ["Draft Sharks · player news", "https://www.draftsharks.com/rss/shark-bites"],
  ["Draft Sharks · injuries", "https://www.draftsharks.com/rss/injury-news"],
  ["Draft Sharks · advice", "https://www.draftsharks.com/rss/advice"],
  ["ESPN", "https://www.espn.com/espn/rss/nfl/news"],
  ["Yahoo Sports", "https://sports.yahoo.com/nfl/rss.xml"],
  ["CBS Sports", "https://www.cbssports.com/rss/headlines/nfl/"],
  ["FantasyPros", "https://www.fantasypros.com/feed/"],
];
export async function waiverNews(db: Pool, names: string[] = []) {
  const articles: any[] = [],
    sources: any[] = [];
  const searches = names
    .slice(0, 12)
    .map((name) => [
      "News search: " + name,
      "https://news.google.com/rss/search?q=" +
        encodeURIComponent('"' + name + '" NFL fantasy when:7d') +
        "&hl=en-US&gl=US&ceid=US:en",
    ]);
  for (const [source, url] of [...waiverFeeds, ...searches]) {
    const old = (
      await db.query(
        "SELECT data,updated_at FROM research_cache WHERE url=$1",
        [url],
      )
    ).rows[0];
    let rows = old?.data || [],
      updatedAt = old?.updated_at || null,
      status = "cached";
    if (!old || Date.now() - Date.parse(old.updated_at) > 3600000) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) throw Error();
        const text = await r.text();
        if (text.length > 3000000) throw Error();
        const items = new XMLParser().parse(text).rss?.channel?.item;
        const plain = (v: any) =>
          typeof v === "string"
            ? v
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim()
            : "";
        rows = (Array.isArray(items) ? items : items ? [items] : [])
          .slice(0, 60)
          .flatMap((x: any) => {
            const title = plain(x.title),
              excerpt = plain(x.description).slice(0, 650),
              publishedAt = Date.parse(x.pubDate);
            if (
              !title ||
              typeof x.link !== "string" ||
              !x.link.startsWith("https://") ||
              !Number.isFinite(publishedAt)
            )
              return [];
            return [
              {
                source:
                  typeof x.source === "string"
                    ? x.source
                    : x.source?.["#text"] || source,
                title: title.slice(0, 250),
                excerpt,
                url: x.link,
                publishedAt: new Date(publishedAt).toISOString(),
              },
            ];
          });
        if (!rows.length) throw Error();
        await db.query(
          "INSERT INTO research_cache VALUES($1,now(),$2) ON CONFLICT(url) DO UPDATE SET updated_at=now(),data=$2",
          [url, JSON.stringify(rows)],
        );
        updatedAt = new Date().toISOString();
        status = "ok";
      } catch {
        status = old ? "stale" : "unavailable";
      }
    }
    sources.push({ source, url, updatedAt, status });
    rows = rows.map((x: any) => ({
      ...x,
      searchPlayer: source.startsWith("News search: ")
        ? source.slice(13)
        : undefined,
    }));
    articles.push(
      ...rows.filter(
        (x: any) =>
          Date.parse(x.publishedAt) <= Date.now() + 3600000 &&
          Date.now() - Date.parse(x.publishedAt) < 7 * 86400000,
      ),
    );
  }
  return {
    articles: [
      ...new Map(
        articles.map((x) => [x.url + ":" + (x.searchPlayer || ""), x]),
      ).values(),
    ],
    sources,
  };
}
export function matchingNews(name: string, articles: any[]) {
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return articles
    .filter(
      (n) =>
        n.searchPlayer === name ||
        (" " + key(n.title + " " + n.excerpt) + " ").includes(
          " " + key(name) + " ",
        ),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 3);
}
