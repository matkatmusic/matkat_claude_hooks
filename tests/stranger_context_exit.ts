import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { CONTEXT_LEVEL_SPACING, FILLER_FILES, type Row, type Session, TOAST_BOX_RE } from "./stranger_constants.ts";
import { getPaneContextPercent, readWarningLevel, waitForToastGone, writeFillerFiles } from "./stranger_context_screen.ts";
import { setEnablement, setValue } from "./stranger_dispatch.ts";
import { addRow } from "./stranger_evidence.ts";
import { executeTurn, getSessionModel } from "./stranger_turn.ts";

interface CrossingState {
  seenLevels: number[];
  lastShown: number | null;
  fillerIndex: number;
  toastOnEachCrossing: boolean;
  noRepeat: boolean;
}

function executeContextOffTurn(session: Session, clone: string): boolean {
  const pairPercent = getPaneContextPercent(session.name);
  const levelBeforePair = readWarningLevel(tmux_lib.tmux_capturePane(session.name));
  setEnablement(clone, "context-exit", "turn.complete", false);
  setValue(clone, "context-exit", "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS", String(pairPercent));
  executeTurn(session, "say hi");
  const offScreen = tmux_lib.tmux_capturePane(session.name);
  const hasOffToast = TOAST_BOX_RE.test(offScreen);
  const hasOffLevelChange = readWarningLevel(offScreen) !== levelBeforePair;
  return hasOffToast || hasOffLevelChange;
}

function executeContextOnTurn(session: Session, clone: string): boolean {
  setEnablement(clone, "context-exit", "turn.complete", true);
  executeTurn(session, "say hi");
  const hasOnMessage = TOAST_BOX_RE.test(tmux_lib.tmux_capturePane(session.name));
  waitForToastGone(session.name);
  return hasOnMessage;
}

function readNextFiller(session: Session, state: CrossingState, level: number): string {
  state.fillerIndex++;
  if (state.fillerIndex > FILLER_FILES) {
    throw new Error(`context-exit: ${FILLER_FILES} filler files did not reach level ${level}`);
  }
  executeTurn(session, `Read the file filler${state.fillerIndex}.txt in this folder and reply with only the word read.`);
  return tmux_lib.tmux_capturePane(session.name);
}

function addCrossing(state: CrossingState, shown: number, screen: string): void {
  state.seenLevels.push(shown);
  state.lastShown = shown;
  const hasToast = TOAST_BOX_RE.test(screen);
  state.toastOnEachCrossing = state.toastOnEachCrossing && hasToast;
}

function updateRepeatCheck(session: Session, state: CrossingState): void {
  const laterScreen = tmux_lib.tmux_capturePane(session.name);
  const hasNewToast = TOAST_BOX_RE.test(laterScreen);
  const levelChanged = readWarningLevel(laterScreen) !== state.lastShown;
  state.noRepeat = state.noRepeat && !hasNewToast && !levelChanged;
}

function executeCrossing(session: Session, level: number, state: CrossingState): void {
  let hasCrossed = false;
  while (!hasCrossed) {
    const screen = readNextFiller(session, state, level);
    const shown = readWarningLevel(screen);
    hasCrossed = shown !== state.lastShown;
    if (hasCrossed) {
      addCrossing(state, shown!, screen);
    }
  }
  waitForToastGone(session.name);
  executeTurn(session, "say hi");
  updateRepeatCheck(session, state);
}

function buildContextLevels(startPercent: number): number[] {
  const levels: number[] = [];
  for (let step = 1; step <= 3; step++) {
    levels.push(startPercent + step * CONTEXT_LEVEL_SPACING);
  }
  return levels;
}

function executeContextCrossings(session: Session, clone: string, levels: number[]): CrossingState {
  setValue(clone, "context-exit", "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS", levels.join(","));
  const lastShown = readWarningLevel(tmux_lib.tmux_capturePane(session.name));
  const state: CrossingState = { seenLevels: [], lastShown, fillerIndex: 0, toastOnEachCrossing: true, noRepeat: true };
  for (const level of levels) {
    executeCrossing(session, level, state);
  }
  return state;
}

function addContextExitRow(rows: Row[], session: Session, hasOffMessage: boolean, hasOnMessage: boolean, startPercent: number, levels: number[], state: CrossingState): void {
  const switchOk = !hasOffMessage && hasOnMessage;
  const isInOrder = state.seenLevels.join(",") === levels.join(",");
  const ok = isInOrder && state.toastOnEachCrossing && state.noRepeat && switchOk;
  addRow(rows, 43, "context-exit", getSessionModel(session), ok, `hook off: message ${hasOffMessage ? "PRESENT" : "absent"}; hook on: message ${hasOnMessage ? "present" : "ABSENT"}; context ${startPercent}%, levels set ${levels.join(",")}; warnings seen in order: ${state.seenLevels.join(",")}; toast shown at each crossing: ${state.toastOnEachCrossing ? "True" : "False"}; no second toast on a later turn at the same level: ${state.noRepeat ? "True" : "False"}; files read: ${state.fillerIndex}`);
}

// Row 43: set three levels just above the current context percent, then read files until each level warns once.
export function executeContextExitRow(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  writeFillerFiles(path.join(bed, "project"));
  setEnablement(clone, "idle-state", "turn.complete", false);
  waitForToastGone(session.name);
  const hasOffMessage = executeContextOffTurn(session, clone);
  const hasOnMessage = executeContextOnTurn(session, clone);
  const startPercent = getPaneContextPercent(session.name);
  const levels = buildContextLevels(startPercent);
  const state = executeContextCrossings(session, clone, levels);
  setEnablement(clone, "idle-state", "turn.complete", true);
  addContextExitRow(rows, session, hasOffMessage, hasOnMessage, startPercent, levels, state);
}
