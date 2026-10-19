#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const MONITOR_SCRIPT = `${import.meta.dirname}/monitor-test-run.ts`;

test("monitor prints the result and the log path when the done file exists", () => {
  const dir = mkdtempSync(`${tmpdir()}/monitor-run-`);
  const logPath = `${dir}/run.log`;
  writeFileSync(`${logPath}.done`, "exit code: 0");
  const run = spawnSync("node", [MONITOR_SCRIPT, logPath], { encoding: "utf8", env: process.env });
  assert.match(run.stdout, /TEST RUN FINISHED/);
  assert.match(run.stdout, /exit code: 0/);
  assert.match(run.stdout, new RegExp(`Full log: ${logPath}`));
});

test("monitor says the run is still in progress when the wait limit ends first", () => {
  const dir = mkdtempSync(`${tmpdir()}/monitor-run-`);
  const logPath = `${dir}/run.log`;
  const run = spawnSync("node", [MONITOR_SCRIPT, logPath, "0"], { encoding: "utf8", env: process.env });
  assert.match(run.stdout, /TEST RUN STILL IN PROGRESS/);
});
