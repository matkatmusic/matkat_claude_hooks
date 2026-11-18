#!/usr/bin/env bun
import { test, after } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK_PATH = fileURLToPath(new URL("./worktreeCreate.ts", import.meta.url));
const madeRepoFolders: string[] = [];

function runGit(folder: string, args: string[]): void {
  execFileSync("git", ["-C", folder, ...args], { stdio: "ignore" });
}

function makeRepoWithSubmodule(): string {
  const submoduleSourceFolder = mkdtempSync(join(tmpdir(), "wtCreateSource"));
  const repoFolder = mkdtempSync(join(tmpdir(), "wtCreateRepo"));
  madeRepoFolders.push(submoduleSourceFolder, repoFolder);
  execFileSync("git", ["init", "-q", submoduleSourceFolder]);
  execFileSync("git", ["init", "-q", repoFolder]);
  runGit(submoduleSourceFolder, ["config", "user.email", "t@t.t"]);
  runGit(submoduleSourceFolder, ["config", "user.name", "t"]);
  execFileSync("touch", [join(submoduleSourceFolder, "inside.txt")]);
  runGit(submoduleSourceFolder, ["add", "inside.txt"]);
  runGit(submoduleSourceFolder, ["commit", "-q", "-m", "first"]);
  runGit(repoFolder, ["config", "user.email", "t@t.t"]);
  runGit(repoFolder, ["config", "user.name", "t"]);
  runGit(repoFolder, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", submoduleSourceFolder, "sub"]);
  runGit(repoFolder, ["commit", "-q", "-m", "add submodule"]);
  return repoFolder;
}

function runCreateHook(repoFolder: string, branchName: string) {
  const input = JSON.stringify({ hook_event_name: "WorktreeCreate", cwd: repoFolder, name: branchName });
  return spawnSync("bun", [HOOK_PATH], { input, encoding: "utf8" });
}

after(() => {
  for (const madeFolder of madeRepoFolders) {
    rmSync(join(homedir(), "Programming", `${basename(madeFolder)}-worktrees`), { recursive: true, force: true });
    rmSync(madeFolder, { recursive: true, force: true });
  }
});

test("create hook prints a worktree folder whose submodule has files", () => {
  const repoFolder = makeRepoWithSubmodule();
  const result = runCreateHook(repoFolder, "createHookBranchA");
  assert.equal(result.status, 0, result.stderr);
  const outputLines = result.stdout.trim().split("\n");
  const worktreeFolder = outputLines[outputLines.length - 1];
  assert.equal(existsSync(worktreeFolder), true);
  assert.equal(readdirSync(join(worktreeFolder, "sub")).includes("inside.txt"), true);
});

test("create hook exits non-zero when the branch already exists", () => {
  const repoFolder = makeRepoWithSubmodule();
  runGit(repoFolder, ["branch", "createHookBranchB"]);
  const result = runCreateHook(repoFolder, "createHookBranchB");
  assert.notEqual(result.status, 0);
});
