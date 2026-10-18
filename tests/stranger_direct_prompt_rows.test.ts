import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validatePonytailSkillCall } from "./stranger_direct_prompt_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

test("validatePonytailSkillCall passes on the repo's own ponytail-ultra-nudge hook", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-prompt-"));
  const context = { ...createContext(bed, bed), clone: path.resolve(import.meta.dirname, "..") };
  const result = validatePonytailSkillCall(context);
  assert.equal(result.number, 28);
  assert.equal(result.ok, true);
});
