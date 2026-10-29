import { splitSimpleCommands } from "./block-npm-test-split.ts";
import { buildTestRun, type TestRun } from "./block-npm-test-find-helpers.ts";

const RUNNERS = new Set(["jest", "vitest", "mocha"]);

// Leading VAR=value words are skipped; then the first words must be a JavaScript test runner.
export function isRunner(words: string[]): boolean {
  let start = 0;
  for (; start < words.length; start++) {
    const isAssignment = /^\w+=/.test(words[start]);
    if (!isAssignment)
      break;
  }
  words = words.slice(start);
  const [first, second, third] = words;
  // test:baseline runs the suite itself and applies the known-failures filter, so it stays untouched.
  if (first === "npm") {
    const isTestWord = second === "test";
    const isTestAlias = second === "t";
    const isRunWord = second === "run";
    const isTestScript = /^test(:|$)/.test(third ?? "");
    const isBaselineScript = third === "test:baseline";
    const isRunOfTestScript = isRunWord && isTestScript;
    const isRunOfUnfilteredTestScript = isRunOfTestScript && !isBaselineScript;
    return isTestWord || isTestAlias || isRunOfUnfilteredTestScript;
  }
  const yarnLikeRunners = ["yarn", "pnpm", "bun"];
  let isYarnLikeRunner = false;
  for (let i = 0; i < yarnLikeRunners.length; i++) {
    if (first === yarnLikeRunners[i]) {
      isYarnLikeRunner = true;
      break;
    }
  }
  if (isYarnLikeRunner)
    return second === "test";
  const isNodeCommand = first === "node";
  const isTsxCommand = first === "tsx";
  const isNodeLikeCommand = isNodeCommand || isTsxCommand;
  if (isNodeLikeCommand)
    return second === "--test";
  if (first === "npx")
    return RUNNERS.has(second ?? "");
  return RUNNERS.has(first ?? "");
}

const SHELLS = new Set(["bash", "sh", "zsh"]);

// bash -c "a && b" becomes the simple commands of "a && b", in place.
function parseShellScripts(commands: string[][]): string[][] {
  const result: string[][] = [];
  for (const words of commands) {
    const isShell = SHELLS.has(words[0]);
    const flag = words[1] ?? "";
    const startsWithDash = flag.startsWith("-");
    const isLongFlag = flag.startsWith("--");
    const hasCommandLetter = flag.includes("c");
    const isDashFlagWithC = startsWithDash && hasCommandLetter;
    const isCommandFlag = isDashFlagWithC && !isLongFlag;
    const isShellScript = isShell && isCommandFlag;
    if (isShellScript) {
      const script = words.slice(2).join(" ");
      result.push(...parseShellScripts(splitSimpleCommands(script)));
    }
    else
      result.push(words);
  }
  return result;
}

// Every test-runner command in the line, in order.
export function findTestRuns(command: string): TestRun[] {
  const commands = parseShellScripts(splitSimpleCommands(command));
  const runs: TestRun[] = [];
  for (let i = 0; i < commands.length; i++) {
    const isTestRunner = isRunner(commands[i]);
    if (isTestRunner)
      runs.push(buildTestRun(commands, i));
  }
  return runs;
}

// The first test-runner command in the line.
export function findTestRun(command: string): TestRun | undefined {
  return findTestRuns(command)[0];
}
