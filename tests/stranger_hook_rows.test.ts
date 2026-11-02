import assert from "node:assert/strict";
import { test } from "node:test";
import { CLARIFY_ROW, SESSION_ONE_ROWS, SESSION_TWO_ROWS } from "./stranger_hook_rows.ts";

test("session one has rows 4 to 8 in order", () => {
  assert.deepEqual(SESSION_ONE_ROWS.map((row) => row[0]), [4, 5, 6, 7, 8]);
});

test("session two has rows 12 and 13 and the clarify row is row 11", () => {
  assert.deepEqual(SESSION_TWO_ROWS.map((row) => row[0]), [12, 13]);
  assert.equal(CLARIFY_ROW[0], 11);
});
