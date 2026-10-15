#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR = "/tmp/tasktools-npm-test";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS = "3600";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS = "120000";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS = "604800000";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_MONITOR_WAIT_SECONDS = "240";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_MONITOR_POLL_SECONDS = "2";

const MONITOR_SCRIPT = `${import.meta.dirname}/monitor-test-run.ts`;
// node --test sets these; if the hook inherits them, its nested node --test run skips the file.
const HOOK_TEST_ENV = { ...process.env };
delete HOOK_TEST_ENV.NODE_TEST_CONTEXT;
delete HOOK_TEST_ENV.NODE_TEST_WORKER_ID;

test("hook: returns immediately, and the one-file test run finishes in the background", () => {
  const project = mkdtempSync(`${tmpdir()}/background-run-`);
  writeFileSync(`${project}/package.json`, "{}");
  writeFileSync(`${project}/slow.test.js`, 'require("node:test").test("slow", async () => { await new Promise((r) => setTimeout(r, 3000)); });');
  const input = JSON.stringify({ cwd: project, tool_input: { command: "node --test slow.test.js" } });
  const start = Date.now();
  const hook = spawnSync("node", [`${import.meta.dirname}/block-npm-test.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  assert.ok(Date.now() - start < 2500, "the hook does not wait for the 3 second test");
  const reason: string = JSON.parse(hook.stdout).hookSpecificOutput.permissionDecisionReason;
  const monitorCommand = reason.match(/node \S+monitor-test-run\.ts (\S+\.log)/);
  assert.ok(monitorCommand, reason);
  const monitor = spawnSync("node", [MONITOR_SCRIPT, monitorCommand[1], "30"], { encoding: "utf8" });
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
  const input = JSON.stringify({ cwd: project, tool_input: { command: "node --test --test-name-pattern=^keep$ two.test.js" } });
  const hook = spawnSync("node", [`${import.meta.dirname}/block-npm-test.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  const reason: string = JSON.parse(hook.stdout).hookSpecificOutput.permissionDecisionReason;
  const monitorCommand = reason.match(/node \S+monitor-test-run\.ts (\S+\.log)/);
  assert.ok(monitorCommand, reason);
  const monitor = spawnSync("node", [MONITOR_SCRIPT, monitorCommand[1], "30"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  assert.match(monitor.stdout, /exit code: 0/);
  const log = readFileSync(monitorCommand[1], "utf8");
  assert.match(log, /pass 1/);
  assert.match(log, /ℹ tests 1/);
});

test("hook: returns immediately, and the full-suite test run finishes in the background", () => {
  const project = mkdtempSync(`${tmpdir()}/background-run-`);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(`${project}/fast.test.js`, 'require("node:test").test("fast", () => {});');
  const input = JSON.stringify({ cwd: project, tool_input: { command: "npm test" } });
  const start = Date.now();
  const hook = spawnSync("node", [`${import.meta.dirname}/block-npm-test.ts`], { input, encoding: "utf8", env: HOOK_TEST_ENV });
  assert.ok(Date.now() - start < 2500, "the hook does not wait for the suite to finish");
  const reason: string = JSON.parse(hook.stdout).hookSpecificOutput.permissionDecisionReason;
  const monitorCommand = reason.match(/node \S+monitor-test-run\.ts (\S+\.log)/);
  assert.ok(monitorCommand, reason);
  const monitor = spawnSync("node", [MONITOR_SCRIPT, monitorCommand[1], "30"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  assert.match(monitor.stdout, /all passing/);
  assert.match(monitor.stdout, /exit code: 0/);
});
