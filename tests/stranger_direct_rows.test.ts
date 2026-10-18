import assert from "node:assert/strict";
import { test } from "node:test";
import { executeDirectRows } from "./stranger_direct_rows.ts";

test("executeDirectRows takes a bed and a config folder and returns a promise", () => {
  assert.equal(typeof executeDirectRows, "function");
  assert.equal(executeDirectRows.length, 2);
});
