import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { wrapShellWord } from "../shared/chatSwap.ts";
import { lockTeamFile, unlockTeamFile } from "../teamSession/teamFile.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";

export type SingleChatSwapRecord = { newChatName: string; newPane: string; isNewChatReady: boolean };

export function parseSingleChatArguments(args: string[], defaultModel: string): { name: string; model: string } {
  const parsed = parseArgs({
    args,
    options: {
      name: { type: "string" },
      model: { type: "string", default: defaultModel },
    },
  });
  const name = parsed.values.name;
  if (name === undefined)
    throw new Error('claude-tmux needs --name "NAME"');
  return { name, model: parsed.values.model };
}

export function buildSingleChatName(name: string, chatNumber: number): string {
  return `${name} ${chatNumber}`;
}

// export function buildSingleChatEnvironmentFlags(name: string, chatNumber: number, model: string, workDirectory: string): string[] {
//   return [
//     "-e", `CLAUDE_TMUX_NAME=${name}`,
//     "-e", `CLAUDE_TMUX_CHAT_NUMBER=${chatNumber}`,
//     "-e", `CLAUDE_TMUX_MODEL=${model}`,
//     "-e", `CLAUDE_TMUX_WORK_DIRECTORY=${workDirectory}`,
//   ];
// }
export function buildSingleChatEnvironmentFlags(name: string, chatNumber: number, model: string, workDirectory: string, swapPercent: string): string[] {
  const environmentFlags = [
    "-e", `CLAUDE_TMUX_NAME=${name}`,
    "-e", `CLAUDE_TMUX_CHAT_NUMBER=${chatNumber}`,
    "-e", `CLAUDE_TMUX_MODEL=${model}`,
    "-e", `CLAUDE_TMUX_WORK_DIRECTORY=${workDirectory}`,
  ];
  const hasSwapPercent = swapPercent !== "";
  if (hasSwapPercent)
    environmentFlags.push("-e", `CLAUDE_TMUX_SWAP_PERCENT=${swapPercent}`);
  return environmentFlags;
}

export function buildSingleChatPaneCommand(chatName: string, model: string, startingText: string): string {
  let claudeCommand = `claude --name ${wrapShellWord(chatName)} --model ${wrapShellWord(model)}`;
  if (startingText !== "")
    claudeCommand += ` -- ${wrapShellWord(startingText)}`;
  return `zsh -ic ${wrapShellWord(claudeCommand)}`;
}

export function isTmuxSessionNameTaken(sessionName: string): boolean {
  // tmux has-session -t NAME also matches a name prefix; "=" asks for the exact name
  const hasSessionResult = tmux_lib.run(["tmux", "has-session", "-t", `=${sessionName}`], { capture_output: true, text: true, check: false });
  return hasSessionResult.returncode === 0;
}

export function buildSwapRecordPath(stateDirectory: string, oldSessionId: string): string {
  return `${stateDirectory}/claude-tmux/${oldSessionId}.json`;
}

export function writeSwapRecord(swapRecordPath: string, swapRecord: SingleChatSwapRecord): void {
  mkdirSync(dirname(swapRecordPath), { recursive: true });
  writeFileSync(swapRecordPath, JSON.stringify(swapRecord, null, 2));
}

export function readSwapRecord(swapRecordPath: string): SingleChatSwapRecord {
  return JSON.parse(readFileSync(swapRecordPath, "utf8"));
}

export function getSwapFailedAction(swapRecord: SingleChatSwapRecord | undefined): "undoSwap" | "closeNewChatAndUndoSwap" | "keepNewChat" {
  if (swapRecord === undefined)
    return "undoSwap";
  if (swapRecord.isNewChatReady)
    return "keepNewChat";
  if (swapRecord.newPane === "")
    return "undoSwap";
  return "closeNewChatAndUndoSwap";
}

