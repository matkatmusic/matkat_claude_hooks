#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const scriptPath = `${import.meta.dirname}/task-details.ts`;
const TASK_LIST_ID = "demo-list";

function makeHomeWithTask(taskNumber: string, task: Record<string, unknown>): string {
    const home = mkdtempSync(`${tmpdir()}/task-details-`);
    const taskFolder = `${home}/.claude/tasks/${TASK_LIST_ID}`;
    mkdirSync(taskFolder, { recursive: true });
    writeFileSync(`${taskFolder}/${taskNumber}.json`, JSON.stringify(task));
    return home;
}

function runHook(prompt: string, home: string, taskListId: string | undefined) {
    const env: Record<string, string | undefined> = { ...process.env, HOME: home };
    delete env.CLAUDE_CODE_TASK_LIST_ID;
    if (taskListId !== undefined)
        env.CLAUDE_CODE_TASK_LIST_ID = taskListId;
    const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt, cwd: home });
    return spawnSync("node", [scriptPath], { encoding: "utf8", env, input });
}

const completedTask = {
    id: "384",
    subject: "turn off only Stop hooks",
    description: "Write a marker file.\nSkip Stop hooks while it exists.",
    status: "completed",
    blocks: [],
    blockedBy: ["12", "13"],
    metadata: { source: "user" },
};

test("test_found_task_prints_subject_and_description", () => {
    // Setup: a temp home with task 384 written to the task list folder.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook with "/task-details #384".
    const result = runHook("/task-details #384", home, TASK_LIST_ID);
    // Verify: the block reason holds the header line, subject and description with real newlines.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.ok(output.reason.startsWith("Task #384 (completed): turn off only Stop hooks\n\nWrite a marker file.\nSkip Stop hooks while it exists."));
});

test("test_other_fields_print_as_key_value_lines", () => {
    // Setup: a temp home with task 384 that has array, empty array and object fields.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook.
    const result = runHook("/task-details #384", home, TASK_LIST_ID);
    // Verify: each other field is one "key: value" line, and id, subject, description, status are not repeated.
    const reason: string = JSON.parse(result.stdout).reason;
    const lines = reason.split("\n");
    assert.ok(lines.includes("blocks: (none)"));
    assert.ok(lines.includes("blockedBy: 12, 13"));
    assert.ok(lines.includes('metadata: {"source":"user"}'));
    assert.ok(!lines.some(line => line.startsWith("id:")));
    assert.ok(!lines.some(line => line.startsWith("status:")));
});

test("test_number_without_hash_works", () => {
    // Setup: a temp home with task 384.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook with "/task-details 384".
    const result = runHook("/task-details 384", home, TASK_LIST_ID);
    // Verify: the reason names task 384.
    assert.ok(JSON.parse(result.stdout).reason.startsWith("Task #384 (completed):"));
});

test("test_namespaced_command_works", () => {
    // Setup: a temp home with task 384.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook with the plugin-namespaced command.
    const result = runHook("/matkat-hooks:task-details 384", home, TASK_LIST_ID);
    // Verify: the reason names task 384.
    assert.ok(JSON.parse(result.stdout).reason.startsWith("Task #384 (completed):"));
});

test("test_missing_task_file_says_not_found_with_folder", () => {
    // Setup: a temp home with task 384 only.
    const home = makeHomeWithTask("384", completedTask);
    // Action: ask for task 999.
    const result = runHook("/task-details #999", home, TASK_LIST_ID);
    // Verify: the reason says task 999 is not found in the task list folder.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.equal(output.reason, `Task #999: not found in ${home}/.claude/tasks/${TASK_LIST_ID}`);
});

test("test_unset_task_list_id_says_it_is_not_set", () => {
    // Setup: a temp home with task 384 and no CLAUDE_CODE_TASK_LIST_ID.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook.
    const result = runHook("/task-details #384", home, undefined);
    // Verify: the reason says the variable is not set.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.ok(output.reason.includes("CLAUDE_CODE_TASK_LIST_ID is not set"));
});

test("test_no_number_prints_usage", () => {
    // Setup: a temp home with task 384.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook with no number.
    const result = runHook("/task-details", home, TASK_LIST_ID);
    // Verify: the reason is the usage line.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.equal(output.reason, "Usage: /task-details #<number>");
});

test("test_other_prompt_prints_nothing", () => {
    // Setup: a temp home with task 384.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook with a normal prompt.
    const result = runHook("please fix the login bug", home, TASK_LIST_ID);
    // Verify: exit code 0 and empty stdout.
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
});

function makeHomeWithTasks(tasks: Record<string, unknown>[]): string {
    const home = mkdtempSync(`${tmpdir()}/task-details-`);
    const taskFolder = `${home}/.claude/tasks/${TASK_LIST_ID}`;
    mkdirSync(taskFolder, { recursive: true });
    for (const task of tasks)
        writeFileSync(`${taskFolder}/${task.id}.json`, JSON.stringify(task));
    return home;
}

const mixedStatusTasks = [
    { id: "10", subject: "ten pending", description: "d", status: "pending" },
    { id: "2", subject: "two pending", description: "d", status: "pending" },
    { id: "3", subject: "three working", description: "d", status: "in_progress" },
    { id: "4", subject: "four done", description: "d", status: "completed" },
];

test("test_pending_task_list_prints_pending_subjects_sorted_by_number", () => {
    // Setup: a temp home with pending, in_progress and completed tasks.
    const home = makeHomeWithTasks(mixedStatusTasks);
    // Action: run the hook with "/pending-task-list".
    const result = runHook("/pending-task-list", home, TASK_LIST_ID);
    // Verify: the reason is one subject per line, pending only, task 2 before task 10.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.equal(output.reason, "two pending\nten pending");
});

test("test_in_progress_task_list_prints_in_progress_subjects", () => {
    // Setup: a temp home with pending, in_progress and completed tasks.
    const home = makeHomeWithTasks(mixedStatusTasks);
    // Action: run the hook with the plugin-namespaced "/in-progress-task-list".
    const result = runHook("/matkat-hooks:in-progress-task-list", home, TASK_LIST_ID);
    // Verify: the reason is the in_progress subject only.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.equal(output.reason, "three working");
});

test("test_task_list_with_no_matching_tasks_says_there_are_none", () => {
    // Setup: a temp home with one completed task.
    const home = makeHomeWithTasks([{ id: "4", subject: "four done", description: "d", status: "completed" }]);
    // Action: run the hook with "/pending-task-list".
    const result = runHook("/pending-task-list", home, TASK_LIST_ID);
    // Verify: the reason is one short line saying there are none.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.equal(output.reason, "No pending tasks.");
});

test("test_task_list_with_unset_task_list_id_says_it_is_not_set", () => {
    // Setup: a temp home with tasks and no CLAUDE_CODE_TASK_LIST_ID.
    const home = makeHomeWithTasks(mixedStatusTasks);
    // Action: run the hook with "/in-progress-task-list".
    const result = runHook("/in-progress-task-list", home, undefined);
    // Verify: the reason says the variable is not set.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.ok(output.reason.includes("CLAUDE_CODE_TASK_LIST_ID is not set"));
});

test("test_similar_command_name_prints_nothing", () => {
    // Setup: a temp home with task 384.
    const home = makeHomeWithTask("384", completedTask);
    // Action: run the hook with "/task-details-extra 384".
    const result = runHook("/task-details-extra 384", home, TASK_LIST_ID);
    // Verify: exit code 0 and empty stdout.
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
});
