#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HOOK_FILE = `${import.meta.dirname}/blockWorktreeAdd.ts`;
const SETUP_SCRIPT = resolve(import.meta.dirname, "../worktreeSetup/newWorktree.sh");
const HOOK_CWD = "/work/myRepo";

function runHook(command: string) {
  const input = JSON.stringify({ cwd: HOOK_CWD, tool_input: { command, description: "make a worktree" } });
  const hook = spawnSync("bun", [HOOK_FILE], { input, encoding: "utf8" });
  const hasOutput = hook.stdout.trim() !== "";
  if (hasOutput)
    return JSON.parse(hook.stdout).hookSpecificOutput;
  return undefined;
}

test("swaps `git worktree add <path> -b <branch>` for the setup script, in the hook cwd", () => {
  const output = runHook("git worktree add ../wt -b feature");
  assert.equal(output.permissionDecision, "allow");
  assert.equal(output.updatedInput.command, `${SETUP_SCRIPT} '${HOOK_CWD}' 'feature'`);
  assert.equal(output.updatedInput.description, "make a worktree");
});

test("swaps `git -C <dir> worktree add -b <branch> <path>` and uses the -C dir as repo folder", () => {
  const output = runHook("git -C /other/repo worktree add -b feature ../wt");
  assert.equal(output.permissionDecision, "allow");
  assert.equal(output.updatedInput.command, `${SETUP_SCRIPT} '/other/repo' 'feature'`);
});

test("swaps `git worktree add <path>` and takes the branch from the path folder name", () => {
  const output = runHook("git worktree add ../trees/fixBug");
  assert.equal(output.permissionDecision, "allow");
  assert.equal(output.updatedInput.command, `${SETUP_SCRIPT} '${HOOK_CWD}' 'fixBug'`);
});

test("denies `git worktree add` joined to another command with &&", () => {
  const output = runHook("cd x && git worktree add ../wt -b feature");
  assert.equal(output.permissionDecision, "deny");
  assert.equal(output.updatedInput, undefined);
});

test("denies `git worktree add <path> <existing branch>`", () => {
  const output = runHook("git worktree add ../wt existingBranch");
  assert.equal(output.permissionDecision, "deny");
  assert.equal(output.updatedInput, undefined);
});

test("allows `git worktree list`", () => {
  assert.equal(runHook("git worktree list"), undefined);
});

test("allows `git worktree remove x`", () => {
  assert.equal(runHook("git worktree remove x"), undefined);
});

test("allows a command that runs newWorktree.sh", () => {
  assert.equal(runHook(`${SETUP_SCRIPT} /work/myRepo feature`), undefined);
});
