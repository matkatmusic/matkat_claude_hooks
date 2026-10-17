#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { setDebtRatchetEnv, setUpRepo } from "./debt-ratchet-test-helpers.ts";

setDebtRatchetEnv();

function runReport(repo: string): string {
  const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet-report.ts`], { cwd: repo, encoding: "utf8" });
  return run.stdout.trim();
}

test("report on a repo with a clean .ts file prints the no-debt line", () => {
  const repo = setUpRepo("export const value = 1;\n");
  assert.equal(runReport(repo), "No style debt found across the repo.");
});

test("report on a repo with a flagged .ts file names that file under the Style debt line", () => {
  const repo = setUpRepo("const a = 1; const b = 2;\n");
  const output = runReport(repo);
  assert.match(output, /Style debt exists: 1 flagged line\(s\) across 1 file\(s\)/);
  assert.match(output, /subject\.ts: lines 1 /);
});
