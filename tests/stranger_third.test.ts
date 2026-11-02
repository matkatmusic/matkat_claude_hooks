import assert from "node:assert/strict";
import { test } from "node:test";
import { executeParentFilesRow, executeThirdSession } from "./stranger_third.ts";

test("executeThirdSession takes the second session, its state files and the exit flag", () => {
  assert.equal(executeThirdSession.length, 6);
});

test("executeParentFilesRow takes rows, a session and a bed", () => {
  assert.equal(executeParentFilesRow.length, 3);
});
