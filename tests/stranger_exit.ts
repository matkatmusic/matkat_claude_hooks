import { readFileSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { BOGUS_MODEL, CANCEL_RULE_PROMPT, EXIT_NOTICE, HOOK_FLUSH_S, type Row, type Session, STANDING_RULE_PROMPT, TOOL_DENY_MESSAGE } from "./stranger_constants.ts";
import { setEnablement } from "./stranger_dispatch.ts";
import { addRow, findEvidence } from "./stranger_evidence.ts";
import { listFilesWithSuffix } from "./stranger_helpers.ts";
import { launchSession, readRecords } from "./stranger_session.ts";
import { executeFullTurn, executeTurn, getSessionModel, waitForIdleScreen, waitForRecordText } from "./stranger_turn.ts";

function readSittingEnd(bed: string, session: Session): number | "" {
  const statePath = path.join(bed, "state", `${session.id}.json`);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const sittings = state.sittings;
  return sittings[sittings.length - 1].end;
}

export function readSittingTurns(bed: string, session: Session): number {
  const statePath = path.join(bed, "state", `${session.id}.json`);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const sittings = state.sittings;
  return sittings[sittings.length - 1].turns;
}

// Returns true when the first /exit showed the notice and kept the session open.
function executeDenyExitRow(rows: Row[], session: Session, model: string | null): boolean {
  executeFullTurn(session, STANDING_RULE_PROMPT);
  tmux_lib.tmux_sendAndSubmit(session.name, "/exit");
  const sawDenyMessage = waitForRecordText(session, TOOL_DENY_MESSAGE, 150);
  const wentIdle = waitForIdleScreen(session, 120);
  tmux_lib.sleep(HOOK_FLUSH_S);
  const firstRecords = readRecords(session);
  const denyEvidence = findEvidence(firstRecords, TOOL_DENY_MESSAGE);
  const sawExitNotice = JSON.stringify(firstRecords).includes(EXIT_NOTICE);
  const closedEarly = tmux_lib.tmux_waitForPaneClose(session.name, 1);
  const toolDenied = sawDenyMessage && denyEvidence !== undefined && !closedEarly;
  addRow(rows, 58, "idle-state (tool.call)", model, toolDenied, `model tried a tool during the state prompt: error in the tool result: ${denyEvidence !== undefined ? denyEvidence : "ABSENT"}; screen went idle: ${wentIdle ? "True" : "False"}`);
  return sawExitNotice && !closedEarly;
}

function listSessionStateFiles(bed: string, session: Session): string[] {
  const sessionPrefix = session.id.slice(0, 8);
  const stateFiles: string[] = [];
  for (const stateFile of listFilesWithSuffix(path.join(bed, "project", ".idleState"), ".json")) {
    const isThisSession = stateFile.includes(sessionPrefix);
    if (isThisSession) {
      stateFiles.push(stateFile);
    }
  }
  return stateFiles;
}

function executeCancelExitRow(rows: Row[], session: Session, bed: string, model: string | null, keptOpen: boolean): void {
  executeFullTurn(session, CANCEL_RULE_PROMPT);
  tmux_lib.tmux_sendAndSubmit(session.name, "/exit");
  const hasExited = tmux_lib.tmux_waitForPaneClose(session.name, 180);
  tmux_lib.sleep(HOOK_FLUSH_S);
  const stateFiles = listSessionStateFiles(bed, session);
  const exitOk = keptOpen && stateFiles.length > 0 && hasExited;
  addRow(rows, 59, "idle-state (command.run)", model, exitOk, `first /exit showed the notice and kept the session open: ${keptOpen ? "True" : "False"}; state files for this session: ${stateFiles.length}; second /exit closed the pane: ${hasExited ? "True" : "False"}`);
}

// Row 57: a nonexistent model name fails every turn, so only StopFailure can count turns.
export function executeStopFailureRow(rows: Row[], bed: string, config: string): void {
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "turn-counter", "StopFailure", false);
  const session = launchSession(BOGUS_MODEL, bed, config);
  executeTurn(session, "say hi");
  const turnsOff = readSittingTurns(bed, session);
  setEnablement(clone, "turn-counter", "StopFailure", true);
  executeTurn(session, "say hi again");
  const turnsOn = readSittingTurns(bed, session);
  tmux_lib.tmux_killPane(session.name);
  const countOk = turnsOff === 0 && turnsOn === 1;
  addRow(rows, 57, "turn-counter (StopFailure)", null, countOk, `failed turn with StopFailure off: counted turns ${turnsOff}; failed turn with StopFailure on: counted turns ${turnsOn}`);
}

// Rows 56, 58, 59: the state prompt denies tool calls, /exit writes the state file, SessionEnd fires.
export function executeExitRows(rows: Row[], session: Session, bed: string): void {
  const model = getSessionModel(session);
  const keptOpen = executeDenyExitRow(rows, session, model);
  executeCancelExitRow(rows, session, bed, model, keptOpen);
  const endTime = readSittingEnd(bed, session);
  const hasEndTime = endTime !== "";
  addRow(rows, 56, "turn-counter (SessionEnd)", model, hasEndTime, `session state file after exit: end time ${hasEndTime ? "set (" + endTime + ")" : "EMPTY"}`);
}
