#!/usr/bin/env node
// Writes one merged state file, moves the state files it replaces to .idleState/archive, and deletes archive files older than 7 days.
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function formatTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function buildStamp(now: Date): string {
  const date = `${now.getFullYear()}-${formatTwoDigits(now.getMonth() + 1)}-${formatTwoDigits(now.getDate())}`;
  return `${date}-${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
}

export function writeMerged(root: string, input: any, now: Date): void {
  const folder = join(root, ".idleState");
  const archive = join(folder, "archive");
  const state = {
    not_done: input.not_done,
    nextSteps: { actions: input.actions, questions: input.questions },
    traps: { rules: input.rules, mistakes: input.mistakes },
  };
  writeFileSync(join(folder, `${buildStamp(now)}-merged.json`), JSON.stringify(state, null, 2));
  mkdirSync(archive, { recursive: true });
  for (const name of input.files) {
    renameSync(join(folder, `${name}.json`), join(archive, `${name}.json`));
  }
  for (const name of readdirSync(archive)) {
    const isOld = now.getTime() - statSync(join(archive, name)).mtimeMs > SEVEN_DAYS_MS;
    if (isOld)
      unlinkSync(join(archive, name));
  }
}

if (import.meta.main)
  writeMerged(process.cwd(), JSON.parse(readFileSync(process.argv[2], "utf8")), new Date());
