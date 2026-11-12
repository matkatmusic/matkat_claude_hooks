#!/usr/bin/env node
// Sets isCommitted on each done item of <root>/.idleState/<file>.json from git, then writes the file back.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

function getTranscriptPath(sessionId: string): string {
  const projectsFolder = `${homedir()}/.claude/projects`;
  const transcriptPaths: string[] = [];
  for (const projectFolderName of readdirSync(projectsFolder)) {
    const candidatePath = `${projectsFolder}/${projectFolderName}/${sessionId}.jsonl`;
    if (existsSync(candidatePath))
      transcriptPaths.push(candidatePath);
  }
  if (transcriptPaths.length !== 1)
    throw new Error(`expected one transcript for session ${sessionId}, found ${transcriptPaths.length}`);
  return transcriptPaths[0]!;
}

function getToolResultText(content: any): string {
  if (typeof content === "string")
    return content;
  let text = "";
  for (const block of content)
    text += block.text;
  return text;
}

function setTaskNumbersFromTranscript(state: any): void {
  const transcriptText = readFileSync(getTranscriptPath(state.sessionId), "utf8");
  const toolUses: any[] = [];
  const toolResultsById = new Map<string, any>();
  for (const line of transcriptText.split("\n")) {
    if (line === "")
      continue;
    const entry = JSON.parse(line);
    if (entry.type === "assistant") {
      for (const block of entry.message.content) {
        if (block.type === "tool_use")
          toolUses.push(block);
      }
    }
    if (entry.type === "user") {
      for (const block of entry.message.content) {
        if (block.type === "tool_result")
          toolResultsById.set(block.tool_use_id, block);
      }
    }
  }
  const createdTasks: number[] = [];
  const finishedTasks: number[] = [];
  for (const toolUse of toolUses) {
    const toolResult = toolResultsById.get(toolUse.id);
    if (toolResult === undefined)
      continue;
    if (toolResult.is_error)
      continue;
    if (toolUse.name === "TaskCreate") {
      const resultText = getToolResultText(toolResult.content);
      const createdMatch = resultText.match(/^Task #(\d+) created successfully/);
      if (createdMatch === null)
        throw new Error(`TaskCreate result has no task number: ${resultText}`);
      const taskNumber = Number(createdMatch[1]);
      if (!createdTasks.includes(taskNumber))
        createdTasks.push(taskNumber);
    }
    if (toolUse.name === "TaskUpdate") {
      let isFinishing = toolUse.input.status === "completed";
      if (toolUse.input.status === "deleted")
        isFinishing = true;
      if (isFinishing) {
        const taskNumber = Number(toolUse.input.taskId);
        if (!finishedTasks.includes(taskNumber))
          finishedTasks.push(taskNumber);
      }
    }
  }
  state.createdTasks = createdTasks;
  state.finishedTasks = finishedTasks;
}

export function setCommittedFromGit(statePath: string): void {
  const root = dirname(dirname(resolve(statePath)));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  for (const doneItem of state.done)
    setDoneItemCommittedFromGit(root, doneItem);
  setTaskNumbersFromTranscript(state);
  writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

if (import.meta.main)
  setCommittedFromGit(process.argv[2]);
