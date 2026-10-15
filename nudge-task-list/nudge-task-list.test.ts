import { test } from "node:test";
import assert from "node:assert/strict";
import { isStartingWork, NUDGE, NO_ID_NOTE, getReason } from "./nudge-task-list.ts";

test("matches replies that announce work is starting", () => {
  assert.ok(isStartingWork("There are 4 things to do here."));
  assert.ok(isStartingWork("Starting on the parser now."));
  assert.ok(isStartingWork("starting with the hook file"));
  assert.ok(isStartingWork("Registering the hook, then fanning out three subagents."));
});

test("ignores ordinary replies", () => {
  assert.ok(!isStartingWork("Done. Tests pass."));
  assert.ok(!isStartingWork("The build is starting up slowly."));
});

test("adds the missing-id note and setup help only when CLAUDE_CODE_TASK_LIST_ID is unset", () => {
  assert.equal(getReason("dotfiles", "help"), NUDGE);
  assert.ok(getReason(undefined, "help").startsWith(NUDGE + NO_ID_NOTE));
  assert.ok(getReason(undefined, "help").endsWith("\nhelp"));
});
