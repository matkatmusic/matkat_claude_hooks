import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { wrapShellWord } from "../shared/chatSwap.ts";
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
