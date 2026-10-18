import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("matches whole words only", () => {
  assert.ok(!isStartingWork("I am restarting once the cache clears."));
  assert.ok(!isStartingWork("The things to doctor are listed."));
  assert.ok(isStartingWork("Okay, starting on it."));
});

test("ignores phrases inside quotes or backticks", () => {
  assert.ok(!isStartingWork('The phrase "starting with" is a trigger word.'));
  assert.ok(!isStartingWork("The phrase `starting with` is a trigger word."));
  assert.ok(!isStartingWork("The phrase “starting with” is a trigger word."));
  assert.ok(isStartingWork('He said "hello". Starting with the parser.'));
});

function runHook(input: object): string {
  const result = spawnSync("node", [new URL("./nudge-task-list.ts", import.meta.url).pathname], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_CODE_TASK_LIST_ID: "test" },
  });
  return result.stdout;
}

test("blocks the first stop and lets the second stop pass", () => {
  const message = "Starting on the parser now.";
  assert.ok(runHook({ last_assistant_message: message }).includes('"block"'));
  assert.equal(runHook({ last_assistant_message: message, stop_hook_active: true }), "");
});

test("adds the missing-id note and setup help only when CLAUDE_CODE_TASK_LIST_ID is unset", () => {
  assert.equal(getReason("dotfiles", "help"), NUDGE);
  assert.ok(getReason(undefined, "help").startsWith(NUDGE + NO_ID_NOTE));
  assert.ok(getReason(undefined, "help").endsWith("\nhelp"));
});
