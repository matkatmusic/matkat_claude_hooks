#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// PreToolUse hook (TaskCreate|TaskUpdate): deny when this chat's task list is not the project's shared task list.

function readTaskListIdFromSettings(settingsFile: string): string | undefined {
    if (!existsSync(settingsFile))
        return undefined;
    const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
    return settings.env?.CLAUDE_CODE_TASK_LIST_ID;
}

// Starts at the main repo, not cwd: a worktree has no copy of the ignored settings.local.json.
// Then walks up the parent folders: a repo nested in the project repo has no settings of its own.
function getProjectTaskListId(cwd: string): string | undefined {
    const gitCommonFolder = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
    let folder = dirname(gitCommonFolder);
    while (true) {
        const localTaskListId = readTaskListIdFromSettings(`${folder}/.claude/settings.local.json`);
        if (localTaskListId)
            return localTaskListId;
        const sharedTaskListId = readTaskListIdFromSettings(`${folder}/.claude/settings.json`);
        if (sharedTaskListId)
            return sharedTaskListId;
        const parentFolder = dirname(folder);
        if (parentFolder === folder)
            return undefined;
        folder = parentFolder;
    }
}

if (import.meta.main) {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const projectTaskListId = getProjectTaskListId(input.cwd);
    if (projectTaskListId) {
        const sessionTaskListId = process.env.CLAUDE_CODE_TASK_LIST_ID;
        if (sessionTaskListId !== projectTaskListId) {
            const sessionDescription = sessionTaskListId ? `the task list "${sessionTaskListId}"` : "no shared task list";
            console.log(
                JSON.stringify({
                    hookSpecificOutput: {
                        hookEventName: "PreToolUse",
                        permissionDecision: "deny",
                        permissionDecisionReason: `This chat uses ${sessionDescription}. The project uses the shared task list "${projectTaskListId}". Do not make or change tasks in this chat. Tell the user to restart this chat with CLAUDE_CODE_TASK_LIST_ID set to "${projectTaskListId}".`,
                    },
                }),
            );
        }
    }
}
