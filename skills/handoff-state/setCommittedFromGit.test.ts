#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { setCommittedFromGit } from "./setCommittedFromGit.ts";

function executeGit(folder: string, args: string[]): void {
  const result = spawnSync("git", ["-C", folder, "-c", "user.name=test", "-c", "user.email=test@test", ...args], { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

function createRepo(folder: string): void {
  mkdirSync(folder, { recursive: true });
  executeGit(folder, ["init", "-q"]);
}

function writeAndCommitFile(repo: string, name: string): void {
  writeFileSync(`${repo}/${name}`, "committed\n");
  executeGit(repo, ["add", name]);
  executeGit(repo, ["commit", "-q", "-m", `add ${name}`]);
}

function createProject(): string {
  const root = mkdtempSync(`${tmpdir()}/handoff-state-`);
  createRepo(root);
  writeAndCommitFile(root, "a.ts");
  mkdirSync(`${root}/.idleState`);
  return root;
}

function writeStateFile(root: string, files: string[]): string {
  const path = `${root}/.idleState/2026-11-05-1000-abcdef12.json`;
  writeFileSync(path, JSON.stringify({ version: 2, done: [{ item: "the work", files, isCommitted: false }] }));
  return path;
}

function readIsCommitted(path: string): boolean {
  return JSON.parse(readFileSync(path, "utf8")).done[0].isCommitted;
}

function setsCommittedFileToTrue() {
  // the chat wrote false for a file that git committed: the script writes true
  const root = createProject();
  const path = writeStateFile(root, ["a.ts"]);
  setCommittedFromGit(path);
  assert.equal(readIsCommitted(path), true);
}

function setsChangedFileToFalse() {
  // a changed file that is not committed gives false
  const root = createProject();
  writeFileSync(`${root}/a.ts`, "changed\n");
  const path = writeStateFile(root, ["a.ts"]);
  setCommittedFromGit(path);
  assert.equal(readIsCommitted(path), false);
}

function setsStagedFileToFalse() {
  // a staged file that is not committed gives false
  const root = createProject();
  writeFileSync(`${root}/b.ts`, "staged\n");
  executeGit(root, ["add", "b.ts"]);
  const path = writeStateFile(root, ["a.ts", "b.ts"]);
  setCommittedFromGit(path);
  assert.equal(readIsCommitted(path), false);
}

function setsEmptyFilesToTrue() {
  // an item with no files gives true
  const root = createProject();
  const path = writeStateFile(root, []);
  setCommittedFromGit(path);
  assert.equal(readIsCommitted(path), true);
}

function setsMissingFilesToFalseWithError() {
  // an item with no files key gets false and an error
  const root = createProject();
  const path = `${root}/.idleState/2026-11-05-1000-abcdef12.json`;
  writeFileSync(path, JSON.stringify({ version: 2, done: [{ item: "the work", isCommitted: true }] }));
  setCommittedFromGit(path);
  const doneItem = JSON.parse(readFileSync(path, "utf8")).done[0];
  assert.equal(doneItem.isCommitted, false);
  assert.equal(doneItem.error, "no files in state reply from agent");
}

function addsNoErrorForEmptyFiles() {
  // an item with an empty files list gets no error key
  const root = createProject();
  const path = writeStateFile(root, []);
  setCommittedFromGit(path);
  assert.equal("error" in JSON.parse(readFileSync(path, "utf8")).done[0], false);
}

function checksNestedRepoFileInItsOwnRepo() {
  // a file committed in a nested repo, which the outer repo does not track, gives true
  const root = createProject();
  createRepo(`${root}/sub`);
  writeAndCommitFile(`${root}/sub`, "c.ts");
  const path = writeStateFile(root, ["sub/c.ts"]);
  setCommittedFromGit(path);
  assert.equal(readIsCommitted(path), true);
}

function keepsVersion() {
  // the written file keeps its version key
  const root = createProject();
  const path = writeStateFile(root, ["a.ts"]);
  setCommittedFromGit(path);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).version, 2);
}

test("sets isCommitted to true when git committed the file", setsCommittedFileToTrue);
test("sets isCommitted to false when a file is changed", setsChangedFileToFalse);
test("sets isCommitted to false when a file is staged but not committed", setsStagedFileToFalse);
test("sets isCommitted to true for an item with no files", setsEmptyFilesToTrue);
test("sets isCommitted to false and adds an error for an item with no files key", setsMissingFilesToFalseWithError);
test("adds no error for an item with an empty files list", addsNoErrorForEmptyFiles);
test("checks a nested repo file in its own repo",checksNestedRepoFileInItsOwnRepo);
test("keeps the version key", keepsVersion);
