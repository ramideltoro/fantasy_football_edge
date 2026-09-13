import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
if (process.platform !== "darwin")
  throw Error("The local scheduler requires macOS.");
const base = path.resolve(import.meta.dirname, "..");
const home =
  process.env.EDGE_IMPORT_HOME ||
  path.join(os.homedir(), "Library/Application Support/FantasyFootballEdge");
if (!fs.existsSync(path.join(home, "config.json")))
  throw Error("Create the private importer config first.");
fs.mkdirSync(home, { recursive: true, mode: 0o700 });
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const label = "com.ramideltoro.fantasy-football-edge.import";
const file = path.join(os.homedir(), "Library/LaunchAgents", label + ".plist");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(
  file,
  `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${esc(fs.existsSync('/opt/homebrew/bin/node')?'/opt/homebrew/bin/node':process.execPath)}</string><string>--import</string><string>${esc(path.join(base, "node_modules/tsx/dist/loader.mjs"))}</string><string>${esc(path.join(base, "importer/run.ts"))}</string></array><key>WorkingDirectory</key><string>${esc(base)}</string><key>EnvironmentVariables</key><dict><key>EDGE_IMPORT_HOME</key><string>${esc(home)}</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict><key>StartInterval</key><integer>900</integer><key>RunAtLoad</key><true/><key>ProcessType</key><string>Background</string><key>StandardOutPath</key><string>${esc(path.join(home, "import.log"))}</string><key>StandardErrorPath</key><string>${esc(path.join(home, "import-error.log"))}</string></dict></plist>`,
  { mode: 0o600 },
);
const domain = "gui/" + process.getuid!();
spawnSync("launchctl", ["bootout", domain, file], { stdio: "ignore" });
const r = spawnSync("launchctl", ["bootstrap", domain, file], {
  stdio: "inherit",
});
if (r.status) process.exit(r.status);
console.log(
  "Mac import scheduler installed. Runs every 15 minutes; normal checks are throttled to hourly.",
);
