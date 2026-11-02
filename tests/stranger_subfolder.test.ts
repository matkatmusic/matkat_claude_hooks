import assert from "node:assert/strict";
import { test } from "node:test";
import { executeSubfolderSession } from "./stranger_subfolder.ts";

test("executeSubfolderSession takes rows, a bed and a config folder", () => {
  assert.equal(executeSubfolderSession.length, 3);
});
