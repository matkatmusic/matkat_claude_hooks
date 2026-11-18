#!/usr/bin/env bun
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { waitForChatReady } from "../shared/chatSwap.ts";
import { sendTextToChat } from "../shared/chatSend.ts";
import { buildHelpersCreatedNotice } from "./tmuxHelper.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length < 3)
    throw new Error("usage: sendHelpersCreatedNotice.ts <pane> <chatName> <helperName>...");
const [pane, chatName, ...helperNames] = scriptArguments;

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS"]);
const helpersCreatedNotice = `[claude-tmux] ${buildHelpersCreatedNotice(values["CLAUDE_HOOKS_CLAUDE_TMUX_HELPERS_CREATED_NOTICE"], helperNames)}`;

waitForChatReady(pane, chatName);
sendTextToChat(pane, chatName, helpersCreatedNotice, dialogWaitSeconds);
