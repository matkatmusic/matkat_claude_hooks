#!/usr/bin/env bun
// Usage: bun listTasksClosedByPruning.ts <taskFolder>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface PrunedTask {
    taskNumber: number;
    line: string;
}

function comparePrunedTasks(first: PrunedTask, second: PrunedTask): number {
    return first.taskNumber - second.taskNumber;
}

export function buildPruningTaskReport(taskFolder: string): string {
    const prunedTasks: PrunedTask[] = [];
    for (const fileName of readdirSync(taskFolder)) {
        if (!fileName.endsWith(".json"))
            continue;
        const task = JSON.parse(readFileSync(join(taskFolder, fileName), "utf8"));
        const closedBy = task.metadata?.closedBy;
        if (closedBy === undefined)
            continue;
        if (!String(closedBy).includes("pruning"))
            continue;
        const taskNumber = Number(fileName.slice(0, -".json".length));
        prunedTasks.push({ taskNumber, line: `#${taskNumber} ${task.status} | ${closedBy} | ${task.metadata.closedReason}` });
    }
    if (prunedTasks.length === 0)
        return "No tasks closed by pruning.";
    prunedTasks.sort(comparePrunedTasks);
    const taskLines: string[] = [];
    for (const prunedTask of prunedTasks)
        taskLines.push(prunedTask.line);
    return taskLines.join("\n");
}

if (import.meta.main)
    console.log(buildPruningTaskReport(process.argv[2]));
