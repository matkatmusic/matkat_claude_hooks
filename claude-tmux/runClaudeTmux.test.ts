import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

function runScriptWithBun(scriptName: string, scriptArguments: string[], workDirectory: string) {
  return spawnSync("bun", [`${import.meta.dirname}/${scriptName}`, ...scriptArguments], { encoding: "utf8", cwd: workDirectory, env: { ...process.env, BUN_JSC_useTailCalls: "0" } });
}

test("test_runClaudeTmux_with_the_team_flag_starts_team_mode", () => {
  // Scenario: claude-tmux starts with the --team flag and no name.
  // Step 1: run runClaudeTmux.ts with only --team.
  const result = runScriptWithBun("runClaudeTmux.ts", ["--team"], import.meta.dirname);
  // Step 2: check that it fails and the error comes from team mode.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claude-tmux --team needs --name/);
});

test("test_runClaudeTmux_without_the_team_flag_starts_one_chat_mode", () => {
  // Scenario: claude-tmux starts with no arguments.
  // Step 1: run runClaudeTmux.ts with no arguments.
  const result = runScriptWithBun("runClaudeTmux.ts", [], import.meta.dirname);
  // Step 2: check that it fails and the error comes from one-chat mode.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claude-tmux needs --name/);
  // Step 3: check that the error does not come from team mode.
  assert.doesNotMatch(result.stderr, /--team needs/);
});
