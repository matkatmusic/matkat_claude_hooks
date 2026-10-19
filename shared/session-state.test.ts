#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { getSessionStatePath, readSessionState, writeSessionState } from "./session-state.ts";

const STATE_DIR = "/some/state/dir";

test("getSessionStatePath strips a transcript path's .jsonl extension", () => {
  assert.equal(getSessionStatePath("/some/dir/abc-123.jsonl", STATE_DIR), `${STATE_DIR}/abc-123.json`);
});

test("getSessionStatePath accepts a bare session id", () => {
  assert.equal(getSessionStatePath("abc-123", STATE_DIR), `${STATE_DIR}/abc-123.json`);
});

test("readSessionState returns an empty object when no file exists yet", () => {
  const home = mkdtempSync(`${tmpdir()}/session-state-`);
  assert.deepEqual(readSessionState(`${home}/state/no-such-session.json`), {});
  rmSync(home, { recursive: true, force: true });
});

test("writeSessionState creates the folder and the state round-trips through readSessionState", () => {
  const home = mkdtempSync(`${tmpdir()}/session-state-`);
  const path = `${home}/state/some-session.json`;
  writeSessionState(path, { ponytailUltraInvoked: true });
  assert.deepEqual(readSessionState(path), { ponytailUltraInvoked: true });
  rmSync(home, { recursive: true, force: true });
});

test("writeSessionState leaves only the final json file behind, no leftover tmp file", () => {
  const home = mkdtempSync(`${tmpdir()}/session-state-`);
  const path = `${home}/state/atomic-session.json`;
  writeSessionState(path, { ponytailUltraInvoked: true });
  assert.deepEqual(readdirSync(dirname(path)), ["atomic-session.json"]);
  assert.deepEqual(readSessionState(path), { ponytailUltraInvoked: true });
  rmSync(home, { recursive: true, force: true });
});
