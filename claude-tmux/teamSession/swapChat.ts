// import { mkdirSync, writeFileSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
import { buildDirectorPaneCommand } from "./teamCommand.ts";
// import { addReplacementChat, buildHandle, buildHandleList, buildJobValueKey, buildPaneEnvironmentFlags, buildTeamFilePath, fillTemplate, findChatWithStatus, findDirectorChatOfJobTeam, findNewHandoffFile, findTeamLeader, getReplacementChatModel, listHandoffFiles, listIdleStateDirectories, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
// import { addReplacementChat, buildHandle, buildHandleList, buildJobValueKey, buildPaneEnvironmentFlags, buildTeamFilePath, fillTemplate, findChatWithStatus, findDirectorChatOfJobTeam, findTeamLeader, getReplacementChatModel, listIdleStateDirectories, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import { addReplacementChat, buildHandle, buildHandleList, buildJobValueKey, buildPaneEnvironmentFlags, buildTeamFilePath, findChatWithStatus, findDirectorChatOfJobTeam, findTeamLeader, getReplacementChatModel, listIdleStateDirectories, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import type { Team, TeamChat } from "./teamFile.ts";
// import { sendTextToChat } from "./teamSend.ts";
// import { startChatInNewWindow } from "./teamStart.ts";
// import { sendHandoffCommandAndWaitForFile, waitForChatReady, writeHandoffDoneMarker } from "../chat-swap/chatSwap.ts";
import { fillTemplate, sendHandoffCommandAndWaitForFile, sendTextToChat, startChatInNewWindow, waitForChatReady, writeHandoffDoneMarker } from "../shared/chatSwap.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 4)
  throw new Error("usage: swapChat.ts <teamName> <job> <oldChatName> <oldSessionId>");
const [teamName, job, oldChatName, oldSessionId] = scriptArguments;

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"];
// const allJobs = `${directorJob},${values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"]}`;
const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIALOG_WAIT_SECONDS"]);

