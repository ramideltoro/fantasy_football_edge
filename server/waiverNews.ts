import { XMLParser } from "fast-xml-parser";
import type { Pool } from "pg";
export const waiverFeeds = [
  [
    "Reddit r/fantasyfootball · unverified opinion",
    "https://www.reddit.com/r/fantasyfootball/new/.rss",
  ],
  ["Draft Sharks · player news", "https://www.draftsharks.com/rss/shark-bites"],
  ["Draft Sharks · injuries", "https://www.draftsharks.com/rss/injury-news"],
  ["Draft Sharks · advice", "https://www.draftsharks.com/rss/advice"],
  ["ESPN", "https://www.espn.com/espn/rss/nfl/news"],
  ["Yahoo Sports", "https://sports.yahoo.com/nfl/rss.xml"],
  ["CBS Sports", "https://www.cbssports.com/rss/headlines/nfl/"],
  ["FantasyPros", "https://www.fantasypros.com/feed/"],
];
export async function waiverNews(db: Pool, _names: string[] = []) {
  const [articles, sources] = await Promise.all([
    db.query(
      "SELECT data FROM news_articles WHERE published_at>now()-interval '7 days' ORDER BY published_at DESC",
    ),
    db.query(
      'SELECT source,url,updated_at AS "updatedAt",status FROM news_sources',
    ),
  ]);
  return { articles: articles.rows.map((r) => r.data), sources: sources.rows };
}
export function matchingNews(name: string, articles: any[]) {
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return articles
    .filter((n) =>
      (" " + key(n.title + " " + n.excerpt) + " ").includes(
        " " + key(name) + " ",
      ),
    )
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 3);
}
