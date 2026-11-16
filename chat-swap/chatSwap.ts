import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { findNewHandoffFile, hasBackgroundWorkDialog, isChatBusy, isInputBoxEmpty, listHandoffFiles } from "../claude-team/teamFile.ts";
import { sendTextToChat } from "../claude-team/teamSend.ts";

// The bodies of these helpers stay in claude-team for now: see plan 2026-11-16, Risk R6.
export { fillTemplate } from "../claude-team/teamFile.ts";
export { sendExitToChat, sendTextToChat } from "../claude-team/teamSend.ts";
export { startChatInNewWindow } from "../claude-team/teamStart.ts";
export { wrapShellWord } from "../claude-team/teamCommand.ts";

export function listHandoffFilesInDirectories(idleStateDirectories: string[], sessionId: string): string[] {
  const handoffFiles: string[] = [];
  for (const idleStateDirectory of idleStateDirectories)
    handoffFiles.push(...listHandoffFiles(idleStateDirectory, sessionId));
  return handoffFiles;
}

export function waitForNewHandoffFile(idleStateDirectories: string[], sessionId: string, handoffFilesBefore: string[], chatName: string, handoffWaitSeconds: number): string {
  const handoffStartedAt = Date.now();
  let handoffFilePath: string | undefined;
  while (handoffFilePath === undefined) {
    const waitedSeconds = (Date.now() - handoffStartedAt) / 1000;
    if (waitedSeconds > handoffWaitSeconds)
      throw new Error(`"${chatName}" did not write a handoff file`);
    const handoffFilesNow = listHandoffFilesInDirectories(idleStateDirectories, sessionId);
    handoffFilePath = findNewHandoffFile(handoffFilesBefore, handoffFilesNow);
    if (handoffFilePath === undefined)
      tmux_lib.sleep(2);
  }
  tmux_lib.sleep(5);
  return handoffFilePath;
}

export function sendHandoffCommandAndWaitForFile(pane: string, chatName: string, handoffCommand: string, idleStateDirectories: string[], sessionId: string, dialogWaitSeconds: number, handoffWaitSeconds: number): string {
  const handoffFilesBefore = listHandoffFilesInDirectories(idleStateDirectories, sessionId);
  sendTextToChat(pane, chatName, handoffCommand, dialogWaitSeconds);
  return waitForNewHandoffFile(idleStateDirectories, sessionId, handoffFilesBefore, chatName, handoffWaitSeconds);
}

export function buildHandoffDoneMarkerPath(dispatcherDirectory: string, sessionId: string): string {
  return `${dispatcherDirectory}/handoff-done/${sessionId}`;
}

export function writeHandoffDoneMarker(dispatcherDirectory: string, sessionId: string): void {
  mkdirSync(`${dispatcherDirectory}/handoff-done`, { recursive: true });
  writeFileSync(buildHandoffDoneMarkerPath(dispatcherDirectory, sessionId), "");
}

export function removeHandoffDoneMarker(dispatcherDirectory: string, sessionId: string): void {
  rmSync(buildHandoffDoneMarkerPath(dispatcherDirectory, sessionId));
}

export function writeSwapFailedMarker(dispatcherDirectory: string, sessionId: string): void {
  mkdirSync(`${dispatcherDirectory}/swap-failed`, { recursive: true });
  writeFileSync(`${dispatcherDirectory}/swap-failed/${sessionId}`, "");
}

export function waitForChatReady(pane: string, chatName: string): void {
  const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(pane);
  if (readinessCode !== 0)
    throw new Error(`${chatName} did not become ready in pane ${pane}`);
}

export function isChatIdle(screen: string): boolean {
  const isBusy = isChatBusy(screen);
  if (isBusy)
    return false;
  return isInputBoxEmpty(screen);
}

function closeExitDialogIfOpen(pane: string, screen: string): void {
  const isExitDialogOpen = hasBackgroundWorkDialog(screen);
  if (isExitDialogOpen)
    tmux_lib.run(["tmux", "send-keys", "-t", pane, "Escape"], { capture_output: true, text: true, check: true });
}

export function waitForIdleChat(pane: string, chatName: string, waitSeconds: number): void {
  const waitStartedAt = Date.now();
  let isIdle = false;
  while (!isIdle) {
    const waitedSeconds = (Date.now() - waitStartedAt) / 1000;
    if (waitedSeconds > waitSeconds)
      throw new Error(`"${chatName}" is not idle: it is busy or its input box holds text`);
    const screen = tmux_lib.tmux_capturePane(pane);
    closeExitDialogIfOpen(pane, screen);
    isIdle = isChatIdle(screen);
    if (!isIdle)
      tmux_lib.sleep(1);
  }
}

function isPaneOpen(pane: string): boolean {
  // tmux_paneExists answers true for a missing pane, so list the panes instead
  const paneListResult = tmux_lib.run(["tmux", "list-panes", "-a", "-F", "#{pane_id}"], { capture_output: true, text: true, check: true });
  const paneIds = paneListResult.stdout.split("\n");
  return paneIds.includes(pane);
}

export function closePaneIfOpen(pane: string): void {
  const isOpen = isPaneOpen(pane);
  if (isOpen)
    tmux_lib.tmux_killPane(pane);
}

export function selectWindowOfPane(pane: string): void {
  // tmux rejects a pane id as a window target, so use the window id of the pane
  const windowResult = tmux_lib.run(["tmux", "display-message", "-p", "-t", pane, "#{window_id}"], { capture_output: true, text: true, check: true });
  const windowId = windowResult.stdout.trim();
  tmux_lib.run(["tmux", "select-window", "-t", windowId], { capture_output: true, text: true, check: true });
}
