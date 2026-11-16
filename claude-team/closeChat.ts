import { rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { buildHandle, buildTeamFilePath, fillTemplate, findChatWithStatus, hasBackgroundWorkDialog, isChatBusy, isInputBoxEmpty, listNoticeChats, lockTeamFile, readTeamFile, removeChat, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import { sendExitToChat, sendTextToChat } from "./teamSend.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 1)
  throw new Error("usage: closeChat.ts <job>");
const [job] = scriptArguments;

const teamName = process.env.CLAUDE_TEAM_NAME;
const ownJob = process.env.CLAUDE_TEAM_JOB;
if (teamName === undefined)
  throw new Error("closeChat.ts must run inside a claude-team chat");
if (ownJob === undefined)
  throw new Error("closeChat.ts must run inside a claude-team chat");
if (ownJob !== job)
  throw new Error(`only the chat of job ${job} can close its old chat`);

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_DIALOG_WAIT_SECONDS"]);
const closeWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_CLOSE_WAIT_SECONDS"]);
const handoffWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_HANDOFF_WAIT_SECONDS"]);

lockTeamFile(teamFilePath);
const team = readTeamFile(teamFilePath);
unlockTeamFile(teamFilePath);
const oldChat = findChatWithStatus(team, job, "leaving");
if (oldChat === undefined)
  throw new Error(`job ${job} has no old chat`);
const oldSessionId = oldChat.sessionId;
if (oldSessionId === undefined)
  throw new Error(`"${oldChat.chatName}" has no session id in the team file`);

const newChat = findChatWithStatus(team, job, "active");
if (newChat === undefined)
  throw new Error(`job ${job} has no active chat`);
const replacedNotice = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_REPLACED_NOTICE"], { oldHandle: buildHandle(oldChat.chatName), newHandle: buildHandle(newChat.chatName) });
for (const noticeChat of listNoticeChats(team, newChat.chatName))
  sendTextToChat(noticeChat.pane, noticeChat.chatName, replacedNotice, dialogWaitSeconds);
if (oldChat.isTeamLeader === true) {
  if (team.parentTeam !== undefined) {
    const directorJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"];
    const parentTeam = readTeamFile(buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.parentTeam));
    const directorChat = findChatWithStatus(parentTeam, directorJob, "active");
    if (directorChat === undefined)
      throw new Error(`the Director of team ${team.parentTeam} has no active chat`);
    sendTextToChat(directorChat.pane, directorChat.chatName, replacedNotice, dialogWaitSeconds);
  }
}

const readyWaitStartedAt = Date.now();
let isOldChatReadyForExit = false;
while (!isOldChatReadyForExit) {
  if (Date.now() - readyWaitStartedAt > handoffWaitSeconds * 1000)
    throw new Error(`"${oldChat.chatName}" is not ready for /exit: it is busy or its input box holds text`);
  const oldChatScreen = tmux_lib.tmux_capturePane(oldChat.pane);
  const isExitDialogOpen = hasBackgroundWorkDialog(oldChatScreen);
  if (isExitDialogOpen)
    tmux_lib.run(["tmux", "send-keys", "-t", oldChat.pane, "Escape"], { capture_output: true, text: true, check: true });
  const isOldChatBusy = isChatBusy(oldChatScreen);
  if (!isOldChatBusy)
    isOldChatReadyForExit = isInputBoxEmpty(oldChatScreen);
  if (!isOldChatReadyForExit)
    tmux_lib.sleep(1);
}
sendExitToChat(oldChat.pane, oldChat.chatName, handoffWaitSeconds, closeWaitSeconds);
// sendTextToChat(oldChat.pane, oldChat.chatName, "/exit", dialogWaitSeconds);

// // tmux_paneExists answers true for a missing pane, so list the panes instead
// const closeStartedAt = Date.now();
// let isPaneOpen = true;
// while (isPaneOpen) {
//   if (Date.now() - closeStartedAt > closeWaitSeconds * 1000)
//     throw new Error(`"${oldChat.chatName}" did not close`);
//   const paneListResult = tmux_lib.run(["tmux", "list-panes", "-a", "-F", "#{pane_id}"], { capture_output: true, text: true, check: true });
//   isPaneOpen = paneListResult.stdout.split("\n").includes(oldChat.pane);
//   if (isPaneOpen)
//     tmux_lib.sleep(1);
// }

lockTeamFile(teamFilePath);
const teamToShrink = readTeamFile(teamFilePath);
removeChat(teamToShrink, oldChat.chatName);
writeTeamFile(teamFilePath, teamToShrink);
unlockTeamFile(teamFilePath);

rmSync(`${DISPATCHER_DIR}/handoff-done/${oldSessionId}`);

const activeChat = findChatWithStatus(teamToShrink, job, "active")!;
tmux_lib.tmux_selectLayout(activeChat.pane, values["CLAUDE_HOOKS_CLAUDE_TEAM_WINDOW_LAYOUT"]);

console.log(`closed "${oldChat.chatName}"`);
