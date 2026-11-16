import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function runScriptWithBun(scriptName: string, scriptArguments: string[], workDirectory: string) {
  return spawnSync("bun", [`${import.meta.dirname}/${scriptName}`, ...scriptArguments], { encoding: "utf8", cwd: workDirectory, env: { ...process.env, BUN_JSC_useTailCalls: "0" } });
}

test("test_startClaudeTmux_throws_without_a_name", () => {
  // Scenario: claude-tmux starts with no arguments.
  // Step 1: run startClaudeTmux.ts with no arguments.
  const result = runScriptWithBun("startClaudeTmux.ts", [], import.meta.dirname);
  // Step 2: check that it fails and the error says a name is needed.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /claude-tmux needs --name/);
});

test("test_startClaudeTmux_throws_outside_a_git_repository", () => {
  // Scenario: claude-tmux starts in a folder that is not a git repository.
  // Step 1: make a new temporary folder with no git.
  const plainFolder = mkdtempSync(join(tmpdir(), "claude-tmux-plain-"));
  // Step 2: check that git fails in that folder, so the test proves what it claims.
  const gitResult = spawnSync("git", ["-C", plainFolder, "rev-parse"], { encoding: "utf8" });
  assert.notEqual(gitResult.status, 0);
  // Step 3: run startClaudeTmux.ts with a name in that folder.
  const result = runScriptWithBun("startClaudeTmux.ts", ["--name", "t"], plainFolder);
  // Step 4: check that it fails and the error says the start must be inside a git repository.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must start inside a git repository/);
});

test("test_startClaudeTmux_throws_when_a_tmux_session_with_the_name_exists", (t) => {
  // Scenario: a tmux session with the chosen name is already open.
  // Step 1: start a tmux session named claude-tmux-test-PID. Kill it when the test ends.
  const sessionName = `claude-tmux-test-${process.pid}`;
  const newSessionResult = spawnSync("tmux", ["new-session", "-d", "-s", sessionName, "sleep", "60"], { encoding: "utf8" });
  assert.equal(newSessionResult.status, 0);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${sessionName}`]);
  });
  // Step 2: make a new temporary folder and run git init in it.
  const gitFolder = mkdtempSync(join(tmpdir(), "claude-tmux-git-"));
  const gitInitResult = spawnSync("git", ["init"], { encoding: "utf8", cwd: gitFolder });
  assert.equal(gitInitResult.status, 0);
  // Step 3: run startClaudeTmux.ts with the same name in that folder.
  const result = runScriptWithBun("startClaudeTmux.ts", ["--name", sessionName], gitFolder);
  // Step 4: check that it fails and the error says the session already exists.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already exists/);
});

// test("test_swapSingleChat_throws_without_exactly_six_arguments", () => {
test("test_swapSingleChat_throws_without_exactly_seven_arguments", () => {
  // Scenario: swapSingleChat.ts gets five arguments, not seven.
  // Step 1: run swapSingleChat.ts with five arguments.
  const result = runScriptWithBun("swapSingleChat.ts", ["a", "1", "sonnet", "/w", "%1"], import.meta.dirname);
  // Step 2: check that it fails and the error shows the usage line.
  assert.notEqual(result.status, 0);
  // assert.match(result.stderr, /usage: swapSingleChat.ts/);
  assert.match(result.stderr, /usage: swapSingleChat\.ts .*<swapPercent>/);
});

// test("test_swapSingleChatFailed_throws_without_exactly_six_arguments", () => {
test("test_swapSingleChatFailed_throws_without_exactly_seven_arguments", () => {
  // Scenario: swapSingleChatFailed.ts gets five arguments, not seven.
  // Step 1: run swapSingleChatFailed.ts with five arguments.
  const result = runScriptWithBun("swapSingleChatFailed.ts", ["a", "1", "sonnet", "/w", "%1"], import.meta.dirname);
  // Step 2: check that it fails and the error shows the usage line.
  assert.notEqual(result.status, 0);
  // assert.match(result.stderr, /usage: swapSingleChatFailed.ts/);
  assert.match(result.stderr, /usage: swapSingleChatFailed\.ts .*<swapPercent>/);
});
