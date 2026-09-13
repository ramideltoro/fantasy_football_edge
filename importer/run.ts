import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { capture } from "./capture.ts";
import { normalize, parsePlayers, type PageCapture } from "../shared/model.ts";
const dir =
  process.env.EDGE_IMPORT_HOME ||
  path.join(os.homedir(), "Library/Application Support/FantasyFootballEdge");
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const config = JSON.parse(
  fs.readFileSync(path.join(dir, "config.json"), "utf8"),
);
config.endpoint = process.env.EDGE_IMPORT_ENDPOINT || config.endpoint;
const lock = path.join(dir, "import.lock");
const report = async (status: string, message: string) => {
  fs.writeFileSync(
    path.join(dir, "status.json"),
    JSON.stringify({ status, message, time: new Date().toISOString() }),
    { mode: 0o600 },
  );
  try {
    await fetch(config.endpoint + "/api/import/status", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status, message }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {}
};
async function main() {
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    try {
      process.kill(pid, 0);
      return;
    } catch {
      fs.unlinkSync(lock);
    }
  }
  fs.writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
  let context;
  try {
    const login = process.argv.includes("--login");
    const et = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const day = et.find((p) => p.type === "weekday")?.value,
      hour = Number(et.find((p) => p.type === "hour")?.value);
    const footballWindow =
      (day === "Sun" && hour >= 9) ||
      (day === "Mon" && hour >= 18) ||
      (day === "Thu" && hour >= 18) ||
      (day === "Sat" && hour >= 12);
    const gameTimes = fs.existsSync(path.join(dir, "game-times.json"))
      ? (JSON.parse(
          fs.readFileSync(path.join(dir, "game-times.json"), "utf8"),
        ) as string[])
      : [];
    const boosted =
      gameTimes.some(
        (t) =>
          Date.now() >= Date.parse(t) - 4 * 3600000 &&
          Date.now() <= Date.parse(t) + 5 * 3600000,
      ) || footballWindow;
    const last = fs.existsSync(path.join(dir, "last-success"))
      ? Number(fs.readFileSync(path.join(dir, "last-success"), "utf8"))
      : 0;
    if (
      !login &&
      !process.argv.includes("--force") &&
      Date.now() - last < (boosted ? 15 : 60) * 60000
    )
      return;
    context = await chromium.launchPersistentContext(
      path.join(dir, "browser"),
      {
        channel: "chrome",
        headless: !login,
        viewport: { width: 1440, height: 1000 },
      },
    );
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(config.rosterUrl, { waitUntil: "commit", timeout: 60000 });
    if (login) {
      console.log(
        "Sign in to Yahoo in this dedicated browser, then close it when finished.",
      );
      await new Promise<void>((resolve) =>
        context!.on("close", () => resolve()),
      );
      return;
    }
    if (
      !page.url().startsWith("https://football.fantasysports.yahoo.com/f1/") ||
      (await page.locator("input[type=password]").count())
    ) {
      await report(
        "authentication_required",
        "Open the Mac importer login to reconnect Yahoo.",
      );
      process.exitCode = 2;
      return;
    }
    await page.locator("#statTable0").waitFor({ timeout: 30000 });
    const pages: PageCapture[] = [
      { ...(await page.evaluate(capture)), kind: "roster" },
    ];
    const root = new URL(config.rosterUrl).pathname
      .split("/")
      .slice(0, 3)
      .join("/");
    const allowed = [
      "league",
      "matchups",
      "players",
      "settings",
      "transactions",
      "schedule",
      "research",
      "draft",
      "opponent",
    ];
    for (const entry of config.pages || []) {
      if (!allowed.includes(entry.kind)) continue;
      const url = new URL(entry.url);
      if (
        url.origin !== "https://football.fantasysports.yahoo.com" ||
        !(url.pathname === root || url.pathname.startsWith(root + "/"))
      )
        throw Error("Invalid import route");
      await page.goto(url.href, { waitUntil: "commit", timeout: 60000 });
      if (new URL(page.url()).origin !== url.origin)
        throw Error("Yahoo login required");
      await page.locator("#yspmain").waitFor({ timeout: 30000 });
      pages.push({ ...(await page.evaluate(capture)), kind: entry.kind });
    }
    const week = normalize(pages).week;
    const coverage = [];
    if (config.fullPlayerPool !== false) {
      for (const position of ["O", "K", "DEF"]) {
        const url = new URL(
          root + "/players",
          "https://football.fantasysports.yahoo.com",
        );
        url.search = new URLSearchParams({
          status: "ALL",
          pos: position,
          stat1: "S_PW_" + week,
          sort: "PTS",
          sdir: "1",
        }).toString();
        let next: string | null = url.href,
          count = 0,
          rows = 0;
        const seen = new Set<string>();
        while (next && count < 80 && !seen.has(next)) {
          seen.add(next);
          await page.goto(next, { waitUntil: "commit", timeout: 60000 });
          await page.locator("#yspmain").waitFor({ timeout: 30000 });
          await page.locator("#statselect").waitFor({ timeout: 30000 });
          const captured = {
            ...(await page.evaluate(capture)),
            kind: "players",
          };
          const parsed = parsePlayers(captured);
          rows += parsed.length;
          count++;
          pages.push(captured);
          const link = captured.links.find((l) =>
            /^Next \d+$/.test(l.text.trim()),
          );
          if (!parsed.length || !link) {
            next = null;
            break;
          }
          const target = new URL(link.url);
          if (target.origin !== url.origin || target.pathname !== url.pathname)
            throw Error("Invalid player pagination");
          next = target.href;
        }
        coverage.push({
          kind: "players-" + position,
          pages: count,
          rows,
          complete: next === null,
        });
      }
    }
    const snap = normalize(pages);
    snap.coverage = [
      ...coverage,
      ...[
        "roster",
        "league",
        "matchups",
        "settings",
        "transactions",
        "schedule",
        "draft",
        "research",
      ].map((kind) => ({
        kind,
        pages: pages.filter((p) => p.kind === kind).length,
        rows: pages
          .filter((p) => p.kind === kind)
          .reduce(
            (n, p) => n + p.tables.reduce((n, t) => n + t.rows.length, 0),
            0,
          ),
        complete: pages.some((p) => p.kind === kind),
      })),
    ];
    // Player tables are normalized above. Avoid retaining duplicate participant
    // labels and multi-megabyte table copies in the private page archive.
    snap.sections = snap.sections.map((p) =>
      p.kind === "players"
        ? {
            ...p,
            text: "Player fields normalized into the player pool.",
            tables: [],
          }
        : p,
    );
    fs.writeFileSync(
      path.join(dir, "game-times.json"),
      JSON.stringify([
        ...new Set(
          [...snap.players, ...snap.available]
            .map((p) => p.kickoffAt)
            .filter(Boolean),
        ),
      ]),
      { mode: 0o600 },
    );
    const r = await fetch(config.endpoint + "/api/import/snapshot", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snap),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error("Snapshot upload rejected");
    fs.writeFileSync(path.join(dir, "last-success"), String(Date.now()), {
      mode: 0o600,
    });
    await report(
      "ok",
      `Imported ${snap.players.length} roster players and ${pages.length} pages.`,
    );
  } catch (error) {
    if (process.env.EDGE_IMPORT_DEBUG === "1") console.error(error);
    await report(
      "failed",
      "Import failed. Check Yahoo login, network connection or page format.",
    );
    process.exitCode = 1;
  } finally {
    await context?.close().catch(() => {});
    fs.rmSync(lock, { force: true });
  }
}
await main();
