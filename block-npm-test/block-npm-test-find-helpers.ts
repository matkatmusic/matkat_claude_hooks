import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";

export type TestRun = { file?: string; cwd?: string; env: Record<string, string>; extraArgs?: string[]; isBunTest?: boolean; runnerWords?: string[] };

// Builds one test run: file, cwd, env, extra flags, and the typed runner.
export function buildTestRun(commands: string[][], index: number): TestRun {
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
