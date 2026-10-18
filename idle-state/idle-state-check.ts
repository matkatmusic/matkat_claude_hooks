#!/usr/bin/env node
// Stop hook: on the first turn, blocks until the model read and named each idle-state file.
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { isPromptLine } from "../shared/prompt-line.ts";
import { readEnvValue } from "../shared/env.ts";
import { getSessionStatePath, readSessionState } from "../shared/session-state.ts";
import type { HookEntry } from "../dispatcher/hooks-list.ts";

export function isFirstTurn(transcript: string): boolean {
  let promptCount = 0;
  for (const line of transcript.split("\n")) {
    if (line === "")
      continue;
    const entry = JSON.parse(line);
    const isPrompt = isPromptLine(entry);
    if (isPrompt)
      promptCount++;
  }
  return promptCount <= 1;
}

export function findUnreadFiles(files: string[], transcript: string): string[] {
  const readPaths: string[] = [];
  for (const line of transcript.split("\n")) {
    if (line === "")
      continue;
    const entry = JSON.parse(line);
    const isAssistant = entry.type === "assistant";
    if (!isAssistant)
      continue;
    const content = entry.message?.content;
    const blocks = Array.isArray(content) ? content : [];
    for (const block of blocks) {
      const isRead = block.type === "tool_use" && block.name === "Read";
      if (isRead)
        readPaths.push(resolve(block.input.file_path));
    }
  }
  const unread: string[] = [];
  for (const file of files) {
    const wasRead = readPaths.includes(resolve(file));
    if (!wasRead)
      unread.push(file);
  }
  return unread;
}

export function collectReplyText(transcript: string): string {
  let replyText = "";
  for (const line of transcript.split("\n")) {
    if (line === "")
      continue;
    const entry = JSON.parse(line);
    const isAssistant = entry.type === "assistant";
    if (!isAssistant)
      continue;
    const content = entry.message?.content;
    const blocks = Array.isArray(content) ? content : [];
    for (const block of blocks) {
      const isText = block.type === "text";
      if (isText)
        replyText += block.text + "\n";
    }
  }
  return replyText;
}

export function findUnnamedFiles(files: string[], replyText: string): string[] {
  const unnamed: string[] = [];
  for (const file of files) {
    const wasNamed = replyText.includes(basename(file, ".json"));
    if (!wasNamed)
      unnamed.push(file);
  }
  return unnamed;
}

export async function isReaderEnabled(): Promise<boolean> {
  const listPath = resolve(import.meta.dirname, "..", readEnvValue("CLAUDE_HOOKS_LIST"));
  const { HOOKS }: { HOOKS: HookEntry[] } = await import(listPath);
  for (const hook of HOOKS) {
    const isReaderEntry = hook.event === "UserPromptSubmit" && hook.command[hook.command.length - 1].endsWith("idle-state-reader.ts");
    const isEnabled = hook.enabled;
    const isEnabledReader = isReaderEntry && isEnabled;
    if (isEnabledReader)
      return true;
  }
  return false;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const readerEnabled = await isReaderEnabled();
  if (!readerEnabled)
    process.exit(0);
  const state = readSessionState(getSessionStatePath(input.transcript_path));
  const files = state.idleStateFiles ?? [];
  if (files.length === 0)
    process.exit(0);
  const transcript = readFileSync(input.transcript_path, "utf8");
  const firstTurn = isFirstTurn(transcript);
  if (!firstTurn)
    process.exit(0);
  const unread = findUnreadFiles(files, transcript);
  const unnamed = findUnnamedFiles(files, collectReplyText(transcript) + (input.last_assistant_message ?? ""));
  const allRead = unread.length === 0;
  const allNamed = unnamed.length === 0;
  const allDone = allRead && allNamed;
  if (allDone)
    process.exit(0);
  let reason = "Before you end your first turn, read each idle-state file and tell the user about the recent work in it.";
  if (unread.length > 0)
    reason += `\nNot read yet:\n${unread.join("\n")}`;
  if (unnamed.length > 0) {
    const names: string[] = [];
    for (const file of unnamed)
      names.push(basename(file, ".json"));
    reason += `\nNot named in your reply yet:\n${names.join("\n")}`;
  }
  reason += "\nName each file in your reply.";
  console.log(JSON.stringify({ decision: "block", reason }));
}
