import assert from "node:assert/strict";
import { test } from "node:test";
import { executeChainRows, executeSubagentStopRows } from "./strangerChain.ts";

test("the chain row runners take rows, a session and a bed", () => {
  assert.equal(executeChainRows.length, 3);
  assert.equal(executeSubagentStopRows.length, 3);
});
