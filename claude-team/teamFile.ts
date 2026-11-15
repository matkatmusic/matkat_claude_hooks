import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type TeamChat = { job: string; chatNumber: number; chatName: string; pane: string; model: string; status: "starting" | "active" | "leaving" };
export type Team = { teamName: string; workDirectory: string; chats: TeamChat[] };

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
  return `CLAUDE_HOOKS_CLAUDE_TEAM_${job.toUpperCase()}_${suffix}`;
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
      return line.includes(textStart);
    }
  }
  return false;
}
