import { existsSync } from "node:fs";
import { resolve } from "node:path";

const HOME = process.env.HOME;

const BASH_WRITE_PATTERN = /(>|\btee\b|\bsd\b|\bsed\s+-i|\bcp\b|\bmv\b)/;
const DEBT_CHECKED_PATH_PATTERN = /[^\s'"<>|;&=]+\.(ts|html|css)\b/g;

// Existing .ts, .html and .css paths named in a Bash command that looks like it writes files.
export function findBashWrittenDebtCheckedPaths(command: string, cwd: string): string[] {
  const paths: string[] = [];
  const looksLikeWrite = BASH_WRITE_PATTERN.test(command);
  if (!looksLikeWrite)
    return paths;
  const matches = command.match(DEBT_CHECKED_PATH_PATTERN);
  const hasMatches = matches !== null;
  if (!hasMatches)
    return paths;
  for (let i = 0; i < matches.length; i++) {
    const withHome = matches[i].replace(/^(~|\$HOME)/, HOME as string);
    const candidate = resolve(cwd, withHome);
    const exists = existsSync(candidate);
    if (!exists)
      continue;
    paths.push(candidate);
  }
  return paths;
}

export function filterUniqueDebtCheckedFiles(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const isTsFile = path.endsWith(".ts");
    const isTestFile = path.endsWith(".test.ts");
    const isHtmlFile = path.endsWith(".html");
    const isCssFile = path.endsWith(".css");
    const isNonTestTsFile = isTsFile && !isTestFile;
    const isEligible = isNonTestTsFile || isHtmlFile || isCssFile;
    if (!isEligible)
      continue;
    const alreadySeen = seen.has(path);
    if (alreadySeen)
      continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}
