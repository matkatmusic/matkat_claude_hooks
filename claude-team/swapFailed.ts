// import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
// import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { closePaneIfOpen, writeSwapFailedMarker } from "../chat-swap/chatSwap.ts";
import { buildTeamFilePath, fillTemplate, lockTeamFile, readTeamFile, undoReplacementChat, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import { sendTextToChat } from "./teamSend.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 4)
  throw new Error("usage: swapFailed.ts <teamName> <job> <oldChatName> <oldSessionId>");
const [teamName, job, oldChatName, oldSessionId] = scriptArguments;

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_DIALOG_WAIT_SECONDS"]);

lockTeamFile(teamFilePath);
const team = readTeamFile(teamFilePath);
const removedChat = undoReplacementChat(team, job, oldChatName);
writeTeamFile(teamFilePath, team);
unlockTeamFile(teamFilePath);

// rmSync(`${DISPATCHER_DIR}/handoff-done/${oldSessionId}`, { force: true });

if (removedChat === undefined) {
  console.log(`swap of "${oldChatName}" failed after the new chat became active. See the log.`);
  process.exit(0);
}

rmSync(`${DISPATCHER_DIR}/handoff-done/${oldSessionId}`, { force: true });
// mkdirSync(`${DISPATCHER_DIR}/swap-failed`, { recursive: true });
// writeFileSync(`${DISPATCHER_DIR}/swap-failed/${oldSessionId}`, "");
writeSwapFailedMarker(DISPATCHER_DIR, oldSessionId);

// if (removedChat.pane !== "") {
//   // tmux_paneExists answers true for a missing pane, so list the panes instead
//   const paneListResult = tmux_lib.run(["tmux", "list-panes", "-a", "-F", "#{pane_id}"], { capture_output: true, text: true, check: true });
//   const isPaneOpen = paneListResult.stdout.split("\n").includes(removedChat.pane);
//   if (isPaneOpen)
//     tmux_lib.tmux_killPane(removedChat.pane);
// }
if (removedChat.pane !== "")
  closePaneIfOpen(removedChat.pane);

let oldChatPane = "";
for (const chat of team.chats) {
  if (chat.chatName === oldChatName)
    oldChatPane = chat.pane;
}
const failedNotice = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_SWAP_FAILED_NOTICE"], { job, logPath: `${import.meta.dirname}/../dispatcher/claude-team-swap.log` });
sendTextToChat(oldChatPane, oldChatName, failedNotice, dialogWaitSeconds);

console.log(`swap of "${oldChatName}" failed and was undone`);
