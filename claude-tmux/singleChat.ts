import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { wrapShellWord } from "../chat-swap/chatSwap.ts";

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

export function buildSingleChatEnvironmentFlags(name: string, chatNumber: number, model: string, workDirectory: string): string[] {
  return [
    "-e", `CLAUDE_TMUX_NAME=${name}`,
    "-e", `CLAUDE_TMUX_CHAT_NUMBER=${chatNumber}`,
    "-e", `CLAUDE_TMUX_MODEL=${model}`,
    "-e", `CLAUDE_TMUX_WORK_DIRECTORY=${workDirectory}`,
  ];
}

export function buildSingleChatPaneCommand(chatName: string, model: string, startingText: string): string {
  let claudeCommand = `claude --name ${wrapShellWord(chatName)} --model ${wrapShellWord(model)}`;
  if (startingText !== "")
    claudeCommand += ` -- ${wrapShellWord(startingText)}`;
  return `zsh -ic ${wrapShellWord(claudeCommand)}`;
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
