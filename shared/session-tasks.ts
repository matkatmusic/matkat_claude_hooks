import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

export const TASK_LIST_ID_NOT_SET_REASON = "CLAUDE_CODE_TASK_LIST_ID is not set, so the task list is unknown.";

// Plugin skills reach the hook namespaced, as /matkat-hooks:task-details.
export function readPromptFromStdin(): string {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    return (typeof payload.prompt === "string" ? payload.prompt.trimStart() : "").replace(/^\/[\w-]+:/, "/");
}

export function writeBlockDecision(reason: string): void {
    process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
}

export function findTaskFolder(): string | undefined {
    const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID;
    if (!taskListId)
        return undefined;
    return `${homedir()}/.claude/tasks/${taskListId}`;
}

function compareTaskNumbers(first: { taskNumber: number }, second: { taskNumber: number }): number {
    return first.taskNumber - second.taskNumber;
}

export function buildSubjectListForStatus(taskFolder: string, status: string): string {
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
