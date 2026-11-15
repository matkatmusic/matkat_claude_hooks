import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { buildChatName, buildDirectorPaneCommand } from "./teamCommand.ts";
import { buildJobValueKey, buildPaneEnvironmentFlags, buildTeamFilePath, fillTemplate, findChatWithStatus, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import type { TeamChat } from "./teamFile.ts";
import { sendTextToChat } from "./teamSend.ts";

const scriptArguments = process.argv.slice(2);
if (scriptArguments.length !== 2)
  throw new Error('usage: sendToJob.ts <job> "<text>"');
const [job, text] = scriptArguments;

const teamName = process.env.CLAUDE_TEAM_NAME;
const senderJob = process.env.CLAUDE_TEAM_JOB;
const senderChatName = process.env.CLAUDE_TEAM_CHAT_NAME;
if (teamName === undefined || senderJob === undefined || senderChatName === undefined)
  throw new Error("sendToJob.ts must run inside a claude-team chat");

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"];
const jobList = values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"];
const allJobs = [directorJob, ...jobList.split(",")];
if (!allJobs.includes(job))
  throw new Error(`unknown job ${job}. Jobs: ${allJobs.join(",")}`);

const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const startWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_START_WAIT_SECONDS"]);
const dialogWaitSeconds = Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_DIALOG_WAIT_SECONDS"]);

function fillSendInstructions(chatName: string, chatJob: string): string {
  return fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_SEND_INSTRUCTIONS"], {
    chatName,
    teamName: teamName!,
    job: chatJob,
    jobs: allJobs.join(","),
    sendScript: `${import.meta.dirname}/sendToJob.ts`,
  });
}

let targetChat: TeamChat | undefined;
const startedAt = Date.now();
while (targetChat === undefined) {
  if (Date.now() - startedAt > startWaitSeconds * 1000)
    throw new Error(`the chat for job ${job} did not become active`);

  lockTeamFile(teamFilePath);
  const team = readTeamFile(teamFilePath);
  const activeChat = findChatWithStatus(team, job, "active");
  if (activeChat !== undefined) {
    unlockTeamFile(teamFilePath);
    targetChat = activeChat;
    continue;
  }
  const startingChat = findChatWithStatus(team, job, "starting");
  if (startingChat !== undefined) {
    unlockTeamFile(teamFilePath);
    tmux_lib.sleep(1);
    continue;
  }

  const newChat: TeamChat = {
    job,
    chatNumber: 1,
    chatName: buildChatName(teamName, job, 1),
    pane: "",
    model: values[buildJobValueKey(job, "MODEL")],
    status: "starting",
  };
  team.chats.push(newChat);
  writeTeamFile(teamFilePath, team);
  unlockTeamFile(teamFilePath);

  const directorPane = findChatWithStatus(team, directorJob, "active")!.pane;
  const environmentFlags = buildPaneEnvironmentFlags(teamName, job, newChat.chatName);
  const splitCommand = ["tmux", "split-window", "-t", directorPane, "-c", team.workDirectory, "-P", "-F", "#{pane_id}", ...environmentFlags, buildDirectorPaneCommand(newChat.chatName, newChat.model)];
  const splitResult = tmux_lib.run(splitCommand, { capture_output: true, text: true, check: true });
  const newPane = splitResult.stdout.trim();
  tmux_lib.tmux_selectLayout(newPane, "tiled");

  lockTeamFile(teamFilePath);
  const teamWithPane = readTeamFile(teamFilePath);
  findChatWithStatus(teamWithPane, job, "starting")!.pane = newPane;
  writeTeamFile(teamFilePath, teamWithPane);
  unlockTeamFile(teamFilePath);

  const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(newPane);
  if (readinessCode !== 0)
    throw new Error(`${newChat.chatName} did not become ready in pane ${newPane}`);
  tmux_lib.sleep(6);
  const roleText = `${values[buildJobValueKey(job, "PROMPT")]}\n${fillSendInstructions(newChat.chatName, job)}`;
  const roleSendCode = tmux_lib.tmux_sendAndSubmit(newPane, roleText);
  if (roleSendCode !== 0)
    throw new Error(`tmux could not send the role text to pane ${newPane}`);

  lockTeamFile(teamFilePath);
  const teamToActivate = readTeamFile(teamFilePath);
  findChatWithStatus(teamToActivate, job, "starting")!.status = "active";
  writeTeamFile(teamFilePath, teamToActivate);
  unlockTeamFile(teamFilePath);
  targetChat = { ...newChat, pane: newPane, status: "active" };
}

const messageHeader = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_MESSAGE_HEADER"], { senderChatName, senderJob });
sendTextToChat(targetChat.pane, targetChat.chatName, `${messageHeader}\n${text}`, dialogWaitSeconds);
console.log(`sent to "${targetChat.chatName}"`);
