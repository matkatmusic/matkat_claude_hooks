#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { setUpRepo } from "./debtRatchetTestHelpers.ts";

const COUNT_START_PRELOAD = 'require("node:fs").appendFileSync(process.env.LINT_START_COUNT_FILE, "x\\n");\n';

function countLintStartsDuringReport(repo: string): number {
  const countDir = mkdtempSync(`${tmpdir()}/lint-start-count-`);
  const preloadPath = `${countDir}/countStart.cjs`;
  const countPath = `${countDir}/starts.log`;
  writeFileSync(preloadPath, COUNT_START_PRELOAD);
  writeFileSync(countPath, "");
  const env = { ...process.env, NODE_OPTIONS: `--require ${preloadPath}`, LINT_START_COUNT_FILE: countPath };
  const run = spawnSync("bun", [`${import.meta.dirname}/debtRatchetReport.ts`], { cwd: repo, encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  const startCount = readFileSync(countPath, "utf8").split("\n").length - 1;
  rmSync(countDir, { recursive: true });
  return startCount;
}

test("test_computeDebtForFiles_returns_undefined_for_a_file_outside_a_git_repo", async () => {
  // Steps: a folder that is not in a git repo holds one .ts file.
  const folder = mkdtempSync(`${tmpdir()}/not-a-repo-`);
  writeFileSync(`${folder}/subject.ts`, "export function getValue(): number {\n  return 1;\n}\n");
  // The batch function returns undefined for that file, like computeDebt does.
  const { computeDebtForFiles } = await import("./debtCompute.ts");
  assert.deepEqual(computeDebtForFiles([`${folder}/subject.ts`]), [undefined]);
});

test("test_report_starts_the_lint_program_twice_for_a_repo_with_many_files", () => {
  // Steps: a repo has a clean subject.ts, its test file, and 5 more .ts files that are not committed yet.
  const repo = setUpRepo("export function getValue(): number {\n  return 1;\n}\n");
  for (let i = 0; i < 5; i++)
    writeFileSync(`${repo}/extra${i}.ts`, "export function getValue(input: any): number {\n  return 1;\n}\n");
  // The report starts the lint program 2 times: one --fix run for all files and one --format json run for all files.
  assert.equal(countLintStartsDuringReport(repo), 2);
});
