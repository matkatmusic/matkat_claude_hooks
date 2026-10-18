import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateStatusUnknownModel } from "./stranger_direct_status_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

test("validateStatusUnknownModel passes on the repo's own status line", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-status-"));
  const context = { ...createContext(bed, bed), clone: path.resolve(import.meta.dirname, "..") };
  const result = validateStatusUnknownModel(context);
  assert.equal(result.number, 30);
  assert.equal(result.ok, true);
});