export function validateSwapPercentText(swapPercentText: string | undefined): void {
  if (swapPercentText === undefined)
    return;
  const isWholeNumberFrom1To100 = /^(100|[1-9][0-9]?)$/.test(swapPercentText);
  if (!isWholeNumberFrom1To100)
    throw new Error(`CLAUDE_TMUX_SWAP_PERCENT must be a whole number from 1 to 100, not "${swapPercentText}"`);
}

const TRACKER_OPTION = "@claude_tmux_tracker";

export function buildTrackerPath(projectRoot: string, sessionId: string): string {
  return `${projectRoot}/.claude_hooks/tmux-sessions/${sessionId}.json`;
}

export function computeNextChatNumber(lastChatNumbers: Record<string, number>, counterName: string, currentChatNumber: number): number {
  const lastChatNumber = lastChatNumbers[counterName] ?? 0;
  return Math.max(lastChatNumber, currentChatNumber) + 1;
}

export function updateTrackerWithNextChatNumber(trackerPath: string, counterName: string, currentChatNumber: number): number {
  lockTeamFile(trackerPath);
  const lastChatNumbers: Record<string, number> = JSON.parse(readFileSync(trackerPath, "utf8"));
  const nextChatNumber = computeNextChatNumber(lastChatNumbers, counterName, currentChatNumber);
  lastChatNumbers[counterName] = nextChatNumber;
  writeFileSync(trackerPath, JSON.stringify(lastChatNumbers, null, 2) + "\n");
  unlockTeamFile(trackerPath);
  return nextChatNumber;
}

export function resetTrackerAfterFailedSwap(trackerPath: string, counterName: string, failedChatName: string): void {
  const failedChatNumber = Number(failedChatName.slice(counterName.length + 1));
  lockTeamFile(trackerPath);
  const lastChatNumbers: Record<string, number> = JSON.parse(readFileSync(trackerPath, "utf8"));
  // a later chat that took a higher number keeps it, so no chat name repeats
  const isFailedChatNumberLast = lastChatNumbers[counterName] === failedChatNumber;
  if (isFailedChatNumberLast) {
    lastChatNumbers[counterName] = failedChatNumber - 1;
    writeFileSync(trackerPath, JSON.stringify(lastChatNumbers, null, 2) + "\n");
  }
  unlockTeamFile(trackerPath);
}

function readTmuxOutput(tmuxArguments: string[]): string {
  return execFileSync("tmux", tmuxArguments, { encoding: "utf8" }).trim();
}

export function buildTrackerCleanupHookCommand(trackerFolder: string): string {
  // ponytail: a folder path with ' " or $ breaks this quoting
  // #{hook_session} is the closed session id, like $12; the single quotes keep the $ from the shell
  return `run-shell "rm -f '${trackerFolder}/#{hook_session}.json'"`;
}

function addTrackerCleanupHook(trackerFolder: string): void {
  // a hook set with -t on the session does not fire at session end; the global hook does
  const globalHooks = readTmuxOutput(["show-hooks", "-g"]);
  const hasCleanupHook = globalHooks.includes(`${trackerFolder}/`);
  if (hasCleanupHook)
    return;
  readTmuxOutput(["set-hook", "-ga", "session-closed", buildTrackerCleanupHookCommand(trackerFolder)]);
}

export function openTrackerOfPane(pane: string, projectRoot: string): string {
  const storedTrackerPath = readTmuxOutput(["display-message", "-p", "-t", pane, `#{${TRACKER_OPTION}}`]);
  if (storedTrackerPath !== "")
    return storedTrackerPath;
  const sessionId = readTmuxOutput(["display-message", "-p", "-t", pane, "#{session_id}"]);
  const trackerPath = buildTrackerPath(projectRoot, sessionId);
  // a tmux server restart reuses session ids, so a new tracker replaces an old file
  mkdirSync(dirname(trackerPath), { recursive: true });
  writeFileSync(trackerPath, "{}\n");
  readTmuxOutput(["set-option", "-t", sessionId, TRACKER_OPTION, trackerPath]);
  addTrackerCleanupHook(dirname(trackerPath));
  return trackerPath;
}
