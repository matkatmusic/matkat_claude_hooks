import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { writeRoadmapTaskCompleted } from "./markRoadmapTaskCompleted.ts";

const FIXED_TIME = "2026-11-15T10:20:30Z";
const OLD_TIME = "2026-10-01T01:02:03Z";

function buildElementLine(taskNumber: number, completed: string, isLast: boolean): string {
    const session = `[{"name": "chat ${taskNumber}", "workedOnTask": true}]`;
    const fields = `"taskNumber": ${taskNumber}, "started": "", "session": ${session}, "status": "Work, with a comma.", "branch": "", "lastUpdated": "2026-10-09T05:00:29Z", "blockedBy": "", "completed": "${completed}"`;
    return `    {${fields}}${isLast ? "" : ","}`;
}

function writeRoadmapFixture(taskPairs: [number, string][]): string {
    const lines = ["["];
    for (const [index, [taskNumber, completed]] of taskPairs.entries())
        lines.push(buildElementLine(taskNumber, completed, index === taskPairs.length - 1));
    lines.push("]", "");
    const roadmapFile = `${mkdtempSync(`${tmpdir()}/mark-roadmap-`)}/roadmap.json`;
    writeFileSync(roadmapFile, lines.join("\n"));
    return roadmapFile;
}

test("test_open_element_gets_completed_time_and_nothing_else_changes", () => {
    // Scenario: three elements, task 5 is open.
    const roadmapFile = writeRoadmapFixture([[9, ""], [5, ""], [2, ""]]);
    const before = JSON.parse(readFileSync(roadmapFile, "utf8"));
    // Mark task 5 completed with a fixed time.
    writeRoadmapTaskCompleted(roadmapFile, 5, FIXED_TIME);
    const after = JSON.parse(readFileSync(roadmapFile, "utf8"));
    // Only the completed field of task 5 differs.
    before[1].completed = FIXED_TIME;
    assert.deepEqual(after, before);
});

test("test_key_order_and_element_order_and_other_bytes_stay_the_same", () => {
    // Scenario: three elements, task 5 is open.
    const roadmapFile = writeRoadmapFixture([[9, ""], [5, ""], [2, ""]]);
    const beforeText = readFileSync(roadmapFile, "utf8");
    // Mark task 5 completed.
    writeRoadmapTaskCompleted(roadmapFile, 5, FIXED_TIME);
    const afterText = readFileSync(roadmapFile, "utf8");
    // The new text is the old text with that one value replaced: same bytes everywhere else, same trailing newline.
    const expectedText = beforeText.replace(/("taskNumber": 5,.*"completed": )""/, `$1"${FIXED_TIME}"`);
    assert.equal(afterText, expectedText);
    // Key order and element order are the same.
    const before = JSON.parse(beforeText);
    const after = JSON.parse(afterText);
    assert.deepEqual(after.map((element: object) => Object.keys(element).join(",")), before.map((element: object) => Object.keys(element).join(",")));
    assert.deepEqual(after.map((element: { taskNumber: number }) => element.taskNumber), [9, 5, 2]);
});

test("test_last_element_without_trailing_comma_gets_completed_time", () => {
    // Scenario: the open task is the last element, so its line has no comma.
    const roadmapFile = writeRoadmapFixture([[9, ""], [5, ""]]);
    // Mark task 5 completed.
    writeRoadmapTaskCompleted(roadmapFile, 5, FIXED_TIME);
    // The file still parses and holds the time on task 5.
    const after = JSON.parse(readFileSync(roadmapFile, "utf8"));
    assert.equal(after[1].completed, FIXED_TIME);
    assert.equal(after[0].completed, "");
});

test("test_missing_file_is_not_created", () => {
    // Scenario: the roadmap path points at a file that does not exist.
    const roadmapFile = `${mkdtempSync(`${tmpdir()}/mark-roadmap-`)}/roadmap.json`;
    // Run the script function.
    writeRoadmapTaskCompleted(roadmapFile, 5, FIXED_TIME);
    // The file still does not exist.
    assert.equal(existsSync(roadmapFile), false);
});

test("test_unknown_task_number_leaves_file_bytes_unchanged", () => {
    // Scenario: the roadmap has tasks 9 and 5 only.
    const roadmapFile = writeRoadmapFixture([[9, ""], [5, ""]]);
    const beforeText = readFileSync(roadmapFile, "utf8");
    // Mark task 77 completed.
    writeRoadmapTaskCompleted(roadmapFile, 77, FIXED_TIME);
    // The bytes are the same.
    assert.equal(readFileSync(roadmapFile, "utf8"), beforeText);
});

test("test_element_with_completed_time_keeps_old_value", () => {
    // Scenario: task 5 already has a completed time.
    const roadmapFile = writeRoadmapFixture([[9, ""], [5, OLD_TIME]]);
    const beforeText = readFileSync(roadmapFile, "utf8");
    // Mark task 5 completed with a new time.
    writeRoadmapTaskCompleted(roadmapFile, 5, FIXED_TIME);
    // The bytes are the same, so the old value stays.
    assert.equal(readFileSync(roadmapFile, "utf8"), beforeText);
});

test("test_command_line_marks_task_with_current_time", () => {
    // Scenario: three elements, task 5 is open.
    const roadmapFile = writeRoadmapFixture([[9, ""], [5, ""], [2, ""]]);
    // Run the script the way the hook tells the agent to.
    const result = spawnSync("bun", [`${import.meta.dirname}/markRoadmapTaskCompleted.ts`, roadmapFile, "5"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    // Task 5 now holds a UTC time with seconds, and the other tasks stay open.
    const after = JSON.parse(readFileSync(roadmapFile, "utf8"));
    assert.match(after[1].completed, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.equal(after[0].completed, "");
    assert.equal(after[2].completed, "");
});
