import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { BUSY_RE, HOOK_FLUSH_S, type JsonRecord, PROMPT_WAIT_S, SETTLE_S, type Session, TURN_TIMEOUT_S } from "./stranger_constants.ts";
import { clearToIdlePrompt, getJsonlSize, isScreenIdle, readRecords } from "./stranger_session.ts";

function containsPromptText(content: any, recordedPrompt: string): boolean {
  if (typeof content === "string") {
    return content.includes(recordedPrompt);
  }
  for (const block of content) {
    const hasText = block.type === "text" && block.text.includes(recordedPrompt);
    if (hasText) {
      return true;
    }
  }
  return false;
}

function formatRecordedPrompt(prompt: string): string {
  const isSlashPrompt = prompt.startsWith("/");
  return isSlashPrompt ? `<command-args>${prompt.slice(prompt.indexOf(" ") + 1)}</command-args>` : prompt;
}

function containsPromptRecord(records: JsonRecord[], prompt: string): boolean {
  for (const record of records) {
    const isUser = record.type === "user";
    const isMeta = record.isMeta === true;
    const isTypedPrompt = isUser && !isMeta;
    if (!isTypedPrompt) {
      continue;
    }
    const hasPrompt = containsPromptText(record.message.content, formatRecordedPrompt(prompt));
    if (hasPrompt) {
      return true;
    }
  }
  return false;
}

function validatePromptRecorded(session: Session, records: JsonRecord[], prompt: string): void {
  const isRecorded = containsPromptRecord(records, prompt);
  if (!isRecorded) {
    throw new Error(`prompt was not recorded as a user message in session ${session.name}: ${prompt}\n${tmux_lib.tmux_capturePane(session.name)}`);
  }
}

function readSettledRecords(session: Session, baselineCount: number): JsonRecord[] {
  tmux_lib.sleep(HOOK_FLUSH_S);
  const settledRecords = readRecords(session).slice(baselineCount);
  clearToIdlePrompt(session);
  return settledRecords;
}

// Sends a prompt, waits for its user record and hook records, then interrupts the turn it started.
export function executePromptOnlyTurn(session: Session, prompt: string): JsonRecord[] {
  clearToIdlePrompt(session);
  const baselineCount = readRecords(session).length;
  tmux_lib.tmux_sendAndSubmit(session.name, prompt + " ");
  for (let second = 0; second < PROMPT_WAIT_S; second++) {
    const records = readRecords(session).slice(baselineCount);
    const isRecorded = containsPromptRecord(records, prompt);
    if (isRecorded) {
      return readSettledRecords(session, baselineCount);
    }
    tmux_lib.sleep(1);
  }
  validatePromptRecorded(session, readRecords(session).slice(baselineCount), prompt);
  return [];
}

function createJsonlGrowthCheck(session: Session): () => boolean {
  let lastSize = getJsonlSize(session);
  return (): boolean => {
    const size = getJsonlSize(session);
    const hasGrown = size !== lastSize;
    lastSize = size;
    return hasGrown;
  };
}

export function executeTurn(session: Session, prompt: string, watchRegex?: RegExp): [JsonRecord[], string | undefined] {
  clearToIdlePrompt(session);
  const isJsonlGrowing = createJsonlGrowthCheck(session);
  const baselineCount = readRecords(session).length;
  tmux_lib.tmux_sendAndSubmit(session.name, prompt + " ");
  const watchMatch = tmux_lib.tmux_waitForTurnEnd(session.name, BUSY_RE, SETTLE_S, TURN_TIMEOUT_S, isJsonlGrowing, watchRegex);
  tmux_lib.tmux_capturePaneToFile(session.name, path.join(session.bed, `pane-${session.name}.txt`));
  const turnRecords = readRecords(session).slice(baselineCount);
  validatePromptRecorded(session, turnRecords, prompt);
  return [turnRecords, watchMatch];
}

export function executeFullTurn(session: Session, prompt: string): JsonRecord[] {
  const [records] = executeTurn(session, prompt);
  return records;
}

export function getSessionModel(session: Session): string | null {
  let model: string | null = null;
  for (const record of readRecords(session)) {
    const isAssistant = record.type === "assistant";
    const hasModel = isAssistant && Boolean(record.message.model);
    const isAssistantWithModel = isAssistant && hasModel;
    if (isAssistantWithModel) {
      model = record.message.model;
    }
  }
  return model;
}

export function validateSessionModel(session: Session, expectedPrefix: string): string {
  const model = getSessionModel(session);
  const hasNoModel = model === null;
  const hasWrongPrefix = model !== null && !model.startsWith(expectedPrefix);
  const isUnexpectedModel = hasNoModel || hasWrongPrefix;
  if (isUnexpectedModel) {
    throw new Error(`session ${session.name} ran model ${model}, expected ${expectedPrefix}*`);
  }
  return model;
}

export function waitForRecordText(session: Session, needle: string, timeoutSeconds: number): boolean {
  for (let waited = 0; waited < timeoutSeconds; waited += 2) {
    const text = JSON.stringify(readRecords(session));
    const hasNeedle = text.includes(needle);
    if (hasNeedle) {
      return true;
    }
    tmux_lib.sleep(2);
  }
  return false;
}

export function waitForIdleScreen(session: Session, timeoutSeconds: number): boolean {
  let idleChecks = 0;
  for (let waited = 0; waited < timeoutSeconds; waited += 2) {
    const isIdle = isScreenIdle(tmux_lib.tmux_capturePane(session.name));
    idleChecks = isIdle ? idleChecks + 1 : 0;
    if (idleChecks >= 3) {
      return true;
    }
    tmux_lib.sleep(2);
  }
  return false;
}
