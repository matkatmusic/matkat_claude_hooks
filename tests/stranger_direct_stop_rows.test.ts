import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateUnlistedSharedWords } from "./stranger_direct_stop_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

const REPO = path.resolve(import.meta.dirname, "..");

function isCopiedPath(source: string): boolean {
  const name = path.basename(source);
  const isSkipped = name === "node_modules" || name === ".git" || name === ".env" || name === "tests";
  return !isSkipped;
}

test("validateUnlistedSharedWords passes on a copy of the repo with the unlisted-items settings", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-stop-"));
  const clone = path.join(bed, "claude_hooks");
  cpSync(REPO, clone, { recursive: true, filter: isCopiedPath });
  writeFileSync(path.join(clone, ".env"), "CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS=2\nCLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH=5\n");
  const context = { ...createContext(bed, bed), clone };
  const result = validateUnlistedSharedWords(context);
  assert.equal(result.number, 37);
  assert.equal(result.ok, true);
});
