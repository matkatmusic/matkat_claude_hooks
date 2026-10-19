// Disabled: the fake-engine rows in stranger_direct_mod_rows.ts are replaced by live rows.
/*
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateContextExitMod } from "./stranger_direct_mod_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

test("validateContextExitMod passes on the repo's own context-exit mod", async () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-mod-"));
  const context = { ...createContext(bed, bed), clone: path.resolve(import.meta.dirname, "..") };
  const result = await validateContextExitMod(context);
  assert.equal(result.number, 41);
  assert.equal(result.ok, true);
});
*/
