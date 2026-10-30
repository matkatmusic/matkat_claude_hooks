#!/usr/bin/env node
// Drops rules and mistakes that a memory file or a CLAUDE.md file already holds.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { choice, type ChoiceQuestion, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { Item } from "./collect.ts";
import { DROP_THRESHOLD, sendQuestions, type TypesafeLog } from "./typesafeFilters.ts";

const MAX_KNOWN_TRAP_QUESTIONS_PER_REQUEST = 3;

function readMemoryDescription(path: string): string {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const isDescription = line.startsWith("description: ");
    if (isDescription)
      return line.slice("description: ".length);
  }
  throw new Error(`Memory file has no description line: ${path}`);
}

export async function removeKnownTraps(client: TypeSafeClient, rules: Item[], mistakes: Item[], memoryFolder: string, globalClaudeMdPath: string, projectClaudeMdPath: string, log: TypesafeLog) {
  const hasMemory = existsSync(memoryFolder);
  const hasProjectClaudeMd = existsSync(projectClaudeMdPath);
  const memoryCriteria: Record<string, string> = {};
  if (hasMemory) {
    for (const name of readdirSync(memoryFolder).sort()) {
      const isIndex = name === "MEMORY.md";
      const isSubfolder = statSync(join(memoryFolder, name)).isDirectory();
      if (!isIndex && !isSubfolder)
        memoryCriteria[name] = readMemoryDescription(join(memoryFolder, name));
    }
    // ponytail: about 450 memory files at 3 questions per request pass 64k tokens again; size batches by measured tokens (task #255)
    memoryCriteria.none = "No memory matches this item.";
  }
  const state: Record<string, unknown> = { rules, mistakes, globalClaudeMd: readFileSync(globalClaudeMdPath, "utf8") };
  if (hasProjectClaudeMd)
    state.projectClaudeMd = readFileSync(projectClaudeMdPath, "utf8");
  const groups = [
    { key: "rules", noun: "rule", items: rules },
    { key: "mistakes", noun: "mistake", items: mistakes },
  ];
  const questions: Record<string, ChoiceQuestion> = {};
  const itemTexts: string[] = [];
  for (const group of groups) {
    for (let index = 0; index < group.items.length; index++) {
      const path = `${group.key}[${index}].text`;
      itemTexts.push(group.items[index].text);
      if (hasMemory)
        questions[`${group.key}_${index}_memory`] = choice(`Which memory most closely matches this ${group.noun}: \`${path}\`?`, memoryCriteria);
      questions[`${group.key}_${index}_global`] = choice(`Does \`globalClaudeMd\` contain or mention what \`${path}\` describes?`, { yes: null, no: null, unsure: null });
      if (hasProjectClaudeMd)
        questions[`${group.key}_${index}_project`] = choice(`Does \`projectClaudeMd\` contain or mention what \`${path}\` describes?`, { yes: null, no: null, unsure: null });
    }
  }
  const answers = await sendQuestions(client, "known-traps", state, questions, itemTexts, MAX_KNOWN_TRAP_QUESTIONS_PER_REQUEST, log);
  const keptByKey: Record<string, Item[]> = { rules: [], mistakes: [] };
  for (const group of groups) {
    for (let index = 0; index < group.items.length; index++) {
      const memoryAnswer = answers[`${group.key}_${index}_memory`];
      const globalAnswer = answers[`${group.key}_${index}_global`];
      const projectAnswer = answers[`${group.key}_${index}_project`];
      let isKnown = false;
      if (memoryAnswer) {
        const isMemoryMatch = memoryAnswer.choice !== "none";
        const isMemoryConfident = memoryAnswer.probabilities[memoryAnswer.choice] > DROP_THRESHOLD;
        const isInMemory = isMemoryMatch && isMemoryConfident;
        if (isInMemory)
          isKnown = true;
      }
      const isInGlobal = globalAnswer.choice === "yes" && globalAnswer.probabilities.yes > DROP_THRESHOLD;
      if (isInGlobal)
        isKnown = true;
      if (projectAnswer) {
        const isInProject = projectAnswer.choice === "yes" && projectAnswer.probabilities.yes > DROP_THRESHOLD;
        if (isInProject)
          isKnown = true;
      }
      if (!isKnown)
        keptByKey[group.key].push(group.items[index]);
    }
  }
  return { rules: keptByKey.rules, mistakes: keptByKey.mistakes };
}
