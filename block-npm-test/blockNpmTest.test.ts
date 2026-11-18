#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const HOOK_SETTINGS = {
  CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR: "/tmp/tasktools-npm-test",
  CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS: "3600",
  CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS: "120000",
  CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS: "604800000",
};

const MONITOR_SCRIPT = `${import.meta.dirname}/monitorTestRun.ts`;
// node --test sets these; if the hook inherits them, its nested node --test run skips the file.
const HOOK_TEST_ENV = { ...process.env };
delete HOOK_TEST_ENV.NODE_TEST_CONTEXT;
delete HOOK_TEST_ENV.NODE_TEST_WORKER_ID;

test("hook: returns immediately, and the one-file test run finishes in the background", () => {
  const project = mkdtempSync(`${tmpdir()}/background-run-`);
  writeFileSync(`${project}/package.json`, "{}");
  writeFileSync(`${project}/slow.test.js`, 'require("node:test").test("slow", async () => { await new Promise((r) => setTimeout(r, 3000)); });');
  const input = JSON.stringify({ cwd: project, tool_input: { command: "node --test slow.test.js" }, settings: HOOK_SETTINGS });
  const start = Date.now();
  const hook = spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  assert.ok(Date.now() - start < 2500, "the hook does not wait for the 3 second test");
  const reason: string = JSON.parse(hook.stdout).hookSpecificOutput.permissionDecisionReason;
  const monitorCommand = reason.match(/bun \S+monitorTestRun\.ts (\S+\.log)/);
  assert.ok(monitorCommand, reason);
  const monitor = spawnSync("bun", [MONITOR_SCRIPT, monitorCommand[1], "30"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  assert.match(monitor.stdout, /exit code: 0/);
  assert.match(readFileSync(monitorCommand[1], "utf8"), /pass 1/);
});

test("hook: a --test-name-pattern flag scopes the background run to one test in the file", () => {
  const project = mkdtempSync(`${tmpdir()}/background-run-`);
  writeFileSync(`${project}/package.json`, "{}");
  writeFileSync(
    `${project}/two.test.js`,
    'const { test } = require("node:test"); test("keep", () => {}); test("skip", () => { throw new Error("should not run"); });',
  );
  const input = JSON.stringify({ cwd: project, tool_input: { command: "node --test --test-name-pattern=^keep$ two.test.js" }, settings: HOOK_SETTINGS });
  const hook = spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  const reason: string = JSON.parse(hook.stdout).hookSpecificOutput.permissionDecisionReason;
  const monitorCommand = reason.match(/bun \S+monitorTestRun\.ts (\S+\.log)/);
  assert.ok(monitorCommand, reason);
  const monitor = spawnSync("bun", [MONITOR_SCRIPT, monitorCommand[1], "30"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  assert.match(monitor.stdout, /exit code: 0/);
  const log = readFileSync(monitorCommand[1], "utf8");
  assert.match(log, /pass 1/);
  assert.match(log, /ℹ tests 1/);
});

function runHook(project: string, command: string, env = HOOK_TEST_ENV) {
  const input = JSON.stringify({ cwd: project, tool_input: { command }, settings: HOOK_SETTINGS });
  return spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env });
}

function monitorLogPaths(hookStdout: string): string[] {
  const reason: string = JSON.parse(hookStdout).hookSpecificOutput.permissionDecisionReason;
  const logPaths: string[] = [];
  for (const match of reason.matchAll(/bun \S+monitorTestRun\.ts (\S+\.log)/g))
    logPaths.push(match[1]);
  return logPaths;
}

function waitForLog(logPath: string): string {
  const monitor = spawnSync("bun", [MONITOR_SCRIPT, logPath, "30"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  return monitor.stdout;
}

test("hook: a named test file runs with the runner Claude typed", () => {
  const project = mkdtempSync(`${tmpdir()}/typed-runner-`);
  writeFileSync(`${project}/package.json`, "{}");
  const binDir = mkdtempSync(`${tmpdir()}/fake-bin-`);
  writeFileSync(`${binDir}/jest`, '#!/bin/sh\necho "fake jest ran: $@"\n');
  chmodSync(`${binDir}/jest`, 0o755);
  const hook = runHook(project, "jest math.test.ts", { ...HOOK_TEST_ENV, PATH: `${binDir}:${process.env.PATH}` });
  const logPaths = monitorLogPaths(hook.stdout);
  assert.equal(logPaths.length, 1, hook.stdout);
  waitForLog(logPaths[0]);
  assert.match(readFileSync(logPaths[0], "utf8"), /fake jest ran: math\.test\.ts/);
});

test("hook: every test command in the line starts its own background run", () => {
  const project = mkdtempSync(`${tmpdir()}/two-runs-`);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(`${project}/fast.test.js`, 'require("node:test").test("fast", () => {});');
  const hook = runHook(project, "npm test && node --test fast.test.js");
  const logPaths = monitorLogPaths(hook.stdout);
  assert.equal(logPaths.length, 2, hook.stdout);
  assert.notEqual(logPaths[0], logPaths[1]);
  assert.match(waitForLog(logPaths[0]), /all passing/);
  assert.match(waitForLog(logPaths[1]), /exit code: 0/);
});

test("hook: a test command inside bash -c quotes is blocked too", () => {
  const project = mkdtempSync(`${tmpdir()}/bash-c-`);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(`${project}/fast.test.js`, 'require("node:test").test("fast", () => {});');
  const hook = runHook(project, 'bash -c "npm test"');
  const logPaths = monitorLogPaths(hook.stdout);
  assert.equal(logPaths.length, 1, hook.stdout);
  assert.match(waitForLog(logPaths[0]), /all passing/);
});

test("hook: a cd into a folder that an earlier step makes lets the command run as typed", () => {
  const project = mkdtempSync(`${tmpdir()}/new-dir-`);
  writeFileSync(`${project}/package.json`, "{}");
  const hook = runHook(project, "mkdir newdir && cd newdir && npm test");
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
});

const CTX_EXECUTE_TOOL_NAME = "mcp__plugin_context-mode_context-mode__ctx_execute";

test("test_ctx_execute_shell_test_command_is_denied_like_bash", () => {
  // The project has a package.json with a test script.
  const project = mkdtempSync(`${tmpdir()}/ctx-execute-`);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(`${project}/fast.test.js`, 'require("node:test").test("fast", () => {});');
  // The hook gets a ctx_execute call with shell code that runs npm test.
  const input = JSON.stringify({ cwd: project, tool_name: CTX_EXECUTE_TOOL_NAME, tool_input: { language: "shell", code: "npm test" }, settings: HOOK_SETTINGS });
  const hook = spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  // The hook denies the call and names the monitor command.
  assert.equal(JSON.parse(hook.stdout).hookSpecificOutput.permissionDecision, "deny");
  const logPaths = monitorLogPaths(hook.stdout);
  assert.equal(logPaths.length, 1, hook.stdout);
  // The background run finishes, so no test run is left behind.
  assert.match(waitForLog(logPaths[0]), /all passing/);
});

test("test_ctx_execute_shell_code_without_test_command_passes", () => {
  // The project has a package.json.
  const project = mkdtempSync(`${tmpdir()}/ctx-execute-`);
  writeFileSync(`${project}/package.json`, "{}");
  // The hook gets a ctx_execute call with shell code that is not a test command.
  const input = JSON.stringify({ cwd: project, tool_name: CTX_EXECUTE_TOOL_NAME, tool_input: { language: "shell", code: "ls" }, settings: HOOK_SETTINGS });
  const hook = spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  // The hook says nothing.
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
});

test("test_ctx_execute_non_shell_language_passes", () => {
  // The project has a package.json.
  const project = mkdtempSync(`${tmpdir()}/ctx-execute-`);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: "node --test" } }));
  // The hook gets a ctx_execute call in another language whose code contains npm test.
  const input = JSON.stringify({ cwd: project, tool_name: CTX_EXECUTE_TOOL_NAME, tool_input: { language: "javascript", code: "npm test" }, settings: HOOK_SETTINGS });
  const hook = spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  // The hook says nothing.
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout, "");
});

test("hook: returns immediately, and the full-suite test run finishes in the background", () => {
  const project = mkdtempSync(`${tmpdir()}/background-run-`);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(`${project}/fast.test.js`, 'require("node:test").test("fast", () => {});');
  const input = JSON.stringify({ cwd: project, tool_input: { command: "npm test" }, settings: HOOK_SETTINGS });
  const start = Date.now();
  const hook = spawnSync("bun", [`${import.meta.dirname}/blockNpmTest.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  assert.ok(Date.now() - start < 2500, "the hook does not wait for the suite to finish");
  const reason: string = JSON.parse(hook.stdout).hookSpecificOutput.permissionDecisionReason;
  const monitorCommand = reason.match(/bun \S+monitorTestRun\.ts (\S+\.log)/);
  assert.ok(monitorCommand, reason);
  const monitor = spawnSync("bun", [MONITOR_SCRIPT, monitorCommand[1], "30"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  assert.match(monitor.stdout, /all passing/);
  assert.match(monitor.stdout, /exit code: 0/);
});
