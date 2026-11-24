#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";

const HOOK_FILE = `${import.meta.dirname}/checkPlanFormat.ts`;

const VALID_PLAN = { title: "A plan", sections: [{ id: "step-1", intent: "Fix it.", how: "Edit a.ts." }] };

function makePlansFolder(): string {
    const projectFolder = mkdtempSync(`${tmpdir()}/planFormat-`);
    mkdirSync(`${projectFolder}/plans`);
    return `${projectFolder}/plans`;
}

function runHook(toolName: string, toolInput: Record<string, string>) {
    const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput });
    const hook = spawnSync("bun", [HOOK_FILE], { input, encoding: "utf8" });
    const hasOutput = hook.stdout.trim() !== "";
    if (hasOutput)
        return JSON.parse(hook.stdout).hookSpecificOutput;
    return undefined;
}

function writePlanJson(plansFolder: string, plan: unknown) {
    return runHook("Write", { file_path: `${plansFolder}/a.plan.json`, content: JSON.stringify(plan) });
}

test("test_denies_write_of_markdown_file_in_plans_folder", () => {
    // Steps: a Write targets plans/a.md.
    const output = runHook("Write", { file_path: `${makePlansFolder()}/a.md`, content: "# plan" });
    // The hook denies it and names the .plan.json file to write instead.
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /a\.plan\.json/);
});

test("test_denies_edit_of_markdown_file_in_plans_folder", () => {
    const output = runHook("Edit", { file_path: `${makePlansFolder()}/a.md`, old_string: "x", new_string: "y" });
    assert.equal(output.permissionDecision, "deny");
});

test("test_allows_markdown_file_outside_plans_folder", () => {
    assert.equal(runHook("Write", { file_path: "/work/docs/a.md", content: "# doc" }), undefined);
});

test("test_allows_markdown_file_in_claude_plans_folder_of_home", () => {
    assert.equal(runHook("Write", { file_path: `${homedir()}/.claude/plans/a.md`, content: "# plan" }), undefined);
});

test("test_allows_valid_plan_json", () => {
    assert.equal(writePlanJson(makePlansFolder(), VALID_PLAN), undefined);
});

test("test_denies_plan_json_that_is_not_valid_json", () => {
    const output = runHook("Write", { file_path: `${makePlansFolder()}/a.plan.json`, content: "{not json" });
    assert.equal(output.permissionDecision, "deny");
});

test("test_denies_plan_json_without_sections", () => {
    const output = writePlanJson(makePlansFolder(), { title: "A plan" });
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /sections/);
});

test("test_denies_plan_json_with_section_without_intent", () => {
    const output = writePlanJson(makePlansFolder(), { title: "A plan", sections: [{ id: "step-1", how: "Edit a.ts." }] });
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /intent/);
});

test("test_denies_plan_json_with_duplicate_section_ids", () => {
    const section = { id: "step-1", intent: "Fix it.", how: "Edit a.ts." };
    const output = writePlanJson(makePlansFolder(), { title: "A plan", sections: [section, section] });
    assert.equal(output.permissionDecision, "deny");
    assert.match(output.permissionDecisionReason, /step-1/);
});

test("test_allows_json_in_plans_folder_that_is_not_a_plan_file", () => {
    const output = runHook("Write", { file_path: `${makePlansFolder()}/papercuts-prune.json`, content: JSON.stringify([1, 2]) });
    assert.equal(output, undefined);
});

test("test_checks_the_result_of_an_edit_of_plan_json", () => {
    // Steps: a valid plan file exists on disk.
    const plansFolder = makePlansFolder();
    writeFileSync(`${plansFolder}/a.plan.json`, JSON.stringify(VALID_PLAN));
    const filePath = `${plansFolder}/a.plan.json`;
    // An edit that renames the "how" key leaves a section without how: denied.
    const badOutput = runHook("Edit", { file_path: filePath, old_string: '"how"', new_string: '"hoo"' });
    assert.equal(badOutput.permissionDecision, "deny");
    // An edit that changes the title text keeps the plan valid: allowed.
    assert.equal(runHook("Edit", { file_path: filePath, old_string: "A plan", new_string: "Another plan" }), undefined);
});
