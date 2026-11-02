import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { ASK_DONT_DUMP_PROMPT, CHECKER_WAIT_S, HOOK_FLUSH_S, type Row, SETTLE_S, type Session, SONNET, STRANGER_TASK_LIST_ID, SUBAGENT_LINE_RE } from "./stranger_constants.ts";
import { executeContextExitRow } from "./stranger_context_exit.ts";
import { setEnablement } from "./stranger_dispatch.ts";
import { addHookRow, addRow, containsAssistantText, findPluginPromptRecord, readRecordText } from "./stranger_evidence.ts";
import { listFilesWithSuffix } from "./stranger_helpers.ts";
import { SESSION_ONE_ROWS } from "./stranger_hook_rows.ts";
import { executeOffOnPair, getPaneTurns } from "./stranger_pair.ts";
import { clearToIdlePrompt, launchSession, readRecords } from "./stranger_session.ts";
import { executeFullTurn, executeTurn, getSessionModel, validateSessionModel } from "./stranger_turn.ts";

function addAskDontDumpOnRow(rows: Row[], session: Session, clone: string): void {
  setEnablement(clone, "ask-dont-dump", "turn.complete", true);
  const onBaseline = readRecords(session).length;
  executeTurn(session, ASK_DONT_DUMP_PROMPT);
  tmux_lib.sleep(HOOK_FLUSH_S);
  const followUp = findPluginPromptRecord(readRecords(session).slice(onBaseline), "ask-dont-dump");
  const followUpText = followUp !== undefined ? readRecordText(followUp) : "no message from the ask-dont-dump plugin";
  addRow(rows, 45, "ask-dont-dump", getSessionModel(session), followUp !== undefined, followUpText);
}

function addAskDontDumpOffRow(rows: Row[], session: Session, clone: string): void {
  setEnablement(clone, "ask-dont-dump", "turn.complete", false);
  clearToIdlePrompt(session);
  tmux_lib.sleep(SETTLE_S);
  const offBaseline = readRecords(session).length;
  executeTurn(session, ASK_DONT_DUMP_PROMPT);
  tmux_lib.sleep(CHECKER_WAIT_S);
  const offRecords = readRecords(session).slice(offBaseline);
  const offFollowUp = findPluginPromptRecord(offRecords, "ask-dont-dump");
  const repliedWithOpenItem = containsAssistantText(offRecords, "Task #20 is still open");
  const isSilent = offFollowUp === undefined && repliedWithOpenItem;
  addRow(rows, 46, "ask-dont-dump (off)", getSessionModel(session), isSilent, `reply ended with the open item: ${repliedWithOpenItem ? "True" : "False"}; message from the plugin with the switch off: ${offFollowUp === undefined ? "absent" : "PRESENT"}`);
}

// Rows 45 and 46: an open item gets a mod follow-up when on, none when off.
function executeAskDontDumpRows(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  addAskDontDumpOnRow(rows, session, clone);
  addAskDontDumpOffRow(rows, session, clone);
}

function getTaskListSettingsPath(bed: string): string {
  return path.join(bed, "project", ".claude", "settings.json");
}

// The ask-dont-dump mod reads the task list id from project settings; row 45 needs it.
export function writeTaskListSettings(bed: string, config: string): void {
  const settingsPath = getTaskListSettingsPath(bed);
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ env: { CLAUDE_CODE_TASK_LIST_ID: STRANGER_TASK_LIST_ID } }, null, 2) + "\n");
  mkdirSync(path.join(config, "tasks", STRANGER_TASK_LIST_ID), { recursive: true });
}

function executeStartRows(rows: Row[], session: Session, bed: string, config: string): void {
  const turnsBefore = getPaneTurns(session.name);
  executeTurn(session, "say hi");
  validateSessionModel(session, "claude-sonnet-5");
  addHookRow(rows, session, 1, "check-task-list-id", readRecords(session), "CLAUDE_CODE_TASK_LIST_ID is not set", "SessionStart");
  writeTaskListSettings(bed, config);
  tmux_lib.sleep(6);
  const turnsAfter = getPaneTurns(session.name);
  const startedAtZero = turnsBefore === 0;
  const hasTurnsAfter = turnsAfter !== null && turnsAfter >= 1;
  const statusLineOk = startedAtZero && hasTurnsAfter;
  addRow(rows, 2, "status-line", getSessionModel(session), statusLineOk, `turns on screen: before=${turnsBefore} after=${turnsAfter}`);
}

function addSubagentLineRow(rows: Row[], session: Session): void {
  const [, subagentLine] = executeTurn(session, "Start one subagent that lists the files in this folder.", SUBAGENT_LINE_RE);
  addRow(rows, 3, "status-line (subagent)", getSessionModel(session), subagentLine !== undefined, subagentLine !== undefined ? subagentLine : "no subagent line seen on screen");
}

function executeSessionOneRows(rows: Row[], session: Session, bed: string): void {
  for (const hookRow of SESSION_ONE_ROWS) {
    const row = executeOffOnPair(rows, session, bed, hookRow, executeFullTurn);
    const isNpmTestRow = hookRow[0] === 5;
    if (isNpmTestRow) {
      const logFiles = listFilesWithSuffix(path.join(bed, "npm-test-logs"), "");
      row.ok = row.ok && logFiles.length > 0;
      row.evidence += ` | log files: ${logFiles.length}`;
    }
  }
}

export function executeFirstSession(rows: Row[], bed: string, config: string): Session {
  const session = launchSession(SONNET, bed, config);
  executeStartRows(rows, session, bed, config);
  addSubagentLineRow(rows, session);
  executeSessionOneRows(rows, session, bed);
  executeAskDontDumpRows(rows, session, bed);
  executeContextExitRow(rows, session, bed);
  rmSync(getTaskListSettingsPath(bed), { force: true });
  return session;
}
