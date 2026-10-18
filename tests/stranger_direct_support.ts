// Shared helpers for the direct stranger rows: run a hook script in the bed clone with crafted stdin.
import { spawnSync } from "node:child_process";
import { mkdirSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

export interface DirectContext {
  clone: string;
  config: string;
  direct: string;
  nodeModules: string;
}

export interface DirectResult {
  number: number;
  hook: string;
  ok: boolean;
  evidence: string;
}

export interface HookRun {
  status: number;
  stdout: string;
  stderr: string;
}

const CLEARED_NAMES = /^(CLAUDE_HOOKS_|CLAUDE_CODE_)|^(CLAUDECODE|CLAUDE_PID|CLAUDE_EFFORT)$/;

export function createContext(bed: string, config: string): DirectContext {
  const direct = path.join(bed, "direct");
  mkdirSync(direct, { recursive: true });
  return { clone: path.join(bed, "claude_hooks"), config, direct, nodeModules: path.join(bed, "project", "node_modules") };
}

export function buildResult(number: number, hook: string, ok: boolean, evidence: string): DirectResult {
  return { number, hook, ok, evidence };
}

export function formatFlag(flag: boolean): string {
  return flag ? "yes" : "no";
}

export function buildHookEnv(context: DirectContext, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(process.env)) {
    const isCleared = CLEARED_NAMES.test(key);
    if (!isCleared)
      env[key] = process.env[key];
  }
  env.CLAUDE_HOOKS_SESSION_STATE_DIR = path.join(context.direct, "state");
  env.CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR = path.join(context.direct, "array-debt");
  env.CLAUDE_HOOKS_BLOCKED_EDITS_DIR = path.join(context.direct, "blocked-edits");
  env.CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR = path.join(context.direct, "npm-test-logs");
  env.CLAUDE_HOOKS_TASKS_DIR = path.join(context.direct, "tasks");
  return { ...env, ...extra };
}

export function executeHook(context: DirectContext, script: string, input: object | string, cwd: string, extraEnv: Record<string, string> = {}): HookRun {
  const stdin = typeof input === "string" ? input : JSON.stringify(input);
  const result = spawnSync("node", [path.join(context.clone, script)], { input: stdin, cwd, env: buildHookEnv(context, extraEnv), encoding: "utf8" });
  if (result.error)
    throw result.error;
  if (result.status === null)
    throw new Error(`${script} ended by signal ${result.signal}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function executeCommand(command: string[], cwd: string): void {
  const result = spawnSync(command[0], command.slice(1), { cwd, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`command failed: ${command.join(" ")}\n${result.stderr}`);
}

export function isHookDenied(run: HookRun): boolean {
  return run.stdout.includes('"permissionDecision":"deny"');
}

export function readDenyReason(run: HookRun): string {
  return JSON.parse(run.stdout).hookSpecificOutput.permissionDecisionReason;
}

export function isHookBlocked(run: HookRun): boolean {
  return run.stdout.includes('"decision":"block"');
}

export function readBlockReason(run: HookRun): string {
  return JSON.parse(run.stdout).reason;
}

export function writeJsonLines(file: string, entries: object[]): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const lines: string[] = [];
  for (const entry of entries)
    lines.push(JSON.stringify(entry));
  writeFileSync(file, lines.join("\n") + "\n");
}

export function writeFiles(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(files))
    writeFileSync(path.join(dir, name), files[name]);
}

export function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

export function createTypeScriptProject(context: DirectContext, name: string, files: Record<string, string>): string {
  const dir = path.join(context.direct, name);
  const tsconfig = { compilerOptions: { strict: true, noEmit: true, target: "es2022", module: "nodenext" }, include: ["*.ts", "*.tsx"] };
  writeFiles(dir, { ...files, "package.json": '{"name":"direct","type":"module"}\n', "tsconfig.json": JSON.stringify(tsconfig) });
  const linkPath = path.join(dir, "node_modules");
  const hasLink = existsSync(linkPath);
  if (!hasLink)
    symlinkSync(context.nodeModules, linkPath);
  return dir;
}
