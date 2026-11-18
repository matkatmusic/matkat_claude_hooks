import { existsSync, rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
// import { buildHandoffDoneMarkerPath, closePaneIfOpen, fillTemplate, sendTextToChat, writeSwapFailedMarker } from "../shared/chatSwap.ts";
// import { buildHandoffDoneMarkerPath, closePaneIfOpen, fillTemplate, writeSwapFailedMarker } from "../shared/chatSwap.ts";
import { buildHandoffDoneMarkerPath, closePaneIfOpen, fillTemplate, removeHandoffPathMarker, writeSwapFailedMarker } from "../shared/chatSwap.ts";
// import { buildSingleChatName, buildSwapRecordPath, getSwapFailedAction, readSwapRecord } from "./singleChat.ts";
import { buildSingleChatName, buildSwapRecordPath, getSwapFailedAction, openTrackerOfPane, readSwapRecord, resetTrackerAfterFailedSwap } from "./singleChat.ts";
import type { SingleChatSwapRecord } from "./singleChat.ts";

const scriptArguments = process.argv.slice(2);
// if (scriptArguments.length !== 6)
if (scriptArguments.length !== 7)
  // throw new Error("usage: swapSingleChatFailed.ts <name> <chatNumber> <model> <workDirectory> <oldPane> <oldSessionId>");
  throw new Error("usage: swapSingleChatFailed.ts <name> <chatNumber> <model> <workDirectory> <oldPane> <oldSessionId> <swapPercent>");
// const [name, chatNumberText, , , oldPane, oldSessionId] = scriptArguments;
const [name, chatNumberText, , workDirectory, oldPane, oldSessionId] = scriptArguments;

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
const oldChatName = buildSingleChatName(name, Number(chatNumberText));
const swapRecordPath = buildSwapRecordPath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], oldSessionId);
let swapRecord: SingleChatSwapRecord | undefined;
const hasSwapRecord = existsSync(swapRecordPath);
if (hasSwapRecord)
  swapRecord = readSwapRecord(swapRecordPath);
rmSync(swapRecordPath, { force: true });

const swapFailedAction = getSwapFailedAction(swapRecord);
if (swapFailedAction === "keepNewChat") {
  console.log(`swap of "${oldChatName}" failed after "${swapRecord!.newChatName}" became ready. "${oldChatName}" stays open: close its window by hand.`);
  process.exit(0);
}
if (swapFailedAction === "closeNewChatAndUndoSwap")
  closePaneIfOpen(swapRecord!.newPane);
// the swap record is written after the new number is taken, so a record means a number to give back
if (swapRecord !== undefined) {
  const projectRootResult = tmux_lib.run(["git", "-C", workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: true });
  const trackerPath = openTrackerOfPane(oldPane, projectRootResult.stdout.trim());
  resetTrackerAfterFailedSwap(trackerPath, name, swapRecord.newChatName);
}

rmSync(buildHandoffDoneMarkerPath(DISPATCHER_DIR, oldSessionId), { force: true });
removeHandoffPathMarker(DISPATCHER_DIR, oldSessionId);
writeSwapFailedMarker(DISPATCHER_DIR, oldSessionId);
const failedNotice = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_SWAP_FAILED_NOTICE"], { logPath: `${DISPATCHER_DIR}/claude-tmux-swap.log` });
// sendTextToChat(oldPane, oldChatName, failedNotice, Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS"]));
const sessionIdResult = tmux_lib.run(["tmux", "display-message", "-p", "-t", oldPane, "#{session_id}"], { capture_output: true, text: true, check: true });
const clientListResult = tmux_lib.run(["tmux", "list-clients", "-t", sessionIdResult.stdout.trim(), "-F", "#{client_name}"], { capture_output: true, text: true, check: true });
for (const clientName of clientListResult.stdout.split("\n")) {
  if (clientName !== "")
    tmux_lib.run(["tmux", "display-message", "-d", "10000", "-c", clientName, failedNotice], { capture_output: true, text: true, check: true });
}
console.log(`swap of "${oldChatName}" failed and was undone`);
