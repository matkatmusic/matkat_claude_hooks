#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { FileDebt } from "./debt-compute.ts";
import { ARRAY_DEBT_DIR, DEBT_LIMITS, STYLISTIC_ESLINT_CONFIG, setUpRepo, writeTranscript, executeHook } from "./debt-ratchet-test-helpers.ts";

const { computeDebt, blockReason } = await import("./debt-compute.ts");

test("computeDebt on a repo with no eslint.config.js and no node_modules returns a numeric count", () => {
  const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-noconfig-`);
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
  writeFileSync(`${dir}/subject.ts`, "export function getNums() { return [1, 2, 3].map((n) => n + 1); }\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
  const debt = computeDebt(`${dir}/subject.ts`);
  assert.equal(typeof debt?.current, "number");
});

test("computeDebt outside dotfiles is not ignored by the eslint base path: real findings", () => {
  const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-basepath-`);
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
  writeFileSync(`${dir}/subject.ts`, "const a = 1; const b = 2;\n");
  writeFileSync(`${dir}/subject.test.ts`, "export const check = 1;\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
  const debt = computeDebt(`${dir}/subject.ts`);
  assert.equal(debt?.current, 1);
  assert.deepEqual(debt?.lines, [1]);
});

test("computeDebt does not count eslint's ignored-file warning for a .test.ts file", () => {
  const repo = setUpRepo("export const value = 1;\n");
  const debt = computeDebt(`${repo}/subject.test.ts`);
  assert.deepEqual(debt?.lines, []);
});

test("a source file with no test file is flagged missingTest and costs 1 more debt point", () => {
  // Steps: a repo has a source file and no test file. Compute debt: missingTest is true.
  const repo = setUpRepo("export const value = 1;\n");
  rmSync(`${repo}/subject.test.ts`);
  const withoutTest =computeDebt(`${repo}/subject.ts`);
  assert.equal(withoutTest?.missingTest, true);
  // Add subject.test.ts next to it. Compute debt: missingTest is false and the debt is 1 lower.
  writeFileSync(`${repo}/subject.test.ts`, "export const check = 1;\n");
  const withTest = computeDebt(`${repo}/subject.ts`);
  assert.equal(withTest?.missingTest, false);
  assert.equal(withTest?.current, (withoutTest?.current ?? 0) - 1);
});

test("a tests/<name>.test.ts file at the repo root counts as the test file", () => {
  const repo = setUpRepo("export const value = 1;\n");
  rmSync(`${repo}/subject.test.ts`);
  mkdirSync(`${repo}/tests`);
  writeFileSync(`${repo}/tests/subject.test.ts`, "export const check = 1;\n");
  assert.equal(computeDebt(`${repo}/subject.ts`)?.missingTest, false);
});

test("a tests/test-<name>.ts file at the repo root counts as the test file", () => {
  const repo = setUpRepo("export const value = 1;\n");
  rmSync(`${repo}/subject.test.ts`);
  mkdirSync(`${repo}/tests`);
  writeFileSync(`${repo}/tests/test-subject.ts`, "export const check = 1;\n");
  assert.equal(computeDebt(`${repo}/subject.ts`)?.missingTest, false);
});

test("a .d.ts file is never flagged missingTest", () => {
  const repo = setUpRepo("export const value = 1;\n");
  writeFileSync(`${repo}/types.d.ts`, "export type Value = number;\n");
  assert.equal(computeDebt(`${repo}/types.d.ts`)?.missingTest, false);
});

test("eslint --fix runs: fixable brace-style debt is fixed in place, and the reformat is announced", () => {
  const dotfilesRoot = resolve(import.meta.dirname, "..");
  const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-stylistic-`);
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
  symlinkSync(`${dotfilesRoot}/node_modules`, `${dir}/node_modules`);
  writeFileSync(`${dir}/eslint.config.js`, STYLISTIC_ESLINT_CONFIG);
  const headSource =
    "export function computeValue(x) {\n  if (x > 0) {\n    return 1;\n  }\n  else {\n    return 2;\n  }\n}\n";
  writeFileSync(`${dir}/subject.ts`, headSource);
  writeFileSync(`${dir}/subject.test.ts`, "export const check = 1;\n");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });

  const cuddledSource =
    "export function computeValue(x) {\n  if (x > 0) {\n    return 1;\n  } else {\n    return 2;\n  }\n}\n";
  writeFileSync(`${dir}/subject.ts`, cuddledSource);

  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${dir}/subject.ts`);
  const output = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(output, /"additionalContext"/);
  assert.match(output, /This hook reformatted these files to the house layout/);
  assert.match(output, /subject\.ts/);
  const fixedOnDisk = readFileSync(`${dir}/subject.ts`, "utf8");
  assert.match(fixedOnDisk, /\}\s*\n\s*else\s*\{/);
  assert.equal(existsSync(ledgerPath), false);
  rmSync(ledgerPath, { force: true });
});

test("blockReason does not block a file over the line limit that has 9 flagged items", () => {
  const longFile: FileDebt = { file: "/x/long.ts", current: 9, lines: [1], reformatted: false, lineCount: 151, missingTest: false };
  const limits = { ...DEBT_LIMITS, debtTarget: 100 };
  assert.equal(blockReason([longFile], 9, undefined, [], limits), undefined);
});

test("blockReason blocks a file over the line limit that has 10 flagged items", () => {
  const longFile: FileDebt = { file: "/x/long.ts", current: 10, lines: [1], reformatted: false, lineCount: 151, missingTest: false };
  const limits = { ...DEBT_LIMITS, debtTarget: 100 };
  assert.match(blockReason([longFile], 10, undefined, [], limits) ?? "", /exceed the hard limit of 150 lines: \/x\/long\.ts \(151 lines\)/);
});
