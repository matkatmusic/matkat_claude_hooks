#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
// One JSON file per session holds every hook's per-session state.

export type Sitting = {
  start: number;
  turns: number;
  end: number | "";
  tokensIn: number;
  tokensOut: number;
};

export type SessionState = {
  sittings?: Sitting[];
  ambiguity?: { count: number; lastFired: number };
  ponytailUltraInvoked?: boolean;
  idleStateFiles?: string[];
};

export function getSessionStatePath(transcriptPathOrSessionId: string, stateDir: string): string {
  const sessionId = basename(transcriptPathOrSessionId).replace(/\.jsonl$/, "");
  return `${stateDir}/${sessionId}.json`;
}

export function readSessionState(path: string): SessionState {
  const stateFileExists = existsSync(path);
  if (!stateFileExists)
    return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

// ponytail: no lock; hooks run one by one.
export function writeSessionState(path: string, state: SessionState): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(state));
  renameSync(temporaryPath, path);
}
