import { rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
// import { fillTemplate, removeHandoffDoneMarker, selectWindowOfPane, sendExitToChat, sendHandoffCommandAndWaitForFile, startChatInNewWindow, waitForChatReady, waitForIdleChat, writeHandoffDoneMarker } from "../shared/chatSwap.ts";
// import { fillTemplate, isWindowOfPaneActive, removeHandoffDoneMarker, selectWindowOfPane, sendExitToChat, sendHandoffCommandAndWaitForFile, startChatInNewWindow, waitForChatReady, waitForIdleChat, writeHandoffDoneMarker } from "../shared/chatSwap.ts";
import { fillTemplate, isWindowOfPaneActive, removeHandoffDoneMarker, selectWindowOfPane, sendExitToChat, sendHandoffCommandAndWaitForFile, startChatInNewWindow, waitForChatReady, waitForIdleChat, waitForIdleChatAndClearInputBox, writeHandoffDoneMarker } from "../shared/chatSwap.ts";
// import { buildSingleChatEnvironmentFlags, buildSingleChatName, buildSingleChatPaneCommand, buildSwapRecordPath, writeSwapRecord } from "./singleChat.ts";
import { buildSingleChatEnvironmentFlags, buildSingleChatName, buildSingleChatPaneCommand, buildSwapRecordPath, openTrackerOfPane, updateTrackerWithNextChatNumber, writeSwapRecord } from "./singleChat.ts";

const scriptArguments = process.argv.slice(2);
// if (scriptArguments.length !== 6)
if (scriptArguments.length !== 7)
  // throw new Error("usage: swapSingleChat.ts <name> <chatNumber> <model> <workDirectory> <oldPane> <oldSessionId>");
  throw new Error("usage: swapSingleChat.ts <name> <chatNumber> <model> <workDirectory> <oldPane> <oldSessionId> <swapPercent>");
// const [name, chatNumberText, model, workDirectory, oldPane, oldSessionId] = scriptArguments;
const [name, chatNumberText, model, workDirectory, oldPane, oldSessionId, swapPercent] = scriptArguments;

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS"]);
const handoffWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_WAIT_SECONDS"]);
const closeWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_CLOSE_WAIT_SECONDS"]);
const oldChatNumber = Number(chatNumberText);
const projectRootResult = tmux_lib.run(["git", "-C", workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: true });
const trackerPath = openTrackerOfPane(oldPane, projectRootResult.stdout.trim());
const oldChatName = buildSingleChatName(name, oldChatNumber);
// const newChatNumber = oldChatNumber + 1;
const newChatNumber = updateTrackerWithNextChatNumber(trackerPath, name, oldChatNumber);
const newChatName = buildSingleChatName(name, newChatNumber);
const swapRecordPath = buildSwapRecordPath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], oldSessionId);
writeSwapRecord(swapRecordPath, { newChatName, newPane: "", isNewChatReady: false });

waitForIdleChat(oldPane, oldChatName, handoffWaitSeconds);
// const projectRootResult = tmux_lib.run(["git", "-C", workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: true });
const idleStateDirectories = [`${projectRootResult.stdout.trim()}/.idleState`];
const handoffCommand = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_COMMAND"], { sessionId: oldSessionId });
const handoffFilePath = sendHandoffCommandAndWaitForFile(oldPane, oldChatName, handoffCommand, idleStateDirectories, oldSessionId, dialogWaitSeconds, handoffWaitSeconds);
writeHandoffDoneMarker(DISPATCHER_DIR, oldSessionId);

const takeoverPrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TAKEOVER_PROMPT"], { oldChatName, handoffPath: handoffFilePath });
// const environmentFlags = buildSingleChatEnvironmentFlags(name, newChatNumber, model, workDirectory);
const environmentFlags = buildSingleChatEnvironmentFlags(name, newChatNumber, model, workDirectory, swapPercent);
const paneCommand = buildSingleChatPaneCommand(newChatName, model, takeoverPrompt);
const isOldWindowActive = isWindowOfPaneActive(oldPane);
const newPane = startChatInNewWindow(oldPane, workDirectory, environmentFlags, paneCommand);
writeSwapRecord(swapRecordPath, { newChatName, newPane, isNewChatReady: false });
waitForChatReady(newPane, newChatName);
writeSwapRecord(swapRecordPath, { newChatName, newPane, isNewChatReady: true });
// selectWindowOfPane(newPane);
if (isOldWindowActive)
  selectWindowOfPane(newPane);

// waitForIdleChat(oldPane, oldChatName, handoffWaitSeconds);
// text typed into the old chat during the swap stays in its input box; clear it so /exit can go in
// waitForIdleChatAndClearInputBox(oldPane, oldChatName, handoffWaitSeconds);
// the new chat is ready, so wait as long as the old chat needs; a closed pane still throws at once
waitForIdleChatAndClearInputBox(oldPane, oldChatName, Number.POSITIVE_INFINITY);
sendExitToChat(oldPane, oldChatName, handoffWaitSeconds, closeWaitSeconds);
removeHandoffDoneMarker(DISPATCHER_DIR, oldSessionId);
rmSync(swapRecordPath);
console.log(`swapped "${oldChatName}" for "${newChatName}"`);
