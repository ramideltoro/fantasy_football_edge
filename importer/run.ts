import { packSnapshot } from "../shared/importPackage.ts";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
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
  let awake: ChildProcess | undefined;
  let stage = "starting";
  const progress = async (value: string) => {
    stage = value;
    await report("running", value);
    fs.writeFileSync(
      path.join(dir, "status.json"),
      JSON.stringify({
        status: "running",
        message: value,
        time: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
  };
  try {
    const login = process.argv.includes("--login");
    const cooldownFile = path.join(dir, "retry-after");
    if (!login) {
      const retryAt = fs.existsSync(cooldownFile)
        ? Number(fs.readFileSync(cooldownFile, "utf8"))
        : 0;
      const local = fs.existsSync(path.join(dir, "status.json"))
        ? JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8"))
        : {};
      try {
        await fetch(config.endpoint + "/api/import/heartbeat", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + config.token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: retryAt > Date.now() ? "cooldown" : local.status || "idle",
            message: local.message || "Worker checked for work",
            retryAt:
              retryAt > Date.now() ? new Date(retryAt).toISOString() : null,
          }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
    }
    if (
      !login &&
      fs.existsSync(cooldownFile) &&
      Date.now() < Number(fs.readFileSync(cooldownFile, "utf8"))
    )
      return;
    let requested = false;
    if (!login) {
      try {
        const response = await fetch(config.endpoint + "/api/import/request", {
          headers: { Authorization: "Bearer " + config.token },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) requested = (await response.json()).pending === true;
      } catch {}
    }
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
      !requested &&
      Date.now() - last < (boosted ? 15 : 60) * 60000
    )
      return;
    // Keep an active import awake without preventing screen locking or display sleep.
    // The assertion expires with this process, including an unexpected exit.
    if (process.platform === "darwin") {
      awake = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], {
        stdio: "ignore",
      });
      awake.on("error", () => {});
    }
    context = await chromium.launchPersistentContext(
      path.join(dir, "browser"),
      {
        channel: "chrome",
        headless: login ? false : config.headless !== false,
        viewport: { width: 1440, height: 1000 },
      },
    );
    const page = context.pages()[0] || (await context.newPage());
    const deadline = Date.now() + 10 * 60000;
    let lastNavigation = 0;
    async function navigate(url: string, selector: string) {
      const delay = Math.max(0, 5000 - (Date.now() - lastNavigation));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastNavigation = Date.now();
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() > deadline) throw Error("Import time limit reached");
        try {
          const response = await page.goto(url, {
            waitUntil: "commit",
            timeout: 30000,
          });
          if (response && [429, 999].includes(response.status())) {
            const retry = response.headers()["retry-after"];
            const retryAt =
              retry && /^\d+$/.test(retry)
                ? Date.now() + Number(retry) * 1000
                : Date.parse(retry || "");
            fs.writeFileSync(
              cooldownFile,
              String(Math.max(Date.now() + 3600000, retryAt || 0)),
              { mode: 0o600 },
            );
            throw Error("Yahoo temporarily blocked requests");
          }
          if (new URL(page.url()).hostname === "login.yahoo.com")
            throw Error("Yahoo authentication required");
          await page.locator(selector).waitFor({
            timeout: 20000,
            state: selector === "#statselect" ? "attached" : "visible",
          });
          await page.waitForFunction(
            () => document.readyState !== "loading",
            {},
            { timeout: 20000 },
          );
          return;
        } catch (error) {
          lastError = error;
          if (
            error instanceof Error &&
            error.message === "Yahoo temporarily blocked requests"
          )
            throw error;
          if (new URL(page.url()).hostname === "login.yahoo.com") throw error;
        }
      }
      throw lastError;
    }
    const checkpointFile = path.join(dir, "checkpoint.json");
    const identity = JSON.stringify({
      roster: config.rosterUrl,
      pages: config.pages,
      scope: "available-all-positions-v2",
    });
    let checkpoint: {
      identity: string;
      startedAt: string;
      pages: Record<
        string,
        PageCapture & { links: { text: string; url: string }[] }
      >;
    } = { identity, startedAt: new Date().toISOString(), pages: {} };
    if (fs.existsSync(checkpointFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(checkpointFile, "utf8"));
        if (
          saved.identity === identity &&
          Date.now() - Date.parse(saved.startedAt) < 2 * 3600000
        )
          checkpoint = saved;
      } catch {}
    }
    const captureStartedAt = checkpoint.startedAt;
    async function readPage(url: string, selector: string, kind: string) {
      const key = kind + ":" + url;
      if (checkpoint.pages[key]) return checkpoint.pages[key];
      await navigate(url, selector);
      const captured = { ...(await page.evaluate(capture)), kind };
      if (kind === "players" && !parsePlayers(captured).length)
        throw Error("Player page returned no parsed rows");
      checkpoint.pages[key] = captured;
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint), {
        mode: 0o600,
      });
      return captured;
    }
    await progress("Loading roster");
    if (login)
      await page.goto(config.rosterUrl, {
        waitUntil: "commit",
        timeout: 30000,
      });

    if (login) {
      console.log(
        "Sign in to Yahoo in this dedicated browser, then close it when finished.",
      );
      await new Promise<void>((resolve) =>
        context!.on("close", () => resolve()),
      );
      return;
    }
    const pages: PageCapture[] = [
      await readPage(config.rosterUrl, "#statTable0", "roster"),
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
      if (!allowed.includes(entry.kind) || entry.kind === "players") continue;
      const url = new URL(entry.url);
      if (
        url.origin !== "https://football.fantasysports.yahoo.com" ||
        !(url.pathname === root || url.pathname.startsWith(root + "/"))
      )
        throw Error("Invalid import route");
      await progress("Reading " + entry.kind);
      pages.push(await readPage(url.href, "#yspmain", entry.kind));
    }
    const week = normalize(pages).week;
    const coverage = [];
    {
      for (const position of ["W/R/T", "QB", "K", "DEF"]) {
        const url = new URL(
          root + "/players",
          "https://football.fantasysports.yahoo.com",
        );
        url.search = new URLSearchParams({
          status: "A",
          pos: position,
          stat1: "S_PW_" + week,
          sort: "PTS",
          sdir: "1",
        }).toString();
        let next: string | null = url.href,
          count = 0,
          rows = 0;
        const seen = new Set<string>();
        while (
          next &&
          count < (position === "W/R/T" ? 2 : 1) &&
          !seen.has(next)
        ) {
          seen.add(next);
          await progress("Reading " + position + " player page " + (count + 1));
          const captured = await readPage(next, "#statselect", "players");
          const parsed = parsePlayers(captured);
          rows += parsed.length;
          count++;
          pages.push(captured);
          const link = captured.links.find((l) =>
            /^Next \d+$/.test(l.text.trim()),
          );
          if (!parsed.length)
            throw Error("Player page returned no parsed rows");
          if (!link) {
            next = null;
            break;
          }
          const target = new URL(link.url);
          if (target.origin !== url.origin || target.pathname !== url.pathname)
            throw Error("Invalid player pagination");
          next = target.href;
        }
        coverage.push({
          kind:
            position === "W/R/T"
              ? "players-WRT-top2"
              : `players-${position}-top1`,
          pages: count,
          rows,
          complete: count === (position === "W/R/T" ? 2 : 1) || next === null,
        });
      }
    }
    const snap = normalize(pages, captureStartedAt);
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
    const archive = packSnapshot(snap);
    await progress(
      `Uploading one ZIP package (${Math.ceil(archive.length / 1024)} KB)`,
    );
    const r = await fetch(config.endpoint + "/api/import/snapshot", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.token,
        "Content-Type": "application/zip",
      },
      body: archive,
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok)
      throw Error("Complete snapshot upload rejected; previous data retained");
    const receipt = await r.json();
    if (receipt.duplicate)
      throw Error("Duplicate snapshot was not a fresh import");
    fs.rmSync(checkpointFile, { force: true });
    fs.writeFileSync(path.join(dir, "last-success"), String(Date.now()), {
      mode: 0o600,
    });
    await report(
      "ok",
      `All Yahoo views refreshed: ${snap.players.length} roster, ${snap.available.length} pool players, ${pages.length} pages. Capture began ${snap.capturedAt}.`,
    );
  } catch (error) {
    if (process.env.EDGE_IMPORT_DEBUG === "1") console.error(error);
    const needsAuthentication =
      error instanceof Error &&
      error.message === "Yahoo authentication required";
    await report(
      needsAuthentication ? "authentication_required" : "failed",
      needsAuthentication
        ? "Yahoo sign-in expired. Reconnect the local browser."
        : error instanceof Error &&
            error.message === "Yahoo temporarily blocked requests"
          ? "Yahoo temporarily blocked requests. Imports paused for at least one hour; last good snapshot retained."
          : `Import failed during ${stage}. ${error instanceof Error ? error.name : "Error"}. Last good snapshot retained.`,
    );
    process.exitCode = 1;
  } finally {
    await context?.close().catch(() => {});
    awake?.kill();
    fs.rmSync(lock, { force: true });
  }
}
await main();
