#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { buildLedger, computeDebt } from "./debt-compute.ts";
import { applyReflowToFile, listOverCapLines } from "../comment-length-limiter/reflowComments.ts";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { filterUniqueDebtCheckedFiles } from "../shared/debt-files.ts";
// On-demand, non-blocking debt report: unlike the Stop hook, never blocks the turn.

if (import.meta.main) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" });
  if (gitRoot.error)
    throw gitRoot.error;
  const repoRoot = gitRoot.stdout.trim();

  const lsFiles = spawnSync("git", ["ls-files", "*.ts", "*.html", "*.css"], { cwd: repoRoot, encoding: "utf8" });
  if (lsFiles.error)
    throw lsFiles.error;
  const lines = lsFiles.stdout.split("\n");
  const absolutePaths: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const isEmpty = lines[i].length === 0;
    if (isEmpty)
      continue;
    const absolutePath = resolve(repoRoot, lines[i]);
    const existsOnDisk = existsSync(absolutePath);
    if (!existsOnDisk)
      continue;
    absolutePaths.push(absolutePath);
  }
  const files = filterUniqueDebtCheckedFiles(absolutePaths);

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

  if (total === 0) {
    console.log("No style debt found across the repo.");
  }
  else {
    console.log(`Style debt exists: ${total} flagged line(s) across ${fileCount} file(s). Not urgent, address when convenient.`);
    console.log(debtLines.join("\n"));
  }
  console.log(`Debt log written: ${logPath}`);
}
