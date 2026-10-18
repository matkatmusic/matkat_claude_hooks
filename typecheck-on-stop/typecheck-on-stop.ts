#!/usr/bin/env node
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { findEditedFilePaths, findSubagentEditedFilePaths } from "../shared/debt-transcript.ts";
import { readEnvValue } from "../shared/env.ts";
import { getSessionStatePath } from "../shared/session-state.ts";
// Stop/SubagentStop: blocks the stop while tsc reports type errors in TypeScript files edited this turn.

const typeScriptExtensions = [".ts", ".tsx", ".mts", ".cts"];
const maxBlocksInARow = 3;

function isTypeScriptFile(path: string): boolean {
  for (let i = 0; i < typeScriptExtensions.length; i++) {
    const hasExtension = path.endsWith(typeScriptExtensions[i]);
    if (hasExtension)
      return true;
  }
  return false;
}

function readErrorFilePath(errorLine: string, cwd: string): string | undefined {
  const isGlobalError = errorLine.startsWith("error TS");
  if (isGlobalError)
    return undefined;
  const messageStart = errorLine.indexOf(": error TS");
  const pathEnd = errorLine.lastIndexOf("(", messageStart);
  return resolve(cwd, errorLine.slice(0, pathEnd));
}

function readBlockCountPath(stateKeyPath: string): string {
  return getSessionStatePath(`typecheck-blocks-${basename(stateKeyPath)}`);
}

function readBlockCount(countPath: string): number {
  const hasCountFile = existsSync(countPath);
  if (!hasCountFile)
    return 0;
  return Number(readFileSync(countPath, "utf8"));
}

function writeBlockCount(countPath: string, count: number): void {
  mkdirSync(dirname(countPath), { recursive: true });
  writeFileSync(countPath, String(count));
}

function printStopResult(result: object): void {
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  const maxErrorLines = Number(readEnvValue("CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES"));
  const input = JSON.parse(readFileSync(0, "utf8"));
  const hasTsconfig = existsSync(`${input.cwd}/tsconfig.json`);
  if (!hasTsconfig)
    process.exit(0);
  const isSubagentTranscript = typeof input.agent_transcript_path === "string";
  let files: string[];
  if (isSubagentTranscript) {
    const agentTranscript = readFileSync(input.agent_transcript_path, "utf8");
    files = findEditedFilePaths(agentTranscript).files;
  }
  else {
    const transcript = readFileSync(input.transcript_path, "utf8");
    const turn = findEditedFilePaths(transcript);
    files = turn.files;
    const turnStartTimestamp = turn.turnStartTimestamp;
    const hasTurnStart = turnStartTimestamp !== undefined;
    if (hasTurnStart) {
      const transcriptDir = dirname(input.transcript_path);
      const sessionId = basename(input.transcript_path, ".jsonl");
      const subagentsDir = join(transcriptDir, sessionId, "subagents");
      const subagentFiles = findSubagentEditedFilePaths(subagentsDir, turnStartTimestamp);
      for (let i = 0; i < subagentFiles.length; i++)
        files.push(subagentFiles[i]);
    }
  }

  const editedTypeScriptFiles = new Set<string>();
  for (let i = 0; i < files.length; i++) {
    const isTypeScript = isTypeScriptFile(files[i]);
    if (isTypeScript)
      editedTypeScriptFiles.add(resolve(input.cwd, files[i]));
  }
  const editedNothingTypeScript = editedTypeScriptFiles.size === 0;
  if (editedNothingTypeScript)
    process.exit(0);

  const stateKeyPath = isSubagentTranscript ? input.agent_transcript_path : input.transcript_path;
  const countPath = readBlockCountPath(stateKeyPath);

  const run = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false", "-p", "."], { cwd: input.cwd, encoding: "utf8" });
  if (run.error)
    throw run.error;

  const outputLines = run.stdout.split("\n");
  const editedFileErrors: string[] = [];
  const otherFileErrors: string[] = [];
  for (let i = 0; i < outputLines.length; i++) {
    const isErrorLine = outputLines[i].includes("error TS");
    if (!isErrorLine)
      continue;
    const errorFilePath = readErrorFilePath(outputLines[i], input.cwd);
    const isOtherFile = errorFilePath !== undefined && !editedTypeScriptFiles.has(errorFilePath);
    if (isOtherFile)
      otherFileErrors.push(outputLines[i]);
    else
      editedFileErrors.push(outputLines[i]);
  }

  const totalErrors = editedFileErrors.length + otherFileErrors.length;
  const tscFailedToStart = run.status !== 0 && totalErrors === 0;
  const summaryLine = `tsc found ${totalErrors} errors: ${editedFileErrors.length} in files edited this turn, ${otherFileErrors.length} in other files.`;
  const otherNote = `Errors in files you did not edit (note only, do not fix):\n${otherFileErrors.slice(0, maxErrorLines).join("\n")}`;

  const hasEditedFileErrors = editedFileErrors.length > 0;
  const mustBlock = hasEditedFileErrors || tscFailedToStart;
  if (!mustBlock) {
    writeBlockCount(countPath, 0);
    const hasOtherFileErrors = otherFileErrors.length > 0;
    if (hasOtherFileErrors)
      printStopResult({ systemMessage: `${summaryLine}\n${otherNote}` });
    process.exit(0);
  }

  let reason = `Type errors remain in files you edited. Fix every error below before you stop.\n${summaryLine}\n${editedFileErrors.slice(0, maxErrorLines).join("\n")}`;
  const hasOtherFileErrors = otherFileErrors.length > 0;
  if (hasOtherFileErrors)
    reason += `\n${otherNote}`;
  if (tscFailedToStart)
    reason = `TSC FAILED TO START. Exit status ${run.status}. The type check did not run.\nstderr:\n${run.stderr}\nstdout:\n${run.stdout}`;

  const blocksSoFar = readBlockCount(countPath);
  const blockLimitReached = blocksSoFar >= maxBlocksInARow;
  if (blockLimitReached) {
    printStopResult({ systemMessage: `The hook already blocked ${blocksSoFar} times and now lets the stop pass. Last result:\n${reason}` });
    process.exit(0);
  }
  writeBlockCount(countPath, blocksSoFar + 1);
  printStopResult({ decision: "block", reason });
}
