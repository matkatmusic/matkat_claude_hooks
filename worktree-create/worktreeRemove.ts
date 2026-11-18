#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
// WorktreeRemove: removes a worktree that worktreeCreate.ts made. No --force: a worktree with changes stays and this hook fails.

export function findMainRepoFolder(worktreePath: string): string {
  const commonGitDir = execFileSync("git", ["-C", worktreePath, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim();
  return dirname(resolve(worktreePath, commonGitDir));
}

export function removeWorktree(worktreePath: string): void {
  const mainRepoFolder = findMainRepoFolder(worktreePath);
  const changedLines = execFileSync("git", ["-C", worktreePath, "status", "--porcelain", "--ignore-submodules=none"], { encoding: "utf8" }).trim();
  if (changedLines !== "") {
    throw new Error(`worktree has changes, so it stays: ${worktreePath}\n${changedLines}`);
  }
  // Git refuses to remove any worktree that has submodules unless --force is set. The check above replaces git's own check.
  execFileSync("git", ["-C", mainRepoFolder, "worktree", "remove", "--force", worktreePath], { stdio: ["ignore", "inherit", "inherit"] });
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  removeWorktree(input.worktree_path);
}
