import { REPLY_CHECKS } from '../mod/hooks/register';
import type { FlaggedCheck } from '../mod/hooks/nudgeFile';
import { assertOldNudgeDidsHaveChecks, containsOldNudge } from './oldNudgeTexts';
import { addReadCalls, addReadResults, containsToolResult, findNudgeDetails, isNewFormatNudge, readTextBlocks, type Content, type ReadCall } from './nudgeDetails';

const PLUGIN_NAME = 'ask-dont-dump';
const TASK_NUMBER_PATTERN = /#\d+/;

export type CheckState = 'fired' | 'fired (details not read)' | 'quiet' | 'quiet (maybe task-list skip)' | 'not checked';
export type CheckRow = { question: string; state: CheckState; phrase: string };
export type ReplyRow = { uuid: string; promptText: string; replyText: string; checks: CheckRow[] };
export type ParsedTranscript = { sessionId: string; rows: ReplyRow[] };

type Line = {
  type: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  uuid: string;
  sessionId: string;
  origin?: { kind: string; name?: string };
  message: { id?: string; content: Content };
};
type Turn = {
  promptText: string;
  isNudge: boolean;
  nudgeText: string;
  flagged: FlaggedCheck[] | undefined;
  isDetailsUnread: boolean;
  replyUuid: string;
  replyMessageId: string;
  replyText: string;
};

function addPromptTurn(turns: Turn[], line: Line) {
  const isToolResult = containsToolResult(line.message.content);
  const isMeta = line.isMeta === true;
  const isSkippedPrompt = isToolResult || isMeta;
  if (isSkippedPrompt)
    return;
  const isPluginPrompt = line.origin?.kind === 'plugin';
  const isOwnPlugin = line.origin?.name === PLUGIN_NAME;
  const isNudge = isPluginPrompt && isOwnPlugin;
  const promptText = readTextBlocks(line.message.content);
  turns.push({ promptText, isNudge, nudgeText: '', flagged: undefined, isDetailsUnread: false, replyUuid: '', replyMessageId: '', replyText: '' });
}

function addAssistantText(turns: Turn[], line: Line) {
  const text = readTextBlocks(line.message.content);
  const hasText = text.trim() !== '';
  if (!hasText)
    return;
  const turn = turns.at(-1);
  if (turn === undefined)
    throw new Error(`assistant text before any prompt: ${line.uuid}`);
  const isSameMessage = turn.replyMessageId === line.message.id;
  if (isSameMessage) {
    turn.replyText += `\n\n${text}`;
    return;
  }
  turn.replyMessageId = line.message.id as string;
  turn.replyUuid = line.uuid;
  turn.replyText = text;
}

function applyNudges(turns: Turn[], reads: ReadCall[]) {
  for (const [i, turn] of turns.entries()) {
    if (!turn.isNudge)
      continue;
    let checkedTurn: Turn | undefined;
    for (let j = i - 1; j >= 0 && checkedTurn === undefined; j--) {
      const hasReply = turns[j].replyText !== '';
      if (hasReply)
        checkedTurn = turns[j];
    }
    if (checkedTurn === undefined)
      throw new Error(`nudge has no reply before it: ${turn.promptText}`);
    checkedTurn.nudgeText = turn.promptText;
    const isNewFormat = isNewFormatNudge(turn.promptText);
    if (!isNewFormat)
      continue;
    let endTurnIndex = turns.length;
    for (let k = turns.length - 1; k > i; k--) {
      if (turns[k].isNudge)
        endTurnIndex = k;
    }
    checkedTurn.flagged = findNudgeDetails(reads, turn.promptText, i, endTurnIndex);
    checkedTurn.isDetailsUnread = checkedTurn.flagged === undefined;
  }
}

function buildChecks(turn: Turn): CheckRow[] {
  const hasTaskNumber = TASK_NUMBER_PATTERN.test(turn.replyText);
  const checks: CheckRow[] = [];
  for (const check of REPLY_CHECKS) {
    // const flaggedIndex = turn.flagged === undefined ? -1 : turn.flagged.did.indexOf(check.did);
    // const isFiredByDetails = flaggedIndex >= 0;
    let flaggedProof = '';
    let isFiredByDetails = false;
    for (const item of turn.flagged ?? []) {
      if (item.did === check.did) {
        isFiredByDetails = true;
        flaggedProof = item.proof;
      }
    }
    const isFiredByOldText = containsOldNudge(turn.nudgeText, check.did);
    const isFired = isFiredByOldText || isFiredByDetails;
    const isMaybeSkipped = check.skipsListedTasks === true && hasTaskNumber;
    let state: CheckState = 'quiet';
    let phrase = '';
    if (isMaybeSkipped)
      state = 'quiet (maybe task-list skip)';
    if (turn.isDetailsUnread)
      state = 'fired (details not read)';
    if (isFired)
      state = 'fired';
    if (isFiredByDetails)
      phrase = flaggedProof;
    if (turn.isNudge)
      state = 'not checked';
    checks.push({ question: check.question, state, phrase });
  }
  return checks;
}

export function parseTranscript(rawText: string): ParsedTranscript {
  assertOldNudgeDidsHaveChecks();
  const turns: Turn[] = [];
  const reads: ReadCall[] = [];
  let sessionId = '';
  for (const rawLine of rawText.split('\n')) {
    if (rawLine === '')
      continue;
    const line: Line = JSON.parse(rawLine);
    const isConversationLine = line.type === 'user' || line.type === 'assistant';
    const isSidechain = line.isSidechain === true;
    const isSkippedLine = !isConversationLine || isSidechain;
    if (isSkippedLine)
      continue;
    if (sessionId === '')
      sessionId = line.sessionId;
    if (line.type === 'user') {
      addReadResults(reads, line.message.content);
      addPromptTurn(turns, line);
    }
    else {
      addReadCalls(reads, turns.length - 1, line.message.content);
      addAssistantText(turns, line);
    }
  }
  applyNudges(turns, reads);
  const rows: ReplyRow[] = [];
  for (const turn of turns) {
    if (turn.replyText === '')
      continue;
    rows.push({ uuid: turn.replyUuid, promptText: turn.promptText, replyText: turn.replyText, checks: buildChecks(turn) });
  }
  return { sessionId, rows };
}
