import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ESLINT_BIN = resolve(import.meta.dirname, "..", "node_modules", ".bin", "eslint");
const ESLINT_CONFIG = resolve(import.meta.dirname, "eslint.config.js");

export type DebtLimits = { maxFileLines: number; debtTarget: number; fixBatchSize: number };

export type FileDebt = { file: string; current: number; lines: number[]; reformatted: boolean; lineCount: number; missingTest: boolean };

function countEslintMessages(args: string[], cwd: string, input?: string): { count: number; lines: number[] } {
  const result = spawnSync(ESLINT_BIN, ["--config", ESLINT_CONFIG, ...args], { cwd, encoding: "utf8", input });
  if (result.error)
    throw result.error;
  const report = JSON.parse(result.stdout);
  const lines: number[] = [];
  for (let i = 0; i < report.length; i++) {
    const messages = report[i].messages;
    for (let j = 0; j < messages.length; j++) {
      lines.push(messages[j].line);
    }
  }
  return { count: lines.length, lines };
}

export function computeDebt(filePath: string): FileDebt | undefined {
  const realFilePath = realpathSync(filePath);
  const dir = dirname(realFilePath);
  const gitRoot = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (gitRoot.error)
    throw gitRoot.error;
  const isOutsideGitRepo = gitRoot.status !== 0;
  if (isOutsideGitRepo)
    return undefined;
  const repoRoot = gitRoot.stdout.trim();
  const beforeFix = readFileSync(realFilePath, "utf8");
  spawnSync(ESLINT_BIN, ["--config", ESLINT_CONFIG, "--fix", realFilePath], { cwd: repoRoot, encoding: "utf8" });
  const afterFix = readFileSync(realFilePath, "utf8");
  const reformatted = beforeFix !== afterFix;
  const result = countEslintMessages(["--format", "json", realFilePath], repoRoot);
  const lineCount = afterFix.trimEnd().split("\n").length;
  const baseName = basename(realFilePath, ".ts");
  const testFileCandidates = [`${dir}/${baseName}.test.ts`, `${repoRoot}/tests/${baseName}.test.ts`, `${repoRoot}/tests/test-${baseName}.ts`];
  let hasTestFile = false;
  for (let i = 0; i < testFileCandidates.length; i++) {
    const candidateExists = existsSync(testFileCandidates[i]);
    if (candidateExists)
      hasTestFile = true;
  }
  const isDeclarationFile = realFilePath.endsWith(".d.ts");
  const missingTest = !hasTestFile && !isDeclarationFile;
  const current = result.count + (missingTest ? 1 : 0);
  return { file: filePath, current, lines: result.lines, reformatted, lineCount, missingTest };
}

export function blockReason(
  debts: FileDebt[],
  newTotal: number,
  savedTotal: number | undefined,
  reformattedFiles: string[],
  limits: DebtLimits,
): string | undefined {
  const { maxFileLines, debtTarget, fixBatchSize } = limits;
  const oversizedFiles: string[] = [];
  for (let i = 0; i < debts.length; i++) {
    const isOversized = debts[i].lineCount > maxFileLines;
    if (isOversized)
      oversizedFiles.push(`${debts[i].file} (${debts[i].lineCount} lines)`);
  }
  const hasOversizedFiles = oversizedFiles.length > 0;
  const isFirstSighting = savedTotal === undefined;
  const isStyleDebtStuck = newTotal > debtTarget && (isFirstSighting || newTotal >= savedTotal);
  const shouldBlock = hasOversizedFiles || isStyleDebtStuck;
  if (!shouldBlock)
    return undefined;
  const reasonLines: string[] = [];
  if (hasOversizedFiles)
    reasonLines.push(
      `These files exceed the hard limit of ${maxFileLines} lines: ${oversizedFiles.join(", ")}. Split each one into separate files of ${maxFileLines} lines or fewer. No exceptions.`,
    );
  if (!isStyleDebtStuck)
    return reasonLines.join("\n");
  const target = isFirstSighting ? newTotal : savedTotal;
  const requiredTotal = Math.max(target - fixBatchSize, debtTarget);
  const hasReformattedFiles = reformattedFiles.length > 0;
  if (hasReformattedFiles)
    reasonLines.push(
      `This hook reformatted these files to the house layout: ${reformattedFiles.join(", ")}. Do not revert that reformatting.`,
    );
  reasonLines.push(
    `Style debt is ${newTotal} and must drop to ${requiredTotal} or fewer. Spawn a subagent to fix up to ${fixBatchSize} flagged spots. Rewrite array calls as a \`for()\` loop with named booleans. Rename functions to include a verb from \`FUNCTION_VERBS\` in \`${ESLINT_CONFIG}\`. If you already spawned a subagent that edited the flagged file, relaunch that same subagent with \`SendMessage\`. Then stop again.`,
  );
  const filesWithoutTest: string[] = [];
  for (let i = 0; i < debts.length; i++) {
    if (debts[i].missingTest)
      filesWithoutTest.push(debts[i].file);
  }
  const hasFilesWithoutTest = filesWithoutTest.length > 0;
  if (hasFilesWithoutTest)
    reasonLines.push(`These files have no test file: ${filesWithoutTest.join(", ")}. Write a test file next to each one.`);
  for (let i = 0; i < debts.length; i++) {
    const debt = debts[i];
    const hasFlaggedLines = debt.lines.length > 0;
    if (!hasFlaggedLines)
      continue;
    const sedAddresses: string[] = [];
    for (let j = 0; j < debt.lines.length; j++) {
      sedAddresses.push(`${debt.lines[j]}p`);
    }
    reasonLines.push(`${debt.file}: lines ${debt.lines.join(",")}  show: nl -ba '${debt.file}' | sed -n '${sedAddresses.join(";")}'`);
  }
  return reasonLines.join("\n");
}
