import assert from "node:assert/strict";
import { test } from "node:test";
import { executePonytailRows } from "./stranger_ponytail.ts";

test("executePonytailRows takes rows, a session and a bed", () => {
  assert.equal(executePonytailRows.length, 3);
});
