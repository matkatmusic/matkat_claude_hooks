#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
// Stop gate: sends the reminder once per reply, then blocks until the agent writes "done <epoch>" after it.

export const REMINDER =
  'If you reported any of the following to the user at the end of your turn:' +
  '\n- issues' +
  '\n- open decisions' +
  '\n- open TaskList items' +
  '\n- asked a question (?) (and gave choices)' +
  '\n- wrote "say the word"-style items' +
  '\n- wrote "not checked" or similar prose' +
  '\nuse AskUserQuestion to resolve them now.' +
  '\nExamples of a dropped issue at the end of your turn:' +
  '\n- "Task #20 is still open."' + 
  '\n- "Not checked: the context-exit warning"' +
  //uses ` instead of ' to correctly unwrap the real turn-done.ts path. 
  `\nIf you left no open items, run: \`node "${import.meta.dirname}/turn-done.ts"\` and then end your turn.` +
  '\nDo not repeat what you just wrote prior to, or after, running the command.';

// jfred's isGenuineUserPrompt: hook feedback (isMeta) and tool results are not prompts.
export function isPromptLine(entry: {
  type?: string;
  isMeta?: boolean;
  origin?: { kind?: string };
  message?: { content?: unknown };
}): boolean {
  // Assistant replies and system records are never prompts.
  if (entry.type !== "user")
    return false;
  // A typed or queued human message is always a prompt, even one carrying a tool result.
  if (entry.origin?.kind === "human")
    return true;
  // Any other origin (task-notification from a subagent, peer session message) is not a prompt.
  if (entry.origin?.kind !== undefined)
    return false;
  // Hook feedback and injected context are marked isMeta; skip them.
  if (entry.isMeta === true)
    return false;
  const content = entry.message?.content;
  const blocks = Array.isArray(content) ? (content as { type?: string }[]) : [];
  return !blocks.some((block) => block.type === "tool_result");
}

export function lastPromptSeconds(transcript: string): number {
  let last = 0;
  for (const line of transcript.split("\n")) {
    if (!line)
      continue;
    const entry = JSON.parse(line);
    if (isPromptLine(entry))
      last = Math.floor(Date.parse(entry.timestamp) / 1000);
  }
  return last;
}

// Lowercase substrings; the message is lowercased before matching.
export const DUMP_PHRASES = [
  "if you want",
  "if you'd like",
  "if you would like",
  "say the word",
  "tell me if",
  "let me know",
  "want me to",
  "should i ",
  "shall i ",
  "your call",
  "up to you",
  "you decide",
  "two choices",
];

export function shouldBlock(
  doneAt: number,
  remindedAt: number,
  transcript: string,
  lastMessage: string,
): boolean {
  if (remindedAt < lastPromptSeconds(transcript))
    return true;
  const lowered = lastMessage.toLowerCase();
  if (DUMP_PHRASES.some((phrase) => lowered.includes(phrase)))
    return true;
  const hasQuestionMark = lastMessage.includes("?");
  const listLinePattern = /^\s*(?:[-*] |\d+[.)] )/;
  let listLineCount = 0;
  for (const line of lastMessage.split("\n")) {
    const isListLine = listLinePattern.test(line);
    if (isListLine)
      listLineCount++;
  }
  const hasTwoListLines = listLineCount >= 2;
  if (hasQuestionMark && hasTwoListLines)
    return true;
  return !(doneAt > remindedAt);
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const path = getSessionStatePath(input.transcript_path);
  const state = readSessionState(path);
  const transcript = readFileSync(input.transcript_path, "utf8");
  const result = shouldBlock(state.done ?? 0, state.reminded ?? 0, transcript, input.last_assistant_message ?? "");
  if (!result)
    process.exit(0);
  state.reminded = Math.floor(Date.now() / 1000);
  writeSessionState(path, state);
  console.log(JSON.stringify({ decision: "block", reason: REMINDER }));
}
