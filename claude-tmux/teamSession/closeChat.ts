// import { rmSync } from "node:fs";
import { readdirSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
// import { buildHandle, buildTeamFilePath, fillTemplate, findChatWithStatus, hasBackgroundWorkDialog, isChatBusy, isInputBoxEmpty, listNoticeChats, lockTeamFile, readTeamFile, removeChat, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
// import { buildHandle, buildTeamFilePath, fillTemplate, findChatWithStatus, listReplacedNoticeChats, lockTeamFile, readTeamFile, removeChat, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import { buildHandle, buildTeamFilePath, findChatWithStatus, listReplacedNoticeChats, lockTeamFile, readTeamFile, removeChat, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import type { Team } from "./teamFile.ts";
// import { removeHandoffDoneMarker, waitForIdleChat } from "../chat-swap/chatSwap.ts";
import { fillTemplate, removeHandoffDoneMarker, waitForIdleChat } from "../shared/chatSwap.ts";
// import { sendExitToChat, sendTextToChat } from "./teamSend.ts";
import { sendExitToChat, sendTextToChat } from "../shared/chatSend.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 1)
  throw new Error("usage: closeChat.ts <job>");
const [job] = scriptArguments;

const teamName = process.env.CLAUDE_TMUX_TEAM_NAME;
const ownJob = process.env.CLAUDE_TMUX_TEAM_JOB;
if (teamName === undefined)
  throw new Error("closeChat.ts must run inside a claude-tmux team chat");
if (ownJob === undefined)
  throw new Error("closeChat.ts must run inside a claude-tmux team chat");
if (ownJob !== job)
  throw new Error(`only the chat of job ${job} can close its old chat`);

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIALOG_WAIT_SECONDS"]);
const closeWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_CLOSE_WAIT_SECONDS"]);
const handoffWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_WAIT_SECONDS"]);

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
const replacedNotice = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_REPLACED_NOTICE"], { oldHandle: buildHandle(oldChat.chatName), newHandle: buildHandle(newChat.chatName) });
// for (const noticeChat of listNoticeChats(team, newChat.chatName))
//   sendTextToChat(noticeChat.pane, noticeChat.chatName, replacedNotice, dialogWaitSeconds);
// if (oldChat.isTeamLeader === true) {
//   if (team.parentTeam !== undefined) {
//     const directorJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"];
//     const parentTeam = readTeamFile(buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.parentTeam));
//     const directorChat = findChatWithStatus(parentTeam, directorJob, "active");
//     if (directorChat === undefined)
//       throw new Error(`the Director of team ${team.parentTeam} has no active chat`);
//     sendTextToChat(directorChat.pane, directorChat.chatName, replacedNotice, dialogWaitSeconds);
//   }
// }
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"];
const stateDirectory = values["CLAUDE_HOOKS_SESSION_STATE_DIR"];
let parentTeam: Team | undefined = undefined;
if (team.parentTeam !== undefined)
  parentTeam = readTeamFile(buildTeamFilePath(stateDirectory, team.parentTeam));
const childTeams: Team[] = [];
for (const fileName of readdirSync(`${stateDirectory}/claude-tmux-team`)) {
  const isTeamFile = fileName.endsWith(".json");
  if (isTeamFile) {
    const otherTeam = readTeamFile(`${stateDirectory}/claude-tmux-team/${fileName}`);
    if (otherTeam.parentTeam === team.teamName)
      childTeams.push(otherTeam);
  }
}
const sessionListResult = tmux_lib.run(["tmux", "list-sessions", "-F", "#{session_name}"], { capture_output: true, text: true, check: true });
const liveSessionNames = sessionListResult.stdout.split("\n");
for (const noticeChat of listReplacedNoticeChats(team, oldChat, newChat.chatName, parentTeam, childTeams, liveSessionNames, directorJob, values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_READ_FIND_JOB"]))
  sendTextToChat(noticeChat.pane, noticeChat.chatName, replacedNotice, dialogWaitSeconds);

// const readyWaitStartedAt = Date.now();
// let isOldChatReadyForExit = false;
// while (!isOldChatReadyForExit) {
//   if (Date.now() - readyWaitStartedAt > handoffWaitSeconds * 1000)
//     throw new Error(`"${oldChat.chatName}" is not ready for /exit: it is busy or its input box holds text`);
//   const oldChatScreen = tmux_lib.tmux_capturePane(oldChat.pane);
//   const isExitDialogOpen = hasBackgroundWorkDialog(oldChatScreen);
//   if (isExitDialogOpen)
//     tmux_lib.run(["tmux", "send-keys", "-t", oldChat.pane, "Escape"], { capture_output: true, text: true, check: true });
//   const isOldChatBusy = isChatBusy(oldChatScreen);
//   if (!isOldChatBusy)
//     isOldChatReadyForExit = isInputBoxEmpty(oldChatScreen);
//   if (!isOldChatReadyForExit)
//     tmux_lib.sleep(1);
// }
waitForIdleChat(oldChat.pane, oldChat.chatName, handoffWaitSeconds);
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

// rmSync(`${DISPATCHER_DIR}/handoff-done/${oldSessionId}`);
removeHandoffDoneMarker(DISPATCHER_DIR, oldSessionId);

const activeChat = findChatWithStatus(teamToShrink, job, "active")!;
tmux_lib.tmux_selectLayout(activeChat.pane, values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_WINDOW_LAYOUT"]);

console.log(`closed "${oldChat.chatName}"`);
