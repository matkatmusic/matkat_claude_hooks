#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS = "604800000";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_MONITOR_WAIT_SECONDS = "240";
process.env.CLAUDE_HOOKS_BLOCK_NPM_TEST_MONITOR_POLL_SECONDS = "2";
const { buildBackgroundTestScript, buildInitialPass, removeOldLogs } = await import("./block-npm-test-scripts.ts");

const MONITOR_SCRIPT = `${import.meta.dirname}/monitor-test-run.ts`;

test("buildInitialPass: embeds the log path in the tee line and the awk message", () => {
  const script = buildInitialPass("/tmp/tasktools-npm-test/123.log");
  assert.match(script, /\| tee \/tmp\/tasktools-npm-test\/123\.log \\/);
  assert.match(script, /see \/tmp\/tasktools-npm-test\/123\.log/);
});

function runInitialPassWithSuiteOutput(suiteOutput: string, exitCode: number): string {
  const project = mkdtempSync(`${tmpdir()}/initial-pass-`);
  writeFileSync(`${project}/suite-output.txt`, suiteOutput);
  writeFileSync(`${project}/package.json`, JSON.stringify({ scripts: { test: `cat suite-output.txt; exit ${exitCode}` } }));
  const run = spawnSync("bash", ["-c", buildInitialPass(`${project}/run.log`)], { cwd: project, encoding: "utf8" });
  return run.stdout;
}

test("buildInitialPass: a failed test name prints once, even when node --test lists it twice", () => {
  const output = runInitialPassWithSuiteOutput(
    "✖ bad one (0.3ms)\nℹ tests 2\nℹ pass 1\nℹ fail 1\n✖ failing tests:\n\ntest at x.test.js:1:1\n✖ bad one (0.3ms)\n  Error: x\n",
    1,
  );
  const lines = output.split("\n");
  let nameCount = 0;
  for (const line of lines) {
    const isBadOne = line.startsWith("✖ bad one");
    if (isBadOne)
      nameCount++;
  }
  assert.equal(nameCount, 1, output);
});

test("buildInitialPass: reads the jest summary", () => {
  const failing = runInitialPassWithSuiteOutput("FAIL ./math.test.ts\n  ● add › adds\nTest Suites: 1 failed, 1 total\nTests:       1 failed, 2 passed, 3 total\n", 1);
  assert.match(failing, /FAIL \.\/math\.test\.ts/);
  assert.doesNotMatch(failing, /stopped before producing a summary/);
  assert.doesNotMatch(failing, /all passing/);
  const passing = runInitialPassWithSuiteOutput("Test Suites: 1 passed, 1 total\nTests:       3 passed, 3 total\n", 0);
  assert.match(passing, /all passing/);
});

test("buildInitialPass: reads the vitest summary", () => {
  const failing = runInitialPassWithSuiteOutput(" FAIL  math.test.ts > add\n Test Files  1 failed (1)\n      Tests  1 failed | 2 passed (3)\n", 1);
  assert.match(failing, /FAIL/);
  assert.doesNotMatch(failing, /all passing|stopped before producing a summary/);
  const passing = runInitialPassWithSuiteOutput(" Test Files  1 passed (1)\n      Tests  3 passed (3)\n", 0);
  assert.match(passing, /all passing/);
});

test("buildInitialPass: reads the mocha summary", () => {
  const failing = runInitialPassWithSuiteOutput("  2 passing (5ms)\n  1 failing\n\n  1) add\n       adds:\n", 1);
  assert.match(failing, /1\) add/);
  assert.doesNotMatch(failing, /all passing|stopped before producing a summary/);
  const passing = runInitialPassWithSuiteOutput("  3 passing (5ms)\n", 0);
  assert.match(passing, /all passing/);
});

