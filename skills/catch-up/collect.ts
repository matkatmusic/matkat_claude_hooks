#!/usr/bin/env node
// Reads every .json file in <root>/.idleState and prints the open-work lists as one JSON object.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type Item = { text: string; file: string };

function pushItems(list: Item[], texts: string[], file: string): void {
  for (const text of texts) {
    let existing: Item | undefined;
    for (const item of list) {
      const isSameText = item.text === text;
      if (isSameText)
        existing = item;
    }
    if (existing)
      existing.file = file;
    else
      list.push({ text, file });
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
  for (const name of names) {
    const isJson = name.endsWith(".json");
    if (!isJson)
      continue;
    const state = JSON.parse(readFileSync(join(folder, name), "utf8"));
    const file = basename(name, ".json");
    pushItems(not_done, state.not_done, file);
    pushItems(actions, state.nextSteps.actions, file);
    pushItems(questions, state.nextSteps.questions, file);
    pushItems(rules, state.traps.rules, file);
    pushItems(mistakes, state.traps.mistakes, file);
  }
  return { not_done, actions, questions, rules, mistakes };
}

if (import.meta.main)
  console.log(JSON.stringify(collectLists(process.argv[2])));
