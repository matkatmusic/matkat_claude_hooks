#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { setUpRepo } from "./debtRatchetTestHelpers.ts";

function runReport(repo: string): string {
  const run = spawnSync("bun", [`${import.meta.dirname}/debtRatchetReport.ts`], { cwd: repo, encoding: "utf8" });
  return run.stdout.trim();
}

test("report on a repo with a clean .ts file prints the no-debt line", () => {
  const repo = setUpRepo("export const value = 1;\n");
  const output = runReport(repo);
  assert.match(output, /^No style debt found across the repo\.\nDebt log written: /);
  rmSync(readDebtLog(output).logPath);
});

test("report on a repo with a flagged .ts file names that file under the Style debt line", () => {
  const repo = setUpRepo("const a = 1; const b = 2;\n");
  const output = runReport(repo);
  assert.match(output, /Style debt exists: 1 flagged line\(s\) across 1 file\(s\)/);
  assert.match(output, /subject\.ts: lines 1 /);
  rmSync(readDebtLog(output).logPath);
});

test("report on a repo with a flagged .css file names that file under the Style debt line", () => {
  // Steps: a repo has a clean .ts file and a committed .css file with one !important on line 2.
  const repo = setUpRepo("export const value = 1;\n");
  writeFileSync(`${repo}/style.css`, "a {\n  color: red !important;\n}\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add css"], { cwd: repo });
  // The report names the .css file with its flagged line.
  const output = runReport(repo);
  assert.match(output, /Style debt exists: 1 flagged line\(s\) across 1 file\(s\)/);
  assert.match(output, /style\.css: lines 2 /);
  rmSync(readDebtLog(output).logPath);
});

function readDebtLog(output: string): { logPath: string; log: any } {
  const match = output.match(/^Debt log written: (.+)$/m);
  assert.ok(match, `no "Debt log written:" line in output: ${output}`);
  const logPath = match[1];
  assert.ok(existsSync(logPath));
  const log = JSON.parse(readFileSync(logPath, "utf8"));
  return { logPath, log };
}

test("test_report_writes_repo_debt_log_with_eslint_lines", () => {
  // Steps: a repo has a committed subject.ts with one flagged line.
  const repo = setUpRepo("const a = 1; const b = 2;\n");
  const subjectPath = realpathSync(`${repo}/subject.ts`);
  // The report prints the path of the debt log it wrote.
  const { logPath, log } = readDebtLog(runReport(repo));
  // The log counts debt for the flagged file, the total is the sum of the files, and the details hold the eslint lines.
  assert.ok(log.files[subjectPath] > 0);
  let sum = 0;
  for (const file of Object.keys(log.files))
    sum += log.files[file];
  assert.equal(log.total, sum);
  assert.ok(log.details[subjectPath].eslintLines.length > 0);
  rmSync(logPath);
});

test("test_report_logs_new_file_that_git_does_not_track_yet", () => {
  // Steps: a repo has one committed clean file and a new flagged .ts file that was never git added.
  const repo = setUpRepo("export const value = 1;\n");
  writeFileSync(`${repo}/untracked.ts`, "const a = 1; const b = 2;\n");
  const untrackedPath = realpathSync(`${repo}/untracked.ts`);
  // The log counts debt for the untracked file.
  const { logPath, log } = readDebtLog(runReport(repo));
  assert.ok(log.files[untrackedPath] > 0);
  rmSync(logPath);
});

test("test_report_skips_file_that_gitignore_lists", () => {
  // Steps: a repo commits only a .gitignore that lists ignored.ts, and ignored.ts has a flagged line.
  const repo = setUpRepo("export const value = 1;\n");
  writeFileSync(`${repo}/.gitignore`, "ignored.ts\n");
  writeFileSync(`${repo}/ignored.ts`, "const a = 1; const b = 2;\n");
  spawnSync("git", ["add", ".gitignore"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add gitignore"], { cwd: repo });
  const ignoredPath = realpathSync(`${repo}/ignored.ts`);
  // The log has no entry for the ignored file.
  const { logPath, log } = readDebtLog(runReport(repo));
  assert.equal(log.files[ignoredPath], undefined);
  rmSync(logPath);
});

function addSubmoduleToRepo(repo: string): void {
  const subRepo = setUpRepo("const a = 1; const b = 2;\n");
  const add = spawnSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", subRepo, "sub"], { cwd: repo, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  spawnSync("git", ["commit", "-m", "add submodule"], { cwd: repo });
}

test("test_report_scans_tracked_file_inside_submodule", () => {
  // Steps: a main repo has a clean file and a submodule "sub" whose committed subject.ts has one flagged line.
  const repo = setUpRepo("export const value = 1;\n");
  addSubmoduleToRepo(repo);
  // The report names the flagged file inside the submodule.
  const output = runReport(repo);
  assert.match(output, /sub\/subject\.ts: lines 1 /);
  rmSync(readDebtLog(output).logPath);
});

test("test_report_scans_untracked_file_inside_submodule", () => {
  // Steps: a main repo has a submodule "sub" with a clean file, and a new flagged file that git does not track yet.
  const repo = setUpRepo("export const value = 1;\n");
  addSubmoduleToRepo(repo);
  writeFileSync(`${repo}/sub/untracked.ts`, "const a = 1; const b = 2;\n");
  // The report names the untracked file inside the submodule.
  const output = runReport(repo);
  assert.match(output, /sub\/untracked\.ts: lines 1 /);
  rmSync(readDebtLog(output).logPath);
});

test("test_report_names_file_over_line_limit", () => {
  // Steps: a repo has a clean 160 line subject.ts and a matching subject.test.ts, so it has no style debt.
  let longSource = "";
  for (let i = 0; i < 160; i++)
    longSource += `export const value${i} = ${i};\n`;
  const repo = setUpRepo(longSource);
  // The report names the file in a line that states the 150 line limit.
  const output = runReport(repo);
  assert.match(output, /Files over the 150-line limit: .*subject\.ts/);
  assert.doesNotMatch(output, /No style debt found/);
  rmSync(readDebtLog(output).logPath);
});

test("test_report_logs_line_of_comment_with_20_or_more_words", () => {
  // Steps: a repo has a .ts file with a 25 word comment on line 1 and clean code after it.
  const longComment = `// ${"word ".repeat(25).trim()}\n`;
  const repo = setUpRepo(`${longComment}export const value = 1;\n`);
  const subjectPath = realpathSync(`${repo}/subject.ts`);
  // The log names line 1 as a long comment line.
  const { logPath, log } = readDebtLog(runReport(repo));
  assert.deepEqual(log.details[subjectPath].longCommentLines, [1]);
  rmSync(logPath);
});
