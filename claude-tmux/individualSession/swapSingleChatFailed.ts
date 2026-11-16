import { existsSync, rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { buildHandoffDoneMarkerPath, closePaneIfOpen, fillTemplate, sendTextToChat, writeSwapFailedMarker } from "../shared/chatSwap.ts";
import { buildSingleChatName, buildSwapRecordPath, getSwapFailedAction, readSwapRecord } from "./singleChat.ts";
import type { SingleChatSwapRecord } from "./singleChat.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 6)
  throw new Error("usage: swapSingleChatFailed.ts <name> <chatNumber> <model> <workDirectory> <oldPane> <oldSessionId>");
const [name, chatNumberText, , , oldPane, oldSessionId] = scriptArguments;

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

rmSync(buildHandoffDoneMarkerPath(DISPATCHER_DIR, oldSessionId), { force: true });
writeSwapFailedMarker(DISPATCHER_DIR, oldSessionId);
const failedNotice = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_SWAP_FAILED_NOTICE"], { logPath: `${DISPATCHER_DIR}/claude-tmux-swap.log` });
sendTextToChat(oldPane, oldChatName, failedNotice, Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS"]));
console.log(`swap of "${oldChatName}" failed and was undone`);
