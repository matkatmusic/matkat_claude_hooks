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

const badIds = ["x", "ab", "my project", "a/b/c", "../tasks", ".hidden", "..", "my\tproject", " "];
for (const badId of badIds) {
  test(`bad id ${JSON.stringify(badId)}: prints a systemMessage naming the variable`, () => {
    const result = runHook(badId);
    const output = JSON.parse(result.stdout);
    assert.ok(output.systemMessage.includes("CLAUDE_CODE_TASK_LIST_ID"));
  });
}

const goodIds = ["my-project", "abc", "proj_1.2", "3b1f2c9e-6a4d-4f7e-9d0a-1c2b3d4e5f60"];
for (const goodId of goodIds) {
  test(`good id ${JSON.stringify(goodId)}: prints nothing`, () => {
    assert.equal(runHook(goodId).stdout, "");
  });
}

test("id set: prints nothing", () => {
  const result = runHook("my-project");
  assert.equal(result.stdout, "");
});
