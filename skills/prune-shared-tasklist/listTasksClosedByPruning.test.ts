#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPruningTaskReport } from "./listTasksClosedByPruning.ts";

function writeTask(taskFolder: string, taskId: string, status: string, metadata: Record<string, unknown> | undefined): void {
    const task: Record<string, unknown> = { id: taskId, subject: `task ${taskId}`, status };
    if (metadata !== undefined)
        task.metadata = metadata;
    writeFileSync(join(taskFolder, `${taskId}.json`), JSON.stringify(task));
}

function createTaskFolder(): string {
    return mkdtempSync(join(tmpdir(), "pruning-tasks-"));
}

test("a task whose closedBy contains pruning is listed with number, status, closedBy and reason", () => {
    // Setup: one task closed by a prune run.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "7", "completed", { closedBy: "task-list pruning 2026-01-02", closedReason: "duplicate of #3" });
    // Action: build the report.
    const report = buildPruningTaskReport(taskFolder);
    // Verification: one line with all four values.
    assert.deepEqual(report.split("\n"), ["#7 completed | task-list pruning 2026-01-02 | duplicate of #3"]);
});

test("a task with another closedBy or no metadata is left out", () => {
    // Setup: one task closed by someone else, one with no metadata, one closed by a prune run.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "1", "completed", { closedBy: "manual cleanup", closedReason: "done" });
    writeTask(taskFolder, "2", "pending", undefined);
    writeTask(taskFolder, "3", "completed", { closedBy: "task-list pruning 2026-01-02", closedReason: "done" });
    // Action: build the report.
    const report = buildPruningTaskReport(taskFolder);
    // Verification: only task 3 is listed.
    assert.deepEqual(report.split("\n"), ["#3 completed | task-list pruning 2026-01-02 | done"]);
});

test("lines are sorted by task number", () => {
    // Setup: matching tasks 10, 2 and 33.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "10", "completed", { closedBy: "task-list pruning 2026-01-02", closedReason: "a" });
    writeTask(taskFolder, "2", "completed", { closedBy: "task-list pruning 2026-01-01", closedReason: "b" });
    writeTask(taskFolder, "33", "pending", { closedBy: "task-list pruning 2026-01-03", closedReason: "c" });
    // Action: build the report.
    const report = buildPruningTaskReport(taskFolder);
    // Verification: the lines follow the task numbers, not the text order.
    const taskNumbers: string[] = [];
    for (const line of report.split("\n"))
        taskNumbers.push(line.split(" ")[0]);
    assert.deepEqual(taskNumbers, ["#2", "#10", "#33"]);
});

test("no task line is printed when no task matches", () => {
    // Setup: one task that a person closed.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "1", "completed", { closedBy: "manual cleanup", closedReason: "done" });
    // Action: build the report.
    const report = buildPruningTaskReport(taskFolder);
    // Verification: no line starts with a task number sign.
    for (const line of report.split("\n"))
        assert.equal(line.startsWith("#"), false);
});
