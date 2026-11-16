#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { orderDebtFixes } from "./orderDebtFixes.ts";
import type { DebtLog } from "./orderDebtFixes.ts";

const MAX_FILE_LINES = 100;

function buildLog(lineCount: number, debtCount: number): DebtLog {
  return {
    files: { "a.ts": debtCount },
    total: debtCount,
    details: { "a.ts": { eslintLines: [], longCommentLines: [], lineCount, missingTest: false } },
  };
}

function putsFileOverLineLimitInSplitFilesOnly() {
  // The file has 101 lines and the limit is 100.
  const log = buildLog(MAX_FILE_LINES + 1, 3);
  // The file has debt, so it could also go in fixFiles.
  const result = orderDebtFixes(log, MAX_FILE_LINES);
  // The file must be in splitFiles and must not be in fixFiles.
  assert.deepEqual(result.splitFiles, ["a.ts"]);
  assert.deepEqual(result.fixFiles, []);
}

function putsShortFileWithDebtInFixFiles() {
  // The file has 100 lines (at the limit, not over) and 3 debt items.
  const log = buildLog(MAX_FILE_LINES, 3);
  const result = orderDebtFixes(log, MAX_FILE_LINES);
  // The file must be in fixFiles and must not be in splitFiles.
  assert.deepEqual(result.splitFiles, []);
  assert.deepEqual(result.fixFiles, ["a.ts"]);
}

function skipsShortFileWithZeroDebt() {
  // The file has 10 lines and 0 debt items.
  const log = buildLog(10, 0);
  const result = orderDebtFixes(log, MAX_FILE_LINES);
  // The file must be in neither list.
  assert.deepEqual(result.splitFiles, []);
  assert.deepEqual(result.fixFiles, []);
}

function putsFileOverLineLimitWithZeroDebtInSplitFiles() {
  // The file has 101 lines (over the limit of 100) and 0 debt items.
  const log = buildLog(MAX_FILE_LINES + 1, 0);
  const result = orderDebtFixes(log, MAX_FILE_LINES);
  // The file must be in splitFiles and must not be in fixFiles.
  assert.deepEqual(result.splitFiles, ["a.ts"]);
  assert.deepEqual(result.fixFiles, []);
}

test("test_orderDebtFixes_puts_file_over_line_limit_in_splitFiles_only", putsFileOverLineLimitInSplitFilesOnly);
test("test_orderDebtFixes_puts_file_over_line_limit_with_zero_debt_in_splitFiles", putsFileOverLineLimitWithZeroDebtInSplitFiles);
test("test_orderDebtFixes_puts_short_file_with_debt_in_fixFiles", putsShortFileWithDebtInFixFiles);
test("test_orderDebtFixes_skips_short_file_with_zero_debt", skipsShortFileWithZeroDebt);
