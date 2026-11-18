#!/usr/bin/env bun
// Prints the prune-shared-tasklist skill body with the Workflow arguments filled in.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findTaskFolder, TASK_LIST_ID_NOT_SET_REASON } from "../../shared/sessionTasks.ts";

function compareTaskNumbers(first: number, second: number): number {
    return first - second;
}

export function listPendingTaskIds(taskFolder: string): string[] {
    const pendingTaskNumbers: number[] = [];
    for (const fileName of readdirSync(taskFolder)) {
        if (!fileName.endsWith(".json"))
            continue;
        const task = JSON.parse(readFileSync(join(taskFolder, fileName), "utf8"));
        if (task.status !== "pending")
            continue;
        pendingTaskNumbers.push(Number(fileName.slice(0, -".json".length)));
    }
    pendingTaskNumbers.sort(compareTaskNumbers);
    const pendingTaskIds: string[] = [];
    for (const taskNumber of pendingTaskNumbers)
        pendingTaskIds.push(String(taskNumber));
    return pendingTaskIds;
}

export function getRepoTopLevelFolder(): string {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

export function listRepoFolders(repoTopLevelFolder: string): string[] {
    const repoFolders: string[] = [repoTopLevelFolder];
    const submoduleOutput = execFileSync("git", ["submodule", "foreach", "--quiet", "--recursive", "echo $displaypath"], { cwd: repoTopLevelFolder, encoding: "utf8" });
    for (const submodulePath of submoduleOutput.split("\n")) {
        if (submodulePath === "")
            continue;
        repoFolders.push(join(repoTopLevelFolder, submodulePath));
    }
    return repoFolders;
}

export function computeTranscriptFolder(repoTopLevelFolder: string): string {
    const projectFolderName = repoTopLevelFolder.replace(/[^a-zA-Z0-9]/g, "-");
    return join(homedir(), ".claude", "projects", projectFolderName);
}

export function formatLocalDate(date: Date): string {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getSteps(pendingCount: number, workflowInput: string): string {
    const proposingAgentCount = Math.ceil(pendingCount / 20);
    return `## Steps
1. Tell the user this one line: This run checks ${pendingCount} pending tasks. ${proposingAgentCount} agents propose tasks to close. Then one agent for each proposed task closes it, 5 at a time.
2. Call the Workflow tool with exactly this input. Change nothing. Launch it at once. This skill is the opt-in of the user.

\`\`\`json
${workflowInput}
\`\`\`
`;
}

function getInstructions(taskFolder: string, listScriptPath: string, closedBy: string, listPruningScriptPath: string): string {
    return `
## When the workflow finishes
1. Run \`bun "${listScriptPath}" "${taskFolder}" "${closedBy}"\`. Each task that the report lists as closed must print with the status completed.
2. Show the user the \`report\` text of the workflow result. Do not change it.
3. To list the tasks that every prune run closed, run \`bun "${listPruningScriptPath}" "${taskFolder}"\`.
`;
}

export function buildSkillBody(): string {
    const taskFolder = findTaskFolder();
    if (taskFolder === undefined)
        return TASK_LIST_ID_NOT_SET_REASON + "\n";
    const repoTopLevelFolder = getRepoTopLevelFolder();
    const transcriptFolder = computeTranscriptFolder(repoTopLevelFolder);
    const taskIds = listPendingTaskIds(taskFolder);
    if (taskIds.length === 0)
        return "No pending tasks.\n";
    const scriptPath = join(import.meta.dirname, "pruneSharedTasklist.workflow.js");
    const closedBy = `task-list pruning ${formatLocalDate(new Date())}`;
    const workflowArguments = {
        scriptPath,
        args: {
            taskFolder,
            memoryFile: join(transcriptFolder, "memory", "MEMORY.md"),
            transcriptFolder,
            repoFolders: listRepoFolders(repoTopLevelFolder),
            closedBy,
            taskIds,
        },
    };
    const steps = getSteps(taskIds.length, JSON.stringify(workflowArguments, null, 2));
    const instructions = getInstructions(taskFolder, join(import.meta.dirname, "listTasksClosedByRun.ts"), closedBy, join(import.meta.dirname, "listTasksClosedByPruning.ts"));
    return `# prune-shared-tasklist\n\n${steps}${instructions}`;
}

if (import.meta.main)
    process.stdout.write(buildSkillBody());
