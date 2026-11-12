#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const scriptPath = `${import.meta.dirname}/pending-task-list.ts`;
const TASK_LIST_ID = "demo-list";

function runHook(prompt: string, home: string, taskListId: string | undefined) {
    const env: Record<string, string | undefined> = { ...process.env, HOME: home };
    delete env.CLAUDE_CODE_TASK_LIST_ID;
    if (taskListId !== undefined)
        env.CLAUDE_CODE_TASK_LIST_ID = taskListId;
    const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt, cwd: home });
    return spawnSync("node", [scriptPath], { encoding: "utf8", env, input });
}

function makeHomeWithTasks(tasks: Record<string, unknown>[]): string {
    const home = mkdtempSync(`${tmpdir()}/pending-task-list-`);
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

test("test_namespaced_pending_task_list_works", () => {
    // Setup: a temp home with pending, in_progress and completed tasks.
    const home = makeHomeWithTasks(mixedStatusTasks);
    // Action: run the hook with the plugin-namespaced command.
    const result = runHook("/matkat-hooks:pending-task-list", home, TASK_LIST_ID);
    // Verify: the reason is the pending subjects.
    assert.equal(JSON.parse(result.stdout).reason, "two pending\nten pending");
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
    // Action: run the hook with "/pending-task-list".
    const result = runHook("/pending-task-list", home, undefined);
    // Verify: the reason says the variable is not set.
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, "block");
    assert.ok(output.reason.includes("CLAUDE_CODE_TASK_LIST_ID is not set"));
});

test("test_other_prompt_prints_nothing", () => {
    // Setup: a temp home with tasks.
    const home = makeHomeWithTasks(mixedStatusTasks);
    // Action: run the hook with the in-progress command, which this hook ignores.
    const result = runHook("/in-progress-task-list", home, TASK_LIST_ID);
    // Verify: exit code 0 and empty stdout.
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
});
