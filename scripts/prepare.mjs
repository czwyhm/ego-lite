import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
if (process.env.CI === "true" || process.env.CI === "1") process.exit(0);

const executable = process.platform === "win32" ? "lefthook.cmd" : "lefthook";
const lefthook = join(repoRoot, "package", "ego-browser", "node_modules", ".bin", executable);
if (!existsSync(lefthook)) process.exit(0);

const result = spawnSync(lefthook, ["install"], {
  cwd: repoRoot,
  stdio: "inherit",
  // Windows exposes npm-installed .cmd shims that require a shell to spawn.
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