lockTeamFile(teamFilePath);
const team = readTeamFile(teamFilePath);
const { oldChat, newChat } = addReplacementChat(team, job);
if (oldChat.chatName !== oldChatName) {
  unlockTeamFile(teamFilePath);
  throw new Error(`the chat "${oldChatName}" is already replaced by "${oldChat.chatName}"`);
}
newChat.model = getReplacementChatModel(oldChat, values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB"], values);
writeTeamFile(teamFilePath, team);
unlockTeamFile(teamFilePath);

const projectRootResult = tmux_lib.run(["git", "-C", team.workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: true });
// const idleStateDirectory = `${projectRootResult.stdout.trim()}/.idleState`;
// const handoffFilesBefore = listHandoffFiles(idleStateDirectory, oldSessionId);
const idleStateDirectories = listIdleStateDirectories(team, projectRootResult.stdout.trim());
// const handoffFilesBefore: string[] = [];
// for (const idleStateDirectory of idleStateDirectories)
//   handoffFilesBefore.push(...listHandoffFiles(idleStateDirectory, oldSessionId));
const handoffCommand = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_COMMAND"], { sessionId: oldSessionId });
// sendTextToChat(oldChat.pane, oldChatName, handoffCommand, dialogWaitSeconds);

const handoffWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_WAIT_SECONDS"]);
const handoffFilePath = sendHandoffCommandAndWaitForFile(oldChat.pane, oldChatName, handoffCommand, idleStateDirectories, oldSessionId, dialogWaitSeconds, handoffWaitSeconds);
// const handoffStartedAt = Date.now();
// let handoffFilePath: string | undefined;
// while (handoffFilePath === undefined) {
//   if (Date.now() - handoffStartedAt > handoffWaitSeconds * 1000)
//     throw new Error(`"${oldChatName}" did not write a handoff file`);
//   // handoffFilePath = findNewHandoffFile(handoffFilesBefore, listHandoffFiles(idleStateDirectory, oldSessionId));
//   const handoffFilesNow: string[] = [];
//   for (const idleStateDirectory of idleStateDirectories)
//     handoffFilesNow.push(...listHandoffFiles(idleStateDirectory, oldSessionId));
//   handoffFilePath = findNewHandoffFile(handoffFilesBefore, handoffFilesNow);
//   if (handoffFilePath === undefined)
//     tmux_lib.sleep(2);
// }
// tmux_lib.sleep(5);

// mkdirSync(`${DISPATCHER_DIR}/handoff-done`, { recursive: true });
// writeFileSync(`${DISPATCHER_DIR}/handoff-done/${oldSessionId}`, "");
writeHandoffDoneMarker(DISPATCHER_DIR, oldSessionId);
lockTeamFile(teamFilePath);
const teamWithSessionId = readTeamFile(teamFilePath);
findChatWithStatus(teamWithSessionId, job, "leaving")!.sessionId = oldSessionId;
writeTeamFile(teamFilePath, teamWithSessionId);
unlockTeamFile(teamFilePath);

// The old send instructions and Director text. The handle list and the new role texts replace them.
// const sendInstructions = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_SEND_INSTRUCTIONS"], {
//   chatName: newChat.chatName,
//   teamName,
//   job,
//   jobs: allJobs,
//   sendScript: `${import.meta.dirname}/sendToJob.ts`,
// });
// if (job === directorJob) {
//   const directorTextFields: Record<string, string> = {
//     teamName,
//     sendScript: `${import.meta.dirname}/sendToJob.ts`,
//     startScript: `${import.meta.dirname}/startClaudeTeam.ts`,
//     helpersScript: `${import.meta.dirname}/startTeamHelpers.ts`,
//     maxTeams: values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_TEAMS"],
//     maxRounds: values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_REVIEW_ROUNDS"],
//     ...buildJobChatFields(team, values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"].split(",")),
//   };
//   ...parent started prompt branch...
//   rolePrompt = fillTemplate(`${values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_PROMPT"]}\n${startedByPrompt}`, directorTextFields);
// }
const teamLeaderJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB"];
// let directorChatOfJobTeam: TeamChat | undefined;
const teamLeader = findTeamLeader(team);
// if (teamLeader !== undefined) {
//   if (teamLeader.job === teamLeaderJob) {
//     let teamWithDirector = team;
//     if (team.parentTeam !== undefined)
//       teamWithDirector = readTeamFile(buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.parentTeam));
//     directorChatOfJobTeam = findChatWithStatus(teamWithDirector, directorJob, "active");
//     if (directorChatOfJobTeam === undefined)
//       throw new Error(`the Director of team ${teamName} has no active chat`);
//   }
// }
let parentTeam: Team | undefined;
if (team.parentTeam !== undefined)
  parentTeam = readTeamFile(buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.parentTeam));
const directorChatOfJobTeam = findDirectorChatOfJobTeam(team, parentTeam, teamLeaderJob, directorJob, job);

let rolePrompt: string;
if (oldChat.isTeamLeader === true) {
  let userQuestionRule = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_QUESTION_RULE_MODE_1"];
  if (directorChatOfJobTeam !== undefined)
    userQuestionRule = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_QUESTION_RULE_MODE_2"], { directorHandle: buildHandle(directorChatOfJobTeam.chatName) });
  rolePrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_PROMPT"], { maxRounds: values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_MAX_REVIEW_ROUNDS"], userQuestionRule });
}
else if (job === directorJob) {
  const readFindJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_READ_FIND_JOB"];
  const readFindChat = findChatWithStatus(team, readFindJob, "active");
  if (readFindChat === undefined)
    throw new Error(`job ${readFindJob} has no active chat`);
  rolePrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_START_PROMPT"], {
    leadScript: `${import.meta.dirname}/leadJobDirectly.ts`,
    jobTeamScript: `${import.meta.dirname}/startJobTeam.ts`,
    closeTeamScript: `${import.meta.dirname}/closeJobTeam.ts`,
    maxTeams: values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_MAX_TEAMS"],
    readFindHandle: buildHandle(readFindChat.chatName),
  });
}
else {
  rolePrompt = values[buildJobValueKey(job, "PROMPT")];
}
const startingTextParts = [rolePrompt];
if (teamLeader !== undefined)
  startingTextParts.push(`${values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDLE_LIST_HEADER"]}\n${buildHandleList(team, values, directorChatOfJobTeam)}`);
