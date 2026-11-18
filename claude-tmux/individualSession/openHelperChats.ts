#!/usr/bin/env bun
import { buildSingleChatName } from "./singleChat.ts";
import { parseNewHelperArguments, startHelperChat } from "./tmuxHelper.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 2)
    throw new Error("usage: openHelperChats.ts <sessionTitle> <argumentText>");
const [sessionTitle, argumentText] = scriptArguments;

const tmuxPane = process.env.TMUX_PANE;
if (!tmuxPane)
    throw new Error("openHelperChats.ts must run inside tmux: TMUX_PANE is missing");

const supervisorName = process.env.CLAUDE_TMUX_NAME;
if (!supervisorName)
    throw new Error("openHelperChats.ts must run inside a claude-tmux chat: CLAUDE_TMUX_NAME is missing");
const supervisorChatNumber = process.env.CLAUDE_TMUX_CHAT_NUMBER;
if (!supervisorChatNumber)
    throw new Error("openHelperChats.ts must run inside a claude-tmux chat: CLAUDE_TMUX_CHAT_NUMBER is missing");
const supervisorChatName = buildSingleChatName(supervisorName, Number(supervisorChatNumber));

const { helperCount, model } = parseNewHelperArguments(argumentText);
const helperChatNames: string[] = [];
for (let helperIndex = 0; helperIndex < helperCount; helperIndex++)
    // helperChatNames.push(startHelperChat(tmuxPane, { cwd: process.cwd(), session_title: sessionTitle }, model));
    helperChatNames.push(startHelperChat(tmuxPane, { cwd: process.cwd(), session_title: sessionTitle }, model, supervisorChatName));
console.log(JSON.stringify(helperChatNames));
