import type { FlaggedChecks } from '../mod/hooks/nudgeFile';

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

export function hasToolResult(content: Content): boolean {
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

function parseReadJson(readText: string): FlaggedChecks {
  const withoutNumbers = readText.replace(LINE_NUMBER_PATTERN, '');
  const start = withoutNumbers.indexOf('{');
  const end = withoutNumbers.lastIndexOf('}');
  return JSON.parse(withoutNumbers.slice(start, end + 1));
}

export function findNudgeDetails(reads: ReadCall[], nudgeText: string, firstTurnIndex: number, endTurnIndex: number): FlaggedChecks | undefined {
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
