#!/usr/bin/env node
// Runs the TypeSafe questions that merge items and drop items that a completed task covers.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { choice, type ChoiceQuestion, type ChoiceResponse, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { Item } from "./collect.ts";
import { buildStamp } from "./writeMerged.ts";

type AnswerMap = Record<string, ChoiceResponse>;
type LogEntry = { step: string; itemTexts: string[]; answers: AnswerMap };
export type TypesafeLog = LogEntry[];

// ponytail: placeholder until test runs show real confidence values
export const DROP_THRESHOLD = 0.5;
// ponytail: no documented max, raise if the service allows
const MAX_QUESTIONS_PER_REQUEST = 100;
// ponytail: each question holds every completed task; about 600 completed tasks at 3 per request pass 64k tokens again (task #255)
const MAX_COMPLETED_QUESTIONS_PER_REQUEST = 3;

export async function sendQuestions(client: TypeSafeClient, step: string, state: any, questions: Record<string, ChoiceQuestion>, itemTexts: string[], batchSize: number, log: TypesafeLog): Promise<AnswerMap> {
  const names = Object.keys(questions);
  const allAnswers: AnswerMap = {};
  for (let start = 0; start < names.length; start += batchSize) {
    const batch: Record<string, ChoiceQuestion> = {};
    for (const name of names.slice(start, start + batchSize))
      batch[name] = questions[name];
    const response = await client.systemOne({ state, questions: batch });
    const answers = response.answers as AnswerMap;
    Object.assign(allAnswers, answers);
    log.push({ step, itemTexts, answers });
  }
  return allAnswers;
}

export async function mergeSameMeaningItems(client: TypeSafeClient, items: Item[], listName: string, log: TypesafeLog): Promise<Item[]> {
  const questions: Record<string, ChoiceQuestion> = {};
  const pairs: { name: string; older: number }[] = [];
  for (let older = 0; older < items.length; older++) {
    for (let newer = older + 1; newer < items.length; newer++) {
      const name = `pair_${older}_${newer}`;
      questions[name] = choice(`Do \`items[${older}].text\` and \`items[${newer}].text\` say the same thing using different words?`, { yes: null, no: null, unclear: null });
      pairs.push({ name, older });
    }
  }
  const itemTexts: string[] = [];
  for (const item of items)
    itemTexts.push(item.text);
  const answers = await sendQuestions(client, `merge:${listName}`, { items }, questions, itemTexts, MAX_QUESTIONS_PER_REQUEST, log);
  const olderDuplicates = new Set<number>();
  for (const pair of pairs) {
    const isSameThing = answers[pair.name].choice === "yes";
    if (isSameThing)
      olderDuplicates.add(pair.older);
  }
  const kept: Item[] = [];
  for (let index = 0; index < items.length; index++) {
    const isOlderDuplicate = olderDuplicates.has(index);
    if (!isOlderDuplicate)
      kept.push(items[index]);
  }
  return kept;
}

export async function removeCompletedItems(client: TypeSafeClient, items: Item[], tasksFolder: string, listName: string, log: TypesafeLog): Promise<Item[]> {
  const criteria: Record<string, string> = {};
  for (const name of readdirSync(tasksFolder).sort()) {
    const isJson = name.endsWith(".json");
    if (!isJson)
      continue;
    const task = JSON.parse(readFileSync(join(tasksFolder, name), "utf8"));
    const isCompleted = task.status === "completed";
    if (isCompleted)
      criteria[`task_${task.id}`] = task.subject;
  }
  criteria.none = "No completed task matches this item.";
  const questions: Record<string, ChoiceQuestion> = {};
  const itemTexts: string[] = [];
  for (let index = 0; index < items.length; index++) {
    questions[`item_${index}`] = choice(`Which completed task-list entry does \`items[${index}].text\` most closely match?`, criteria);
    itemTexts.push(items[index].text);
  }
  const answers = await sendQuestions(client, `completed:${listName}`, { items }, questions, itemTexts, MAX_COMPLETED_QUESTIONS_PER_REQUEST, log);
  const kept: Item[] = [];
  for (let index = 0; index < items.length; index++) {
    const answer = answers[`item_${index}`];
    const isMatch = answer.choice !== "none";
    const isConfident = answer.probabilities[answer.choice] > DROP_THRESHOLD;
    const isDone = isMatch && isConfident;
    if (!isDone)
      kept.push(items[index]);
  }
  return kept;
}

export function writeTypesafeLog(root: string, log: TypesafeLog, now: Date): void {
  const archive = join(root, ".idleState", "archive");
  mkdirSync(archive, { recursive: true });
  writeFileSync(join(archive, `${buildStamp(now)}-typesafe.json`), JSON.stringify(log, null, 2));
}
