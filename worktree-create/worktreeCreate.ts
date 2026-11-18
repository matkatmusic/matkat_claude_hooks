#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// WorktreeCreate: makes every worktree with newWorktree.sh so submodules are filled. Stdout must be only the path.

const SETUP_SCRIPT_PATH = fileURLToPath(new URL("../worktreeSetup/newWorktree.sh", import.meta.url));

export function runSetupScript(repoFolder: string, branchName: string): string {
  const result = spawnSync(SETUP_SCRIPT_PATH, [repoFolder, branchName], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`newWorktree.sh exited with status ${result.status}`);
  }
  const outputLines = result.stdout.split("\n").filter((line) => line.trim() !== "");
  return outputLines[outputLines.length - 1];
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const worktreePath = runSetupScript(input.cwd, input.name);
  console.log(worktreePath);
}
