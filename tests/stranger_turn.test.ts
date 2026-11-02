import assert from "node:assert/strict";
import { test } from "node:test";
import { executeFullTurn, executePromptOnlyTurn, executeTurn, validateSessionModel } from "./stranger_turn.ts";

test("the turn runners take a session and a prompt", () => {
  assert.equal(executeFullTurn.length, 2);
  assert.equal(executePromptOnlyTurn.length, 2);
});

test("executeTurn takes an optional watch regex and validateSessionModel takes a prefix", () => {
  assert.equal(executeTurn.length, 3);
  assert.equal(validateSessionModel.length, 2);
});
