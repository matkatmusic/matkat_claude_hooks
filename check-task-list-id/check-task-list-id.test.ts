#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

const scriptPath = `${import.meta.dirname}/check-task-list-id.ts`;

function runHook(taskListId: string | undefined) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_TASK_LIST_ID;
  if (taskListId !== undefined)
    env.CLAUDE_CODE_TASK_LIST_ID = taskListId;
  return spawnSync("node", [scriptPath], { encoding: "utf8", env });
}

test("id unset: prints a systemMessage naming the variable", () => {
  const result = runHook(undefined);
  const output = JSON.parse(result.stdout);
  assert.ok(output.systemMessage.includes("CLAUDE_CODE_TASK_LIST_ID"));
});

test("id set: prints nothing", () => {
  const result = runHook("my-project");
  assert.equal(result.stdout, "");
});
