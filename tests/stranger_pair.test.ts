import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { executeOffOnPair, removePromptFiles } from "./stranger_pair.ts";

test("removePromptFiles deletes the files the prompts make and ignores missing ones", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "stranger-pair-"));
  mkdirSync(path.join(bed, "project"));
  writeFileSync(path.join(bed, "project", "bad.ts"), "x");
  removePromptFiles(bed);
  assert.equal(existsSync(path.join(bed, "project", "bad.ts")), false);
});

test("executeOffOnPair takes rows, a session, a bed, a hook row and a turn runner", () => {
  assert.equal(executeOffOnPair.length, 5);
});
