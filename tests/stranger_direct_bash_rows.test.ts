import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateBlockBashEdits } from "./stranger_direct_bash_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

test("validateBlockBashEdits passes on the repo's own block-bash-edits hook", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-bash-"));
  const context = { ...createContext(bed, bed), clone: path.resolve(import.meta.dirname, "..") };
  const result = validateBlockBashEdits(context);
  assert.equal(result.number, 16);
  assert.equal(result.ok, true);
});