test("buildInitialPass: reads the bun test summary", () => {
  const failing = runInitialPassWithSuiteOutput("(fail) add adds\n\n 2 pass\n 1 fail\nRan 3 tests across 1 file.\n", 1);
  assert.match(failing, /\(fail\) add adds/);
  assert.doesNotMatch(failing, /all passing|stopped before producing a summary/);
  const passing = runInitialPassWithSuiteOutput(" 3 pass\n 0 fail\nRan 3 tests across 1 file.\n", 0);
  assert.match(passing, /all passing/);
});

test("removeOldLogs: deletes files older than 7 days, keeps fresh ones", () => {
  const dir = mkdtempSync(`${tmpdir()}/tasktools-npm-test-`);
  writeFileSync(`${dir}/old.log`, "old");
  writeFileSync(`${dir}/fresh.log`, "fresh");
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  utimesSync(`${dir}/old.log`, eightDaysAgo, eightDaysAgo);
  removeOldLogs(dir, Date.now());
  assert.deepEqual(readdirSync(dir), ["fresh.log"]);
});

test("buildBackgroundTestScript: writes the summary, then renames it to the done file", () => {
  const script = buildBackgroundTestScript("npm test", "/tmp/tasktools-npm-test/123.log", 3600);
  assert.match(script, /\( npm test \) > \/tmp\/tasktools-npm-test\/123\.log\.summary 2>&1/);
  assert.match(script, /echo "exit code: \$\?" >> \/tmp\/tasktools-npm-test\/123\.log\.summary/);
  assert.match(script, /mv \/tmp\/tasktools-npm-test\/123\.log\.summary \/tmp\/tasktools-npm-test\/123\.log\.done/);
  assert.match(script, /sleep 3600/);
  assert.match(script, /kill -KILL 0/);
});

test("buildBackgroundTestScript: kills the whole run after killAfterSeconds and the monitor reports it", () => {
  const dir = mkdtempSync(`${tmpdir()}/tasktools-npm-test-`);
  const logPath = `${dir}/1.log`;
  const script = buildBackgroundTestScript("sleep 30", logPath, 1);
  spawn("bash", ["-c", script], { detached: true, stdio: "ignore" }).unref();
  const monitor = spawnSync("node", [MONITOR_SCRIPT, logPath, "10"], { encoding: "utf8" });
  assert.match(monitor.stdout, /TEST RUN FINISHED/);
  assert.match(monitor.stdout, /killed after 1 seconds/);
});

test("buildBackgroundTestScript: a finished run leaves no kill-timer sleep behind", () => {
  const dir = mkdtempSync(`${tmpdir()}/tasktools-npm-test-`);
  const logPath = `${dir}/1.log`;
  // 3577 is a unique sleep length so pgrep finds only this run's timer.
  const script = buildBackgroundTestScript("sleep 1", logPath, 3577);
  spawn("bash", ["-c", script], { detached: true, stdio: "ignore" }).unref();
  const monitor = spawnSync("node", [MONITOR_SCRIPT, logPath, "10"], { encoding: "utf8" });
  assert.match(monitor.stdout, /exit code: 0/);
  const leftover = spawnSync("pgrep", ["-f", "sleep 3577"], { encoding: "utf8" });
  assert.equal(leftover.stdout, "");
});

test("monitor-test-run.ts: prints the done file when the test run is finished", () => {
  const dir = mkdtempSync(`${tmpdir()}/monitor-test-run-`);
  writeFileSync(`${dir}/1.log.done`, "all passing\nexit code: 0\n");
  const run = spawnSync("node", [MONITOR_SCRIPT, `${dir}/1.log`, "5"], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /TEST RUN FINISHED/);
  assert.match(run.stdout, /all passing\nexit code: 0/);
});

test("monitor-test-run.ts: says still in progress when the wait limit passes", () => {
  const dir = mkdtempSync(`${tmpdir()}/monitor-test-run-`);
  const run = spawnSync("node", [MONITOR_SCRIPT, `${dir}/1.log`, "1"], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /TEST RUN STILL IN PROGRESS/);
});
