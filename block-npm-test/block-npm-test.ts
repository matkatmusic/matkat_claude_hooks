#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { buildBackgroundTestScript, buildInitialPass, isNodeProject, removeOldLogs } from "./block-npm-test-scripts.ts";
import { findTestRuns } from "./block-npm-test-find.ts";
import { getSetting } from "../shared/settings.ts";

type FoundTestRun = ReturnType<typeof findTestRuns>[number];

// Starts one test run in the background and returns the text that tells Claude how to read it.
function spawnTestRun(testRun: FoundTestRun, cwd: string, logPath: string, killAfterSeconds: number, testTimeoutMs: string): string {
  const env = { ...process.env, ...testRun.env };
  const testFile = testRun.file;
  const hasTestFile = testFile !== undefined;
  const isBunTest = testRun.isBunTest === true;
  const typedRunnerWords = testRun.runnerWords;
  const keepsTypedRunner = typedRunnerWords !== undefined;
  const runsWithoutNpmTest = hasTestFile || isBunTest;
  if (runsWithoutNpmTest) {

    const extraArgs = testRun.extraArgs ?? [];
    let testArgs = hasTestFile ? [...extraArgs, testFile] : extraArgs;
    let runnerName = "node --test";
    let testCommand = `node --test --test-timeout=${testTimeoutMs} "$@" > ${logPath} 2>&1`;
    if (isBunTest) {
      runnerName = "bun test";
      testCommand = `bun test --timeout=${testTimeoutMs} "$@" > ${logPath} 2>&1`;
    }
    if (keepsTypedRunner) {
      runnerName = "the typed command";
      testArgs = typedRunnerWords;
      testCommand = `"$@" > ${logPath} 2>&1`;
    }
    // ponytail: kill -KILL 0 needs detached:true so this bash leads its own process group.
    spawn("bash", ["-c", buildBackgroundTestScript(testCommand, logPath, killAfterSeconds), "bash", ...testArgs], { cwd, env, detached: true, stdio: "ignore" }).unref();
    return `${runnerName} ${testArgs.join(" ")} runs in the background in ${cwd}.\nRun this command with a Bash timeout of 300000 to be notified when the test run is finished:\nnode ${import.meta.dirname}/monitor-test-run.ts ${logPath}\nThen read the log: ${logPath}`;
  }

  spawn("bash", ["-c", buildBackgroundTestScript(buildInitialPass(logPath), logPath, killAfterSeconds)], { cwd, env, detached: true, stdio: "ignore" }).unref();
  return `The Full Suite Testing command runs in the background in ${cwd}.\nRun this command with a Bash timeout of 300000 to be notified when the test run is finished:\nnode ${import.meta.dirname}/monitor-test-run.ts ${logPath}\nThen read the log: ${logPath}`;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const command = input.tool_input?.command ?? "";
  const isInNodeProject = isNodeProject(input.cwd);
  if (!isInNodeProject)
    process.exit(0);
  const testRuns = findTestRuns(command);
  if (testRuns.length === 0)
    process.exit(0);
  const cwds: string[] = [];
  for (const testRun of testRuns) {
    const cwd = resolve(input.cwd, testRun.cwd ?? ".");
    cwds.push(cwd);
  }
  // A missing folder may be made by an earlier step of this command, so the command runs as typed.
  for (const cwd of cwds) {
    const cwdExists = existsSync(cwd);
    if (cwdExists === false)
      process.exit(0);
  }

  const logDir = getSetting(input, "CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR");
  const killAfterSeconds = Number(getSetting(input, "CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS"));
  const testTimeoutMs = getSetting(input, "CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS");
  const logMaxAgeMs = Number(getSetting(input, "CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS"));
  mkdirSync(logDir, { recursive: true });
  removeOldLogs(logDir, Date.now(), logMaxAgeMs);
  const now = Date.now();
  const reasons: string[] = [];
  for (let i = 0; i < testRuns.length; i++) {
    const logPath = `${logDir}/${now}-${i}.log`;
    reasons.push(spawnTestRun(testRuns[i], cwds[i], logPath, killAfterSeconds, testTimeoutMs));
  }
  let permissionDecisionReason = `Test runners are blocked. ${reasons.join("\n\n")}`;
  let runsFullSuite = false;
  for (const testRun of testRuns) {
    const isFullSuite = testRun.file === undefined && testRun.isBunTest !== true;
    if (isFullSuite)
      runsFullSuite = true;
  }
  if (runsFullSuite)
    permissionDecisionReason += "\n\nTo run one test file, name it: node --test path/to/file.test.ts";
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason,
      },
    }),
  );
}