if (team.worktreeText !== undefined) {
  if (job !== directorJob)
    startingTextParts.push(team.worktreeText);
}
const takeoverPrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TAKEOVER_PROMPT"], {
  oldHandle: buildHandle(oldChatName),
  handoffPath: handoffFilePath,
  closeScript: `${import.meta.dirname}/closeChat.ts`,
  job,
  logPath: `${DISPATCHER_DIR}/claude-tmux-team-swap.log`,
});
startingTextParts.push(takeoverPrompt);
const startingText = startingTextParts.join("\n\n");
let newChatDirectory = team.workDirectory;
if (team.worktreePath !== undefined) {
  if (job !== directorJob)
    newChatDirectory = team.worktreePath;
}
// const splitCommand = ["tmux", "split-window", "-h", "-t", oldChat.pane, "-c", team.workDirectory, "-P", "-F", "#{pane_id}", ...buildPaneEnvironmentFlags(teamName, job, newChat.chatName), buildDirectorPaneCommand(newChat.chatName, newChat.model, startingText)];
// One chat per window: the split and the layout are replaced by startChatInNewWindow.
// const splitCommand = ["tmux", "split-window", "-h", "-t", oldChat.pane, "-c", newChatDirectory, "-P", "-F", "#{pane_id}", ...buildPaneEnvironmentFlags(teamName, job, newChat.chatName), buildDirectorPaneCommand(newChat.chatName, newChat.model, startingText)];
// const splitResult = tmux_lib.run(splitCommand, { capture_output: true, text: true, check: true });
// const newPane = splitResult.stdout.trim();
// tmux_lib.tmux_selectLayout(newPane, values["CLAUDE_HOOKS_CLAUDE_TEAM_WINDOW_LAYOUT"]);
const newPane = startChatInNewWindow(oldChat.pane, newChatDirectory, buildPaneEnvironmentFlags(teamName, job, newChat.chatName), buildDirectorPaneCommand(newChat.chatName, newChat.model, startingText));

lockTeamFile(teamFilePath);
const teamWithPane = readTeamFile(teamFilePath);
findChatWithStatus(teamWithPane, job, "starting")!.pane = newPane;
writeTeamFile(teamFilePath, teamWithPane);
unlockTeamFile(teamFilePath);

// const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(newPane);
// if (readinessCode !== 0)
//   throw new Error(`${newChat.chatName} did not become ready in pane ${newPane}`);
waitForChatReady(newPane, newChat.chatName);

lockTeamFile(teamFilePath);
const teamToActivate = readTeamFile(teamFilePath);
findChatWithStatus(teamToActivate, job, "starting")!.status = "active";
writeTeamFile(teamFilePath, teamToActivate);
unlockTeamFile(teamFilePath);

const leavingNotice = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_LEAVING_NOTICE"], { newHandle: buildHandle(newChat.chatName) });
sendTextToChat(oldChat.pane, oldChatName, leavingNotice, dialogWaitSeconds);

// closeChat.ts sends the replaced notice now, before it ends the old chat.
// const replacedNotice =fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_REPLACED_NOTICE"], { oldChatName, newChatName: newChat.chatName, job });
// for (const otherChat of listNoticeChats(teamToActivate, newChat.chatName))
//   sendTextToChat(otherChat.pane, otherChat.chatName, replacedNotice, dialogWaitSeconds);

console.log(`swapped "${oldChatName}" for "${newChat.chatName}"`);
