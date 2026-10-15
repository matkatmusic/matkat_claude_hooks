import { test } from "node:test";
import { strict as assert } from "node:assert";
import { checkTaskListId } from "./task-list-id.ts";

test("id unset: returns a message naming the variable", () => {
  assert.ok(checkTaskListId(undefined)?.includes("CLAUDE_CODE_TASK_LIST_ID"));
});

test("id empty: returns a message", () => {
  assert.ok(checkTaskListId(""));
});

test("id set: returns undefined", () => {
  assert.equal(checkTaskListId("my-project"), undefined);
});
