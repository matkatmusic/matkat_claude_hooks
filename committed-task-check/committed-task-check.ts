#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
import { buildSubjectListForStatus, findTaskFolder, writeBlockDecision } from "../shared/session-tasks.ts";
import { getSetting } from "../shared/settings.ts";
// Stop hook: after new commits, tell the agent to mark the matching open tasks completed.

const NO_PENDING_TASKS_LINE = "No pending tasks.";
const NO_IN_PROGRESS_TASKS_LINE = "No in progress tasks.";

// The next whole second, so a commit already reported is not reported again (git dates have whole seconds).
function getNextWholeSecond(): number {
    return Math.floor(Date.now() / 1000) + 1;
}

function findRepoFolder(cwd: string): string | undefined {
    const result = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (result.status !== 0)
        return undefined;
    return result.stdout.trim();
}

function listSubmodulePaths(repoFolder: string): string[] {
    const output = execFileSync("git", ["-C", repoFolder, "submodule", "foreach", "--quiet", "--recursive", "echo $displaypath"], { encoding: "utf8" });
    const submodulePaths: string[] = [];
    for (const line of output.split("\n")) {
        if (line === "")
            continue;
        submodulePaths.push(line);
    }
    return submodulePaths;
}

function listNewCommits(folder: string, sinceSeconds: number): string {
    return execFileSync("git", ["-C", folder, "log", "--all", `--since=@${sinceSeconds}`, "--name-only", "--format=commit %h %s"], { encoding: "utf8" }).trim();
}

function buildNewCommitsText(repoFolder: string, sinceSeconds: number): string {
    const sections: string[] = [];
    const repoCommits = listNewCommits(repoFolder, sinceSeconds);
    if (repoCommits !== "")
        sections.push(repoCommits);
    for (const submodulePath of listSubmodulePaths(repoFolder)) {
        const submoduleCommits = listNewCommits(`${repoFolder}/${submodulePath}`, sinceSeconds);
        if (submoduleCommits !== "")
            sections.push(`Submodule ${submodulePath}:\n${submoduleCommits}`);
    }
    return sections.join("\n\n");
}

function buildOpenTasksText(taskFolder: string): string {
    const pendingLines = buildSubjectListForStatus(taskFolder, "pending");
    const inProgressLines = buildSubjectListForStatus(taskFolder, "in_progress");
    const sections: string[] = [];
    if (pendingLines !== NO_PENDING_TASKS_LINE)
        sections.push(`Pending:\n${pendingLines}`);
    if (inProgressLines !== NO_IN_PROGRESS_TASKS_LINE)
        sections.push(`In progress:\n${inProgressLines}`);
    return sections.join("\n");
}

function readLastCheckSeconds(markerSeconds: number | undefined, transcriptPath: string): number {
    if (markerSeconds !== undefined)
        return markerSeconds;
    return Math.floor(statSync(transcriptPath).birthtimeMs / 1000);
}

function writeLastCommitCheck(statePath: string, seconds: number): void {
    const state = readSessionState(statePath);
    state.lastCommitCheckSeconds = seconds;
    writeSessionState(statePath, state);
}

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.stop_hook_active)
    process.exit(0);

const taskFolder = findTaskFolder();
if (taskFolder === undefined)
    process.exit(0);

const repoFolder = findRepoFolder(input.cwd);
if (repoFolder === undefined)
    process.exit(0);

const statePath = getSessionStatePath(input.session_id, getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR"));
const state = readSessionState(statePath);
const lastCheckSeconds = readLastCheckSeconds(state.lastCommitCheckSeconds, input.transcript_path);

const newCommitsText = buildNewCommitsText(repoFolder, lastCheckSeconds);
if (newCommitsText === "")
    process.exit(0);

writeLastCommitCheck(statePath, getNextWholeSecond());

const openTasksText = buildOpenTasksText(taskFolder);
if (openTasksText === "")
    process.exit(0);

writeBlockDecision(
    `New commits exist since the last check:\n\n${newCommitsText}\n\nOpen tasks:\n${openTasksText}\n\n` +
    "Mark a task as completed with TaskUpdate only when a listed commit clearly holds that task's work. " +
    "The task list is shared by all chats. Leave a task alone when you are unsure.",
);
