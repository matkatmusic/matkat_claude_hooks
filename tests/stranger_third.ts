import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { IDLE_CHECK_PROMPT, MOVED_BLOCKED_EDITS_FOLDER, OPUS, PARENT_DENY_TEXT, REDIRECT_FILE, type Row, type Session, TASK_LIST_ID_MESSAGE, TURN_COUNTER_EVENTS, TWO_DAYS_SECONDS } from "./stranger_constants.ts";
import { setEnablement, setValue } from "./stranger_dispatch.ts";
import { addHookRow, addRow, findEvidence } from "./stranger_evidence.ts";
import { listFilesWithSuffix } from "./stranger_helpers.ts";
import { PARENT_ROW } from "./stranger_hook_rows.ts";
import { executeOffOnPair, getPaneTurns, removePromptFiles } from "./stranger_pair.ts";
import { launchSession, readRecords } from "./stranger_session.ts";
import { executeFullTurn, getSessionModel, validateSessionModel } from "./stranger_turn.ts";

function enableSessionThreeHooks(clone: string): void {
  setEnablement(clone, "check-task-list-id", "SessionStart", true);
  for (const turnCounterEvent of TURN_COUNTER_EVENTS) {
    setEnablement(clone, "turn-counter", turnCounterEvent, true);
  }
}

function executeParentRow(rows: Row[], session: Session, bed: string): string[] {
  const parentRow = executeOffOnPair(rows, session, bed, PARENT_ROW, executeFullTurn);
  const blockedFiles = listFilesWithSuffix(path.join(bed, "blocked-edits"), ".json");
  parentRow.ok = parentRow.ok && blockedFiles.length > 0;
  parentRow.evidence += ` | saved calls: ${blockedFiles.length}`;
  return blockedFiles;
}

function addThirdStartRows(rows: Row[], session: Session, model: string, turnsBefore: number | null): void {
  const startMessage = findEvidence(readRecords(session), TASK_LIST_ID_MESSAGE, "SessionStart");
  const hasStartMessage = startMessage !== undefined;
  addRow(rows, 49, "check-task-list-id (on)", model, hasStartMessage, `next session started with the hook on: message ${hasStartMessage ? "present" : "ABSENT"}`);
  tmux_lib.sleep(6);
  const turnsAfter = getPaneTurns(session.name);
  const startedAtZero = turnsBefore === 0;
  const hasTurnsAfter = turnsAfter !== null && turnsAfter >= 1;
  addRow(rows, 50, "turn-counter (on)", model, startedAtZero && hasTurnsAfter, `next session ran with the hook on: turns on screen: before=${turnsBefore} after=${turnsAfter}`);
}

function addIdleStateRow(rows: Row[], session: Session, second: Session, stateFiles: string[], hasExited: boolean): void {
  const readerFound = findEvidence(readRecords(session), "Tell me about the recent work", "UserPromptSubmit");
  const idleOk = stateFiles.length > 0 && hasExited && readerFound !== undefined;
  addRow(rows, 14, "idle-state", getSessionModel(second), idleOk, `state files: ${stateFiles.length}; claude exited: ${hasExited ? "True" : "False"}; next start context: ${readerFound !== undefined ? "True" : "False"}`);
}

// Row 53: a value changed mid-session moves the next saved call to the new folder.
function addBlockedValueRow(rows: Row[], session: Session, bed: string, model: string, blockedFiles: string[]): void {
  const movedFolder = path.join(bed, MOVED_BLOCKED_EDITS_FOLDER);
  setValue(path.join(bed, "claude_hooks"), "block-parent-edits", "CLAUDE_HOOKS_BLOCKED_EDITS_DIR", movedFolder);
  executeFullTurn(session, "Use the Write tool to create a file other.txt that says hello. Do not use a subagent.");
  const oldFolderCount = listFilesWithSuffix(path.join(bed, "blocked-edits"), ".json").length;
  const movedFiles = listFilesWithSuffix(movedFolder, ".json");
  const landedInNewFolder = movedFiles.length > 0 && oldFolderCount === blockedFiles.length;
  addRow(rows, 53, "block-parent-edits (value)", model, landedInNewFolder, `value changed mid-session: saved calls in the new folder: ${movedFiles.length}; saved calls in the old folder: ${oldFolderCount} (was ${blockedFiles.length})`);
}

