import { spawnSync } from "node:child_process";

const currentBranch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim();
if (currentBranch === "main" || currentBranch === "dev") process.exit(0);

const fetch = spawnSync("git", ["fetch", "--quiet", "origin", "dev"], {
  stdio: "ignore",
});
if (fetch.status !== 0) {
  console.warn("⚠ skip branch-freshness check: cannot fetch origin/dev (offline?)");
  process.exit(0);
}

const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD"], {
  stdio: "ignore",
});
if (ancestor.status === 0) process.exit(0);

console.error("✗ Your branch is behind origin/dev — sync before committing:");
console.error("    git fetch origin dev && git rebase origin/dev   # or: git merge origin/dev");
process.exit(1);
