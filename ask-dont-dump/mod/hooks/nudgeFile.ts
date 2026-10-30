import type { EngineInterface } from 'claude-code';

// export type FlaggedChecks = { did: string[]; do: string[]; phrases: string[] };
export type FlaggedCheck = { did: string; do: string; proof: string };

const NUDGE_FOLDER = '.claude_hooks/ask-dont-dump';
const YES_PATTERN = /^yes/i;
const LEADING_FILLER_PATTERN = /^[:,\s]+/;
const SURROUNDING_QUOTES_PATTERN = /^["'`“”‘’]+|["'`“”‘’]+$/g;

export function buildNudgePath(root: string, sessionId: string): string {
  return `${root}/${NUDGE_FOLDER}/${sessionId}.json`;
}

// export function parseYesPhrase(replyText: string): string {
//   const trimmedText = replyText.trim();
//   const isYes = YES_PATTERN.test(trimmedText);
//   if (!isYes)
//     return '';
//   const afterYes = trimmedText.slice('yes'.length);
//   const withoutFiller = afterYes.replace(LEADING_FILLER_PATTERN, '');
//   const unquoted = withoutFiller.replace(SURROUNDING_QUOTES_PATTERN, '');
//   return unquoted.trim();
// }
export function parseYesPhrase(replyText: string, answer: string): string {
  const trimmedText = replyText.trim();
  const isYes = YES_PATTERN.test(trimmedText);
  if (isYes == false)
    return '';
  const afterYes = trimmedText.slice('yes'.length);
  const withoutFiller = afterYes.replace(LEADING_FILLER_PATTERN, '');
  const unquoted = withoutFiller.replace(SURROUNDING_QUOTES_PATTERN, '').trim();
  const isInAnswer = answer.includes(unquoted);
  if (isInAnswer == false)
    return '';
  return unquoted;
}

export async function writeNudgeFile($: EngineInterface, flagged: FlaggedCheck[]): Promise<string> {
  const root = await $.session.root();
  const sessionId = await $.session.id();
  const path = buildNudgePath(root, sessionId);
  await $.fs.write(path, JSON.stringify(flagged, null, 2));
  return path;
}

export async function removeNudgeFile($: EngineInterface, sessionId: string): Promise<void> {
  const root = await $.session.root();
  const path = buildNudgePath(root, sessionId);
  const hasFile = await $.fs.exists(path);
  if (!hasFile)
    return;
  const result = await $.process.run(['rm', path]);
  const isRemoveFailed = result.exitCode !== 0;
  if (isRemoveFailed)
    throw new Error(`ask-dont-dump: rm ${path} exited with ${result.exitCode}: ${result.stderr}`);
}
