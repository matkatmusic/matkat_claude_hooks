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

test("a .css file with one !important is flagged on that line and never flagged missingTest", () => {
  // Steps: a repo has a .css file whose line 2 has one !important.
  const repo = setUpRepo("export const value = 1;\n");
  writeFileSync(`${repo}/style.css`, "a {\n  color: red !important;\n}\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add css"], { cwd: repo });
  // Compute debt: current is 1, lines holds line 2, missingTest is false.
  const debt = computeDebt(`${repo}/style.css`);
  assert.equal(debt?.current, 1);
  assert.deepEqual(debt?.lines, [2]);
  assert.equal(debt?.missingTest, false);
});

const CLEAN_PAGE_HEAD = ["<!DOCTYPE html>", '<html lang="en">', "<head>", '  <meta charset="utf-8">', "  <title>Test</title>"];
const CLEAN_PAGE_TAIL = ["</head>", "<body>", "  <h1>Hi</h1>", "</body>", "</html>"];

test("a clean .html page with an inline <style> and an inline <script> is flagged once for each", () => {
  // Steps: a repo page head has an inline style on line 6, an inline script on line 7.
  const repo = setUpRepo("export const value = 1;\n");
  const pageLines = [...CLEAN_PAGE_HEAD, "  <style>body { margin: 0; }</style>", "  <script>const a = 1;</script>", ...CLEAN_PAGE_TAIL];
  writeFileSync(`${repo}/page.html`, `${pageLines.join("\n")}\n`);
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add html"], { cwd: repo });
  // Compute debt: both blocks are flagged and missingTest is false.
  const debt = computeDebt(`${repo}/page.html`);
  assert.deepEqual(debt?.lines, [6, 7]);
  assert.equal(debt?.current, 2);
  assert.equal(debt?.missingTest, false);
});

test("a clean .html page that only uses <script src> and <link rel=stylesheet> has no debt", () => {
  // Steps: a repo has a complete page that loads its code and style from separate files.
  const repo = setUpRepo("export const value = 1;\n");
  const pageLines = [...CLEAN_PAGE_HEAD, '  <link rel="stylesheet" href="page.css">', '  <script src="page.js"></script>', ...CLEAN_PAGE_TAIL];
  writeFileSync(`${repo}/page.html`, `${pageLines.join("\n")}\n`);
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add html"], { cwd: repo });
  // Compute debt: current is 0 and missingTest is false.
  const debt = computeDebt(`${repo}/page.html`);
  assert.deepEqual(debt?.lines, []);
  assert.equal(debt?.current, 0);
  assert.equal(debt?.missingTest, false);
});

test("an .html element nested deeper than 8 levels is flagged", () => {
  // Steps: a repo page has 7 nested divs in body, so the 7th div is at depth 9.
  const repo = setUpRepo("export const value = 1;\n");
  const divOpens = "<div>".repeat(7);
  const divCloses = "</div>".repeat(7);
  const pageLines = [...CLEAN_PAGE_HEAD, "</head>", "<body>", "<h1>Hi</h1>", `${divOpens}${divCloses}`, "</body>", "</html>"];
  writeFileSync(`${repo}/page.html`, `${pageLines.join("\n")}\n`);
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add html"], { cwd: repo });
  // Compute debt: exactly one flag, on the line that holds the divs.
  const debt = computeDebt(`${repo}/page.html`);
  assert.deepEqual(debt?.lines, [CLEAN_PAGE_HEAD.length + 4]);
  assert.equal(debt?.current, 1);
});

test("blockReason names the eslint config on the flagged-lines entry of an .html debt and not of a .ts debt", () => {
  // Steps: two files each have a flagged line and enough debt to block.
  const htmlFile: FileDebt = { file: "/x/page.html", current: 10, lines: [3], reformatted: false, lineCount: 10, missingTest: false };
  const tsFile: FileDebt = { file: "/x/long.ts", current: 10, lines: [4], reformatted: false, lineCount: 10, missingTest: false };
  const reason = blockReason([htmlFile, tsFile], 20, undefined, [], DEBT_LIMITS) ?? "";
  const eslintConfigPath = resolve(import.meta.dirname, "eslint.config.js");
  // The entry for each file is the output line that starts with the file name.
  const reasonLines = reason.split("\n");
  let htmlEntry = "";
  let tsEntry = "";
  for (let i = 0; i < reasonLines.length; i++) {
    if (reasonLines[i].startsWith("/x/page.html:"))
      htmlEntry = reasonLines[i];
    if (reasonLines[i].startsWith("/x/long.ts:"))
      tsEntry = reasonLines[i];
  }
  // The .html entry holds the config path and the .ts entry does not.
  assert.notEqual(htmlEntry, "");
  assert.notEqual(tsEntry, "");
  assert.ok(htmlEntry.includes(eslintConfigPath));
  assert.ok(!tsEntry.includes(eslintConfigPath));
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
