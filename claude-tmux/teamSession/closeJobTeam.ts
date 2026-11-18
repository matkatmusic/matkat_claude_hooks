import { existsSync } from "node:fs";
import { homedir } from "node:os";
// import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
// import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
// import { buildTeamFilePath, buildTranscriptDirectory, fillTemplate, findNewHandoffFile, findSessionIdOfChat, findTeamLeader, listChatsInSwap, listHandoffFiles, listIdleStateDirectories, readTeamFile } from "./teamFile.ts";
// import { buildTeamFilePath, buildTranscriptDirectory, fillTemplate, findSessionIdOfChat, findTeamLeader, listChatsInSwap, listIdleStateDirectories, readTeamFile } from "./teamFile.ts";
import { buildTeamFilePath, buildTranscriptDirectory, findPlanAuditorToWaitFor, findSessionIdOfChat, findTeamLeader, listChatsInSwap, listIdleStateDirectories, readTeamFile } from "./teamFile.ts";
// import { sendTextToChat } from "./teamSend.ts";
// import { sendHandoffCommandAndWaitForFile } from "../chat-swap/chatSwap.ts";
import { fillTemplate, sendHandoffCommandAndWaitForFile, waitForIdleChat } from "../shared/chatSwap.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 1)
  throw new Error('usage: closeJobTeam.ts "JOB-NAME"');
const [jobName] = scriptArguments;

const teamName = process.env.CLAUDE_TMUX_TEAM_NAME;
const ownJob = process.env.CLAUDE_TMUX_TEAM_JOB;
if (teamName === undefined)
  throw new Error("closeJobTeam.ts must run inside a claude-tmux team chat");
if (ownJob === undefined)
  throw new Error("closeJobTeam.ts must run inside a claude-tmux team chat");

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"];
if (ownJob !== directorJob)
  throw new Error("only the Director can run closeJobTeam.ts");

const stateDirectory = values["CLAUDE_HOOKS_SESSION_STATE_DIR"];
const jobTeamName = `${teamName} ${jobName}`;
const jobTeamFilePath = buildTeamFilePath(stateDirectory, jobTeamName);
if (!existsSync(jobTeamFilePath))
  throw new Error(`team ${jobTeamName} has no team file. This script closes only a job team with its own tmux session`);
const jobTeam = readTeamFile(jobTeamFilePath);
if (jobTeam.parentTeam !== teamName)
  throw new Error(`team ${jobTeamName} is not a job team of ${teamName}`);

const sessionListResult = tmux_lib.run(["tmux", "list-sessions", "-F", "#{session_name}"], { capture_output: true, text: true, check: true });
const liveSessionNames = sessionListResult.stdout.split("\n");
if (!liveSessionNames.includes(jobTeamName))
  throw new Error(`team ${jobTeamName} has no tmux session`);

const chatsInSwap = listChatsInSwap(jobTeam);
if (chatsInSwap.length > 0)
  throw new Error(`a chat swap is in progress in team ${jobTeamName}: ${chatsInSwap[0].chatName}`);

const teamLeader = findTeamLeader(jobTeam);
if (teamLeader === undefined)
  throw new Error(`team ${jobTeamName} has no team leader`);

const planAuditorChat = findPlanAuditorToWaitFor(jobTeam, "PlanAuditor");
if (planAuditorChat !== undefined) {
  console.log(`waiting for "${planAuditorChat.chatName}" to finish its work`);
  waitForIdleChat(planAuditorChat.pane, planAuditorChat.chatName, Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_WAIT_SECONDS"]));
}

const transcriptDirectory = buildTranscriptDirectory(`${homedir()}/.claude/projects`, jobTeam.workDirectory);
const teamLeaderSessionId = findSessionIdOfChat(transcriptDirectory, teamLeader.chatName);
if (teamLeaderSessionId === undefined)
  throw new Error(`no chat record found for "${teamLeader.chatName}" in ${transcriptDirectory}`);

const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIALOG_WAIT_SECONDS"]);
const projectRootResult = tmux_lib.run(["git", "-C", jobTeam.workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: true });
const idleStateDirectories = listIdleStateDirectories(jobTeam, projectRootResult.stdout.trim());
// const handoffFilesBefore: string[] = [];
// for (const idleStateDirectory of idleStateDirectories)
//   handoffFilesBefore.push(...listHandoffFiles(idleStateDirectory, teamLeaderSessionId));
const handoffCommand = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_COMMAND"], { sessionId: teamLeaderSessionId });
// sendTextToChat(teamLeader.pane, teamLeader.chatName, handoffCommand, dialogWaitSeconds);

const handoffWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_WAIT_SECONDS"]);
const handoffFilePath = sendHandoffCommandAndWaitForFile(teamLeader.pane, teamLeader.chatName, handoffCommand, idleStateDirectories, teamLeaderSessionId, dialogWaitSeconds, handoffWaitSeconds);
// const handoffStartedAt = Date.now();
// let handoffFilePath: string | undefined;
// while (handoffFilePath === undefined) {
//   if (Date.now() - handoffStartedAt > handoffWaitSeconds * 1000)
//     throw new Error(`"${teamLeader.chatName}" did not write a handoff file`);
//   const handoffFilesNow: string[] = [];
//   for (const idleStateDirectory of idleStateDirectories)
//     handoffFilesNow.push(...listHandoffFiles(idleStateDirectory, teamLeaderSessionId));
//   handoffFilePath = findNewHandoffFile(handoffFilesBefore, handoffFilesNow);
//   if (handoffFilePath === undefined)
//     tmux_lib.sleep(2);
// }
// tmux_lib.sleep(5);

const statusResult = tmux_lib.run(["git", "-C", jobTeam.workDirectory, "status", "--short"], { capture_output: true, text: true, check: true });
// kill-session reads a dot in the name as a pane separator, so kill by session id
// tmux_lib.run(["tmux", "kill-session", "-t", `=${jobTeamName}`], { capture_output: true, text: true, check: true });
const sessionIdListResult = tmux_lib.run(["tmux", "list-sessions", "-F", "#{session_id} #{session_name}"], { capture_output: true, text: true, check: true });
let jobTeamSessionId: string | undefined;
for (const sessionLine of sessionIdListResult.stdout.split("\n")) {
  const firstSpaceIndex = sessionLine.indexOf(" ");
  const listedSessionId = sessionLine.slice(0, firstSpaceIndex);
  const listedSessionName = sessionLine.slice(firstSpaceIndex + 1);
  if (listedSessionName === jobTeamName)
    jobTeamSessionId = listedSessionId;
}
if (jobTeamSessionId === undefined)
  throw new Error(`team ${jobTeamName} has no tmux session to close`);
tmux_lib.run(["tmux", "kill-session", "-t", jobTeamSessionId], { capture_output: true, text: true, check: true });

console.log(`closed team "${jobTeamName}"`);
console.log(`handoff file: ${handoffFilePath}`);
if (statusResult.stdout.trim() === "")
  console.log(`uncommitted files in ${jobTeam.workDirectory}: none`);
if (statusResult.stdout.trim() !== "")
  console.log(`uncommitted files in ${jobTeam.workDirectory}:\n${statusResult.stdout}`);
