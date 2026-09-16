import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFeed,
  matchesPlayer,
  eventsFor,
  newsRequest,
  validateNewsResult,
} from "../shared/newsEvidence";
const now = Date.parse("2026-09-16T12:00:00Z");
const player = {
  id: "p1",
  name: "Chris Brooks",
  position: "RB",
  team: "GB",
  slot: "BN",
  status: "",
  locked: false,
  bye: false,
  available: false,
};
const article = {
  id: "a1",
  title: "Chris Brooks practice update",
  excerpt:
    "Chris Brooks was limited in practice due to an ankle injury on Tuesday. The team has not announced his status for the next game.",
  publishedAt: new Date(now).toISOString(),
  source: "ESPN",
  url: "https://espn.com/story",
  kind: "reporting",
};
test("RSS and Atom parsing retains dates and excerpts, drops stale/future and unsafe URLs", () => {
  const rss = `<rss><channel><item><title>Chris Brooks practice update</title><description>${article.excerpt}</description><link>https://espn.com/story?utm_source=feed</link><pubDate>${new Date(now).toUTCString()}</pubDate></item></channel></rss>`;
  const rows = parseFeed(rss, "ESPN", now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, "https://espn.com/story");
  assert.equal(rows[0].excerpt, article.excerpt);
  assert.equal(parseFeed(rss, "ESPN", now + 8 * 86400000).length, 0);
  assert.equal(parseFeed(rss, "ESPN", now - 86400000).length, 0);
  assert.equal(
    parseFeed(rss.replace("https://espn", "http://espn"), "ESPN", now).length,
    0,
  );
  const atom = `<feed><entry><title>Chris Brooks practice update</title><summary>${article.excerpt}</summary><link href="https://espn.com/story"/><updated>${new Date(now).toISOString()}</updated></entry></feed>`;
  assert.equal(parseFeed(atom, "ESPN", now)[0].id, rows[0].id);
});
test("matching requires identity, never trusts search labels or ambiguous surnames", () => {
  assert.equal(matchesPlayer(player, article), true);
  assert.equal(
    matchesPlayer(player, {
      title: "Brooks news",
      excerpt: "Another player",
      searchPlayer: "Chris Brooks",
    }),
    false,
  );
  assert.equal(
    matchesPlayer(
      { ...player, name: "A.J. Brown" },
      { title: "AJ Brown update", excerpt: "A.J. Brown was limited" },
    ),
    true,
  );
  assert.equal(
    matchesPlayer(
      { name: "Giants", position: "DEF", team: "NYG" },
      { title: "San Francisco Giants news", excerpt: "Baseball" },
    ),
    false,
  );
  assert.equal(
    matchesPlayer(
      { name: "Giants", position: "DEF", team: "NYG" },
      { title: "New York Giants defense", excerpt: "NFL matchup" },
    ),
    true,
  );
});
test("events require substantive excerpts and preserve source uncertainty", () => {
  assert.ok(eventsFor(player, article).some((e) => e.type === "practice"));
  assert.equal(
    eventsFor(player, { ...article, excerpt: article.title }).length,
    0,
  );
  assert.ok(
    eventsFor(player, { ...article, kind: "community" }).every(
      (e) => e.status === "unverified",
    ),
  );
  assert.notEqual(
    eventsFor(player, article)[0].id,
    eventsFor(player, {
      ...article,
      excerpt: article.excerpt.replace("limited", "a full participant"),
    })[0].id,
  );
});
test("AI must cite this player’s event and exact supporting text; opinions and locks cannot change lineup", () => {
  const events = eventsFor(player, article);
  const input = { players: [{ ...player, events }] };
  const result = {
    assessments: [
      {
        playerId: "p1",
        eventId: events[0].id,
        quote: "Chris Brooks was limited in practice",
        action: "review lineup",
        interpretation: "Review before kickoff",
        uncertainty: "Unconfirmed",
      },
    ],
  };
  assert.equal(validateNewsResult(result, input)[0].action, "review lineup");
  assert.throws(() =>
    validateNewsResult(
      {
        ...result,
        assessments: [
          { ...result.assessments[0], quote: "He was confirmed ruled out" },
        ],
      },
      input,
    ),
  );
  assert.throws(() =>
    validateNewsResult(
      {
        ...result,
        assessments: [{ ...result.assessments[0], playerId: "other" }],
      },
      input,
    ),
  );
  assert.throws(() => validateNewsResult({ assessments: [] }, input));
  assert.equal(
    validateNewsResult(result, {
      players: [{ ...player, locked: true, events }],
    })[0].action,
    "monitor",
  );
  assert.equal(
    validateNewsResult(result, {
      players: [
        { ...player, events: events.map((e) => ({ ...e, kind: "community" })) },
      ],
    })[0].action,
    "monitor",
  );
  assert.equal(newsRequest(input).format.properties.assessments.minItems, 1);
  assert.equal("projection" in validateNewsResult(result, input)[0], false);
});
test("encoded link markup and Google discovery listings cannot become event evidence", () => {
  const xml = `<rss><channel><item><title>Chris Brooks practice update</title><description>&lt;p&gt;${article.excerpt}&lt;/p&gt;</description><link>https://espn.com/story</link><pubDate>${new Date(now).toUTCString()}</pubDate></item></channel></rss>`;
  const a = parseFeed(xml, "ESPN", now)[0];
  assert.equal(a.excerpt, article.excerpt);
  assert.ok(eventsFor(player, a).length > 0);
  assert.equal(
    eventsFor(player, { ...a, feedSource: "News search: Chris Brooks" }).length,
    0,
  );
  assert.equal(eventsFor(player, { ...a, discoveryOnly: true }).length, 0);
});
test("multi-player roundups do not attach another player’s injury to the named player", () => {
  const a = {
    ...article,
    excerpt:
      "Chris Brooks had four carries in the first game of the season and remains a backup. Zay Flowers sustained a knee injury in the fourth quarter and is questionable.",
  };
  const events = eventsFor(player, a);
  assert.ok(events.some((e) => e.type === "workload"));
  assert.equal(
    events.some((e) => e.type === "injury"),
    false,
  );
  assert.ok(events.every((e) => !e.evidence.includes("Zay Flowers")));
  const team = { id: "def", name: "49ers", team: "SF", position: "DEF" };
  assert.equal(
    eventsFor(team, {
      ...article,
      title: "San Francisco 49ers",
      excerpt:
        "San Francisco 49ers running back Christian McCaffrey had many carries and targets as the starter this week.",
    }).length,
    0,
  );
});
import { articleExcerpt } from "../shared/newsEvidence";
test("publisher extraction uses article body or article paragraphs, never navigation or scripts", () => {
  assert.equal(
    articleExcerpt(
      '<script type="application/ld+json">' +
        JSON.stringify({
          "@type": "NewsArticle",
          articleBody: article.excerpt,
        }) +
        "</script>",
    ),
    article.excerpt,
  );
  assert.equal(
    articleExcerpt(
      "<nav>Chris Brooks injured</nav><article><p>" +
        article.excerpt +
        "</p></article><script>fake news</script>",
    ),
    article.excerpt,
  );
  assert.equal(articleExcerpt("<nav>Chris Brooks injured</nav>"), "");
});
test("practice squad transactions are not practice-participation updates", () => {
  const a = {
    ...article,
    excerpt:
      "The Ravens released Jake Moody from the practice squad after an impressive performance from kicker Tyler Loop on Sunday.",
  };
  const p = { ...player, name: "Tyler Loop" };
  const e = eventsFor(p, a);
  assert.equal(
    e.some((x) => x.type === "practice"),
    false,
  );
  assert.ok(e.some((x) => x.type === "transaction"));
});
test("an opposing defender’s injury is not an injury event for the team defense", () => {
  const team = { id: "def", name: "Giants", team: "NYG", position: "DEF" };
  const a = {
    ...article,
    title: "NFL injury roundup",
    excerpt:
      "Dallas Cowboys linebacker DeMarvion Overshown sustained a hamstring injury during the loss at the New York Giants on Sunday night.",
  };
  assert.equal(eventsFor(team, a).length, 0);
});
