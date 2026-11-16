import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildChatName } from "./teamCommand.ts";

export type TeamChat = { job: string; chatNumber: number; chatName: string; pane: string; model: string; status: "starting" | "active" | "leaving"; sessionId?: string; needsRoleText?: boolean; isTeamLeader?: boolean };
export type Team = { teamName: string; workDirectory: string; parentTeam?: string; worktreePath?: string; worktreeText?: string; chats: TeamChat[] };

const LOCK_STALE_SECONDS = 30;
const LOCK_GIVE_UP_SECONDS = 60;
const LOCK_RETRY_SECONDS = 0.2;

export function buildTeamFilePath(stateDirectory: string, teamName: string): string {
  return `${stateDirectory}/claude-team/${encodeURIComponent(teamName)}.json`;
}

export function findChatWithStatus(team: Team, job: string, status: TeamChat["status"]): TeamChat | undefined {
  for (const chat of team.chats) {
    if (chat.job === job) {
      if (chat.status === status)
        return chat;
    }
  }
  return undefined;
}

export function buildJobChatFields(team: Team, jobs: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const job of jobs) {
    let chat = findChatWithStatus(team, job, "active");
    if (chat === undefined)
      chat = findChatWithStatus(team, job, "starting");
    const jobWithLettersAndDigits = job.replace(/[^a-zA-Z0-9]/g, "");
    const fieldKey = `${jobWithLettersAndDigits[0].toLowerCase()}${jobWithLettersAndDigits.slice(1)}Chat`;
    if (chat === undefined)
      fields[fieldKey] = buildChatName(team.teamName, job, 1);
    else
      fields[fieldKey] = chat.chatName;
  }
  return fields;
}

export function buildMessageWithRoleText(chat: TeamChat, roleText: string, message: string): string {
  if (chat.needsRoleText === true)
    return `${roleText}\n\n${message}`;
  return message;
}

export function listNoticeChats(team: Team, newChatName: string): TeamChat[] {
  const noticeChats: TeamChat[] = [];
  for (const chat of team.chats) {
    if (chat.status === "active") {
      if (chat.chatName !== newChatName) {
        if (chat.needsRoleText !== true)
          noticeChats.push(chat);
      }
    }
  }
  return noticeChats;
}

export function addReplacementChat(team: Team, job: string): { oldChat: TeamChat; newChat: TeamChat } {
  const oldChat = findChatWithStatus(team, job, "active");
  if (oldChat === undefined)
    throw new Error(`job ${job} has no active chat`);
  oldChat.status = "leaving";
  const chatNumber = oldChat.chatNumber + 1;
  const newChat: TeamChat = { job, chatNumber, chatName: buildChatName(team.teamName, job, chatNumber), pane: "", model: oldChat.model, status: "starting" };
  if (oldChat.isTeamLeader === true)
    newChat.isTeamLeader = true;
  team.chats.push(newChat);
  return { oldChat, newChat };
}

export function buildHandle(chatName: string): string {
  return `@"${chatName}"`;
}

export function findTeamLeader(team: Team): TeamChat | undefined {
  for (const chat of team.chats) {
    if (chat.isTeamLeader === true) {
      if (chat.status !== "leaving")
        return chat;
    }
  }
  return undefined;
}

export function markDirectorAsTeamLeader(team: Team, directorJob: string): void {
  const existingTeamLeader = findTeamLeader(team);
  if (existingTeamLeader !== undefined)
    throw new Error("the team already has a team leader");
  const directorChat = findChatWithStatus(team, directorJob, "active");
  if (directorChat === undefined)
    throw new Error(`job ${directorJob} has no active chat`);
  directorChat.isTeamLeader = true;
}

function findCurrentChatName(team: Team, job: string): string {
  let chat = findChatWithStatus(team, job, "active");
  if (chat === undefined)
    chat = findChatWithStatus(team, job, "starting");
  if (chat === undefined)
    return buildChatName(team.teamName, job, 1);
  return chat.chatName;
}

