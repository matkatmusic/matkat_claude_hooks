#!/usr/bin/env node
// Sets isCommitted on each done item of <root>/.idleState/<file>.json from git, then writes the file back.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function getNearestExistingFolder(path: string): string {
  let folder = dirname(path);
  let hasFolder = existsSync(folder);
  while (!hasFolder) {
    folder = dirname(folder);
    hasFolder = existsSync(folder);
  }
  return folder;
}

function getFileCommitState(root: string, file: string): string {
  const path = resolve(root, file);
  const folder = getNearestExistingFolder(path);
  const status = spawnSync("git", ["-C", folder, "status", "--porcelain", "--", path], { encoding: "utf8" });
  if (status.status !== 0) {
    if (status.stderr.includes("not a git repository"))
      return "outside a git repository";
    throw new Error(`git status failed for ${path}: ${status.stderr}`);
  }
  if (status.stdout === "")
    return "committed";
  return "changed";
}

function setDoneItemCommittedFromGit(root: string, doneItem: any): void {
  const hasFilesKey = doneItem.files !== undefined;
  if (!hasFilesKey) {
    doneItem.isCommitted = false;
    doneItem.error = "no files in state reply from agent";
    return;
  }
  let isCommitted = true;
  for (const file of doneItem.files) {
    const fileCommitState = getFileCommitState(root, file);
    if (fileCommitState === "outside a git repository")
      doneItem.error = "file is outside a git repository";
    if (fileCommitState !== "committed")
      isCommitted = false;
  }
  doneItem.isCommitted = isCommitted;
}

export function setCommittedFromGit(statePath: string): void {
  const root = dirname(dirname(resolve(statePath)));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  for (const doneItem of state.done)
    setDoneItemCommittedFromGit(root, doneItem);
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

if (import.meta.main)
  setCommittedFromGit(process.argv[2]);
