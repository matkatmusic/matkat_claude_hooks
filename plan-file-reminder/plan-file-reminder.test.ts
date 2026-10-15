#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";

process.env.CLAUDE_HOOKS_PLANNING_GUIDE_PATH = "/guides/planning.md";
const { isPlanEdit, buildReminder } = await import("./plan-file-reminder.ts");

test("plan mode", () => {
  assert.equal(isPlanEdit({ permission_mode: "plan", tool_input: { file_path: "/x/notes.md" } }), true);
});

test("plans folder", () => {
  assert.equal(isPlanEdit({ permission_mode: "default", tool_input: { file_path: "/x/plans/a.md" } }), true);
});

test("normal edit", () => {
  assert.equal(isPlanEdit({ permission_mode: "default", tool_input: { file_path: "/x/src/a.ts" } }), false);
});

test("no file path", () => {
  assert.equal(isPlanEdit({ permission_mode: "default" }), false);
});

test("reminder names the guide path from env", () => {
  assert.ok(buildReminder().includes("/guides/planning.md"));
});
