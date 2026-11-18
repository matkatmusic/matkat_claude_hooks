import assert from "node:assert/strict";
import { test } from "node:test";
import { executeContextExitRow } from "./strangerContextExit.ts";

test("executeContextExitRow takes rows, a session and a bed", () => {
  assert.equal(executeContextExitRow.length, 3);
});
