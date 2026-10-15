#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { getSessionStatePath, readSessionState, writeSessionState } from "./session-state.ts";

test("getSessionStatePath strips a transcript path's .jsonl extension", () => {
  process.env.CLAUDE_HOOKS_SESSION_STATE_DIR = "/home/x/.claude/claude_hooks";
  assert.equal(getSessionStatePath("/some/dir/abc-123.jsonl"), "/home/x/.claude/claude_hooks/abc-123.json");
});

test("getSessionStatePath accepts a bare session id", () => {
  process.env.CLAUDE_HOOKS_SESSION_STATE_DIR = "/home/x/.claude/claude_hooks";
  assert.equal(getSessionStatePath("abc-123"), "/home/x/.claude/claude_hooks/abc-123.json");
});

test("readSessionState returns an empty object when no file exists yet", () => {
  const home = mkdtempSync(`${tmpdir()}/session-state-`);
  process.env.CLAUDE_HOOKS_SESSION_STATE_DIR = `${home}/state`;
  const path = getSessionStatePath("no-such-session");
  assert.deepEqual(readSessionState(path), {});
});

test("writeSessionState creates the folder and the state round-trips through readSessionState", () => {
  const home = mkdtempSync(`${tmpdir()}/session-state-`);
  process.env.CLAUDE_HOOKS_SESSION_STATE_DIR = `${home}/state`;
  const path = getSessionStatePath("some-session");
  writeSessionState(path, { done: 123 });
  assert.deepEqual(readSessionState(path), { done: 123 });
});

test("writeSessionState leaves only the final json file behind, no leftover tmp file", () => {
  const home = mkdtempSync(`${tmpdir()}/session-state-`);
  process.env.CLAUDE_HOOKS_SESSION_STATE_DIR = `${home}/state`;
  const path = getSessionStatePath("atomic-session");
  writeSessionState(path, { done: 42 });
  assert.deepEqual(readdirSync(dirname(path)), ["atomic-session.json"]);
  assert.deepEqual(readSessionState(path), { done: 42 });
});
