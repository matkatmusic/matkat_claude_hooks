import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { buildTeamRuleContext, getTeamRole, TeamRole } from "./teamRuleOnStart.ts";

const mainRule = "supervisor of {baseName}";
const helperRule = "helper of {baseName}";

test("test_getTeamRole_returns_nothing_when_the_name_is_missing", () => {
    // Step: ask for the role of a chat with no CLAUDE_TMUX_NAME. Check that the answer is undefined.
    assert.equal(getTeamRole(undefined), undefined);
});

test("test_getTeamRole_returns_main_with_the_whole_name", () => {
    // Step: ask for the role of the chat name "bed". Check the role is main and the base name is "bed".
    assert.deepEqual(getTeamRole("bed"), { role: TeamRole.Main, baseName: "bed" });
});

test("test_getTeamRole_returns_helper_without_the_helper_suffix", () => {
    // Step: ask for the role of the chat name "bed helper". Check the role is helper and the base name is "bed".
    assert.deepEqual(getTeamRole("bed helper"), { role: TeamRole.Helper, baseName: "bed" });
});

test("test_buildTeamRuleContext_fills_the_main_rule", () => {
    // Step: build the context for "bed". Check that it is the main rule with the base name "bed".
    assert.equal(buildTeamRuleContext("bed", mainRule, helperRule), "supervisor of bed");
});

test("test_buildTeamRuleContext_fills_the_helper_rule", () => {
    // Step: build the context for "bed helper". Check that it is the helper rule with the base name "bed".
    assert.equal(buildTeamRuleContext("bed helper", mainRule, helperRule), "helper of bed");
});

test("test_buildTeamRuleContext_returns_nothing_when_the_name_is_missing", () => {
    // Step: build the context with no name. Check that the answer is undefined.
    assert.equal(buildTeamRuleContext(undefined, mainRule, helperRule), undefined);
});

test("test_teamRuleOnStart_script_prints_nothing_without_CLAUDE_TMUX_NAME", () => {
    // Step: run the script with no CLAUDE_TMUX_NAME. Check that it exits 0 and prints nothing.
    const environment = { ...process.env };
    delete environment.CLAUDE_TMUX_NAME;
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/teamRuleOnStart.ts`], { encoding: "utf8", env: environment, input: "{}" });
    assert.equal(scriptResult.status, 0);
    assert.equal(scriptResult.stdout, "");
});

test("test_teamRuleOnStart_script_prints_the_helper_rule_as_additional_context", () => {
    // Step: run the script with CLAUDE_TMUX_NAME "bed helper". Check that the output holds the helper rule for "bed".
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/teamRuleOnStart.ts`], { encoding: "utf8", env: { ...process.env, CLAUDE_TMUX_NAME: "bed helper" }, input: "{}" });
    assert.equal(scriptResult.status, 0);
    const output = JSON.parse(scriptResult.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(output.hookSpecificOutput.additionalContext, /You are a helper of the team bed\./);
});
