import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FILLER_FILES } from "./stranger_constants.ts";
import { readWarningLevel, writeFillerFiles } from "./stranger_context_screen.ts";

test("readWarningLevel reads the percent from the context-exit line and returns null without one", () => {
  assert.equal(readWarningLevel("x\ncontext-exit: context is above 50%\ny"), 50);
  assert.equal(readWarningLevel("above 50% but not the right line"), null);
});

test("writeFillerFiles writes one file per filler file", () => {
  const project = mkdtempSync(path.join(tmpdir(), "stranger-filler-"));
  writeFillerFiles(project);
  assert.equal(readdirSync(project).length, FILLER_FILES);
});
