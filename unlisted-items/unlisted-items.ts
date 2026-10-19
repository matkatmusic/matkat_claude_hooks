#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { getSetting } from "../shared/settings.ts";
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
      kept += char === "\n" ? "\n" : " ";
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

export function findNeedsBuildingLines(message: string): string[] {
  const lines = message.split("\n");
  const unquotedLines = removeQuotedText(message).split("\n");
  const matches: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lowered = unquotedLines[i].toLowerCase();
    let hasPhrase = false;
    for (const phrase of NEEDS_BUILDING_PHRASES) {
      const isPhraseFound = lowered.includes(phrase);
      if (isPhraseFound)
        hasPhrase = true;
    }
    if (hasPhrase)
      matches.push(lines[i].trim());
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
  const isDirPresent = existsSync(dir);
  if (!isDirPresent)
    return [];
  const subjects: string[] = [];
  for (const name of readdirSync(dir)) {
    const isJsonFile = name.endsWith(".json");
    if (!isJsonFile)
      continue;
    const task = JSON.parse(readFileSync(`${dir}/${name}`, "utf8"));
    if (task.status !== "completed")
      subjects.push(task.subject);
  }
  return subjects;
}

const MIN_LINE_SHARE_RATIO = 0.5;

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "being", "could", "doing", "each",
  "every", "from", "have", "having", "into", "just", "more", "most", "other", "should",
  "still", "than", "that", "their", "them", "then", "there", "these", "they", "this",
  "those", "through", "under", "until", "were", "what", "when", "where", "which", "while",
  "will", "with", "without", "would", "needs", "needed", "need", "built", "building", "build",
]);

const STEM_SUFFIXES = ["ing", "ed", "es", "s"];

function getWordStem(word: string): string {
  let stem = word;
  for (const suffix of STEM_SUFFIXES) {
    const isLongEnough = stem.length - suffix.length >= 3;
    const isSuffixed = stem.endsWith(suffix);
    const isDoubleS = suffix === "s" && stem.endsWith("ss");
    const isStrippable = isSuffixed && isLongEnough;
    const shouldStrip = isStrippable && !isDoubleS;
    if (shouldStrip) {
      stem = stem.slice(0, stem.length - suffix.length);
      break;
    }
  }
  const hasTrailingE = stem.endsWith("e") && stem.length > 3;
  return hasTrailingE ? stem.slice(0, stem.length - 1) : stem;
}

function getContentStems(text: string, minimumWordLength: number): string[] {
  let lowered = text.toLowerCase();
  for (const phrase of NEEDS_BUILDING_PHRASES)
    lowered = lowered.split(phrase).join(" ");
  const pieces = lowered.split(/[^a-z]+/);
  const stems: string[] = [];
  for (const piece of pieces) {
    const isLongEnough = piece.length >= minimumWordLength;
    const isStopWord = STOP_WORDS.has(piece);
    const isContentWord = isLongEnough && !isStopWord;
    if (isContentWord)
      stems.push(getWordStem(piece));
  }
  return stems;
}

export function isListed(line: string, subjects: string[], minimumWordLength: number, minimumSharedWords: number): boolean {
  const lineStems = new Set(getContentStems(line, minimumWordLength));
  for (const subject of subjects) {
    const subjectStems = new Set(getContentStems(subject, minimumWordLength));
    let sharedCount = 0;
    for (const lineStem of lineStems) {
      const isShared = subjectStems.has(lineStem);
      if (isShared)
        sharedCount++;
    }
    const shareRatio = sharedCount / lineStems.size;
    const isEnoughShared = sharedCount >= minimumSharedWords;
    const isEnoughRatio = shareRatio >= MIN_LINE_SHARE_RATIO;
    const isMatch = isEnoughShared && isEnoughRatio;
    if (isMatch)
      return true;
  }
  return false;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (input.stop_hook_active)
    process.exit(0);

  const message = input.last_assistant_message ?? "";
  const lines = findNeedsBuildingLines(message);
  if (lines.length === 0)
    process.exit(0);

  const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID ?? input.session_id;
  const subjects = getOpenTaskSubjects(`${getSetting(input, "CLAUDE_HOOKS_TASKS_DIR")}/${taskListId}`);
  const minimumWordLength = Number(getSetting(input, "CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH"));
  const minimumSharedWords = Number(getSetting(input, "CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS"));

  const unlisted: string[] = [];
  for (const line of lines) {
    const isLineListed = isListed(line, subjects, minimumWordLength, minimumSharedWords);
    if (!isLineListed)
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
