#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateRoadmap } from "./checkRoadmap.ts";

const checkScriptPath = join(import.meta.dirname, "checkRoadmap.ts");

function buildEntry(taskNumber: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { taskNumber, started: "", session: [], status: "", branch: "", lastUpdated: "", blockedBy: "", completed: "", ...overrides };
}

function createFixture(taskStatuses: Record<number, string>, roadmapText: string): { roadmapFile: string; taskFolder: string } {
    const rootFolder = mkdtempSync(join(tmpdir(), "check-roadmap-"));
    const taskFolder = join(rootFolder, "tasks");
    mkdirSync(taskFolder);
    for (const [taskNumber, status] of Object.entries(taskStatuses))
        writeFileSync(join(taskFolder, `${taskNumber}.json`), JSON.stringify({ id: taskNumber, subject: "s", description: "d", status }));
    const roadmapFile = join(rootFolder, "roadmap.json");
    writeFileSync(roadmapFile, roadmapText);
    return { roadmapFile, taskFolder };
}

function runCheck(taskStatuses: Record<number, string>, entries: unknown[]) {
    const fixture = createFixture(taskStatuses, JSON.stringify(entries));
    return validateRoadmap(fixture.roadmapFile, fixture.taskFolder);
}

function hasFailureContaining(failures: string[], text: string): boolean {
    return failures.some((failure) => failure.includes(text));
}

test("a correct file passes with no failure and no prose line", () => {
    // Setup: open tasks 1 and 2, closed task 3, all with a valid element.
    const entries = [buildEntry(1), buildEntry(2, { blockedBy: 1 }), buildEntry(3, { completed: "2026-11-13T09:30:00Z" })];
    // Action: check the file.
    const result = runCheck({ 1: "pending", 2: "pending", 3: "completed" }, entries);
    // Verification: nothing to report.
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.proseLines, []);
});

test("a file that is not JSON throws", () => {
    // Setup: a roadmap file with broken text.
    const fixture = createFixture({ 1: "pending" }, "[{");
    // Action and verification: the check throws.
    assert.throws(() => validateRoadmap(fixture.roadmapFile, fixture.taskFolder));
});

test("a file that is not an array fails", () => {
    // Setup: a roadmap file that holds an object.
    const fixture = createFixture({ 1: "pending" }, "{}");
    // Action: check the file.
    const result = validateRoadmap(fixture.roadmapFile, fixture.taskFolder);
    // Verification: one failure says so.
    assert.equal(hasFailureContaining(result.failures, "not an array"), true);
});

test("a duplicate taskNumber fails", () => {
    // Setup: task 1 appears twice.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1), buildEntry(1)]);
    // Verification: a failure names the duplicate.
    assert.equal(hasFailureContaining(result.failures, "duplicate taskNumber"), true);
});

test("an element with keys in the wrong order fails", () => {
    // Setup: status comes before started.
    const wrongOrder = { taskNumber: 1, status: "", started: "", session: [], branch: "", lastUpdated: "", blockedBy: "", completed: "" };
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [wrongOrder]);
    // Verification: a failure names the keys.
    assert.equal(hasFailureContaining(result.failures, "keys"), true);
});

test("an element with an extra key fails", () => {
    // Setup: a ninth key.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [{ ...buildEntry(1), extra: "" }]);
    // Verification: a failure names the keys.
    assert.equal(hasFailureContaining(result.failures, "keys"), true);
});

test("a session item with a non-boolean workedOnTask fails", () => {
    // Setup: workedOnTask is a string.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1, { session: [{ name: "chat", workedOnTask: "yes" }] })]);
    // Verification: a failure names the session item.
    assert.equal(hasFailureContaining(result.failures, "session item"), true);
});

test("a session item with an extra key fails", () => {
    // Setup: a third key in the session item.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1, { session: [{ name: "chat", workedOnTask: true, id: 1 }] })]);
    // Verification: a failure names the session item.
    assert.equal(hasFailureContaining(result.failures, "session item"), true);
});

test("an open task with no element fails", () => {
    // Setup: open task 2 is missing from the file.
    // Action: check the file.
    const result = runCheck({ 1: "pending", 2: "pending" }, [buildEntry(1)]);
    // Verification: a failure names task 2.
    assert.equal(hasFailureContaining(result.failures, "task 2: open task has no element"), true);
});

