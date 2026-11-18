#!/usr/bin/env bun
import { test, after } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const CREATE_HOOK_PATH = fileURLToPath(new URL("./worktreeCreate.ts", import.meta.url));
const REMOVE_HOOK_PATH = fileURLToPath(new URL("./worktreeRemove.ts", import.meta.url));
const madeRepoFolders: string[] = [];

function runGit(folder: string, args: string[]): string {
  return execFileSync("git", ["-C", folder, ...args], { encoding: "utf8" });
}

function makeRepoWithSubmodule(): string {
  const submoduleSourceFolder = mkdtempSync(join(tmpdir(), "wtRemoveSource"));
  const repoFolder = mkdtempSync(join(tmpdir(), "wtRemoveRepo"));
  madeRepoFolders.push(submoduleSourceFolder, repoFolder);
  execFileSync("git", ["init", "-q", submoduleSourceFolder]);
  execFileSync("git", ["init", "-q", repoFolder]);
  runGit(submoduleSourceFolder, ["config", "user.email", "t@t.t"]);
  runGit(submoduleSourceFolder, ["config", "user.name", "t"]);
  writeFileSync(join(submoduleSourceFolder, "inside.txt"), "inside");
  runGit(submoduleSourceFolder, ["add", "inside.txt"]);
  runGit(submoduleSourceFolder, ["commit", "-q", "-m", "first"]);
  runGit(repoFolder, ["config", "user.email", "t@t.t"]);
  runGit(repoFolder, ["config", "user.name", "t"]);
  runGit(repoFolder, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", submoduleSourceFolder, "sub"]);
  runGit(repoFolder, ["commit", "-q", "-m", "add submodule"]);
  return repoFolder;
}

function makeWorktreeWithCreateHook(repoFolder: string, branchName: string): string {
  const input = JSON.stringify({ hook_event_name: "WorktreeCreate", cwd: repoFolder, name: branchName });
  const result = spawnSync("bun", [CREATE_HOOK_PATH], { input, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split("\n").pop() as string;
}

function runRemoveHook(worktreePath: string) {
  const input = JSON.stringify({ hook_event_name: "WorktreeRemove", cwd: worktreePath, worktree_path: worktreePath });
  return spawnSync("bun", [REMOVE_HOOK_PATH], { input, encoding: "utf8" });
}

after(() => {
  for (const madeFolder of madeRepoFolders) {
    rmSync(join(homedir(), "Programming", `${basename(madeFolder)}-worktrees`), { recursive: true, force: true });
    rmSync(madeFolder, { recursive: true, force: true });
  }
});

test("remove hook removes a clean worktree and git forgets it", () => {
  const repoFolder = makeRepoWithSubmodule();
  const worktreePath = makeWorktreeWithCreateHook(repoFolder, "removeHookBranchA");
  const result = runRemoveHook(worktreePath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(worktreePath), false);
  assert.equal(runGit(repoFolder, ["worktree", "list"]).includes("removeHookBranchA"), false);
});

test("remove hook keeps a worktree with an uncommitted change and exits non-zero", () => {
  const repoFolder = makeRepoWithSubmodule();
  const worktreePath = makeWorktreeWithCreateHook(repoFolder, "removeHookBranchB");
  writeFileSync(join(worktreePath, "uncommitted.txt"), "change");
  const result = runRemoveHook(worktreePath);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(worktreePath), true);
});