export function buildHandleList(team: Team, values: Record<string, string>, directorChat?: TeamChat): string {
  const teamLeader = findTeamLeader(team);
  if (teamLeader === undefined)
    throw new Error("the team has no team leader");
  const lineTemplate = values["CLAUDE_HOOKS_CLAUDE_TEAM_HANDLE_LINE"];
  const lines = [fillTemplate(lineTemplate, { chatName: teamLeader.chatName, role: values["CLAUDE_HOOKS_CLAUDE_TEAM_TEAMLEADER_JOB"] })];
  for (const job of values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"].split(",")) {
    const chatName = findCurrentChatName(team, job);
    lines.push(fillTemplate(lineTemplate, { chatName, role: job }));
  }
  if (directorChat !== undefined)
    lines.push(fillTemplate(lineTemplate, { chatName: directorChat.chatName, role: values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"] }));
  return lines.join("\n");
}

export function countLiveJobTeams(team: Team, childTeams: Team[], liveSessionNames: string[]): number {
  let liveJobTeamCount = 0;
  const ownTeamLeader = findTeamLeader(team);
  if (ownTeamLeader !== undefined)
    liveJobTeamCount++;
  for (const childTeam of childTeams) {
    const childSessionIsLive = liveSessionNames.includes(childTeam.teamName);
    if (childSessionIsLive)
      liveJobTeamCount++;
  }
  return liveJobTeamCount;
}

export function undoReplacementChat(team: Team, job: string, oldChatName: string): TeamChat | undefined {
  const startingChat = findChatWithStatus(team, job, "starting");
  if (startingChat === undefined)
    return undefined;
  for (const chat of team.chats) {
    if (chat.chatName === oldChatName)
      chat.status = "active";
  }
  team.chats.splice(team.chats.indexOf(startingChat), 1);
  return startingChat;
}

export function removeChat(team: Team, chatName: string): void {
  for (let chatIndex = 0; chatIndex < team.chats.length; chatIndex++) {
    if (team.chats[chatIndex].chatName === chatName) {
      team.chats.splice(chatIndex, 1);
      return;
    }
  }
}

export function parseSendTarget(target: string): { job: string; isOldChat: boolean } {
  if (target.startsWith("old-"))
    return { job: target.slice("old-".length), isOldChat: true };
  return { job: target, isOldChat: false };
}

export function listHandoffFiles(idleStateDirectory: string, sessionId: string): string[] {
  if (!existsSync(idleStateDirectory))
    return [];
  const fileNameEnd = `-${sessionId.slice(0, 8)}.json`;
  const handoffFiles: string[] = [];
  for (const fileName of readdirSync(idleStateDirectory).sort()) {
    if (fileName.endsWith(fileNameEnd))
      handoffFiles.push(`${idleStateDirectory}/${fileName}`);
  }
  return handoffFiles;
}

export function listIdleStateDirectories(team: Team, projectRoot: string): string[] {
  const projectIdleStateDirectory = `${projectRoot}/.idleState`;
  const idleStateDirectories = [projectIdleStateDirectory];
  if (team.worktreePath !== undefined) {
    const worktreeIdleStateDirectory = `${team.worktreePath}/.idleState`;
    if (worktreeIdleStateDirectory !== projectIdleStateDirectory)
      idleStateDirectories.push(worktreeIdleStateDirectory);
  }
  return idleStateDirectories;
}

export function findNewHandoffFile(filesBefore: string[], filesNow: string[]): string | undefined {
  for (const filePath of filesNow) {
    if (!filesBefore.includes(filePath))
      return filePath;
  }
  return undefined;
}

export function fillTemplate(template: string, fields: Record<string, string>): string {
  let filled = template;
  const keysInTemplate = template.matchAll(/\{(\w+)\}/g);
  for (const keyMatch of keysInTemplate) {
    const key = keyMatch[1];
    if (!(key in fields))
      throw new Error(`template needs the field ${key}`);
    filled = filled.replaceAll(`{${key}}`, fields[key]);
  }
  return filled;
}

export function buildJobValueKey(job: string, suffix: "MODEL" | "PROMPT"): string {
  return `CLAUDE_HOOKS_CLAUDE_TEAM_${job.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${suffix}`;
}

export function hasOpenDialog(screen: string): boolean {
  const screenWithoutWhiteSpace = screen.replace(/\s/g, "");
  return screenWithoutWhiteSpace.includes("Esctocancel");
}

export function buildPaneEnvironmentFlags(teamName: string, job: string, chatName: string): string[] {
  return ["-e", `CLAUDE_TEAM_NAME=${teamName}`, "-e", `CLAUDE_TEAM_JOB=${job}`, "-e", `CLAUDE_TEAM_CHAT_NAME=${chatName}`];
}

export function readTeamFile(teamFilePath: string): Team {
  return JSON.parse(readFileSync(teamFilePath, "utf8"));
}

export function writeTeamFile(teamFilePath: string, team: Team): void {
  mkdirSync(dirname(teamFilePath), { recursive: true });
  writeFileSync(teamFilePath, JSON.stringify(team, null, 2));
}

function sleepSeconds(seconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

export function lockTeamFile(teamFilePath: string): void {
  const lockPath = `${teamFilePath}.lock`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < LOCK_GIVE_UP_SECONDS * 1000) {
    const mkdirResult = spawnSync("mkdir", [lockPath]);
    if (mkdirResult.status === 0)
      return;
    const lockAgeSeconds = (Date.now() - statSync(lockPath).mtimeMs) / 1000;
    if (lockAgeSeconds > LOCK_STALE_SECONDS) {
      rmdirSync(lockPath);
      continue;
    }
    sleepSeconds(LOCK_RETRY_SECONDS);
  }
  throw new Error(`team file is locked: ${teamFilePath}`);
}

export function unlockTeamFile(teamFilePath: string): void {
  rmdirSync(`${teamFilePath}.lock`);
}

export function inputBoxHoldsMessage(screen: string, text: string): boolean {
  const lines = screen.split("\n");
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex--) {
    const line = lines[lineIndex];
    if (line.trimStart().startsWith("❯")) {
      const textStart = text.split("\n")[0].slice(0, 20);
      const lineHoldsTextStart = line.includes(textStart);
      const lineShowsPastedTextMarker = line.includes("[Pasted text");
      const boxWithoutWhiteSpace = lines.slice(lineIndex).join("").replace(/\s/g, "");
      const boxHoldsTextEnd = boxWithoutWhiteSpace.includes(text.replace(/\s/g, "").slice(-20));
      const inputBoxHoldsText = lineHoldsTextStart || lineShowsPastedTextMarker || boxHoldsTextEnd;
      return inputBoxHoldsText;
    }
  }
  return false;
}