test("an element of an open task with a completed time fails", () => {
    // Setup: task 1 is open but the element says it is completed.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1, { completed: "2026-11-13T09:30:00Z" })]);
    // Verification: a failure says completed must be empty.
    assert.equal(hasFailureContaining(result.failures, "task 1: open task has a completed time"), true);
});

test("an element of a closed task with an empty completed fails", () => {
    // Setup: task 1 is completed but the element has no completed time.
    // Action: check the file.
    const result = runCheck({ 1: "completed" }, [buildEntry(1)]);
    // Verification: a failure says completed is empty.
    assert.equal(hasFailureContaining(result.failures, "task 1: closed task has no completed time"), true);
});

test("a date that is not in the roadmap format fails", () => {
    // Setup: lastUpdated has a fraction of a second.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1, { lastUpdated: "2026-11-13T09:30:00.123Z" })]);
    // Verification: a failure names lastUpdated.
    assert.equal(hasFailureContaining(result.failures, "lastUpdated"), true);
});

test("an integer blockedBy that is not an open task fails", () => {
    // Setup: task 2 is blocked by task 1, and task 1 is completed.
    // Action: check the file.
    const result = runCheck({ 1: "completed", 2: "pending" }, [buildEntry(1, { completed: "2026-11-13T09:30:00Z" }), buildEntry(2, { blockedBy: 1 })]);
    // Verification: a failure says the blocker is not open.
    assert.equal(hasFailureContaining(result.failures, "task 2: blockedBy 1 is not an open task"), true);
});

test("an integer blockedBy that points at the element itself fails", () => {
    // Setup: task 1 is blocked by task 1.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1, { blockedBy: 1 })]);
    // Verification: a failure says the element blocks itself.
    assert.equal(hasFailureContaining(result.failures, "task 1: blockedBy points at itself"), true);
});

test("an integer blockedBy that sits later in the array fails", () => {
    // Setup: task 1 is blocked by task 2, but task 2 comes after task 1.
    // Action: check the file.
    const result = runCheck({ 1: "pending", 2: "pending" }, [buildEntry(1, { blockedBy: 2 }), buildEntry(2)]);
    // Verification: a failure says the blocker comes later.
    assert.equal(hasFailureContaining(result.failures, "task 1: blockedBy 2 comes later in the array"), true);
});

test("an integer blockedBy on a closed element is not checked", () => {
    // Setup: closed task 2 still holds blockedBy 1, and task 1 is completed.
    const entries = [buildEntry(1, { completed: "2026-11-13T09:30:00Z" }), buildEntry(2, { blockedBy: 1, completed: "2026-11-13T09:31:00Z" })];
    // Action: check the file.
    const result = runCheck({ 1: "completed", 2: "completed" }, entries);
    // Verification: no failure.
    assert.deepEqual(result.failures, []);
});

test("an em dash anywhere in the file fails", () => {
    // Setup: the status text holds an em dash.
    // Action: check the file.
    const result = runCheck({ 1: "pending" }, [buildEntry(1, { status: `done ${String.fromCharCode(8212)} mostly` })]);
    // Verification: a failure names the em dash.
    assert.equal(hasFailureContaining(result.failures, "em dash"), true);
});

test("a prose blockedBy that names a later open task prints a line and does not fail", () => {
    // Setup: task 1 waits for "task 2 and the user", and task 2 comes later.
    // Action: check the file.
    const result = runCheck({ 1: "pending", 2: "pending" }, [buildEntry(1, { blockedBy: "task 2 and the user" }), buildEntry(2)]);
    // Verification: one prose line, no failure.
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.proseLines, ["prose names later task: 1 -> 2 | task 2 and the user"]);
});

test("the script exits 0 and prints roadmap check passed for a correct file", () => {
    // Setup: one open task with a valid element.
    const fixture = createFixture({ 1: "pending" }, JSON.stringify([buildEntry(1)]));
    // Action: run the script.
    const result = spawnSync("bun", [checkScriptPath, fixture.roadmapFile, fixture.taskFolder], { encoding: "utf8" });
    // Verification: exit 0 and the pass line.
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), "roadmap check passed");
});

test("the script exits 1 and prints one line per failure for a bad file", () => {
    // Setup: open task 1 is missing from the file.
    const fixture = createFixture({ 1: "pending" }, "[]");
    // Action: run the script.
    const result = spawnSync("bun", [checkScriptPath, fixture.roadmapFile, fixture.taskFolder], { encoding: "utf8" });
    // Verification: exit 1 and the failure line.
    assert.equal(result.status, 1);
    assert.equal(result.stdout.trim(), "task 1: open task has no element");
});
