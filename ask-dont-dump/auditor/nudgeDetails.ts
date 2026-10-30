import type { FlaggedCheck } from '../mod/hooks/nudgeFile';

export type Block = { type: string; text?: string; id?: string; name?: string; input?: { file_path?: string }; tool_use_id?: string; content?: string | Block[] };
export type Content = string | Block[];
export type ReadCall = { id: string; path: string; turnIndex: number; text: string | undefined };

const NEW_NUDGE_MARKER = 'ask-dont-dump flagged your last reply.';
const NUDGE_PATH_PATTERN = /Read (\S+) and do each item/;
const LINE_NUMBER_PATTERN = /^\s*\d+[→\t]/gm;

export function readTextBlocks(content: Content): string {
  if (typeof content === 'string')
    return content;
  const texts: string[] = [];
  for (const block of content) {
    const isTextBlock = block.type === 'text' && block.text !== undefined;
    if (isTextBlock)
      texts.push(block.text as string);
  }
  return texts.join('\n\n');
}

export function containsToolResult(content: Content): boolean {
  if (typeof content === 'string')
    return false;
  let isToolResult = false;
  for (const block of content) {
    if (block.type === 'tool_result')
      isToolResult = true;
  }
  return isToolResult;
}

export function addReadCalls(reads: ReadCall[], turnIndex: number, content: Content) {
  if (typeof content === 'string')
    return;
  for (const block of content) {
    const isReadCall = block.type === 'tool_use' && block.name === 'Read';
    if (isReadCall)
      reads.push({ id: block.id as string, path: block.input?.file_path as string, turnIndex, text: undefined });
  }
}

export function addReadResults(reads: ReadCall[], content: Content) {
  if (typeof content === 'string')
    return;
  for (const block of content) {
    if (block.type !== 'tool_result')
      continue;
    for (const read of reads) {
      if (read.id === block.tool_use_id)
        read.text = readTextBlocks(block.content as Content);
    }
  }
}

export function isNewFormatNudge(nudgeText: string): boolean {
  return nudgeText.includes(NEW_NUDGE_MARKER);
}

type OldFlaggedChecks = { did: string[]; do: string[]; phrases: string[] };

function convertOldShapeToChecks(old: OldFlaggedChecks): FlaggedCheck[] {
  const checks: FlaggedCheck[] = [];
  for (const [i, did] of old.did.entries())
    checks.push({ did, do: old.do[i] as string, proof: old.phrases[i] as string });
  return checks;
}

function parseReadJson(readText: string): FlaggedCheck[] {
  const withoutNumbers = readText.replace(LINE_NUMBER_PATTERN, '');
  const arrayStart = withoutNumbers.indexOf('[');
  const objectStart = withoutNumbers.indexOf('{');
  const isArrayMissing = arrayStart === -1;
  const isObjectBeforeArray = objectStart !== -1 && objectStart < arrayStart;
  const isObjectFirst = isArrayMissing || isObjectBeforeArray;
  const start = isObjectFirst ? objectStart : arrayStart;
  const end = Math.max(withoutNumbers.lastIndexOf(']'), withoutNumbers.lastIndexOf('}'));
  const parsed = JSON.parse(withoutNumbers.slice(start, end + 1));
  if (Array.isArray(parsed))
    return parsed;
  return convertOldShapeToChecks(parsed);
}

export function findNudgeDetails(reads: ReadCall[], nudgeText: string, firstTurnIndex: number, endTurnIndex: number): FlaggedCheck[] | undefined {
  const pathMatch = NUDGE_PATH_PATTERN.exec(nudgeText);
  if (pathMatch === null)
    throw new Error(`new-format nudge has no file path: ${nudgeText}`);
  for (const read of reads) {
    const isInNudgeWindow = read.turnIndex >= firstTurnIndex && read.turnIndex < endTurnIndex;
    const isNudgeFile = read.path === pathMatch[1];
    const isNextRead = isInNudgeWindow && isNudgeFile;
    if (!isNextRead)
      continue;
    if (read.text === undefined)
      return undefined;
    return parseReadJson(read.text);
  }
  return undefined;
}
