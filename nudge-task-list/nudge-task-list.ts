#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { checkTaskListId } from "../shared/task-list-id.ts";
// Stop hook: when the reply announces work is starting, tell the agent to use the task list.

export const NUDGE =
  'You are starting work on a task. Make or add to the project\'s task list (TaskCreate) before you continue. Delegate the build to subagents. If the work has two or more features that touch the same files, give each feature its own subagent in its own worktree (Agent isolation: "worktree") and merge afterward.';

export const NO_ID_NOTE =
  " Tell the user that CLAUDE_CODE_TASK_LIST_ID is not set. Setting it lets the task list persist across sessions in this project.";

// Lowercase substrings; the message is lowercased before matching.
export const STARTING_WORK_PHRASES = [
  "things to do",
  "tasks to do",
  "steps to do",
  "items to do",
  "starting on",
  "starting with",
  "fanning out",
];

const QUOTE_CLOSERS: Record<string, string> = { '"': '"', "“": "”", "`": "`" };

function removeQuotedText(message: string): string {
  let kept = "";
  let closer = "";
  for (const char of message) {
    const isInQuote = closer !== "";
    if (isInQuote) {
      const isCloser = char === closer;
      if (isCloser)
        closer = "";
      kept += " ";
      continue;
    }
    const opened = QUOTE_CLOSERS[char] ?? "";
    const isOpener = opened !== "";
    if (isOpener) {
      closer = opened;
      kept += " ";
      continue;
    }
    kept += char;
  }
  return kept;
}

export function isStartingWork(message: string): boolean {
  const unquoted = removeQuotedText(message).toLowerCase();
  const words = unquoted.replace(/[^a-z0-9]+/g, " ");
  const paddedWords = ` ${words} `;
  for (const phrase of STARTING_WORK_PHRASES) {
    const isPhraseFound = paddedWords.includes(` ${phrase} `);
    if (isPhraseFound)
      return true;
  }
  return false;
}

export function getReason(taskListId: string | undefined, setupHelp: string): string {
  return taskListId ? NUDGE : `${NUDGE}${NO_ID_NOTE} Show the user this setup help:\n${setupHelp}`;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.stop_hook_active)
    process.exit(0);
  const isStarting = isStartingWork(input.last_assistant_message ?? "");
  if (!isStarting)
    process.exit(0);
  const setupHelp = checkTaskListId(process.env.CLAUDE_CODE_TASK_LIST_ID) ?? "";
  console.log(JSON.stringify({ decision: "block", reason: getReason(process.env.CLAUDE_CODE_TASK_LIST_ID, setupHelp) }));
}
