// import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
// import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
// import { findNewHandoffFile, hasBackgroundWorkDialog, isChatBusy, isInputBoxEmpty, listHandoffFiles } from "../claude-team/teamFile.ts";
// import { hasBackgroundWorkDialog, isChatBusy, isInputBoxEmpty } from "./chatScreen.ts";
import { hasBackgroundWorkDialog, isChatBusy, isInputBoxEmpty, removeDimText } from "./chatScreen.ts";
// import { sendTextToChat } from "../claude-team/teamSend.ts";
import { sendTextToChat } from "./chatSend.ts";

// The bodies of these helpers stay in claude-team for now: see plan 2026-11-16, Risk R6.
// export { fillTemplate } from "../claude-team/teamFile.ts";
// export { sendExitToChat, sendTextToChat } from "../claude-team/teamSend.ts";
export { sendExitToChat, sendTextToChat } from "./chatSend.ts";
// export { startChatInNewWindow } from "../claude-team/teamStart.ts";
// export { wrapShellWord } from "../claude-team/teamCommand.ts";

export function listHandoffFiles(idleStateDirectory: string, sessionId: string): string[] {
  if (!existsSync(idleStateDirectory))
    return [];
  const fileNameEnd = `-${sessionId.slice(0, 8)}.json`;
  const handoffFiles: string[] = [];
  for (const fileName of readdirSync(idleStateDirectory).sort()) {
    if (fileName.endsWith(fileNameEnd))
      handoffFiles.push(`${idleStateDirectory}/${fileName}`);
  }
  return handoffFiles;
}

export function findNewHandoffFile(filesBefore: string[], filesNow: string[]): string | undefined {
  for (const filePath of filesNow) {
    if (!filesBefore.includes(filePath))
      return filePath;
  }
  return undefined;
}

export function fillTemplate(template: string, fields: Record<string, string>): string {
  let filled = template;
  const keysInTemplate = template.matchAll(/\{(\w+)\}/g);
  for (const keyMatch of keysInTemplate) {
    const key = keyMatch[1];
    if (!(key in fields))
      throw new Error(`template needs the field ${key}`);
    filled = filled.replaceAll(`{${key}}`, fields[key]);
  }
  return filled;
}

export function startChatInNewWindow(anchorPane: string, workDirectory: string, environmentFlags: string[], paneCommand: string): string {
  // tmux new-window -a rejects a pane id as target: use the window id of the anchor pane
  const anchorWindowResult = tmux_lib.run(["tmux", "display-message", "-p", "-t", anchorPane, "#{window_id}"], { capture_output: true, text: true, check: true });
  const anchorWindow = anchorWindowResult.stdout.trim();
  const newWindowCommand = ["tmux", "new-window", "-d", "-a", "-t", anchorWindow, "-c", workDirectory, "-P", "-F", "#{pane_id}", ...environmentFlags, paneCommand];
  const newWindowResult = tmux_lib.run(newWindowCommand, { capture_output: true, text: true, check: true });
  return newWindowResult.stdout.trim();
}

export function wrapShellWord(text: string): string {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

export function getGitRootOfWorkDirectory(workDirectory: string): string {
  const gitRootResult = tmux_lib.run(["git", "-C", workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: false });
  if (gitRootResult.returncode !== 0)
    throw new Error("claude-tmux must start inside a git repository: the handoff file goes to the .idleState folder of the project root");
  return gitRootResult.stdout.trim();
}

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

export function buildHandoffFilePath(idleStateDirectory: string, sessionId: string, now: Date): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${idleStateDirectory}/${year}-${month}-${day}-${hour}${minute}-${sessionId.slice(0, 8)}.json`;
}

export function buildHandoffPathMarkerPath(dispatcherDirectory: string, sessionId: string): string {
  return `${dispatcherDirectory}/handoff-path/${sessionId}`;
}

export function writeHandoffPathMarker(dispatcherDirectory: string, sessionId: string, handoffFilePath: string): void {
  mkdirSync(`${dispatcherDirectory}/handoff-path`, { recursive: true });
  writeFileSync(buildHandoffPathMarkerPath(dispatcherDirectory, sessionId), handoffFilePath);
}

export function removeHandoffPathMarker(dispatcherDirectory: string, sessionId: string): void {
  rmSync(buildHandoffPathMarkerPath(dispatcherDirectory, sessionId), { force: true });
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

function assertPaneIsOpen(pane: string, chatName: string): void {
  const isOpen = isPaneOpen(pane);
  if (!isOpen)
    throw new Error(`"${chatName}" is gone: the tmux pane ${pane} does not exist`);
}

function isPaneInputBoxEmpty(pane: string): boolean {
  const captureResult = tmux_lib.run(["tmux", "capture-pane", "-e", "-p", "-t", pane], { capture_output: true, text: true, check: true });
  const screenWithoutDimText = removeDimText(captureResult.stdout);
  return isInputBoxEmpty(screenWithoutDimText);
}

export function waitForIdleChat(pane: string, chatName: string, waitSeconds: number): void {
  const waitStartedAt = Date.now();
  let isIdle = false;
  while (!isIdle) {
    const waitedSeconds = (Date.now() - waitStartedAt) / 1000;
    if (waitedSeconds > waitSeconds)
      throw new Error(`"${chatName}" is not idle: it is busy or its input box holds text`);
    assertPaneIsOpen(pane, chatName);
    const screen = tmux_lib.tmux_capturePane(pane);
    closeExitDialogIfOpen(pane, screen);
    // isIdle = isChatIdle(screen);
    const isBusy = isChatBusy(screen);
    if (!isBusy)
      isIdle = isPaneInputBoxEmpty(pane);
    if (!isIdle)
      tmux_lib.sleep(1);
  }
}

export function waitForIdleChatAndClearInputBox(pane: string, chatName: string, waitSeconds: number): void {
  const waitStartedAt = Date.now();
  let isIdle = false;
  while (!isIdle) {
    const waitedSeconds = (Date.now() - waitStartedAt) / 1000;
    if (waitedSeconds > waitSeconds)
      throw new Error(`"${chatName}" is not idle: it is busy or its input box holds text`);
    assertPaneIsOpen(pane, chatName);
    const screen = tmux_lib.tmux_capturePane(pane);
    closeExitDialogIfOpen(pane, screen);
    // const isBoxEmpty = isInputBoxEmpty(screen);
    const isBoxEmpty = isPaneInputBoxEmpty(pane);
    // Claude Code docs: Ctrl-U deletes to the line start, and repeated it clears across lines; Ctrl-E first takes the text after the cursor
    if (!isBoxEmpty)
      tmux_lib.run(["tmux", "send-keys", "-t", pane, "C-e", "C-u"], { capture_output: true, text: true, check: true });
    // isIdle = isChatIdle(screen);
    const isBusy = isChatBusy(screen);
    if (!isBusy)
      isIdle = isBoxEmpty;
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

export function isWindowOfPaneActive(pane: string): boolean {
  const windowActiveResult = tmux_lib.run(["tmux", "display-message", "-p", "-t", pane, "#{window_active}"], { capture_output: true, text: true, check: true });
  return windowActiveResult.stdout.trim() === "1";
}
