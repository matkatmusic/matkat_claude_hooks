#!/usr/bin/env node
// Reads every .json file in <root>/.idleState and prints the open-work lists as one JSON object.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type Item = { text: string; file: string; sessionId?: string };

function pushItems(list: Item[], texts: string[], file: string, sessionId?: string): void {
  for (const text of texts) {
    let existing: Item | undefined;
    for (const item of list) {
      const isSameText = item.text === text;
      if (isSameText)
        existing = item;
    }
    if (existing) {
      existing.file = file;
      existing.sessionId = sessionId;
    }
    else
      list.push({ text, file, sessionId });
  }
}

export function collectLists(root: string) {
  const folder = join(root, ".idleState");
  const names = readdirSync(folder).sort();
  const not_done: Item[] = [];
  const actions: Item[] = [];
  const questions: Item[] = [];
  const rules: Item[] = [];
  const mistakes: Item[] = [];
  const files: string[] = [];
  for (const name of names) {
    const isJson = name.endsWith(".json");
    if (!isJson)
      continue;
    const state = JSON.parse(readFileSync(join(folder, name), "utf8"));
    const file = basename(name, ".json");
    files.push(file);
    pushItems(not_done, state.not_done, file, state.sessionId);
    pushItems(actions, state.nextSteps.actions, file, state.sessionId);
    pushItems(questions, state.nextSteps.questions, file, state.sessionId);
    pushItems(rules, state.traps.rules, file, state.sessionId);
    pushItems(mistakes, state.traps.mistakes, file, state.sessionId);
  }
  return { not_done, actions, questions, rules, mistakes, files };
}

export function getProjectFolderName(root: string): string {
  return root.replace(/[^a-zA-Z0-9]/g, "-");
}

if (import.meta.main)
  console.log(JSON.stringify(collectLists(process.argv[2])));
