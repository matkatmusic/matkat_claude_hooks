import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SpawnSyncReturns } from "node:child_process";

const IGNORE_LINE = ".claude_hooks/";

export type HookFailureEntry = {
  root: string;
  hookName: string;
  sessionId: string;
  event: string;
  result: SpawnSyncReturns<string>;
};

function getFailureKindAndMessage(result: SpawnSyncReturns<string>): { kind: string; message: string } | undefined {
  if (result.error)
    return { kind: "spawn-error", message: result.error.message };
  if (result.status === null)
    return { kind: "timeout", message: String(result.signal) };
  const isOkOrBlockExit = result.status === 0 || result.status === 2;
  if (isOkOrBlockExit)
    return undefined;
  return { kind: "exit-code", message: `exit ${result.status}: ${result.stderr.trim()}` };
}

function addIgnoreLineWhenGitExists(root: string): void {
  const hasGitFolder = existsSync(`${root}/.git`);
  if (!hasGitFolder)
    return;
  const ignorePath = `${root}/.gitignore`;
  let ignoreText = "";
  const ignoreFileExists = existsSync(ignorePath);
  if (ignoreFileExists)
    ignoreText = readFileSync(ignorePath, "utf8");
  const ignoreLines = ignoreText.split("\n");
  const hasIgnoreLine = ignoreLines.includes(IGNORE_LINE);
  if (hasIgnoreLine)
    return;
  const needsNewline = ignoreText !== "" && !ignoreText.endsWith("\n");
  const separator = needsNewline ? "\n" : "";
  writeFileSync(ignorePath, `${ignoreText}${separator}${IGNORE_LINE}\n`);
}

export type DispatchedHookEntry = {
  root: string;
  hookName: string;
  sessionId: string;
  event: string;
  input: unknown;
  result: SpawnSyncReturns<string>;
};

function buildDispatchedHookLine(entry: DispatchedHookEntry): object {
  return {
    time: new Date().toISOString(),
    source: entry.hookName,
    event: entry.event,
    kind: "dispatched-hook",
    input: entry.input,
    stdout: entry.result.stdout,
    stderr: entry.result.stderr,
    status: entry.result.status,
    signal: entry.result.signal,
    error: entry.result.error?.message,
  };
}

export function logDispatchedHook(entry: DispatchedHookEntry): void {
  const debugFolder = `${entry.root}/.claude_hooks/debug`;
  mkdirSync(debugFolder, { recursive: true });
  const line = buildDispatchedHookLine(entry);
  appendFileSync(`${debugFolder}/${entry.sessionId}.jsonl`, `${JSON.stringify(line)}\n`);
  addIgnoreLineWhenGitExists(entry.root);
}

export function logHookFailure(entry: HookFailureEntry): void {
  const failure = getFailureKindAndMessage(entry.result);
  if (failure === undefined)
    return;
  const isoTime = new Date().toISOString();
  const logFolder = `${entry.root}/.claude_hooks/logs/${isoTime.slice(0, 10)}`;
  mkdirSync(logFolder, { recursive: true });
  const oneLineMessage = failure.message.replaceAll("\n", " ");
  appendFileSync(`${logFolder}/${entry.hookName}.log`, `${isoTime} session=${entry.sessionId} event=${entry.event} ${failure.kind}: ${oneLineMessage}\n`);
  addIgnoreLineWhenGitExists(entry.root);
}
