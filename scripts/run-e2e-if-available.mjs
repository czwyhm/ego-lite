import { spawnSync } from "node:child_process";

const changed = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
  encoding: "utf8",
}).stdout
  .split(/\r?\n/)
  .filter(Boolean);
if (!changed.some((file) => file.startsWith("package/ego-browser/") || file.startsWith("skills/ego-browser/"))) {
  process.exit(0);
}

const configured = process.env.EGO_BROWSER_REAL_E2E_CLI;
const probe = process.platform === "win32" ? "where.exe" : "which";
const installed = spawnSync(probe, ["ego-browser"], { stdio: "ignore" }).status === 0;
if (!configured && !installed) {
  console.warn("skip real-browser E2E: Ego Lite CLI is not installed; set EGO_BROWSER_REAL_E2E_CLI to run it");
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["--prefix", "package/ego-browser", "run", "e2e"], {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
