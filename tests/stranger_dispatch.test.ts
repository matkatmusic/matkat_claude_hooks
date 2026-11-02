import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setEnablement, setValue, writeUserDispatch } from "./stranger_dispatch.ts";

test("writeUserDispatch writes the enablements and the bed state folder, and setters change them", () => {
  const clone = mkdtempSync(path.join(tmpdir(), "stranger-dispatch-"));
  mkdirSync(path.join(clone, "dispatcher"));
  writeUserDispatch(clone, "/bed", "/config");
  setEnablement(clone, "turn-counter", "Stop", false);
  setValue(clone, "shared", "CLAUDE_HOOKS_SESSION_STATE_DIR", "/other");
  const written = JSON.parse(readFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), "utf8"));
  assert.equal(written.enablements["turn-counter"].Stop, false);
  assert.equal(written.values.shared.CLAUDE_HOOKS_SESSION_STATE_DIR, "/other");
  assert.equal(written.values["unlisted-items"].CLAUDE_HOOKS_TASKS_DIR, "/config/tasks");
});
