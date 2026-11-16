import { existsSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
import { buildChatName, buildDetachedSizeFlags, buildDirectorPaneCommand, parseTeamArguments } from "./teamCommand.ts";
import { buildHandle, buildJobValueKey, buildPaneEnvironmentFlags, buildTeamFilePath, findChatWithStatus, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import type { Team } from "./teamFile.ts";
import { sendTextToChat } from "../shared/chatSend.ts";
import { fillTemplate } from "../shared/chatSwap.ts";
import { startHelperChats } from "./teamStart.ts";

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
const team = parseTeamArguments(process.argv.slice(2), values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_MODEL"]);
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"];
const directorChatName = buildChatName(team.name, directorJob, 1);
const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.name);

if (existsSync(teamFilePath)) {
  const hasSessionCode = tmux_lib.tmux_hasSession(team.name);
  if (hasSessionCode === 0)
    throw new Error(`team ${team.name} already exists: ${teamFilePath}`);
}

const readFindJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_READ_FIND_JOB"];
const directorStartPrompt = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_START_PROMPT"], {
  leadScript: `${import.meta.dirname}/leadJobDirectly.ts`,
  jobTeamScript: `${import.meta.dirname}/startJobTeam.ts`,
  closeTeamScript: `${import.meta.dirname}/closeJobTeam.ts`,
  maxTeams: values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_MAX_TEAMS"],
  readFindHandle: buildHandle(buildChatName(team.name, readFindJob, 1)),
});

// The old Director start text and the --parent path. startJobTeam.ts replaces them.
// const directorTextFields: Record<string, string> = {
//   chatName: directorChatName,
//   teamName: team.name,
//   job: directorJob,
//   jobs: `${directorJob},${values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"]}`,
//   sendScript: `${import.meta.dirname}/sendToJob.ts`,
//   startScript: `${import.meta.dirname}/startClaudeTeam.ts`,
//   helpersScript: `${import.meta.dirname}/startTeamHelpers.ts`,
//   maxTeams: values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_TEAMS"],
//   maxRounds: values["CLAUDE_HOOKS_CLAUDE_TEAM_MAX_REVIEW_ROUNDS"],
// };
// let startedByPrompt = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_USER_STARTED_PROMPT"];
// if (team.parent !== undefined) {
//   const parentTeamFile = readTeamFile(buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.parent));
//   const parentDirectorChat = findChatWithStatus(parentTeamFile, directorJob, "active");
//   if (parentDirectorChat === undefined)
//     throw new Error(`team ${team.parent} has no active ${directorJob} chat`);
//   directorTextFields.parentTeam = team.parent;
//   directorTextFields.parentDirectorChat = parentDirectorChat.chatName;
//   startedByPrompt = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_PARENT_STARTED_PROMPT"];
// }
// Object.assign(directorTextFields, buildJobChatFields(newTeamFile, jobs));
// const roleText = fillTemplate(`${values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_PROMPT"]}\n${startedByPrompt}\n${values["CLAUDE_HOOKS_CLAUDE_TEAM_SEND_INSTRUCTIONS"]}`, directorTextFields);

const newTeamFile: Team = {
  teamName: team.name,
  workDirectory: process.cwd(),
  chats: [{ job: directorJob, chatNumber: 1, chatName: directorChatName, pane: "", model: team.model, status: "starting" }],
};

const directorPaneCommand = buildDirectorPaneCommand(directorChatName, team.model, directorStartPrompt);

const newSessionCommand = ["tmux", "new-session", "-d", ...buildDetachedSizeFlags(values), "-P", "-F", "#{pane_id}", "-s", team.name, "-c", process.cwd(), ...buildPaneEnvironmentFlags(team.name, directorJob, directorChatName), directorPaneCommand];
const newSessionResult = tmux_lib.run(newSessionCommand, { capture_output: true, text: true, check: true });
const directorPane = newSessionResult.stdout.trim();
newTeamFile.chats[0].pane = directorPane;
lockTeamFile(teamFilePath);
writeTeamFile(teamFilePath, newTeamFile);
unlockTeamFile(teamFilePath);

startHelperChats(teamFilePath, directorPane, values);

console.log(`Starting ${directorChatName}. Waiting for the chat to be ready.`);
const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(directorPane);
if (readinessCode !== 0)
  throw new Error(`${directorChatName} did not become ready in pane ${directorPane}`);
lockTeamFile(teamFilePath);
const teamFile = readTeamFile(teamFilePath);
findChatWithStatus(teamFile, directorJob, "starting")!.status = "active";
writeTeamFile(teamFilePath, teamFile);
unlockTeamFile(teamFilePath);

const teamWithHelpers = readTeamFile(teamFilePath);
const readFindChat = findChatWithStatus(teamWithHelpers, readFindJob, "active");
if (readFindChat === undefined)
  throw new Error(`job ${readFindJob} has no active chat`);
const directorHandleLine = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDLE_LINE"], { chatName: directorChatName, role: directorJob });
const handleSection = `${values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDLE_LIST_HEADER"]}\n${directorHandleLine}`;
const readFindText = [values[buildJobValueKey(readFindJob, "PROMPT")], handleSection].join("\n\n");
sendTextToChat(readFindChat.pane, readFindChat.chatName, readFindText, Number(values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIALOG_WAIT_SECONDS"]));
lockTeamFile(teamFilePath);
const teamWithRoleTextSent = readTeamFile(teamFilePath);
findChatWithStatus(teamWithRoleTextSent, readFindJob, "active")!.needsRoleText = false;
writeTeamFile(teamFilePath, teamWithRoleTextSent);
unlockTeamFile(teamFilePath);

if (process.stdout.isTTY) {
  const isInsideTmux = process.env.TMUX !== undefined;
  if (isInsideTmux) {
    const switchResult = tmux_lib.run(["tmux", "switch-client", "-t", directorPane], { check: false });
    process.exit(switchResult.returncode);
  }
  const attachResult = tmux_lib.run(["tmux", "attach-session", "-t", directorPane], { check: false });
  process.exit(attachResult.returncode);
}
