#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readEnvValue } from "../shared/env.ts";
// Stop hook: blocks when the reply names work still to build that isn't on the task list.

// Lowercase substrings; the message is lowercased before matching.
export const NEEDS_BUILDING_PHRASES = [
  "still needs",
  "not yet built",
  "not built yet",
  "remains to",
  "left to do",
  "todo:",
  "follow-up:",
  "next step:",
  "needs to be written",
  "needs to be added",
];

export function needsBuildingLines(message: string): string[] {
  const lines = message.split("\n");
  const matches: string[] = [];
  for (const line of lines) {
    const lowered = line.toLowerCase();
    let hasPhrase = false;
    for (const phrase of NEEDS_BUILDING_PHRASES) {
      if (lowered.includes(phrase))
        hasPhrase = true;
    }
    if (hasPhrase)
      matches.push(line.trim());
  }
  return matches;
}

export function getLastAssistantText(transcript: string): string {
  const lines = transcript.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i])
      continue;
    const entry = JSON.parse(lines[i]);
    if (entry.type !== "assistant")
      continue;
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    let text = "";
    for (const block of blocks) {
      if (block.type === "text")
        text += block.text;
    }
    return text;
  }
  return "";
}

export function getOpenTaskSubjects(dir: string): string[] {
  if (!existsSync(dir))
    return [];
  const subjects: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json"))
      continue;
    const task = JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
    if (task.status !== "completed")
      subjects.push(task.subject);
  }
  return subjects;
}

// ponytail: word-count overlap, no meaning check — a differently-worded match still reads as unlisted.
function longWords(text: string): string[] {
  const minimumWordLength = Number(readEnvValue("CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH"));
  const pieces = text.toLowerCase().split(/[^a-z]+/);
  const words: string[] = [];
  for (const piece of pieces) {
    if (piece.length >= minimumWordLength)
      words.push(piece);
  }
  return words;
}

export function isListed(line: string, subjects: string[]): boolean {
  const minimumSharedWords = Number(readEnvValue("CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS"));
  const lineWords = longWords(line);
  for (const subject of subjects) {
    const subjectWords = longWords(subject);
    let sharedCount = 0;
    for (const lineWord of lineWords) {
      let foundInSubject = false;
      for (const subjectWord of subjectWords) {
        if (lineWord === subjectWord)
          foundInSubject = true;
      }
      if (foundInSubject)
        sharedCount++;
    }
    if (sharedCount >= minimumSharedWords)
      return true;
  }
  return false;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.stop_hook_active)
    process.exit(0);

  const transcript = readFileSync(input.transcript_path, "utf8");
  const message = getLastAssistantText(transcript);
  const lines = needsBuildingLines(message);
  if (lines.length === 0)
    process.exit(0);

  const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID ?? input.session_id;
  const subjects = getOpenTaskSubjects(`${readEnvValue("CLAUDE_HOOKS_TASKS_DIR")}/${taskListId}`);

  const unlisted: string[] = [];
  for (const line of lines) {
    if (!isListed(line, subjects))
      unlisted.push(line);
  }
  if (unlisted.length === 0)
    process.exit(0);

  let bulletedList = "";
  for (const line of unlisted)
    bulletedList += `\n- ${line}`;
  const reason = `These items are not on the task list. Add each with TaskCreate, then end the turn:${bulletedList}`;
  console.log(JSON.stringify({ decision: "block", reason }));
}
