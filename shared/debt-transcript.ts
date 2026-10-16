import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findBashWrittenTsPaths } from "./debt-files.ts";

type ToolUseBlock = { type?: string; id?: string; name?: string; input?: { file_path?: string; command?: string } };

function findErroredToolUseIds(lines: string[]): Set<string> {
  const erroredIds = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i])
      continue;
    const entry = JSON.parse(lines[i]);
    const isUserLine = entry.type === "user";
    const content = entry.message?.content;
    const isContentArray = Array.isArray(content);
    const isUserWithBlocks = isUserLine && isContentArray;
    if (!isUserWithBlocks)
      continue;
    const blocks = content as { type?: string; tool_use_id?: string; is_error?: boolean }[];
    for (let b = 0; b < blocks.length; b++) {
      const isToolResult = blocks[b].type === "tool_result";
      const isError = blocks[b].is_error === true;
      const isErroredResult = isToolResult && isError;
      if (isErroredResult)
        erroredIds.add(blocks[b].tool_use_id as string);
    }
  }
  return erroredIds;
}

function containsToolResultContent(content: unknown): boolean {
  const isArray = Array.isArray(content);
  if (!isArray)
    return false;
  const blocks = content as { type?: string }[];
  let found = false;
  for (let i = 0; i < blocks.length; i++) {
    const isToolResult = blocks[i].type === "tool_result";
    if (isToolResult)
      found = true;
  }
  return found;
}

export type EditedTurn = { files: string[]; turnStartTimestamp: string | undefined };

export function findEditedFilePaths(transcript: string): EditedTurn {
  const lines = transcript.split("\n");
  const erroredIds = findErroredToolUseIds(lines);
  const files: string[] = [];
  let reachedPromptBoundary = false;
  let turnStartTimestamp: string | undefined;
  let i = lines.length - 1;
  while (true) {
    const hasMoreLines = i >= 0;
    const shouldStop = !hasMoreLines || reachedPromptBoundary;
    if (shouldStop)
      break;
    const line = lines[i];
    i -= 1;
    if (!line)
      continue;
    const entry = JSON.parse(line);
    const isUserLine = entry.type === "user";
    const hasToolResult = containsToolResultContent(entry.message?.content);
    const isPromptBoundary = isUserLine && !hasToolResult;
    if (isPromptBoundary) {
      reachedPromptBoundary = true;
      turnStartTimestamp = entry.timestamp;
      continue;
    }
    const isAssistant = entry.type === "assistant";
    if (!isAssistant)
      continue;
    const content = entry.message?.content;
    const isContentArray = Array.isArray(content);
    if (!isContentArray)
      continue;
    const blocks = content as ToolUseBlock[];
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b];
      const isToolUse = block.type === "tool_use";
      if (!isToolUse)
        continue;
      const wasRejected = erroredIds.has(block.id as string);
      if (wasRejected)
        continue;
      const isBashName = block.name === "Bash";
      if (isBashName) {
        const bashPaths = findBashWrittenTsPaths(block.input?.command as string, entry.cwd);
        for (let p = 0; p < bashPaths.length; p++)
          files.push(bashPaths[p]);
        continue;
      }
      const isEditName = block.name === "Edit";
      const isWriteName = block.name === "Write";
      const isNotebookEditName = block.name === "NotebookEdit";
      const isEditLikeTool = isEditName || isWriteName || isNotebookEditName;
      if (!isEditLikeTool)
        continue;
      const filePath = block.input?.file_path;
      if (!filePath)
        continue;
      files.push(filePath);
    }
  }
  return { files, turnStartTimestamp };
}

export function findSubagentEditedFilePaths(subagentsDir: string, turnStartTimestamp: string): string[] {
  const files: string[] = [];
  const hasSubagentsDir = existsSync(subagentsDir);
  if (!hasSubagentsDir)
    return files;
  const entries = readdirSync(subagentsDir);
  for (let e = 0; e < entries.length; e++) {
    const name = entries[e];
    const isAgentTranscript = name.startsWith("agent-") && name.endsWith(".jsonl");
    if (!isAgentTranscript)
      continue;
    const content = readFileSync(join(subagentsDir, name), "utf8");
    const lines = content.split("\n");
    const erroredIds = findErroredToolUseIds(lines);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line)
        continue;
      const entry = JSON.parse(line);
      const isAssistant = entry.type === "assistant";
      if (!isAssistant)
        continue;
      const isAtOrAfterTurnStart = entry.timestamp >= turnStartTimestamp;
      if (!isAtOrAfterTurnStart)
        continue;
      const messageContent = entry.message?.content;
      const isContentArray = Array.isArray(messageContent);
      if (!isContentArray)
        continue;
      const blocks = messageContent as ToolUseBlock[];
      for (let b = 0; b < blocks.length; b++) {
        const block = blocks[b];
        const isToolUse = block.type === "tool_use";
        if (!isToolUse)
          continue;
        const wasRejected = erroredIds.has(block.id as string);
        if (wasRejected)
          continue;
        const isBashName = block.name === "Bash";
        if (isBashName) {
          const bashPaths = findBashWrittenTsPaths(block.input?.command as string, entry.cwd);
          for (let p = 0; p < bashPaths.length; p++)
            files.push(bashPaths[p]);
          continue;
        }
        const isEditName = block.name === "Edit";
        const isWriteName = block.name === "Write";
        const isNotebookEditName = block.name === "NotebookEdit";
        const isEditLikeTool = isEditName || isWriteName || isNotebookEditName;
        if (!isEditLikeTool)
          continue;
        const filePath = block.input?.file_path;
        if (!filePath)
          continue;
        files.push(filePath);
      }
    }
  }
  return files;
}
