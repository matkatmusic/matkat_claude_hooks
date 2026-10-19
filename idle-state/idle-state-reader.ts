#!/usr/bin/env node
// First prompt only: hands the model the recent .idleState files; skips when the prompt runs catch-up.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { getSetting } from "../shared/settings.ts";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";

const IDLE_STATE_FOLDER_NAME = ".idleState";

export function findIdleStateFolder(cwd: string): string {
  let dir = cwd;
  while (true) {
    const candidate = `${dir}/${IDLE_STATE_FOLDER_NAME}`;
    const hasCandidate = existsSync(candidate);
    if (hasCandidate)
      return candidate;
    const isRepoRoot = existsSync(`${dir}/.git`);
    const parent = dirname(dir);
    const isFilesystemRoot = parent === dir;
    const isSearchEnd = isRepoRoot || isFilesystemRoot;
    if (isSearchEnd)
      return `${cwd}/${IDLE_STATE_FOLDER_NAME}`;
    dir = parent;
  }
}

export function findRecentStateFiles(folder: string, nowMs: number, windowMs: number): string[] {
  const hasFolder = existsSync(folder);
  if (!hasFolder)
    return [];
  const paths: string[] = [];
  for (const name of readdirSync(folder).sort()) {
    const isJsonFile = name.endsWith(".json");
    if (!isJsonFile)
      continue;
    const path = `${folder}/${name}`;
    const isRecent = nowMs - statSync(path).mtimeMs < windowMs;
    if (isRecent)
      paths.push(path);
  }
  return paths;
}

export function buildStateContext(folder: string, nowMs: number, windowMs: number): string {
  const paths = findRecentStateFiles(folder, nowMs, windowMs);
  if (paths.length === 0)
    return "";
  const text = `Tell me about the recent work written in the state files ${paths.join(", ")}`;
  return text;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const statePath = getSessionStatePath(input.transcript_path, getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR"));
  const state = readSessionState(statePath);
  const isLaterPrompt = state.idleStateFiles !== undefined;
  if (isLaterPrompt)
    process.exit(0);
  const firstWord = input.prompt.trim().split(/\s+/)[0];
  const isCatchUpPrompt = firstWord === "/catch-up" || firstWord === "/matkat-hooks:catch-up";
  if (isCatchUpPrompt) {
    state.idleStateFiles = [];
    writeSessionState(statePath, state);
    process.exit(0);
  }
  const folder = findIdleStateFolder(input.cwd);
  const windowMs = Number(getSetting(input, "CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS"));
  const paths = findRecentStateFiles(folder, Date.now(), windowMs);
  state.idleStateFiles = paths;
  writeSessionState(statePath, state);
  const context = buildStateContext(folder, Date.now(), windowMs);
  if (context !== "")
    console.log(context);
}
