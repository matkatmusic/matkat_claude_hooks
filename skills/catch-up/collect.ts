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

type StateLists = { sessionId?: string; not_done: string[]; actions: string[]; questions: string[]; rules: string[]; mistakes: string[] };

function parseVersion1State(state: any): StateLists {
  return {
    sessionId: state.sessionId,
    not_done: state.not_done,
    actions: state.nextSteps.actions,
    questions: state.nextSteps.questions,
    rules: state.traps.rules,
    mistakes: state.traps.mistakes,
  };
}

function parseVersion2State(state: any): StateLists {
  return {
    sessionId: state.sessionId,
    not_done: state.not_done,
    actions: state.nextSteps.actions,
    questions: state.nextSteps.questions,
    rules: state.traps.rules,
    mistakes: state.traps.mistakes,
  };
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
    const fileState = JSON.parse(readFileSync(join(folder, name), "utf8"));
    let state: StateLists;
    const isVersion1 = fileState.version === undefined;
    const isVersion2 = fileState.version === 2;
    if (isVersion1)
      state = parseVersion1State(fileState);
    else if (isVersion2)
      state = parseVersion2State(fileState);
    else
      throw new Error(`Unknown state file version ${fileState.version} in ${join(folder, name)}`);
    const file = basename(name, ".json");
    files.push(file);
    pushItems(not_done, state.not_done, file, state.sessionId);
    pushItems(actions, state.actions, file, state.sessionId);
    pushItems(questions, state.questions, file, state.sessionId);
    pushItems(rules, state.rules, file, state.sessionId);
    pushItems(mistakes, state.mistakes, file, state.sessionId);
  }
  return { not_done, actions, questions, rules, mistakes, files };
}

export function getProjectFolderName(root: string): string {
  return root.replace(/[^a-zA-Z0-9]/g, "-");
}

if (import.meta.main)
  console.log(JSON.stringify(collectLists(process.argv[2])));
