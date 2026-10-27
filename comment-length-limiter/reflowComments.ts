// clang-format for `//` prose: rejoin wrapped comment runs onto one line, leaving commented-out code untouched.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyQuota } from "./reflowQuota.ts";
import {
  BODY_LOOKS_LIKE_CODE,
  BODY_LOOKS_LIKE_PROSE,
  CONTINUES_COMMENT_RUN,
  REFLOW_EMITTED,
  REFLOW_NOT_EMITTED,
  REWRITE_NEEDED,
  REWRITE_NOT_NEEDED,
  RUN_IS_NOT_PROSE,
  RUN_IS_PROSE,
  STARTS_NEW_COMMENT_RUN,
} from "./resultCodes.ts";

const COMMENT = /^(\s*)(\/\/)(?!\/) ?(.*)$/; // `///` opts out
const MACHINE_DIRECTIVE = /^(eslint-|@ts-|prettier-|biome-|#region|#endregion|c8 |istanbul |v8 )/;
const PARAGRAPH_MARK = /^ponytail:/; // joined like prose, but exempt from the word cap
const DIVIDER = /^[-=*_#]{3,}/; // `---- section ----`: hand-formatted, passed through verbatim
// `skipIf` guards JSDoc, whose `*`-prefixed continuation lines are a layout the tool must not touch.
const BLOCK_KINDS = [
  {
    open: /^(\s*)\/\*(?!\*)/, openTag: "/*", closeTag: "*/",
    stripOpen: /^\s*\/\*+/, stripClose: /\*\/\s*$/, skipIf: /^\*/,
  },
  {
    open: /^(\s*)<!--/, openTag: "<!--", closeTag: "-->",
    stripOpen: /^\s*<!--/, stripClose: /-->\s*$/, skipIf: undefined,
  },
];
const KEYWORD = /^(const|let|var|function|if|else|for|while|do|return|import|export|class|await|try|catch|switch|case|throw|new|type|interface)(?=[\s;({]|$)/;
const WORD_LIMIT = 20;

export type Reflow = {
  start: number; end: number; line: number; words: number; joined: boolean; capped: boolean;
};

// Trailing `;` and `)` are left out: wrapped prose ends lines that way too.
export function isBodyCode(body: string): number {
  const endsWithBraceOrArrow = /[{}]$|=>$/.test(body);
  const startsWithCloser = /^[)}\]]/.test(body);
  const startsWithMarkup = /^<[/!a-zA-Z]/.test(body); // commented-out markup
  const startsWithKeyword = KEYWORD.test(body);
  const startsWithCall = /^\w+\s*\(/.test(body);
  const endsWithPunctuation = /[;{,:]$/.test(body);
  const isKeywordStatement = startsWithKeyword && (startsWithCall || endsWithPunctuation);
  const isAssignment = /^[\w.$]+\s*[:=].*[,;:{]$/.test(body);
  const isCall = /^[\w.$]+\(.*[;,){]$/.test(body);
  const isCode = endsWithBraceOrArrow || startsWithCloser || startsWithMarkup || isKeywordStatement || isAssignment || isCall;
  return isCode ? BODY_LOOKS_LIKE_CODE : BODY_LOOKS_LIKE_PROSE;
}

// A directive begins a new comment instead of poisoning the run above it.
const isNewRunStart = (body: string): number => {
  const isDivider = DIVIDER.test(body);
  const isDirective = MACHINE_DIRECTIVE.test(body);
  const isParagraphMark = PARAGRAPH_MARK.test(body);
  const startsNewRun = isDivider || isDirective || isParagraphMark;
  return startsNewRun ? STARTS_NEW_COMMENT_RUN : CONTINUES_COMMENT_RUN;
};

// Two spaces after a sentence-ending line, one space otherwise.
function joinBodies(bodies: string[]): string {
  let joinedText = bodies[0];
  for (let n = 1; n < bodies.length; n += 1) {
    const endsSentence = /[.!?]["')\]]?$/.test(joinedText);
    joinedText += (endsSentence ? "  " : " ") + bodies[n];
  }
  return joinedText;
}

function isRunProse(bodies: string[]): number {
  if (bodies.length === 0)
    return RUN_IS_NOT_PROSE;
  const startsWithDirective = MACHINE_DIRECTIVE.test(bodies[0]);
  if (startsWithDirective)
    return RUN_IS_NOT_PROSE;
  for (const body of bodies) {
    const bodyIsCode = isBodyCode(body) !== BODY_LOOKS_LIKE_PROSE;
    if (bodyIsCode)
      return RUN_IS_NOT_PROSE;
  }
  return RUN_IS_PROSE;
}

// Block prose: continuation lines carry no marker, so the block is taken whole.
function buildReflowBlock(lines: string[], start: number, outLen: number) {
  let kind: (typeof BLOCK_KINDS)[number] | undefined;
  for (const candidate of BLOCK_KINDS) {
    const opensBlock = candidate.open.test(lines[start]);
    if (opensBlock) {
      kind = candidate;
      break;
    }
  }
  if (!kind)
    return null;
  const indent = lines[start].match(kind.open)![1];
  let end = start;
  let foundClose = false;
  while (end < lines.length) {
    foundClose = lines[end].includes(kind.closeTag);
    if (foundClose)
      break;
    end += 1;
  }
  if (!foundClose)
    return null;

  const raw = lines.slice(start, end + 1);
  const bodies: string[] = [];
  for (let n = 0; n < raw.length; n += 1) {
    const stripped = (n === 0 ? raw[n].replace(kind.stripOpen, "") : raw[n]);
    bodies.push((n === raw.length - 1 ? stripped.replace(kind.stripClose, "") : stripped).trim());
  }
  for (const body of bodies) {
    const isCodeBody = body !== "" && isBodyCode(body) === BODY_LOOKS_LIKE_CODE;
    if (isCodeBody)
      return null;
  }
  const skipPattern = kind.skipIf;
  if (skipPattern) {
    for (const body of bodies) {
      const isSkipped = skipPattern.test(body);
      if (isSkipped)
        return null;
    }
  }

  const paragraphs: { bodies: string[]; start: number; end: number }[] = [];
  for (let n = 0; n < bodies.length; n += 1) {
    const body = bodies[n];
    if (body === "")
      continue;
    const last = paragraphs.at(-1);
    const continuesParagraph = last && bodies[n - 1] !== "";
    if (continuesParagraph) {
      last.bodies.push(body);
      last.end = start + n + 1;
    }
    else
      paragraphs.push({ bodies: [body], start: start + n + 1, end: start + n + 1 });
  }
  if (paragraphs.length === 0)
    return null;

  // Delimiters get their own lines; body sits two spaces in from the opener.
  const out: string[] = [`${indent}${kind.openTag}`];
  const placed: { paragraph: (typeof paragraphs)[number]; line: number }[] = [];
  for (const paragraph of paragraphs) {
    if (out.length > 1)
      out.push("");
    out.push(`${indent}  ${joinBodies(paragraph.bodies)}`);
    placed.push({ paragraph, line: outLen + out.length });
  }
  out.push(`${indent}${kind.closeTag}`);

  let changed = out.length !== raw.length;
  for (let n = 0; n < out.length; n += 1) {
    if (out[n] !== raw[n])
      changed = true;
  }
  const runs: Reflow[] = [];
  for (const { paragraph, line } of placed) {
    const words = joinBodies(paragraph.bodies).split(/\s+/).length;
    const isUnderCap = !changed && words < WORD_LIMIT;
    if (isUnderCap)
      continue;
    runs.push({ start: paragraph.start, end: paragraph.end, line, words, joined: changed, capped: true });
  }
  return { end, out, runs };
}

export function applyReflowToSource(source: string): { text: string; runs: Reflow[] } {
  const lines = source.split("\n");
  const out: string[] = [];
  const runs: Reflow[] = [];
  let i = 0;
  while (i < lines.length) {
    const block = buildReflowBlock(lines, i, out.length);
    if (block) {
      out.push(...block.out);
      runs.push(...block.runs);
      i = block.end + 1;
      continue;
    }
    const head = lines[i].match(COMMENT);
    // A bare `//` or a `---- section ----` rule separates comments, it never starts one.
    const headBody = head ? head[3].trim() : "";
    const isDividerBody = DIVIDER.test(headBody);
    const endsAtHead = !head || headBody === "" || isDividerBody;
    if (endsAtHead) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const [, indent, marker] = head!;
    let end = i;
    const bodies: string[] = [headBody];
    while (end + 1 < lines.length) {
      const next = lines[end + 1].match(COMMENT);
      if (!next)
        break;
      const nextBody = next[3].trim();
      const startsNewRun = isNewRunStart(nextBody) === STARTS_NEW_COMMENT_RUN;
      const endsRun = next[1] !== indent || next[2] !== marker || startsNewRun;
      if (endsRun)
        break;
      if (nextBody !== "")
        bodies.push(nextBody);
      end += 1;
    }
    const runIsProse = isRunProse(bodies) === RUN_IS_PROSE;
    if (runIsProse) {
      const text = joinBodies(bodies);
      const words = text.split(/\s+/).length;
      const joined = bodies.length > 1;
      const capped = !PARAGRAPH_MARK.test(bodies[0]);
      // An already-flat comment is only worth reporting when it busts the cap.
      const bustsCap = capped && words >= WORD_LIMIT;
      const isWorthReporting = joined || bustsCap;
      if (isWorthReporting) {
        runs.push({ start: i + 1, end: end + 1, line: out.length + 1, words, joined, capped });
      }
      out.push(`${indent}${marker} ${text}`);
    }
    else {
      out.push(...lines.slice(i, end + 1));
    }
    i = end + 1;
  }
  return { text: out.join("\n"), runs };
}

export type FileReflow = { path: string; runs: Reflow[] };

function buildShowCommand(path: string, lines: number[]): string {
  const printRanges: string[] = [];
  for (const line of lines)
    printRanges.push(`${line}p`);
  return `nl -ba '${path}' | sed -n '${printRanges.join(";")}'`;
}

function listOverCapLines({ path, runs }: FileReflow) {
  const lines: number[] = [];
  for (const run of runs) {
    const isOverCap = run.capped && run.words >= WORD_LIMIT;
    if (isOverCap)
      lines.push(run.line);
  }
  return { path, lines };
}

export const isRewriteNeeded = (files: FileReflow[]): number => {
  for (const file of files) {
    const hasOverCapLines = listOverCapLines(file).lines.length > 0;
    if (hasOverCapLines)
      return REWRITE_NEEDED;
  }
  return REWRITE_NOT_NEEDED;
};

// A JSON string, so the receiving agent parses instead of reasoning about prose.
export function formatReflows(
  files: FileReflow[],
  overCapInput?: { path: string; lines: number[] }[],
  maxRewrites?: string,
): string {
  let overCap = overCapInput;
  if (!overCap) {
    overCap = [];
    for (const file of files) {
      const overCapFile = listOverCapLines(file);
      if (overCapFile.lines.length > 0)
        overCap.push(overCapFile);
    }
  }
  const rewritten: { file: string; lines: number[] }[] = [];
  for (const { path, runs } of files) {
    const joinedLines: number[] = [];
    for (const run of runs) {
      if (run.joined)
        joinedLines.push(run.line);
    }
    if (joinedLines.length > 0)
      rewritten.push({ file: path, lines: joinedLines });
  }
  const shownFiles: { path: string; lines: number[]; show: string }[] = [];
  for (const { path, lines } of overCap)
    shownFiles.push({ path, lines, show: buildShowCommand(path, lines) });
  return JSON.stringify({
    ...(rewritten.length > 0 && {
      information: "the following lines were rewritten by a hook after your edit",
      rewritten,
    }),
    ...(overCap.length > 0 && {
      instruction: `Spawn one sonnet-5 subagent per file to rewrite up to ${maxRewrites} of the comments below to under ${WORD_LIMIT} words, keeping each on one line. Return to your primary task after finishing the comment rewrites.  The hook will track when any flagged comments pass the word-length restriction and stop blocking you.`,
      files: shownFiles,
    }),
  });
}

export function applyReflowToFile(path: string): Reflow[] {
  // Markdown prose is not comments; reflowing it mangles plans and docs.
  const isMarkdown = path.endsWith(".md");
  if (isMarkdown)
    return [];
  // An active tackle-tasks worktree has a sibling <worktree>.lease; the pipeline owns those files.
  for (let dir = dirname(path); dir !== dirname(dir); dir = dirname(dir)) {
    const hasLease = existsSync(`${dir}.lease`);
    if (hasLease)
      return [];
  }
  const source = readFileSync(path, "utf8");
  const { text, runs } = applyReflowToSource(source);
  const needsWrite = runs.length > 0 && text !== source;
  if (needsWrite)
    writeFileSync(path, text);
  return runs;
}

// Blocks on over-cap comments; with a sessionId the quota silences already-seen debt after one fix.
export function emitReflows(hookEventName: string, files: FileReflow[], maxRewrites: string, sessionId?: string): number {
  const reflowed: FileReflow[] = [];
  let joined = false;
  for (const file of files) {
    if (file.runs.length === 0)
      continue;
    reflowed.push(file);
    for (const run of file.runs) {
      if (run.joined)
        joined = true;
    }
  }
  if (reflowed.length === 0)
    return REFLOW_NOT_EMITTED;
  let overCap: { path: string; lines: number[] }[] = [];
  for (const file of reflowed) {
    const overCapFile = listOverCapLines(file);
    if (overCapFile.lines.length > 0)
      overCap.push(overCapFile);
  }
  if (sessionId)
    overCap = applyQuota(sessionId, overCap);
  if (overCap.length === 0) {
    if (!joined)
      return REFLOW_NOT_EMITTED;
  }
  const reason = formatReflows(reflowed, overCap, maxRewrites);
  process.stdout.write(`${JSON.stringify(
    overCap.length > 0
      ? { decision: "block", reason }
      : { hookSpecificOutput: { hookEventName, additionalContext: reason } },
  )}\n`);
  return REFLOW_EMITTED;
}
