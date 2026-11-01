#!/usr/bin/env node
// Removes full-line commented-out code from a file or folder.
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { isBodyCode } from "../../comment-length-limiter/reflowComments.ts";
import { BODY_LOOKS_LIKE_CODE } from "../../comment-length-limiter/resultCodes.ts";

const SLASH_COMMENT = /^\s*\/\/(?!\/)/;
const PERCENT_COMMENT = /^\s*%%/;
const MERMAID_DIRECTIVE = /^\s*%%\{/;
const NEVER_CODE = /^(eslint-|@ts-|prettier-|ponytail:)/;
const MERMAID_LINK = /(-->|---|-\.->|==>|--o|--x)/;
const MERMAID_KEYWORD = /^((subgraph|end|classDef|linkStyle|flowchart|graph)\b|(class|style|click) )/;
const MERMAID_NODE = /^[\w-]+\s*[[({>]/;

type LineKind = "other" | "splitter" | "code" | "prose";

function isMermaidCode(body: string): boolean {
  const hasLink = MERMAID_LINK.test(body);
  const hasKeyword = MERMAID_KEYWORD.test(body);
  const isNode = MERMAID_NODE.test(body);
  return hasLink || hasKeyword || isNode;
}

function findLineKind(line: string, isMermaid: boolean): LineKind {
  const isDirective = MERMAID_DIRECTIVE.test(line);
  const isMermaidDirective = isMermaid && isDirective;
  if (isMermaidDirective)
    return "other";
  const commentPattern = isMermaid ? PERCENT_COMMENT : SLASH_COMMENT;
  const isComment = commentPattern.test(line);
  if (!isComment)
    return "other";
  const body = line.replace(/^\s*(\/\/|%%)/, "").trim();
  const isBlank = body === "";
  if (isBlank)
    return "prose";
  const isNeverCode = NEVER_CODE.test(body);
  if (isNeverCode)
    return "splitter";
  if (isMermaid) {
    const isCode = isMermaidCode(body);
    return isCode ? "code" : "prose";
  }
  const isCode = isBodyCode(body) === BODY_LOOKS_LIKE_CODE;
  return isCode ? "code" : "prose";
}

export function clearDeadCode(source: string, isMermaid: boolean): { text: string; removed: number } {
  const lines = source.split("\n");
  const isRemoved: boolean[] = [];
  let firstCode = -1;
  let lastCode = -1;
  let removed = 0;
  for (let index = 0; index <= lines.length; index++) {
    isRemoved.push(false);
    const kind = index < lines.length ? findLineKind(lines[index], isMermaid) : "other";
    if (kind === "code") {
      const isFirstCode = firstCode === -1;
      if (isFirstCode)
        firstCode = index;
      lastCode = index;
    }
    const isRunOpen = kind === "code" || kind === "prose";
    if (isRunOpen)
      continue;
    const hasCode = firstCode !== -1;
    if (hasCode) {
      for (let removeIndex = firstCode; removeIndex <= lastCode; removeIndex++) {
        isRemoved[removeIndex] = true;
        removed++;
      }
    }
    firstCode = -1;
    lastCode = -1;
  }
  for (let blockStart = 0; blockStart < lines.length && !isMermaid; blockStart++) {
    const isBlockStart = lines[blockStart].trim() === "/*";
    if (!isBlockStart)
      continue;
    let blockEnd = blockStart + 1;
    while (blockEnd < lines.length && lines[blockEnd].trim() !== "*/")
      blockEnd++;
    const hasBlockEnd = blockEnd < lines.length;
    if (!hasBlockEnd)
      continue;
    let bodyCount = 0;
    let codeCount = 0;
    for (let bodyIndex = blockStart + 1; bodyIndex < blockEnd; bodyIndex++) {
      const body = lines[bodyIndex].trim().replace(/^\/\//, "").trim();
      const isEmptyBody = body === "";
      if (isEmptyBody)
        continue;
      bodyCount++;
      const isCode = isBodyCode(body) === BODY_LOOKS_LIKE_CODE;
      if (isCode)
        codeCount++;
    }
    const isMostlyCode = codeCount * 2 > bodyCount;
    if (isMostlyCode) {
      for (let removeIndex = blockStart; removeIndex <= blockEnd; removeIndex++) {
        const isAlreadyRemoved = isRemoved[removeIndex];
        if (isAlreadyRemoved)
          continue;
        isRemoved[removeIndex] = true;
        removed++;
      }
    }
    blockStart = blockEnd;
  }
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!isRemoved[index])
      kept.push(lines[index]);
  }
  return { text: kept.join("\n"), removed };
}

export function clearDeadCodeInPath(path: string): void {
  const isFolder = statSync(path).isDirectory();
  const files: string[] = [];
  if (isFolder) {
    const listing = execFileSync("git", ["ls-files", "--recurse-submodules", "--", "."], { cwd: path, encoding: "utf8" });
    const names = listing.split("\n");
    for (let index = 0; index < names.length; index++) {
      const hasName = names[index] !== "";
      if (hasName)
        files.push(join(path, names[index]));
    }
  }
  else {
    files.push(path);
  }
  let total = 0;
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const extension = extname(file);
    const isMarkdown = extension === ".md";
    if (isMarkdown)
      continue;
    const isMermaid = extension === ".mmd";
    const result = clearDeadCode(readFileSync(file, "utf8"), isMermaid);
    const isChanged = result.removed > 0;
    if (!isChanged)
      continue;
    writeFileSync(file, result.text);
    console.log(`${file}: removed ${result.removed} lines`);
    total += result.removed;
  }
  console.log(`total: removed ${total} lines`);
}

if (import.meta.main)
  clearDeadCodeInPath(process.argv[2]);
