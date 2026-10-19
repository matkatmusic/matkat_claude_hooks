#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { computeDebt } from "./debt-compute.ts";
import { filterUniqueNonTestTsFiles } from "../shared/debt-files.ts";
// On-demand, non-blocking debt report: unlike the Stop hook, never blocks the turn.

if (import.meta.main) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), encoding: "utf8" });
  if (gitRoot.error)
    throw gitRoot.error;
  const repoRoot = gitRoot.stdout.trim();

  const lsFiles = spawnSync("git", ["ls-files", "*.ts"], { cwd: repoRoot, encoding: "utf8" });
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
  const files = filterUniqueNonTestTsFiles(absolutePaths);

  const debtLines: string[] = [];
  let total = 0;
  let fileCount = 0;
  for (let i = 0; i < files.length; i++) {
    const debt = computeDebt(files[i]);
    const hasDebt = debt !== undefined && debt.current > 0;
    if (!hasDebt)
      continue;
    fileCount++;
    total += debt.current;
    const sedAddresses: string[] = [];
    for (let j = 0; j < debt.lines.length; j++)
      sedAddresses.push(`${debt.lines[j]}p`);
    debtLines.push(`${debt.file}: lines ${debt.lines.join(",")}  show: nl -ba '${debt.file}' | sed -n '${sedAddresses.join(";")}'`);
  }

  if (total === 0) {
    console.log("No style debt found across the repo.");
  }
  else {
    console.log(`Style debt exists: ${total} flagged line(s) across ${fileCount} file(s). Not urgent, address when convenient.`);
    console.log(debtLines.join("\n"));
  }
}
