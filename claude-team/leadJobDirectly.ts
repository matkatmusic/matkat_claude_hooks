import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { buildHandleList, buildJobValueKey, buildMessageWithRoleText,buildTeamFilePath, fillTemplate, findChatWithStatus, lockTeamFile, markDirectorAsTeamLeader, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import { sendTextToChat } from "./teamSend.ts";

const scriptArguments = process.argv.slice(2);
const teamName = process.env.CLAUDE_TEAM_NAME;
const ownJob = process.env.CLAUDE_TEAM_JOB;
if (teamName === undefined)
  throw new Error("leadJobDirectly.ts must run inside a claude-team chat");
if (ownJob === undefined)
  throw new Error("leadJobDirectly.ts must run inside a claude-team chat");

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"];
if (ownJob !== directorJob)
  throw new Error("only the Director can run leadJobDirectly.ts");
if (scriptArguments.length !== 1)
  throw new Error('usage: leadJobDirectly.ts "JOB-TEXT"');
const [jobText] = scriptArguments;

const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_DIALOG_WAIT_SECONDS"]);

markDirectorAsTeamLeader(readTeamFile(teamFilePath), directorJob);
lockTeamFile(teamFilePath);
const team = readTeamFile(teamFilePath);
markDirectorAsTeamLeader(team, directorJob);
writeTeamFile(teamFilePath, team);
unlockTeamFile(teamFilePath);

const jobSection = `${values["CLAUDE_HOOKS_CLAUDE_TEAM_JOB_HEADER"]}\n${jobText}`;
const handleSection = `${values["CLAUDE_HOOKS_CLAUDE_TEAM_HANDLE_LIST_HEADER"]}\n${buildHandleList(team, values)}`;

for (const job of values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"].split(",")) {
  const helperChat = findChatWithStatus(team, job, "active");
  if (helperChat === undefined)
    throw new Error(`job ${job} has no active chat`);
  const helperText = buildMessageWithRoleText(helperChat, values[buildJobValueKey(job, "PROMPT")], [jobSection, handleSection].join("\n\n"));
  sendTextToChat(helperChat.pane, helperChat.chatName, helperText, dialogWaitSeconds);
  lockTeamFile(teamFilePath);
  const teamWithRoleTextSent = readTeamFile(teamFilePath);
  findChatWithStatus(teamWithRoleTextSent, job, "active")!.needsRoleText = false;
  writeTeamFile(teamFilePath, teamWithRoleTextSent);
  unlockTeamFile(teamFilePath);
}

const directorChat = findChatWithStatus(team, directorJob, "active")!;
const teamLeaderPrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_TEAMLEADER_PROMPT"], {
  maxRounds: values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_REVIEW_ROUNDS"],
  userQuestionRule: values["CLAUDE_HOOKS_CLAUDE_TEAM_TEAMLEADER_QUESTION_RULE_MODE_1"],
});
sendTextToChat(directorChat.pane, directorChat.chatName, [teamLeaderPrompt, jobSection, handleSection].join("\n\n"), dialogWaitSeconds);

console.log("The five helper chats and the TeamLeader role text have their job.");
