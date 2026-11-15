#!/usr/bin/env bun
// Prints the prune-shared-tasklist skill body with the Workflow arguments filled in.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findTaskFolder, TASK_LIST_ID_NOT_SET_REASON } from "../../shared/session-tasks.ts";

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

function getInstructions(scriptPath: string, taskFolder: string): string {
    return `
## Steps
1. If \`taskIds\` is empty, tell the user there are no pending tasks. Then stop.
2. Remove from \`taskIds\` the task that tracks this prune run, if one exists.
3. Before the launch, tell the user one line about the cost: the run uses one agent for about 20 pending tasks to propose, then one agent for each proposed task to close, 5 at a time.
4. Call the Workflow tool with scriptPath \`${scriptPath}\` and the changed \`args\`. Launch it at once. This skill is the opt-in of the user.

## Scope
- The run closes duplicates, tasks that are already done, and tasks that are not needed. It closes them without asking.
- A task stays open when it has no proposal. A task also stays open when git, code, stored memory, and chat logs of the last 14 days do not prove its reason.
- The run marks tasks completed. It never deletes tasks.
- Each closed task gets the metadata \`closedReason\`, \`closedEvidence\`, and \`closedBy\`.

## When the workflow finishes
1. Check each task that the result reports as closed. Run \`jq -r .status ${taskFolder}/<id>.json\`.
2. Report these counts: pending before, proposed, closed, left open, failed.
3. Report one line for each closed task with its reason.
4. Report one line for each task that stays open or was held out, with the cause.
5. The task files are the truth after the run. To list the closed tasks, run \`jq 'select(.metadata.closedBy|tostring|test("pruning"))'\` on them.

## Known limits
- Subagents of the Agent tool have no TaskGet tool and no TaskUpdate tool. The closing step must stay inside the Workflow.
- The run reads tasks that are in progress to find duplicates. It never closes them.
`;
}

export function buildSkillBody(): string {
    const taskFolder = findTaskFolder();
    if (taskFolder === undefined)
        return TASK_LIST_ID_NOT_SET_REASON + "\n";
    const repoTopLevelFolder = getRepoTopLevelFolder();
    const transcriptFolder = computeTranscriptFolder(repoTopLevelFolder);
    const taskIds = listPendingTaskIds(taskFolder);
    const scriptPath = join(import.meta.dirname, "pruneSharedTasklist.workflow.js");
    const workflowArguments = {
        scriptPath,
        pendingCount: taskIds.length,
        args: {
            taskFolder,
            memoryFile: join(transcriptFolder, "memory", "MEMORY.md"),
            transcriptFolder,
            repoFolders: listRepoFolders(repoTopLevelFolder),
            closedBy: `task-list pruning ${formatLocalDate(new Date())}`,
            taskIds,
        },
    };
    return `# prune-shared-tasklist\n\n\`\`\`json\n${JSON.stringify(workflowArguments, null, 2)}\n\`\`\`\n${getInstructions(scriptPath, taskFolder)}`;
}

if (import.meta.main)
    process.stdout.write(buildSkillBody());
