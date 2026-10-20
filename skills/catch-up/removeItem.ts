#!/usr/bin/env node
/* Disabled: writeMerged.ts replaces this file.
// Removes one item text from the 5 lists of <root>/.idleState/<file>.json and every other .json file there.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

function removeFromFile(path: string, text: string): number {
  const state = JSON.parse(readFileSync(path, "utf8"));
  let removed = 0;
  removed += removeText(state.not_done, text);
  removed += removeText(state.nextSteps.actions, text);
  removed += removeText(state.nextSteps.questions, text);
  removed += removeText(state.traps.rules, text);
  removed += removeText(state.traps.mistakes, text);
  const hasRemoved = removed > 0;
  if (hasRemoved)
    writeFileSync(path, JSON.stringify(state, null, 2));
  return removed;
}

export function removeItem(root: string, text: string, file: string): void {
  const folder = join(root, ".idleState");
  const path = join(folder, `${file}.json`);
  const isMissing = removeFromFile(path, text) === 0;
  if (isMissing)
    throw new Error(`Item not found in ${path}: ${text}`);
  for (const name of readdirSync(folder)) {
    const isOtherJson = name.endsWith(".json") && name !== `${file}.json`;
    if (isOtherJson)
      removeFromFile(join(folder, name), text);
  }
}

if (import.meta.main) {
  const pairs = process.argv.slice(2);
  const isOdd = pairs.length % 2 !== 0;
  if (isOdd)
    throw new Error(`Expected "<text>" "<file>" pairs, got ${pairs.length} arguments`);
  const seenTexts = new Set<string>();
  for (let index = 0; index < pairs.length; index += 2) {
    const isRepeat = seenTexts.has(pairs[index]);
    if (isRepeat)
      continue;
    seenTexts.add(pairs[index]);
    removeItem(process.cwd(), pairs[index], pairs[index + 1]);
  }
}
*/
