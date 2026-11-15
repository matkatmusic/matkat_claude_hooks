#!/usr/bin/env bun
// Usage: bun listTasksClosedByRun.ts <taskFolder> <closedBy>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface ClosedTask {
    taskNumber: number;
    status: string;
}

function compareTaskNumbers(first: ClosedTask, second: ClosedTask): number {
    return first.taskNumber - second.taskNumber;
}

export function buildClosedTaskReport(taskFolder: string, closedBy: string): string {
    const closedTasks: ClosedTask[] = [];
    for (const fileName of readdirSync(taskFolder)) {
        if (!fileName.endsWith(".json"))
            continue;
        const task = JSON.parse(readFileSync(join(taskFolder, fileName), "utf8"));
        if (task.metadata?.closedBy !== closedBy)
            continue;
        closedTasks.push({ taskNumber: Number(fileName.slice(0, -".json".length)), status: task.status });
    }
    if (closedTasks.length === 0)
        return `No tasks closed by ${closedBy}.`;
    closedTasks.sort(compareTaskNumbers);
    const taskLines: string[] = [];
    for (const closedTask of closedTasks)
        taskLines.push(`#${closedTask.taskNumber} ${closedTask.status}`);
    return taskLines.join("\n");
}

if (import.meta.main)
    console.log(buildClosedTaskReport(process.argv[2], process.argv[3]));
