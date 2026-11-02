import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function executeCommand(command: string[], cwd?: string, env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`command failed with status ${result.status}: ${command.join(" ")}`);
  }
}

export function wrapShellWord(text: string): string {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

export function findSnippet(text: string, needle: string): string | undefined {
  const index = text.indexOf(needle);
  if (index === -1) {
    return undefined;
  }
  return text.slice(Math.max(0, index - 30), index + needle.length + 70);
}

export function formatOneLine(text: string): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  return words.join(" ");
}

export function listFilesWithSuffix(directory: string, suffix: string): string[] {
  const files: string[] = [];
  const directoryExists = existsSync(directory);
  if (!directoryExists) {
    return files;
  }
  for (const entry of readdirSync(directory)) {
    const hasSuffix = entry.endsWith(suffix);
    if (hasSuffix) {
      files.push(path.join(directory, entry));
    }
  }
  return files;
}

export function readRefreshInterval(file: string, key: string): number {
  return JSON.parse(readFileSync(file, "utf8"))[key].refreshInterval;
}

export function getTmuxPane(): string {
  const pane = process.env.TMUX_PANE;
  if (pane === undefined) {
    throw new Error("TMUX_PANE is not set");
  }
  return pane;
}