export function executeThirdSession(rows: Row[], bed: string, config: string, second: Session, stateFiles: string[], hasExited: boolean): Session {
  const clone = path.join(bed, "claude_hooks");
  enableSessionThreeHooks(clone);
  const session = launchSession(OPUS, bed, config);
  const turnsBefore = getPaneTurns(session.name);
  setEnablement(clone, "clarify-ambiguous", "UserPromptSubmit", false);
  const idleCheckRecords = executeFullTurn(session, IDLE_CHECK_PROMPT);
  addHookRow(rows, session, 60, "idle-state-check", idleCheckRecords, "Before you end your first turn", "Stop");
  const blockedFiles = executeParentRow(rows, session, bed);
  const model = validateSessionModel(session, "claude-opus-5");
  addThirdStartRows(rows, session, model, turnsBefore);
  addIdleStateRow(rows, session, second, stateFiles, hasExited);
  addBlockedValueRow(rows, session, bed, model, blockedFiles);
  return session;
}

function writeOldSavedEdit(oldSavedEdit: string, redirectFile: string): void {
  mkdirSync(path.dirname(oldSavedEdit), { recursive: true });
  mkdirSync(path.dirname(redirectFile), { recursive: true });
  writeFileSync(oldSavedEdit, "{}");
  const twoDaysAgo = Date.now() / 1000 - TWO_DAYS_SECONDS;
  utimesSync(oldSavedEdit, twoDaysAgo, twoDaysAgo);
}

function executeAllowedRedirect(session: Session, redirectFile: string, oldSavedEdit: string): [boolean, boolean] {
  const allowedRecords = executeFullTurn(session, `Use the Bash tool to run exactly this command: echo hi > ./.idleState/${REDIRECT_FILE}`);
  const allowedDenial = findEvidence(allowedRecords, PARENT_DENY_TEXT);
  const wroteRedirect = existsSync(redirectFile);
  const keptOldEdit = existsSync(oldSavedEdit);
  return [allowedDenial === undefined && wroteRedirect, keptOldEdit];
}

function executeDeniedRedirect(session: Session, oldSavedEdit: string): [boolean, boolean] {
  const deniedRecords = executeFullTurn(session, "Use the Bash tool to run exactly this command: echo hi > out.txt. If the tool is denied, reply with the word denied and stop.");
  const deniedEvidence = findEvidence(deniedRecords, PARENT_DENY_TEXT);
  return [deniedEvidence !== undefined, !existsSync(oldSavedEdit)];
}

// Row 61: Opus parents may redirect only into .idleState; a denied redirect removes saved edits over a day old.
export function executeParentFilesRow(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  const oldSavedEdit = path.join(bed, MOVED_BLOCKED_EDITS_FOLDER, "old-session-1.json");
  const redirectFile = path.join(bed, "project", ".idleState", REDIRECT_FILE);
  writeOldSavedEdit(oldSavedEdit, redirectFile);
  setEnablement(clone, "block-bash-edits", "PreToolUse", false);
  const [allowsRedirect, keptOldEdit] = executeAllowedRedirect(session, redirectFile, oldSavedEdit);
  const [deniesOther, removedOldEdit] = executeDeniedRedirect(session, oldSavedEdit);
  setEnablement(clone, "block-bash-edits", "PreToolUse", true);
  rmSync(redirectFile, { force: true });
  removePromptFiles(bed);
  const ok = allowsRedirect && keptOldEdit && deniesOther && removedOldEdit;
  addRow(rows, 61, "block-parent-edits (files)", getSessionModel(session), ok, `redirect into .idleState allowed and written: ${allowsRedirect ? "True" : "False"}; other redirect denied: ${deniesOther ? "True" : "False"}; 2 day old saved edit kept after the allowed call: ${keptOldEdit ? "True" : "False"}; removed after the denial: ${removedOldEdit ? "True" : "False"}`);
}
