#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
import { buildSubjectListForStatus, findTaskFolder, writeBlockDecision } from "../shared/session-tasks.ts";
import { DISPATCHER_DIR, getSetting, getValues, readSettings } from "../shared/settings.ts";
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

function listNewCommitLines(folder: string, sinceSeconds: number): string {
    return execFileSync("git", ["-C", folder, "log", "--all", `--since=@${sinceSeconds}`, "--format=commit %h %s"], { encoding: "utf8" }).trim();
}

function buildNewCommitLinesText(repoFolder: string, sinceSeconds: number): string {
    const sections: string[] = [];
    const repoCommits = listNewCommitLines(repoFolder, sinceSeconds);
    if (repoCommits !== "")
        sections.push(repoCommits);
    for (const submodulePath of listSubmodulePaths(repoFolder)) {
        const submoduleCommits = listNewCommitLines(`${repoFolder}/${submodulePath}`, sinceSeconds);
        if (submoduleCommits !== "")
            sections.push(`Submodule ${submodulePath}:\n${submoduleCommits}`);
    }
    return sections.join("\n\n");
}

function listNewCommitMessages(folder: string, sinceSeconds: number): string {
    return execFileSync("git", ["-C", folder, "log", "--all", `--since=@${sinceSeconds}`, "--format=%B"], { encoding: "utf8" });
}

function listTaskNumbersInCommitMessages(repoFolder: string, sinceSeconds: number): Set<number> {
    const taskNumbers = new Set<number>();
    const folders = [repoFolder];
    for (const submodulePath of listSubmodulePaths(repoFolder))
        folders.push(`${repoFolder}/${submodulePath}`);
    for (const folder of folders) {
        const messages = listNewCommitMessages(folder, sinceSeconds);
        for (const match of messages.matchAll(/#(\d+)/g))
            taskNumbers.add(Number(match[1]));
    }
    return taskNumbers;
}

function buildNamedOpenTasksText(taskFolder: string, taskNumbers: Set<number>): string {
    const pendingLines = buildSubjectListForStatus(taskFolder, "pending");
    const inProgressLines = buildSubjectListForStatus(taskFolder, "in_progress");
    const sections: string[] = [];
    if (pendingLines !== NO_PENDING_TASKS_LINE) {
        const namedPendingLines: string[] = [];
        for (const line of pendingLines.split("\n")) {
            const taskNumber = Number(line.slice(1, line.indexOf(" ")));
            if (taskNumbers.has(taskNumber))
                namedPendingLines.push(line);
        }
        if (namedPendingLines.length > 0)
            sections.push(`Pending:\n${namedPendingLines.join("\n")}`);
    }
    if (inProgressLines !== NO_IN_PROGRESS_TASKS_LINE) {
        const namedInProgressLines: string[] = [];
        for (const line of inProgressLines.split("\n")) {
            const taskNumber = Number(line.slice(1, line.indexOf(" ")));
            if (taskNumbers.has(taskNumber))
                namedInProgressLines.push(line);
        }
        if (namedInProgressLines.length > 0)
            sections.push(`In progress:\n${namedInProgressLines.join("\n")}`);
    }
    return sections.join("\n");
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

function buildRoadmapInstruction(repoFolder: string, taskFolder: string): string {
    const roadmapFile = `${repoFolder}/plans/${basename(taskFolder)}-roadmap.json`;
    const roadmapExists = existsSync(roadmapFile);
    if (!roadmapExists)
        return "";
    const scriptPath = `${import.meta.dirname}/markRoadmapTaskCompleted.ts`;
    return ` After each TaskUpdate that marks a task completed, run this command with the task number: bun "${scriptPath}" "${roadmapFile}" <task number>`;
}

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.stop_hook_active)
    process.exit(0);

const teamJob = process.env.CLAUDE_TMUX_TEAM_JOB;
if (teamJob !== undefined) {
    const teamValues = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
    if (teamJob !== teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"]) {
        if (teamJob !== teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB"])
            process.exit(0);
    }
}

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

if (teamJob !== undefined) {
    const namedTaskNumbers = listTaskNumbersInCommitMessages(repoFolder, lastCheckSeconds);
    const namedTasksText = buildNamedOpenTasksText(taskFolder, namedTaskNumbers);
    if (namedTasksText === "")
        process.exit(0);
    const newCommitLinesText = buildNewCommitLinesText(repoFolder, lastCheckSeconds);
    writeBlockDecision(
        `New commits exist since the last check:\n\n${newCommitLinesText}\n\nOpen tasks:\n${namedTasksText}\n\n` +
        "Mark a task as completed with TaskUpdate only when a listed commit clearly holds that task's work. " +
        "The task list is shared by all chats. Leave a task alone when you are unsure." +
        buildRoadmapInstruction(repoFolder, taskFolder),
    );
} else {
    const openTasksText = buildOpenTasksText(taskFolder);
    if (openTasksText === "")
        process.exit(0);

    writeBlockDecision(
        `New commits exist since the last check:\n\n${newCommitsText}\n\nOpen tasks:\n${openTasksText}\n\n` +
        "Mark a task as completed with TaskUpdate only when a listed commit clearly holds that task's work. " +
        "The task list is shared by all chats. Leave a task alone when you are unsure." +
        buildRoadmapInstruction(repoFolder, taskFolder),
    );
}
