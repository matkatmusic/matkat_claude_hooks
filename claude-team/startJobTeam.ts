import { readdirSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { buildChatName, buildDetachedSizeFlags, buildDirectorPaneCommand } from "./teamCommand.ts";
import { buildHandle, buildHandleList, buildJobValueKey, buildMessageWithRoleText, buildPaneEnvironmentFlags, buildTeamFilePath, countLiveJobTeams, fillTemplate, findChatWithStatus, findTeamLeader, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import type { Team, TeamChat } from "./teamFile.ts";
import { sendTextToChat } from "./teamSend.ts";
// startChatInNewWindow replaces startChatPane
// import { startChatPane, startHelperChats } from "./teamStart.ts";
import { startChatInNewWindow, startHelperChats } from "./teamStart.ts";
import { addJobWorktree } from "./teamWorktree.ts";

const scriptArguments = process.argv.slice(2);
const teamName = process.env.CLAUDE_TEAM_NAME;
const ownJob = process.env.CLAUDE_TEAM_JOB;
if (teamName === undefined)
  throw new Error("startJobTeam.ts must run inside a claude-team chat");
if (ownJob === undefined)
  throw new Error("startJobTeam.ts must run inside a claude-team chat");

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"];
if (ownJob !== directorJob)
  throw new Error("only the Director can run startJobTeam.ts");
if (scriptArguments.length !== 2)
  throw new Error('usage: startJobTeam.ts "JOB-NAME" "JOB-TEXT"');
const [jobName, jobText] = scriptArguments;

const stateDirectory = values["CLAUDE_HOOKS_SESSION_STATE_DIR"];
const teamFilePath = buildTeamFilePath(stateDirectory, teamName);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_DIALOG_WAIT_SECONDS"]);
const teamLeaderJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_TEAMLEADER_JOB"];
const team = readTeamFile(teamFilePath);
const directorChat = findChatWithStatus(team, directorJob, "active");
if (directorChat === undefined)
  throw new Error(`job ${directorJob} has no active chat`);

const childTeams: Team[] = [];
for (const fileName of readdirSync(`${stateDirectory}/claude-team`)) {
  const isTeamFile = fileName.endsWith(".json");
  if (isTeamFile) {
    const otherTeam = readTeamFile(`${stateDirectory}/claude-team/${fileName}`);
    if (otherTeam.parentTeam === team.teamName)
      childTeams.push(otherTeam);
  }
}
const sessionListResult = tmux_lib.run(["tmux", "list-sessions", "-F", "#{session_name}"], { capture_output: true, text: true, check: true });
const liveSessionNames = sessionListResult.stdout.split("\n");
const maxTeams = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_TEAMS"]);
const liveJobTeamCount = countLiveJobTeams(team, childTeams, liveSessionNames);
if (liveJobTeamCount >= maxTeams)
  throw new Error(`the limit of ${maxTeams} teams is reached`);

const isFirstJob = findTeamLeader(team) === undefined;
const jobTeamName = isFirstJob ? team.teamName : `${team.teamName} ${jobName}`;
if (!isFirstJob) {
  const jobTeamSessionIsLive = liveSessionNames.includes(jobTeamName);
  if (jobTeamSessionIsLive)
    throw new Error(`team ${jobTeamName} already exists`);
}

const setupCommands = values["CLAUDE_HOOKS_CLAUDE_TEAM_WORKTREE_SETUP_COMMANDS"].split("\n");
const { worktreePath, branch, baseBranch } = addJobWorktree(team.workDirectory, values["CLAUDE_HOOKS_CLAUDE_TEAM_WORKTREE_DIRECTORY"], team.teamName, jobName, setupCommands);
const worktreeSection = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_WORKTREE_TEXT"], { worktreePath, branch, baseBranch });

const jobTeamFilePath = buildTeamFilePath(stateDirectory, jobTeamName);
const teamLeaderChatName = buildChatName(jobTeamName, teamLeaderJob, 1);
const teamLeaderChat: TeamChat = { job: teamLeaderJob, chatNumber: 1, chatName: teamLeaderChatName, pane: "", model: directorChat.model, status: "starting", needsRoleText: true, isTeamLeader: true };
const teamLeaderEnvironmentFlags = buildPaneEnvironmentFlags(jobTeamName, teamLeaderJob, teamLeaderChatName);
const teamLeaderPaneCommand = buildDirectorPaneCommand(teamLeaderChatName, teamLeaderChat.model, "");

if (isFirstJob) {
  lockTeamFile(teamFilePath);
  const teamToAddLeader = readTeamFile(teamFilePath);
  teamToAddLeader.chats.push(teamLeaderChat);
  teamToAddLeader.worktreePath = worktreePath;
  teamToAddLeader.worktreeText = worktreeSection;
  writeTeamFile(teamFilePath, teamToAddLeader);
  unlockTeamFile(teamFilePath);
  // startChatPane replaces the split-window command and the tiled layout
  // const splitCommand = ["tmux", "split-window", "-t", directorChat.pane, "-c", team.workDirectory, "-P", "-F", "#{pane_id}", ...teamLeaderEnvironmentFlags, teamLeaderPaneCommand];
  // const splitResult = tmux_lib.run(splitCommand, { capture_output: true, text: true, check: true });
  // teamLeaderChat.pane = splitResult.stdout.trim();
  // tmux_lib.tmux_selectLayout(teamLeaderChat.pane, "tiled");
  // startChatInNewWindow replaces startChatPane
  // teamLeaderChat.pane = startChatPane(directorChat.pane, team.workDirectory, teamLeaderEnvironmentFlags, teamLeaderPaneCommand, values);
  teamLeaderChat.pane = startChatInNewWindow(directorChat.pane, team.workDirectory, teamLeaderEnvironmentFlags, teamLeaderPaneCommand);
  lockTeamFile(teamFilePath);
  const teamWithLeaderPane = readTeamFile(teamFilePath);
  findChatWithStatus(teamWithLeaderPane, teamLeaderJob, "starting")!.pane = teamLeaderChat.pane;
  writeTeamFile(teamFilePath, teamWithLeaderPane);
  unlockTeamFile(teamFilePath);
}
if (!isFirstJob) {
  // jobTeam below also holds worktreePath and worktreeText
  // const jobTeam: Team = { teamName: jobTeamName, workDirectory: worktreePath, parentTeam: team.teamName, chats: [teamLeaderChat] };
  const jobTeam: Team = { teamName: jobTeamName, workDirectory: worktreePath, parentTeam: team.teamName, worktreePath, worktreeText: worktreeSection, chats: [teamLeaderChat] };
  const newSessionCommand = ["tmux", "new-session", "-d", ...buildDetachedSizeFlags(values), "-P", "-F", "#{pane_id}", "-s", jobTeamName, "-c", worktreePath, ...teamLeaderEnvironmentFlags, teamLeaderPaneCommand];
  const newSessionResult = tmux_lib.run(newSessionCommand, { capture_output: true, text: true, check: true });
  teamLeaderChat.pane = newSessionResult.stdout.trim();
  lockTeamFile(jobTeamFilePath);
  writeTeamFile(jobTeamFilePath, jobTeam);
  unlockTeamFile(jobTeamFilePath);
  startHelperChats(jobTeamFilePath, teamLeaderChat.pane, values);
}

console.log(`Starting ${teamLeaderChatName}. Waiting for the chat to be ready.`);
const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(teamLeaderChat.pane);
if (readinessCode !== 0)
  throw new Error(`${teamLeaderChatName} did not become ready in pane ${teamLeaderChat.pane}`);
lockTeamFile(jobTeamFilePath);
const teamToActivateLeader = readTeamFile(jobTeamFilePath);
findChatWithStatus(teamToActivateLeader, teamLeaderJob, "starting")!.status = "active";
writeTeamFile(jobTeamFilePath, teamToActivateLeader);
unlockTeamFile(jobTeamFilePath);

const jobTeamToSend = readTeamFile(jobTeamFilePath);
const jobSection = `${values["CLAUDE_HOOKS_CLAUDE_TEAM_JOB_HEADER"]}\n${jobText}`;
// worktreeSection moved up, directly after addJobWorktree
// const worktreeSection = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_WORKTREE_TEXT"], { worktreePath, branch, baseBranch });
const handleSection = `${values["CLAUDE_HOOKS_CLAUDE_TEAM_HANDLE_LIST_HEADER"]}\n${buildHandleList(jobTeamToSend, values, directorChat)}`;

for (const job of values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"].split(",")) {
  const helperChat = findChatWithStatus(jobTeamToSend, job, "active");
  if (helperChat === undefined)
    throw new Error(`job ${job} has no active chat`);
  const helperText = buildMessageWithRoleText(helperChat, values[buildJobValueKey(job, "PROMPT")], [jobSection, worktreeSection, handleSection].join("\n\n"));
  sendTextToChat(helperChat.pane, helperChat.chatName, helperText, dialogWaitSeconds);
  lockTeamFile(jobTeamFilePath);
  const teamWithRoleTextSent = readTeamFile(jobTeamFilePath);
  findChatWithStatus(teamWithRoleTextSent, job, "active")!.needsRoleText = false;
  writeTeamFile(jobTeamFilePath, teamWithRoleTextSent);
  unlockTeamFile(jobTeamFilePath);
}

const directorHandle = buildHandle(directorChat.chatName);
const userQuestionRule = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_TEAMLEADER_QUESTION_RULE_MODE_2"], { directorHandle });
const teamLeaderPrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_TEAMLEADER_PROMPT"], { maxRounds: values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_REVIEW_ROUNDS"], userQuestionRule });
sendTextToChat(teamLeaderChat.pane, teamLeaderChatName, [teamLeaderPrompt, jobSection, worktreeSection, handleSection].join("\n\n"), dialogWaitSeconds);
lockTeamFile(jobTeamFilePath);
const teamWithLeaderTextSent = readTeamFile(jobTeamFilePath);
findChatWithStatus(teamWithLeaderTextSent, teamLeaderJob, "active")!.needsRoleText = false;
writeTeamFile(jobTeamFilePath, teamWithLeaderTextSent);
unlockTeamFile(jobTeamFilePath);

console.log(`Started the team "${jobTeamName}" in ${worktreePath} on the branch ${branch}.`);
