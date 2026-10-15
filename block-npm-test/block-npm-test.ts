#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { buildBackgroundTestScript, buildInitialPass, isNodeProject, removeOldLogs } from "./block-npm-test-scripts.ts";
import { findTestRun } from "./block-npm-test-find.ts";
import { readEnvValue } from "../shared/env.ts";
// PreToolUse on Bash for node projects: swaps a test run for Full Suite Testing or node --test file.

const LOG_DIR = readEnvValue("CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR");
// const TIMEOUT_MS = 240_000; // unused now that test runs happen in the background
const KILL_AFTER_SECONDS = Number(readEnvValue("CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS"));
const TEST_TIMEOUT_MS = readEnvValue("CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS");

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const command = input.tool_input?.command ?? "";
  const isInNodeProject = isNodeProject(input.cwd);
  if (!isInNodeProject)
    process.exit(0);
  const testRun = findTestRun(command);
  if (!testRun)
    process.exit(0);
  const cwd = resolve(input.cwd, testRun.cwd ?? ".");
  const cwdExists = existsSync(cwd);
  if (cwdExists === false) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `block-npm-test: the test run folder does not exist: ${cwd}. The hook runs before the earlier steps of this command. Create the folder in a separate Bash call, then run the test.`,
        },
      }),
    );
    process.exit(0);
  }
  const env = { ...process.env, ...testRun.env };

  mkdirSync(LOG_DIR, { recursive: true });
  removeOldLogs(LOG_DIR, Date.now());
  const logPath = `${LOG_DIR}/${Date.now()}.log`;

  const testFile = testRun.file;
  const hasTestFile = testFile !== undefined;
  const isBunTest = testRun.isBunTest === true;
  const runsWithoutNpmTest = hasTestFile || isBunTest;
  if (runsWithoutNpmTest) {
    // const run = spawnSync("node", ["--test", testFile], {
    //   cwd,
    //   env,
    //   encoding: "utf8",
    //   timeout: TIMEOUT_MS,
    //   killSignal: "SIGKILL",
    // });
    // const timedOut = Boolean(run.signal) || (run.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    // if (run.error && !timedOut)
    //   throw run.error;
    // const output = timedOut
    //   ? `the test was killed by ${run.signal ?? "timeout"} after ${TIMEOUT_MS / 1000}s`
    //   : `${run.stdout}${run.stderr}`.trim();
    const extraArgs = testRun.extraArgs ?? [];
    const testArgs = hasTestFile ? [...extraArgs, testFile] : extraArgs;
    let runnerName = "node --test";
    let testCommand = `node --test --test-timeout=${TEST_TIMEOUT_MS} "$@" > ${logPath} 2>&1`;
    if (isBunTest) {
      runnerName = "bun test";
      testCommand = `bun test --timeout=${TEST_TIMEOUT_MS} "$@" > ${logPath} 2>&1`;
    }
    // ponytail: kill -KILL 0 needs detached:true so this bash leads its own process group.
    spawn("bash", ["-c", buildBackgroundTestScript(testCommand, logPath, KILL_AFTER_SECONDS), "bash", ...testArgs], { cwd, env, detached: true, stdio: "ignore" }).unref();
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Test runners are blocked. ${runnerName} ${testArgs.join(" ")} runs in the background in ${cwd}.\nRun this command with a Bash timeout of 300000 to be notified when the test run is finished:\nnode ${import.meta.dirname}/monitor-test-run.ts ${logPath}\nThen read the log: ${logPath}`,
        },
      }),
    );
    process.exit(0);
  }

  // const run = spawnSync("bash", ["-c", buildInitialPass(logPath)], {
  //   cwd,
  //   env,
  //   encoding: "utf8",
  //   timeout: TIMEOUT_MS,
  //   killSignal: "SIGKILL",
  // });
  // const timedOut = Boolean(run.signal) || (run.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  // if (run.error && !timedOut)
  //   throw run.error;
  // const output = timedOut ? `the suite was killed by ${run.signal ?? "timeout"} after ${TIMEOUT_MS / 1000}s` : run.stdout.trim();
  // const allPassing = output === "all passing";
  // if (allPassing)
  //   unlinkSync(logPath);
  // const followup = allPassing
  //   ? ""
  //   : `\n\nlast 50 log lines:\n${readFileSync(logPath, "utf8").split("\n").slice(-50).join("\n")}\nFull log: ${logPath}`;
  spawn("bash", ["-c", buildBackgroundTestScript(buildInitialPass(logPath), logPath, KILL_AFTER_SECONDS)], { cwd, env, detached: true, stdio: "ignore" }).unref();
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Test runners are blocked. The Full Suite Testing command runs in the background in ${cwd}.\nRun this command with a Bash timeout of 300000 to be notified when the test run is finished:\nnode ${import.meta.dirname}/monitor-test-run.ts ${logPath}\nThen read the log: ${logPath}` +
          "\n\nTo run one test file, name it: node --test path/to/file.test.ts",
      },
    }),
  );
}
