#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildClosedTaskReport } from "./listTasksClosedByRun.ts";

const CLOSED_BY = "task-list pruning 2026-01-02";

function writeTask(taskFolder: string, taskId: string, status: string, metadata: Record<string, unknown> | undefined): void {
    const task: Record<string, unknown> = { id: taskId, subject: `task ${taskId}`, status };
    if (metadata !== undefined)
        task.metadata = metadata;
    writeFileSync(join(taskFolder, `${taskId}.json`), JSON.stringify(task));
}

function createTaskFolder(): string {
    return mkdtempSync(join(tmpdir(), "closed-tasks-"));
}

test("a task with the matching closedBy is listed with its number and status", () => {
    // Setup: one task closed by this run.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "7", "completed", { closedBy: CLOSED_BY });
    // Action: build the report.
    const report = buildClosedTaskReport(taskFolder, CLOSED_BY);
    // Verification: one line with the number and the status.
    assert.deepEqual(report.split("\n"), ["#7 completed"]);
});

test("a task with a different closedBy or no metadata is left out", () => {
    // Setup: one task closed by another run, one with no metadata, one closed by this run.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "1", "completed", { closedBy: "task-list pruning 2025-12-31" });
    writeTask(taskFolder, "2", "pending", undefined);
    writeTask(taskFolder, "3", "completed", { closedBy: CLOSED_BY });
    // Action: build the report.
    const report = buildClosedTaskReport(taskFolder, CLOSED_BY);
    // Verification: only task 3 is listed.
    assert.deepEqual(report.split("\n"), ["#3 completed"]);
});

test("lines are sorted by task number", () => {
    // Setup: matching tasks 10, 2 and 33.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "10", "completed", { closedBy: CLOSED_BY });
    writeTask(taskFolder, "2", "completed", { closedBy: CLOSED_BY });
    writeTask(taskFolder, "33", "pending", { closedBy: CLOSED_BY });
    // Action: build the report.
    const report = buildClosedTaskReport(taskFolder, CLOSED_BY);
    // Verification: the lines follow the task numbers, not the text order.
    assert.deepEqual(report.split("\n"), ["#2 completed", "#10 completed", "#33 pending"]);
});

test("no task line is printed when no task matches", () => {
    // Setup: one task that another run closed.
    const taskFolder = createTaskFolder();
    writeTask(taskFolder, "1", "completed", { closedBy: "other run" });
    // Action: build the report.
    const report = buildClosedTaskReport(taskFolder, CLOSED_BY);
    // Verification: no line starts with a task number sign.
    for (const line of report.split("\n"))
        assert.equal(line.startsWith("#"), false);
});
