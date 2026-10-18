import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { validateIdleReaderSubfolder } from "./stranger_direct_state_rows.ts";
import { createContext } from "./stranger_direct_support.ts";

const REPO = path.resolve(import.meta.dirname, "..");

function isCopiedPath(source: string): boolean {
  const name = path.basename(source);
  const isSkipped = name === "node_modules" || name === ".git" || name === ".env" || name === "tests";
  return !isSkipped;
}

test("validateIdleReaderSubfolder passes on a copy of the repo with the idle-state window", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-state-"));
  const clone = path.join(bed, "claude_hooks");
  cpSync(REPO, clone, { recursive: true, filter: isCopiedPath });
  writeFileSync(path.join(clone, ".env"), "CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS=86400000\n");
  const context = { ...createContext(bed, bed), clone };
  const result = validateIdleReaderSubfolder(context);
  assert.equal(result.number, 39);
  assert.equal(result.ok, true);
});
