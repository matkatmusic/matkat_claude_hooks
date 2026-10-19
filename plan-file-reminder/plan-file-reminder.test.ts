#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { homedir } from "node:os";

import { isPlanEdit, buildReminder } from "./plan-file-reminder.ts";

test("plan mode does not make a non-plan file a plan", () => {
  assert.equal(isPlanEdit({ permission_mode: "plan", cwd: "/x", tool_input: { file_path: "/x/notes.md" } }), false);
});

test("absolute path in the project plans folder", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "/x/plans/a.md" } }), true);
});

test("relative path in the plans folder", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "plans/brief-3.md" } }), true);
});

test("a plans folder outside the project does not count", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "/other/plans/a.md" } }), false);
});

test("a nested folder named plans does not count", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "/x/src/plans/a.md" } }), false);
});

test("a folder that only starts with plans does not count", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "/x/plans-old/a.md" } }), false);
});

test("a dot dot path that leaves the plans folder does not count", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "plans/../src/a.ts" } }), false);
});

test("notebook edit uses notebook_path", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { notebook_path: "/x/plans/a.ipynb" } }), true);
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { notebook_path: "/x/src/a.ipynb" } }), false);
});

test("normal edit", () => {
  assert.equal(isPlanEdit({ cwd: "/x", tool_input: { file_path: "/x/src/a.ts" } }), false);
});

test("no file path", () => {
  assert.equal(isPlanEdit({ cwd: "/x" }), false);
});

test("reminder names the guide path from env", () => {
  assert.ok(buildReminder({ settings: { CLAUDE_HOOKS_PLANNING_GUIDE_PATH: "/guides/planning.md" } }).includes("/guides/planning.md"));
});

test("tilde in the guide path expands to the home folder", () => {
  const reminder = buildReminder({ settings: { CLAUDE_HOOKS_PLANNING_GUIDE_PATH: "~/guides/planning.md" } });
  assert.ok(reminder.includes(`${homedir()}/guides/planning.md`));
  assert.ok(!reminder.includes("~"));
});
