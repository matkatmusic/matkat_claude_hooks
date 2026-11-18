import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

test("test_openHelperChats_throws_without_tmux_pane", () => {
    // Step 1: make a copy of the environment that has no tmux pane.
    const environment: NodeJS.ProcessEnv = { ...process.env };
    delete environment.TMUX_PANE;
    // Step 2: run the script with the two arguments.
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/openHelperChats.ts`, "bed", "2"], { encoding: "utf8", env: environment });
    // Step 3: the script fails, names TMUX_PANE, and prints nothing to stdout.
    assert.notEqual(scriptResult.status, 0);
    assert.match(scriptResult.stderr, /TMUX_PANE/);
    assert.equal(scriptResult.stdout, "");
});

test("test_openHelperChats_throws_without_chat_number", () => {
    // Step 1: make a copy of the environment that has a tmux pane and a chat name, but no chat number.
    const environment: NodeJS.ProcessEnv = { ...process.env, TMUX_PANE: "%999", CLAUDE_TMUX_NAME: "X" };
    delete environment.CLAUDE_TMUX_CHAT_NUMBER;
    // Step 2: run the script with the two arguments.
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/openHelperChats.ts`, "bed", "2"], { encoding: "utf8", env: environment });
    // Step 3: the script fails, names CLAUDE_TMUX_CHAT_NUMBER, and prints nothing to stdout.
    assert.notEqual(scriptResult.status, 0);
    assert.match(scriptResult.stderr, /CLAUDE_TMUX_CHAT_NUMBER/);
    assert.equal(scriptResult.stdout, "");
});

test("test_openHelperChats_throws_without_exactly_two_arguments", () => {
    // Step 1: run the script with one argument.
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/openHelperChats.ts`, "bed"], { encoding: "utf8", env: { ...process.env, TMUX_PANE: "%999" } });
    // Step 2: the script fails and prints the usage line.
    assert.notEqual(scriptResult.status, 0);
    assert.match(scriptResult.stderr, /usage: openHelperChats.ts/);
});

test("test_openHelperChats_throws_for_zero_helpers", () => {
    // Step 1: run the script with the helper count 0.
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/openHelperChats.ts`, "bed", "0"], { encoding: "utf8", env: { ...process.env, TMUX_PANE: "%999" } });
    // Step 2: the script fails and prints nothing to stdout.
    assert.notEqual(scriptResult.status, 0);
    assert.equal(scriptResult.stdout, "");
});
