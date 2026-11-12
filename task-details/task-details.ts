#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

// UserPromptSubmit hook: /task-details #N blocks the prompt and shows that session task to the user.
const SHOWN_FIELDS = ["id", "subject", "description", "status"];

function formatTask(taskNumber: string, task: Record<string, unknown>): string {
    const lines = [`Task #${taskNumber} (${task.status}): ${task.subject}`, "", String(task.description)];
    const otherLines: string[] = [];
    for (const [key, value] of Object.entries(task)) {
        if (SHOWN_FIELDS.includes(key))
            continue;
        if (Array.isArray(value)) {
            const joined = value.length === 0 ? "(none)" : value.join(", ");
            otherLines.push(`${key}: ${joined}`);
        }
        else if (typeof value === "object" && value !== null) {
            otherLines.push(`${key}: ${JSON.stringify(value)}`);
        }
        else {
            otherLines.push(`${key}: ${value}`);
        }
    }
    if (otherLines.length > 0)
        lines.push("", ...otherLines);
    return lines.join("\n");
}

function buildReason(taskNumber: string | undefined): string {
    if (taskNumber === undefined)
        return "Usage: /task-details #<number>";
    const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID;
    if (!taskListId)
        return "CLAUDE_CODE_TASK_LIST_ID is not set, so the task list is unknown.";
    const taskFolder = `${homedir()}/.claude/tasks/${taskListId}`;
    const taskPath = `${taskFolder}/${taskNumber}.json`;
    if (!existsSync(taskPath))
        return `Task #${taskNumber}: not found in ${taskFolder}`;
    return formatTask(taskNumber, JSON.parse(readFileSync(taskPath, "utf8")));
}

const TASK_STATUS_BY_LIST_COMMAND = new Map([
    ["/pending-task-list", "pending"],
    ["/in-progress-task-list", "in_progress"],
]);

function compareTaskNumbers(first: { taskNumber: number }, second: { taskNumber: number }): number {
    return first.taskNumber - second.taskNumber;
}

function buildTaskListReason(status: string): string {
    const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID;
    if (!taskListId)
        return "CLAUDE_CODE_TASK_LIST_ID is not set, so the task list is unknown.";
    const taskFolder = `${homedir()}/.claude/tasks/${taskListId}`;
    const matchingTasks: { taskNumber: number; subject: string }[] = [];
    for (const fileName of readdirSync(taskFolder)) {
        if (!fileName.endsWith(".json"))
            continue;
        const task = JSON.parse(readFileSync(`${taskFolder}/${fileName}`, "utf8"));
        if (task.status !== status)
            continue;
        matchingTasks.push({ taskNumber: Number(fileName.slice(0, -".json".length)), subject: task.subject });
    }
    if (matchingTasks.length === 0)
        return `No ${status.replace("_", " ")} tasks.`;
    matchingTasks.sort(compareTaskNumbers);
    const subjectLines: string[] = [];
    for (const matchingTask of matchingTasks)
        subjectLines.push(matchingTask.subject);
    return subjectLines.join("\n");
}

const payload = JSON.parse(readFileSync(0, "utf8"));
// Plugin skills reach the hook namespaced, as /matkat-hooks:task-details.
const prompt = (typeof payload.prompt === "string" ? payload.prompt.trimStart() : "").replace(/^\/[\w-]+:/, "/");
const listStatus = TASK_STATUS_BY_LIST_COMMAND.get(prompt.split(/\s/)[0]);
if (listStatus !== undefined) {
    const listReason = buildTaskListReason(listStatus);
    process.stdout.write(JSON.stringify({ decision: "block", reason: listReason }) + "\n");
    process.exit(0);
}
if (prompt !== "/task-details" && !prompt.startsWith("/task-details "))
    process.exit(0);

const argumentText = prompt.slice("/task-details".length).trim();
const taskNumber = argumentText.match(/^#?(\d+)/)?.[1];
const reason = buildReason(taskNumber);
process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
