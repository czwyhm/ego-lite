import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const changed = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
  encoding: "utf8",
}).stdout
  .split(/\r?\n/)
  .filter((file) => /^(package\/ego-browser|plugins)\/.*\.(ts|mjs|js|json|md)$/.test(file))
  .filter((file) => !file.startsWith("skills/ego-browser/learnings/"));

if (changed.length === 0) process.exit(0);
const executable = process.platform === "win32" ? "prettier.cmd" : "prettier";
const prettier = join(process.cwd(), "package", "ego-browser", "node_modules", ".bin", executable);
if (!existsSync(prettier)) throw new Error(`Prettier was not found at ${prettier}`);
const result = spawnSync(prettier, ["--check", ...changed], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
