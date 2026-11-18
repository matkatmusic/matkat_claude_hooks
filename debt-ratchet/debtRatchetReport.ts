#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildLedger, computeDebt, isLongFileWithEnoughDebt } from "./debtCompute.ts";
import { applyReflowToFile, listOverCapLines } from "../comment-length-limiter/reflowComments.ts";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { filterUniqueDebtCheckedFiles } from "../shared/debtFiles.ts";
// On-demand, non-blocking debt report: unlike the Stop hook, never blocks the turn.

if (import.meta.main) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" });
  if (gitRoot.error)
    throw gitRoot.error;
  const repoRoot = gitRoot.stdout.trim();

  const submoduleList = spawnSync("git", ["submodule", "foreach", "--quiet", "--recursive", "pwd"], { cwd: repoRoot, encoding: "utf8" });
  if (submoduleList.error)
    throw submoduleList.error;
  const scanRoots = [repoRoot];
  const submoduleLines = submoduleList.stdout.split("\n");
  for (let i = 0; i < submoduleLines.length; i++) {
    const isEmpty = submoduleLines[i].length === 0;
    if (isEmpty)
      continue;
    scanRoots.push(submoduleLines[i]);
  }

  const absolutePaths: string[] = [];
  for (let r = 0; r < scanRoots.length; r++) {
    const lsFiles = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.html", "*.css"], { cwd: scanRoots[r], encoding: "utf8" });
    if (lsFiles.error)
      throw lsFiles.error;
    const lines = lsFiles.stdout.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const isEmpty = lines[i].length === 0;
      if (isEmpty)
        continue;
      const absolutePath = resolve(scanRoots[r], lines[i]);
      const existsOnDisk = existsSync(absolutePath);
      if (!existsOnDisk)
        continue;
      absolutePaths.push(absolutePath);
    }
  }
  const files = filterUniqueDebtCheckedFiles(absolutePaths);

  const maxFileLines = Number(getValues(readSettings(DISPATCHER_DIR), "debt-ratchet").CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES);
  const overLimitFiles: string[] = [];
  const debtLines: string[] = [];
  const fileDebtCounts: Record<string, number> = {};
  const details: Record<string, { eslintLines: number[]; longCommentLines: number[]; lineCount: number; missingTest: boolean }> = {};
  let fileCount = 0;
  for (let i = 0; i < files.length; i++) {
    applyReflowToFile(files[i]);
    const debt = computeDebt(files[i]);
    if (debt === undefined)
      continue;
    const runs = applyReflowToFile(files[i]);
    const longCommentLines = listOverCapLines({ path: files[i], runs }).lines;
    fileDebtCounts[files[i]] = debt.current + longCommentLines.length;
    details[files[i]] = { eslintLines: debt.lines, longCommentLines, lineCount: debt.lineCount, missingTest: debt.missingTest };
    const isOverLineLimit = isLongFileWithEnoughDebt(debt.lineCount, fileDebtCounts[files[i]], maxFileLines, 0);
    if (isOverLineLimit)
      overLimitFiles.push(files[i]);
    const hasDebt = fileDebtCounts[files[i]] > 0;
    if (!hasDebt)
      continue;
    fileCount++;
    const printedLines = [...debt.lines, ...longCommentLines];
    const sedAddresses: string[] = [];
    for (let j = 0; j < printedLines.length; j++)
      sedAddresses.push(`${printedLines[j]}p`);
    debtLines.push(`${debt.file}: lines ${printedLines.join(",")}  show: nl -ba '${debt.file}' | sed -n '${sedAddresses.join(";")}'`);
  }

  const ledger = buildLedger(fileDebtCounts);
  const total = ledger.total;
  const logFolder = getValues(readSettings(DISPATCHER_DIR), "debt-ratchet").CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR;
  mkdirSync(logFolder, { recursive: true });
  const logPath = `${logFolder}/repo-${basename(repoRoot)}.json`;
  writeFileSync(logPath, JSON.stringify({ ...ledger, details }, null, 2));

  const hasOverLimitFiles = overLimitFiles.length > 0;
  if (total === 0) {
    if (!hasOverLimitFiles)
      console.log("No style debt found across the repo.");
  }
  else {
    console.log(`Style debt exists: ${total} flagged line(s) across ${fileCount} file(s). Not urgent, address when convenient.`);
    console.log(debtLines.join("\n"));
  }
  if (hasOverLimitFiles)
    console.log(`Files over the ${maxFileLines}-line limit: ${overLimitFiles.join(", ")}`);
  console.log(`Debt log written: ${logPath}`);
}
