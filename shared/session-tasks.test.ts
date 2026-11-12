#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { buildSubjectListForStatus, findTaskFolder, TASK_LIST_ID_NOT_SET_REASON } from "./session-tasks.ts";

const modulePath = `${import.meta.dirname}/session-tasks.ts`;

function runModuleSnippet(snippet: string, input: string) {
    const code = `import * as sessionTasks from ${JSON.stringify(modulePath)};\n${snippet}`;
    return spawnSync("node", ["--input-type=module", "-e", code], { encoding: "utf8", input });
}

function makeTaskFolder(tasks: Record<string, unknown>[]): string {
    const taskFolder = mkdtempSync(`${tmpdir()}/session-tasks-`);
    for (const task of tasks)
        writeFileSync(`${taskFolder}/${task.id}.json`, JSON.stringify(task));
    return taskFolder;
}

test("test_readPromptFromStdin_strips_plugin_namespace_and_leading_space", () => {
    // Action: read a namespaced prompt with leading spaces from stdin.
    const input = JSON.stringify({ prompt: "  /matkat-hooks:task-details 5" });
    const result = runModuleSnippet("console.log(JSON.stringify(sessionTasks.readPromptFromStdin()));", input);
    // Verify: the namespace and the leading spaces are gone.
    assert.equal(JSON.parse(result.stdout), "/task-details 5");
});

test("test_readPromptFromStdin_returns_empty_text_when_prompt_is_not_a_string", () => {
    // Action: read a payload with no prompt.
    const result = runModuleSnippet("console.log(JSON.stringify(sessionTasks.readPromptFromStdin()));", JSON.stringify({}));
    // Verify: the prompt is empty text.
    assert.equal(JSON.parse(result.stdout), "");
});

test("test_writeBlockDecision_prints_block_json_line", () => {
    // Action: write a block decision.
    const result = runModuleSnippet('sessionTasks.writeBlockDecision("because");', "");
    // Verify: stdout is one JSON line with decision block and the reason.
    assert.equal(result.stdout, '{"decision":"block","reason":"because"}\n');
});

test("test_findTaskFolder_returns_folder_under_home", () => {
    // Setup: a task list id and a home folder.
    process.env.CLAUDE_CODE_TASK_LIST_ID = "demo-list";
    process.env.HOME = "/home/demo";
    // Verify: the folder is home/.claude/tasks/<id>.
    assert.equal(findTaskFolder(), "/home/demo/.claude/tasks/demo-list");
});

test("test_findTaskFolder_returns_undefined_when_task_list_id_is_not_set", () => {
    // Setup: no task list id.
    delete process.env.CLAUDE_CODE_TASK_LIST_ID;
    // Verify: no folder is found.
    assert.equal(findTaskFolder(), undefined);
});

test("test_task_list_id_not_set_reason_names_the_variable", () => {
    assert.ok(TASK_LIST_ID_NOT_SET_REASON.includes("CLAUDE_CODE_TASK_LIST_ID is not set"));
});

test("test_buildSubjectListForStatus_lists_matching_subjects_sorted_by_number", () => {
    // Setup: a folder with pending, in_progress and completed tasks.
    const taskFolder = makeTaskFolder([
        { id: "10", subject: "ten pending", status: "pending" },
        { id: "2", subject: "two pending", status: "pending" },
        { id: "3", subject: "three working", status: "in_progress" },
        { id: "4", subject: "four done", status: "completed" },
    ]);
    // Verify: pending subjects only, task 2 before task 10.
    assert.equal(buildSubjectListForStatus(taskFolder, "pending"), "two pending\nten pending");
});

test("test_buildSubjectListForStatus_says_none_for_no_match", () => {
    // Setup: a folder with one completed task.
    const taskFolder = makeTaskFolder([{ id: "4", subject: "four done", status: "completed" }]);
    // Verify: the in_progress sentence uses a space, not an underscore.
    assert.equal(buildSubjectListForStatus(taskFolder, "in_progress"), "No in progress tasks.");
});
