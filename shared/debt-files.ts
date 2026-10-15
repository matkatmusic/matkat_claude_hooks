import { existsSync } from "node:fs";
import { resolve } from "node:path";

const HOME = process.env.HOME;

const BASH_WRITE_PATTERN = /(>|\btee\b|\bsd\b|\bsed\s+-i|\bcp\b|\bmv\b)/;
const TS_PATH_PATTERN = /[^\s'"<>|;&=]+\.ts\b/g;

// Existing .ts paths named in a Bash command that looks like it writes files.
export function findBashWrittenTsPaths(command: string, cwd: string): string[] {
  const paths: string[] = [];
  const looksLikeWrite = BASH_WRITE_PATTERN.test(command);
  if (!looksLikeWrite)
    return paths;
  const matches = command.match(TS_PATH_PATTERN);
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

export function filterUniqueNonTestTsFiles(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const isTsFile = path.endsWith(".ts");
    const isTestFile = path.endsWith(".test.ts");
    const isEligible = isTsFile && !isTestFile;
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
