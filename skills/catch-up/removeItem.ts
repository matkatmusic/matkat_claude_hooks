#!/usr/bin/env node
// Removes one item text from the 5 lists of <root>/.idleState/<file>.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function removeText(list: string[], text: string): number {
  let removed = 0;
  for (let index = list.length - 1; index >= 0; index--) {
    const isMatch = list[index] === text;
    if (isMatch) {
      list.splice(index, 1);
      removed++;
    }
  }
  return removed;
}

export function removeItem(root: string, text: string, file: string): void {
  const path = join(root, ".idleState", `${file}.json`);
  const state = JSON.parse(readFileSync(path, "utf8"));
  let removed = 0;
  removed += removeText(state.not_done, text);
  removed += removeText(state.nextSteps.actions, text);
  removed += removeText(state.nextSteps.questions, text);
  removed += removeText(state.traps.rules, text);
  removed += removeText(state.traps.mistakes, text);
  const isMissing = removed === 0;
  if (isMissing)
    throw new Error(`Item not found in ${path}: ${text}`);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

if (import.meta.main)
  removeItem(process.cwd(), process.argv[2], process.argv[3]);
