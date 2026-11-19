#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const HOOK_FILE = `${import.meta.dirname}/checkTaskListMatch.ts`;

function makeRepo(settingsFileName: string, taskListId: string | undefined): string {
  const repoFolder = mkdtempSync(`${tmpdir()}/taskListMatch-`);
  execFileSync("git", ["init", "-q"], { cwd: repoFolder });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "first"], { cwd: repoFolder });
  if (taskListId !== undefined) {
    mkdirSync(`${repoFolder}/.claude`);
    writeFileSync(`${repoFolder}/.claude/${settingsFileName}`, JSON.stringify({ env: { CLAUDE_CODE_TASK_LIST_ID: taskListId } }));
  }
  return repoFolder;
}

function makeWorktree(repoFolder: string): string {
  const worktreeFolder = `${repoFolder}-worktree`;
  execFileSync("git", ["worktree", "add", "-q", worktreeFolder, "-b", "feature"], { cwd: repoFolder });
  return worktreeFolder;
}

function runHook(toolName: string, cwd: string, sessionTaskListId: string | undefined) {
  const env: Record<string, string | undefined> = { ...process.env, CLAUDE_CODE_TASK_LIST_ID: sessionTaskListId };
  const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: toolName, cwd });
  const hook = spawnSync("bun", [HOOK_FILE], { input, encoding: "utf8", env });
  const hasOutput = hook.stdout.trim() !== "";
  if (hasOutput)
    return JSON.parse(hook.stdout).hookSpecificOutput;
  return undefined;
}

test("test_allows_task_create_when_session_list_matches_project_list", () => {
  // Steps: a repo names the list "shared" in .claude/settings.json; the session uses "shared".
  const repoFolder = makeRepo("settings.json", "shared");
  // The hook prints nothing: the call is allowed.
  assert.equal(runHook("TaskCreate", repoFolder, "shared"), undefined);
});

test("test_denies_task_create_when_session_list_is_missing", () => {
  // Steps: a repo names the list "shared"; the session has no list name.
  const repoFolder = makeRepo("settings.json", "shared");
  const output = runHook("TaskCreate", repoFolder, undefined);
  // The hook denies the call and names the shared list.
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /shared/);
});

test("test_denies_task_update_when_session_list_differs_from_project_list", () => {
  // Steps: a repo names the list "shared"; the session uses a list named "other".
  const repoFolder = makeRepo("settings.json", "shared");
  const output = runHook("TaskUpdate", repoFolder, "other");
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /other/);
});

test("test_reads_list_name_from_settings_local_json", () => {
  // Steps: only the ignored settings.local.json names the list, so a worktree does not get it.
  const repoFolder = makeRepo("settings.local.json", "shared");
  const output = runHook("TaskCreate", repoFolder, undefined);
  assert.equal(output.permissionDecision, "deny");
});

test("test_finds_project_list_from_a_worktree_cwd", () => {
  // Steps: the repo names the list in settings.local.json; the chat runs in a worktree of the repo.
  const repoFolder = makeRepo("settings.local.json", "shared");
  const worktreeFolder = makeWorktree(repoFolder);
  // A session without the list name is denied.
  assert.equal(runHook("TaskCreate", worktreeFolder, undefined).permissionDecision, "deny");
  // A session with the list name is allowed.
  assert.equal(runHook("TaskCreate", worktreeFolder, "shared"), undefined);
});

test("test_finds_project_list_from_a_repo_nested_in_the_project_repo", () => {
    // Steps: the outer repo names the list "shared"; an inner repo inside it has no settings.
    const outerFolder = makeRepo("settings.json", "shared");
    const innerFolder = `${outerFolder}/inner`;
    mkdirSync(innerFolder);
    execFileSync("git", ["init", "-q"], { cwd: innerFolder });
    // A session without the list name is denied.
    assert.equal(runHook("TaskCreate", innerFolder, undefined).permissionDecision, "deny");
    // A session with the list name is allowed.
    assert.equal(runHook("TaskCreate", innerFolder, "shared"), undefined);
});

test("test_allows_task_create_when_project_names_no_list", () => {
  // Steps: a repo has no task list setting; the session has none either.
  const repoFolder = makeRepo("settings.json", undefined);
  assert.equal(runHook("TaskCreate", repoFolder, undefined), undefined);
});
