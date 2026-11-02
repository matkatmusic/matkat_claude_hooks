import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { IDLE_PROGRAM_PATTERN, IDLE_PROGRAM_SCRIPT, NO_ENABLEMENT_MESSAGE, NOT_WIRED_TEXT, type Row, type Session, SONNET, TASK_LIST_ID_MESSAGE, TURN_COUNTER_EVENTS, TURNS_RE, UNKNOWN_HOOK_MESSAGE, UNKNOWN_HOOK_NAME } from "./stranger_constants.ts";
import { addUnknownHook, readDispatchTexts, removeEnablement, setEnablement, writeDispatchTexts } from "./stranger_dispatch.ts";
import { addHookRow, addRow, findEvidence } from "./stranger_evidence.ts";
import { CLARIFY_ROW, PONYTAIL_ROW, SESSION_TWO_ROWS } from "./stranger_hook_rows.ts";
import { executeOffOnPair, removePromptFiles } from "./stranger_pair.ts";
import { executeChainRows, executeSubagentStopRows } from "./stranger_chain.ts";
import { launchSession, readRecords } from "./stranger_session.ts";
import { executeFullTurn, executePromptOnlyTurn, executeTurn, getSessionModel, validateSessionModel } from "./stranger_turn.ts";

interface IdleProgram {
  command: string;
  hasProgram: boolean;
  isRunning: boolean;
  pidCount: number;
}

// Rows 47 and 48: session hooks cannot switch mid-session, so this session starts with them off.
function addSessionOffRows(rows: Row[], session: Session): void {
  const startMessage = findEvidence(readRecords(session), TASK_LIST_ID_MESSAGE, "SessionStart");
  const hasStartMessage = startMessage !== undefined;
  addRow(rows, 47, "check-task-list-id (off)", getSessionModel(session), !hasStartMessage, `session started with the hook off: message ${hasStartMessage ? "PRESENT" : "absent"}`);
  const screen = tmux_lib.tmux_capturePane(session.name);
  const turnsMatch = TURNS_RE.exec(screen);
  const hasTurnCount = turnsMatch !== null;
  const hasNotWiredText = screen.includes(NOT_WIRED_TEXT);
  const turnCounterOff = !hasTurnCount && hasNotWiredText;
  addRow(rows, 48, "turn-counter (off)", getSessionModel(session), turnCounterOff, `session ran with the hook off: turn count on screen: ${hasTurnCount ? "PRESENT" : "absent"}; not-wired note on screen: ${hasNotWiredText ? "present" : "ABSENT"}`);
}

// Rows 51 and 52: a missing enablement and an unknown hook name must show their errors in the session.
function executeDispatchErrorRows(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  const savedTexts = readDispatchTexts(clone);
  removeEnablement(clone, "idle-state-reader", "UserPromptSubmit");
  const missingRecords = executePromptOnlyTurn(session, "say hello");
  writeDispatchTexts(clone, savedTexts);
  addHookRow(rows, session, 51, "dispatcher (no enablement)", missingRecords, NO_ENABLEMENT_MESSAGE, "UserPromptSubmit");
  addUnknownHook(clone, UNKNOWN_HOOK_NAME);
  const unknownRecords = executePromptOnlyTurn(session, "say hello again");
  writeDispatchTexts(clone, savedTexts);
  addHookRow(rows, session, 52, "dispatcher (unknown hook)", unknownRecords, UNKNOWN_HOOK_MESSAGE, "UserPromptSubmit");
}

function executeClarifyRows(rows: Row[], session: Session, bed: string): void {
  const clarifyRow = executeOffOnPair(rows, session, bed, CLARIFY_ROW, executePromptOnlyTurn);
  const fixItJdiRecords = executePromptOnlyTurn(session, "fix it jdi");
  const gateInOptOut = findEvidence(fixItJdiRecords, "AMBIGUITY GATE", "UserPromptSubmit");
  clarifyRow.ok = clarifyRow.ok && gateInOptOut === undefined;
  clarifyRow.evidence += ` | gate on 'fix it jdi': ${gateInOptOut !== undefined ? "True" : "False"}`;
  executeDispatchErrorRows(rows, session, bed);
}

function executeSessionTwoRows(rows: Row[], session: Session, bed: string): void {
  for (const hookRow of SESSION_TWO_ROWS) {
    executeOffOnPair(rows, session, bed, hookRow, executeFullTurn);
    removePromptFiles(bed);
  }
  executeChainRows(rows, session, bed);
  executeSubagentStopRows(rows, session, bed);
  executeClarifyRows(rows, session, bed);
}

function launchIdleProgram(session: Session, project: string): void {
  writeFileSync(path.join(project, IDLE_PROGRAM_SCRIPT), "sleep 3000\n");
  executeTurn(session, `Use the Bash tool with run_in_background set to true to run exactly this command: bash ./${IDLE_PROGRAM_SCRIPT}`);
  const programFound = spawnSync("pgrep", ["-f", IDLE_PROGRAM_PATTERN]);
  if (programFound.status !== 0) {
    throw new Error(`the background program ${IDLE_PROGRAM_SCRIPT} is not running in session ${session.name}`);
  }
}

export function executeSecondSession(rows: Row[], bed: string, config: string): Session {
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "check-task-list-id", "SessionStart", false);
  for (const turnCounterEvent of TURN_COUNTER_EVENTS) {
    setEnablement(clone, "turn-counter", turnCounterEvent, false);
  }
  const session = launchSession(SONNET, bed, config);
  executeOffOnPair(rows, session, bed, PONYTAIL_ROW, executeFullTurn);
  validateSessionModel(session, "claude-sonnet-5");
  addSessionOffRows(rows, session);
  executeSessionTwoRows(rows, session, bed);
  launchIdleProgram(session, path.join(bed, "project"));
  executeTurn(session, "say hi");
  return session;
}

function findIdleProgram(stateFiles: string[]): IdleProgram {
  const found: IdleProgram = { command: "none", hasProgram: false, isRunning: false, pidCount: 0 };
  for (const stateFile of stateFiles) {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    for (const program of state.runningPrograms) {
      const isIdleProgram = program.command.includes(IDLE_PROGRAM_SCRIPT);
      if (isIdleProgram) {
        Object.assign(found, { hasProgram: true, command: program.command, isRunning: program.isRunning, pidCount: program.pids.length });
      }
    }
  }
  return found;
}

// Row 44: the idle-state mod searches for the running programs of the state file with escaped regex characters.
export function addIdleProgramRow(rows: Row[], second: Session, stateFiles: string[]): void {
  const found = findIdleProgram(stateFiles);
  const ok = found.hasProgram && found.isRunning && found.pidCount > 0;
  addRow(rows, 44, "idle-state (regex chars)", getSessionModel(second), ok, `state file lists "${found.command}": listed: ${found.hasProgram ? "True" : "False"}; found running by pgrep: ${found.isRunning ? "True" : "False"}; process ids: ${found.pidCount}`);
}
