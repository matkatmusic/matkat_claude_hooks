#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import type { SpawnSyncReturns } from "node:child_process";
import { logHookFailure } from "./hook-log.ts";

function makeResult(overrides: Partial<SpawnSyncReturns<string>>): SpawnSyncReturns<string> {
  return { pid: 1, output: [], stdout: "", stderr: "", status: 0, signal: null, ...overrides };
}

function makeRoot(withGit: boolean): string {
  const root = mkdtempSync(`${tmpdir()}/hook-log-`);
  if (withGit)
    mkdirSync(`${root}/.git`);
  return root;
}

function readOnlyLog(root: string, hookName: string): string {
  const days = readdirSync(`${root}/.claude_hooks/logs`);
  assert.equal(days.length, 1);
  assert.match(days[0], /^\d{4}-\d{2}-\d{2}$/);
  return readFileSync(`${root}/.claude_hooks/logs/${days[0]}/${hookName}.log`, "utf8");
}

test("a nonzero exit appends one line with time, session, event, kind and message", () => {
  const root = makeRoot(false);
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1, stderr: "bad\nthing\n" }) });
  const lines = readOnlyLog(root, "oops").split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[1], "");
  assert.match(lines[0], /^\d{4}-\d{2}-\d{2}T[\d:.]+Z session=s1 event=Stop exit-code: exit 1: bad thing$/);
});

test("a second failure appends a second line to the same file", () => {
  const root = makeRoot(false);
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1 }) });
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 3 }) });
  assert.equal(readOnlyLog(root, "oops").trim().split("\n").length, 2);
});

test("a time-out (status null with a signal) logs a timeout line", () => {
  const root = makeRoot(false);
  logHookFailure({ root, hookName: "slow", sessionId: "s1", event: "Stop", result: makeResult({ status: null, signal: "SIGTERM" }) });
  assert.match(readOnlyLog(root, "slow"), / event=Stop timeout: SIGTERM\n$/);
});

test("a spawn error logs a spawn-error line", () => {
  const root = makeRoot(false);
  logHookFailure({ root, hookName: "ghost", sessionId: "s1", event: "Stop", result: makeResult({ status: null, error: new Error("spawn nope ENOENT") }) });
  assert.match(readOnlyLog(root, "ghost"), / event=Stop spawn-error: spawn nope ENOENT\n$/);
});

test("exit 0 and exit 2 write nothing", () => {
  const root = makeRoot(true);
  logHookFailure({ root, hookName: "fine", sessionId: "s1", event: "Stop", result: makeResult({ status: 0 }) });
  logHookFailure({ root, hookName: "fine", sessionId: "s1", event: "Stop", result: makeResult({ status: 2, stderr: "blocked" }) });
  assert.equal(existsSync(`${root}/.claude_hooks`), false);
  assert.equal(existsSync(`${root}/.gitignore`), false);
});

test("with a .git folder, .gitignore is created with .claude_hooks/ once", () => {
  const root = makeRoot(true);
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1 }) });
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1 }) });
  assert.equal(readFileSync(`${root}/.gitignore`, "utf8"), ".claude_hooks/\n");
});

test("an existing .gitignore without the line gets it appended, other lines stay", () => {
  const root = makeRoot(true);
  writeFileSync(`${root}/.gitignore`, "node_modules");
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1 }) });
  assert.equal(readFileSync(`${root}/.gitignore`, "utf8"), "node_modules\n.claude_hooks/\n");
});

test("an existing .gitignore that has the line is left as it is", () => {
  const root = makeRoot(true);
  writeFileSync(`${root}/.gitignore`, "a\n.claude_hooks/\nb\n");
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1 }) });
  assert.equal(readFileSync(`${root}/.gitignore`, "utf8"), "a\n.claude_hooks/\nb\n");
});

test("without a .git folder, .gitignore is not touched", () => {
  const root = makeRoot(false);
  logHookFailure({ root, hookName: "oops", sessionId: "s1", event: "Stop", result: makeResult({ status: 1 }) });
  assert.equal(existsSync(`${root}/.gitignore`), false);
});
