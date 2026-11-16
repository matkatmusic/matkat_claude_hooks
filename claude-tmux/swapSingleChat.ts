import { rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { fillTemplate, removeHandoffDoneMarker, selectWindowOfPane, sendExitToChat, sendHandoffCommandAndWaitForFile, startChatInNewWindow, waitForChatReady, waitForIdleChat, writeHandoffDoneMarker } from "../chat-swap/chatSwap.ts";
import { buildSingleChatEnvironmentFlags, buildSingleChatName, buildSingleChatPaneCommand, buildSwapRecordPath, writeSwapRecord } from "./singleChat.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 6)
  throw new Error("usage: swapSingleChat.ts <name> <chatNumber> <model> <workDirectory> <oldPane> <oldSessionId>");
const [name, chatNumberText, model, workDirectory, oldPane, oldSessionId] = scriptArguments;

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS"]);
const handoffWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_WAIT_SECONDS"]);
const closeWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_CLOSE_WAIT_SECONDS"]);
const oldChatNumber = Number(chatNumberText);
const oldChatName = buildSingleChatName(name, oldChatNumber);
const newChatNumber = oldChatNumber + 1;
const newChatName = buildSingleChatName(name, newChatNumber);
const swapRecordPath = buildSwapRecordPath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], oldSessionId);
writeSwapRecord(swapRecordPath, { newChatName, newPane: "", isNewChatReady: false });

waitForIdleChat(oldPane, oldChatName, handoffWaitSeconds);
const projectRootResult = tmux_lib.run(["git", "-C", workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: true });
const idleStateDirectories = [`${projectRootResult.stdout.trim()}/.idleState`];
const handoffCommand = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_COMMAND"], { sessionId: oldSessionId });
const handoffFilePath = sendHandoffCommandAndWaitForFile(oldPane, oldChatName, handoffCommand, idleStateDirectories, oldSessionId, dialogWaitSeconds, handoffWaitSeconds);
writeHandoffDoneMarker(DISPATCHER_DIR, oldSessionId);

const takeoverPrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TAKEOVER_PROMPT"], { oldChatName, handoffPath: handoffFilePath });
const environmentFlags = buildSingleChatEnvironmentFlags(name, newChatNumber, model, workDirectory);
const paneCommand = buildSingleChatPaneCommand(newChatName, model, takeoverPrompt);
const newPane = startChatInNewWindow(oldPane, workDirectory, environmentFlags, paneCommand);
writeSwapRecord(swapRecordPath, { newChatName, newPane, isNewChatReady: false });
waitForChatReady(newPane, newChatName);
writeSwapRecord(swapRecordPath, { newChatName, newPane, isNewChatReady: true });
selectWindowOfPane(newPane);

waitForIdleChat(oldPane, oldChatName, handoffWaitSeconds);
sendExitToChat(oldPane, oldChatName, handoffWaitSeconds, closeWaitSeconds);
removeHandoffDoneMarker(DISPATCHER_DIR, oldSessionId);
rmSync(swapRecordPath);
console.log(`swapped "${oldChatName}" for "${newChatName}"`);
