import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateTaskListIdName } from "./stranger_direct_parent_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

test("validateTaskListIdName passes on the repo's own check-task-list-id hook", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-parent-"));
  const context = { ...createContext(bed, bed), clone: path.resolve(import.meta.dirname, "..") };
  const result = validateTaskListIdName(context);
  assert.equal(result.number, 23);
  assert.equal(result.ok, true);
});
