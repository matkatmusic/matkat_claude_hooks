#!/usr/bin/env node
// Splits the debt log files into files to split first (one at a time) and files to fix after (in parallel).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { isLongFileWithEnoughDebt } from "../../debt-ratchet/debt-compute.ts";

const SPLIT_MIN_FILE_DEBT = 0;

export type DebtLog = {
  files: { [path: string]: number };
  total: number;
  details: {
    [path: string]: { eslintLines: number[]; longCommentLines: number[]; lineCount: number; missingTest: boolean };
  };
};

export function orderDebtFixes(log: DebtLog, maxFileLines: number): { splitFiles: string[]; fixFiles: string[] } {
  const splitFiles: string[] = [];
  const fixFiles: string[] = [];
  const paths = Object.keys(log.files);
  for (const path of paths) {
    const isOverLineLimit = isLongFileWithEnoughDebt(log.details[path].lineCount, log.files[path], maxFileLines, SPLIT_MIN_FILE_DEBT);
    if (isOverLineLimit) {
      splitFiles.push(path);
      continue;
    }
    const hasDebt = log.files[path] > 0;
    if (hasDebt)
      fixFiles.push(path);
  }
  return { splitFiles, fixFiles };
}

if (import.meta.main) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" });
  if (gitRoot.error)
    throw gitRoot.error;
  const repoRoot = gitRoot.stdout.trim();
  const values = getValues(readSettings(DISPATCHER_DIR), "debt-ratchet");
  const logPath = `${values.CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR}/repo-${basename(repoRoot)}.json`;
  const maxFileLines = Number(values.CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES);
  const log: DebtLog = JSON.parse(readFileSync(logPath, "utf8"));
  const { splitFiles, fixFiles } = orderDebtFixes(log, maxFileLines);
  console.log(JSON.stringify({ logPath, maxFileLines, splitFiles, fixFiles }, null, 2));
}
