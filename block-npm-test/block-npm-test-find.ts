import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { splitSimpleCommands } from "./block-npm-test-split.ts";

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

type TestRun = { file?: string; cwd?: string; env: Record<string, string>; extraArgs?: string[]; isBunTest?: boolean; runnerWords?: string[] };

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

// Builds one test run: file, cwd, env, extra flags, and the typed runner.
function buildTestRun(commands: string[][], index: number): TestRun {
  const words = commands[index];
  const env: Record<string, string> = {};
  let wordIndex = 0;
  while (wordIndex < words.length) {
    const isAssignment = /^\w+=/.test(words[wordIndex]);
    if (!isAssignment)
      break;
    const eq = words[wordIndex].indexOf("=");
    env[words[wordIndex].slice(0, eq)] = words[wordIndex].slice(eq + 1);
    wordIndex++;
  }
  let file: string | undefined;
  for (const word of words) {
    const isTestFile = /\.(test|spec)\./.test(word);
    if (isTestFile) {
      const isGlob = word.includes("*");
      if (!isGlob) {
        file = word;
        break;
      }
    }
  }
  const coreWords = words.slice(wordIndex);
  const isNodeTestCommand = (coreWords[0] === "node" || coreWords[0] === "tsx") && coreWords[1] === "--test";
  const isBunTestCommand = coreWords[0] === "bun" && coreWords[1] === "test";
  const wordsWithoutRedirects: string[] = [];
  let skipNext = false;
  for (const word of coreWords) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const isRedirect = /[<>]/.test(word);
    if (isRedirect) {
      skipNext = /[<>]$/.test(word);
      continue;
    }
    wordsWithoutRedirects.push(word);
  }
  let extraArgs: string[] | undefined;
  const takesExtraArgs = isNodeTestCommand || isBunTestCommand;
  if (takesExtraArgs) {
    const rest: string[] = [];
    const argWords = wordsWithoutRedirects.slice(2);
    for (const word of argWords) {
      // const isTestFile = /\.(test|spec)\./.test(word);
      // if (!isTestFile)
      //   rest.push(word);
      const isChosenFile = word === file;
      const isTestFileWord = /\.(test|spec)\./.test(word);
      const hasGlobStar = word.includes("*");
      const isGlobTestFile = isTestFileWord && hasGlobStar;
      const isKeptWord = !isChosenFile && !isGlobTestFile;
      if (isKeptWord)
        rest.push(word);
    }
    if (rest.length > 0)
      extraArgs = rest;
  }
  const keepsTypedRunner = file !== undefined && !takesExtraArgs;

  let cwd: string | undefined;
  for (let i = 0; i < index; i++) {
    const isCd = commands[i][0] === "cd";
    if (!isCd)
      continue;
    const hasTarget = commands[i].length > 1;
    if (!hasTarget)
      continue;
    let target = commands[i][commands[i].length - 1];
    const isBareHome = target === "~";
    if (isBareHome)
      target = homedir();
    const isHomePath = target.startsWith("~/");
    if (isHomePath)
      target = join(homedir(), target.slice(2));
    const isAbsoluteTarget = isAbsolute(target);
    if (isAbsoluteTarget)
      cwd = target;
    else
      cwd = join(cwd ?? "", target);
  }
  return { file, cwd, env, ...(extraArgs ? { extraArgs } : {}), ...(isBunTestCommand ? { isBunTest: true } : {}), ...(keepsTypedRunner ? { runnerWords: wordsWithoutRedirects } : {}) };
}
