import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { STRANGER_TASK_LIST_ID } from "./stranger_constants.ts";
import { executeFirstSession, writeTaskListSettings } from "./stranger_first.ts";

test("executeFirstSession takes rows, a bed and a config folder", () => {
  assert.equal(executeFirstSession.length, 3);
});

test("writeTaskListSettings writes the task list id into the project settings and makes its task folder", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "stranger-first-bed-"));
  const config = mkdtempSync(path.join(tmpdir(), "stranger-first-config-"));
  writeTaskListSettings(bed, config);
  const settings = JSON.parse(readFileSync(path.join(bed, "project", ".claude", "settings.json"), "utf8"));
  assert.equal(settings.env.CLAUDE_CODE_TASK_LIST_ID, STRANGER_TASK_LIST_ID);
  assert.equal(existsSync(path.join(config, "tasks", STRANGER_TASK_LIST_ID)), true);
});
