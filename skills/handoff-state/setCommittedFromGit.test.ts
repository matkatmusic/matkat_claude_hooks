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

const SESSION_ID = "abcdef12-0000-0000-0000-000000000000";

function writeTranscript(lines: object[]): void {
  const home = mkdtempSync(`${tmpdir()}/handoff-state-home-`);
  mkdirSync(`${home}/.claude/projects/some-project`, { recursive: true });
  writeFileSync(`${home}/.claude/projects/some-project/${SESSION_ID}.jsonl`, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  process.env.HOME = home;
}

function createProject(): string {
  const root = mkdtempSync(`${tmpdir()}/handoff-state-`);
  createRepo(root);
  writeAndCommitFile(root, "a.ts");
  mkdirSync(`${root}/.idleState`);
  writeTranscript([]);
  return root;
}

function writeStateFile(root: string, files: string[]): string {
  const path = `${root}/.idleState/2026-11-05-1000-abcdef12.json`;
  writeFileSync(path, JSON.stringify({ version: 2, sessionId: SESSION_ID, done: [{ item: "the work", files, isCommitted: false }] }));
  return path;
}

function createToolUseLine(id: string, name: string, input: object): object {
  return { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] } };
}

function createToolResultLine(id: string, content: string | object[], isError?: boolean): object {
  return { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: isError }] } };
}

function readState(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
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
  writeFileSync(path, JSON.stringify({ version: 2, sessionId: SESSION_ID, done: [{ item: "the work", isCommitted: true }] }));
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

function setsOutsideRepoFileToFalseWithError() {
  // a file outside any git repository gives false and an error
  const root = createProject();
  const outsideFolder = mkdtempSync(`${tmpdir()}/handoff-state-outside-`);
  const outsideFile = `${outsideFolder}/plan.md`;
  writeFileSync(outsideFile, "plan\n");
  const path = writeStateFile(root, [outsideFile]);
  setCommittedFromGit(path);
  const doneItem = JSON.parse(readFileSync(path, "utf8")).done[0];
  assert.equal(doneItem.isCommitted, false);
  assert.equal(doneItem.error, "file is outside a git repository");
}

function keepsVersion() {
  // the written file keeps its version key
  const root = createProject();
  const path = writeStateFile(root, ["a.ts"]);
  setCommittedFromGit(path);
  assert.equal(JSON.parse(readFileSync(path, "utf8")).version, 2);
}

function setsCreatedTasksFromTranscript() {
  // TaskCreate results (string or text-block content) name the task numbers: listed once each, first-seen order
  const root = createProject();
  writeTranscript([
    createToolUseLine("t1", "TaskCreate", { subject: "a" }),
    createToolResultLine("t1", "Task #508 created successfully: a"),
    createToolUseLine("t2", "TaskCreate", { subject: "b" }),
    createToolResultLine("t2", [{ type: "text", text: "Task #507 created successfully: b" }]),
    createToolUseLine("t3", "TaskCreate", { subject: "a" }),
    createToolResultLine("t3", "Task #508 created successfully: a"),
    createToolUseLine("t4", "TaskUpdate", { taskId: "9", status: "completed" }),
    createToolResultLine("t4", "Updated task #9 status"),
  ]);
  const path = writeStateFile(root, []);
  setCommittedFromGit(path);
  assert.deepEqual(readState(path).createdTasks, [508, 507]);
}

function setsFinishedTasksFromTranscript() {
  // only completed and deleted TaskUpdate calls count, once each, even for a task this chat did not create
  const root = createProject();
  writeTranscript([
    createToolUseLine("u1", "TaskUpdate", { taskId: "12", status: "in_progress" }),
    createToolResultLine("u1", "Updated task #12 status"),
    createToolUseLine("u2", "TaskUpdate", { taskId: "12", status: "completed" }),
    createToolResultLine("u2", "Updated task #12 status"),
    createToolUseLine("u3", "TaskUpdate", { taskId: "3", status: "deleted" }),
    createToolResultLine("u3", "Updated task #3 deleted"),
    createToolUseLine("u4", "TaskUpdate", { taskId: "12", status: "completed" }),
    createToolResultLine("u4", "Updated task #12 status"),
    createToolUseLine("u5", "TaskUpdate", { taskId: "77", status: "completed" }),
    createToolResultLine("u5", "Task not found", true),
  ]);
  const path = writeStateFile(root, []);
  setCommittedFromGit(path);
  assert.deepEqual(readState(path).finishedTasks, [12, 3]);
}

function setsEmptyTaskListsWhenTranscriptHasNoTaskCalls() {
  // the agent's own createdTasks and finishedTasks values are overwritten by the chat log
  const root = createProject();
  const path = writeStateFile(root, []);
  writeFileSync(path, JSON.stringify({ ...readState(path), createdTasks: [1], finishedTasks: [2] }));
  setCommittedFromGit(path);
  assert.deepEqual(readState(path).createdTasks, []);
  assert.deepEqual(readState(path).finishedTasks, []);
}

function throwsWhenTranscriptIsMissing() {
  // no transcript file for the session id: the script throws
  const root = createProject();
  const path = writeStateFile(root, []);
  process.env.HOME = mkdtempSync(`${tmpdir()}/handoff-state-empty-home-`);
  mkdirSync(`${process.env.HOME}/.claude/projects`, { recursive: true });
  assert.throws(() => setCommittedFromGit(path), /transcript/);
}

test("sets isCommitted to true when git committed the file", setsCommittedFileToTrue);
test("sets createdTasks from the TaskCreate results in the chat log", setsCreatedTasksFromTranscript);
test("sets finishedTasks from the completed and deleted TaskUpdate calls in the chat log", setsFinishedTasksFromTranscript);
test("sets empty task lists when the chat log has no task calls", setsEmptyTaskListsWhenTranscriptHasNoTaskCalls);
test("throws when the chat log file is missing", throwsWhenTranscriptIsMissing);
test("sets isCommitted to false when a file is changed", setsChangedFileToFalse);
test("sets isCommitted to false when a file is staged but not committed", setsStagedFileToFalse);
test("sets isCommitted to true for an item with no files", setsEmptyFilesToTrue);
test("sets isCommitted to false and adds an error for an item with no files key", setsMissingFilesToFalseWithError);
test("adds no error for an item with an empty files list", addsNoErrorForEmptyFiles);
test("checks a nested repo file in its own repo",checksNestedRepoFileInItsOwnRepo);
test("sets isCommitted to false and adds an error for a file outside a git repository", setsOutsideRepoFileToFalseWithError);
test("keeps the version key", keepsVersion);
