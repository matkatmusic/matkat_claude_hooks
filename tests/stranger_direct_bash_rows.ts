// Direct rows 16 to 20: block-bash-edits and block-npm-test, run on the bed clone with crafted input.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { type DirectContext, type DirectResult, buildResult, countOccurrences, formatFlag, isHookDenied, readDenyReason, executeHook, writeFiles } from "./stranger_direct_support.ts";

const BASH_EDITS_SCRIPT = "block-bash-edits/block-bash-edits.ts";
const NPM_TEST_SCRIPT = "block-npm-test/block-npm-test.ts";
const FAKE_JEST_REPORT = "FAIL math.test.ts\n  ● add › adds numbers\nFAIL math.test.ts\nTests: 1 failed, 1 total\n";
const DONE_WAIT_SECONDS = 90;

function executeBashCommand(context: DirectContext, script: string, command: string, cwd: string) {
  return executeHook(context, script, { tool_name: "Bash", cwd, tool_input: { command } }, cwd);
}

function createJestProject(context: DirectContext): string {
  const dir = path.join(context.direct, "jest-project");
  const packageJson = { name: "jest-bed", scripts: { test: "node fake-jest.cjs" } };
  const fakeJest = `process.stdout.write(${JSON.stringify(FAKE_JEST_REPORT)});\nprocess.exit(1);\n`;
  writeFiles(dir, { "package.json": JSON.stringify(packageJson), "fake-jest.cjs": fakeJest });
  return dir;
}

function waitForDoneFile(donePath: string): string {
  for (let second = 0; second < DONE_WAIT_SECONDS; second++) {
    const isDone = existsSync(donePath);
    if (isDone)
      return readFileSync(donePath, "utf8");
    tmux_lib.sleep(1);
  }
  throw new Error(`the background test run did not finish: ${donePath}`);
}

function findLogPath(reason: string): string {
  const marker = "monitor-test-run.ts ";
  const start = reason.indexOf(marker) + marker.length;
  const end = reason.indexOf("\n", start);
  return reason.slice(start, end);
}

export function validateBlockBashEdits(context: DirectContext): DirectResult {
  const cwd = context.direct;
  const fdRedirect = executeBashCommand(context, BASH_EDITS_SCRIPT, "make 2> err.log", cwd);
  const pythonCode = executeBashCommand(context, BASH_EDITS_SCRIPT, 'python -c "print(1)"', cwd);
  const mergedStreams = executeBashCommand(context, BASH_EDITS_SCRIPT, "make 2>&1 | tail -1", cwd);
  const nullRedirect = executeBashCommand(context, BASH_EDITS_SCRIPT, "make 2> /dev/null", cwd);
  const deniesFd = isHookDenied(fdRedirect);
  const deniesPython = isHookDenied(pythonCode);
  const allowsMerged = !isHookDenied(mergedStreams);
  const allowsNull = !isHookDenied(nullRedirect);
  const ok = deniesFd && deniesPython && allowsMerged && allowsNull;
  const evidence = `denied "make 2> err.log": ${formatFlag(deniesFd)}; denied python -c: ${formatFlag(deniesPython)}; allowed 2>&1: ${formatFlag(allowsMerged)}; allowed 2>/dev/null: ${formatFlag(allowsNull)}`;
  return buildResult(16, "block-bash-edits", ok, evidence);
}

export function validateNpmTestOtherReporter(context: DirectContext): DirectResult {
  const project = createJestProject(context);
  const run = executeBashCommand(context, NPM_TEST_SCRIPT, "npm test", project);
  const done = waitForDoneFile(`${findLogPath(readDenyReason(run))}.done`);
  const failCount = countOccurrences(done, "FAIL math.test.ts");
  const hasStoppedNote = done.includes("test runner stopped before producing a summary");
  const ok = isHookDenied(run) && failCount === 1 && !hasStoppedNote && done.includes("exit code: 1");
  return buildResult(17, "block-npm-test (reporter)", ok, `jest-style output: failed test name printed ${failCount} time(s); stopped-before-summary note: ${formatFlag(hasStoppedNote)}`);
}

export function validateNpmTestTypedRunner(context: DirectContext): DirectResult {
  const project = createJestProject(context);
  const run = executeBashCommand(context, NPM_TEST_SCRIPT, "jest math.test.ts", project);
  const reason = readDenyReason(run);
  const keepsTypedRunner = reason.includes("the typed command jest math.test.ts");
  const swapsToNodeTest = reason.includes("node --test math.test.ts");
  const ok = isHookDenied(run) && keepsTypedRunner && !swapsToNodeTest;
  return buildResult(18, "block-npm-test (jest)", ok, `typed jest command kept: ${formatFlag(keepsTypedRunner)}; swapped to node --test: ${formatFlag(swapsToNodeTest)}`);
}

export function validateNpmTestShellAndLaterRuns(context: DirectContext): DirectResult {
  const project = createJestProject(context);
  const shellRun = executeBashCommand(context, NPM_TEST_SCRIPT, 'bash -c "npm test"', project);
  const twoRuns = executeBashCommand(context, NPM_TEST_SCRIPT, "npm test && node --test a.test.ts", project);
  const runCount = countOccurrences(readDenyReason(twoRuns), "runs in the background in");
  const ok = isHookDenied(shellRun) && runCount === 2;
  return buildResult(19, "block-npm-test (many runs)", ok, `bash -c "npm test" denied: ${formatFlag(isHookDenied(shellRun))}; runs started for "npm test && node --test a.test.ts": ${runCount}`);
}

export function validateNpmTestMissingFolder(context: DirectContext): DirectResult {
  const project = createJestProject(context);
  const run = executeBashCommand(context, NPM_TEST_SCRIPT, "cd newdir-not-made-yet && npm test", project);
  const ok = run.status === 0 && run.stdout.trim() === "";
  return buildResult(20, "block-npm-test (cd)", ok, `exit ${run.status}; output: ${run.stdout.trim() === "" ? "none, command runs as typed" : run.stdout.trim()}`);
}
