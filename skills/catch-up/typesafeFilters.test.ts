#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { mergeSameMeaningItems, removeCompletedItems, writeTypesafeLog } from "./typesafeFilters.ts";
import type { TypeSafeClient } from "@typesafe-ai/sdk";

type Decision = { choice: string; probability: number };

function buildFakeClient(decide: (name: string, instructions: string) => Decision) {
  const requests: any[] = [];
  const client = {
    async systemOne(request: any) {
      requests.push(request);
      const answers: any = {};
      for (const name of Object.keys(request.questions)) {
        const decision = decide(name, request.questions[name].instructions);
        answers[name] = {
          type: "choice",
          choice: decision.choice,
          confidence: decision.probability,
          probabilities: { [decision.choice]: decision.probability },
        };
      }
      return { answers };
    },
  };
  return { client: client as unknown as TypeSafeClient, requests };
}

function buildItems(...texts: string[]) {
  return texts.map((text) => ({ text, file: "2026-10-15-0900-aaaaaaaa", sessionId: "s" }));
}

async function mergeDropsOlderOnYesKeepsOnUnclear() {
  const { client, requests } = buildFakeClient((name) => {
    if (name === "pair_0_1")
      return { choice: "yes", probability: 0.9 };
    if (name === "pair_1_2")
      return { choice: "unclear", probability: 0.9 };
    return { choice: "no", probability: 0.9 };
  });
  const kept = await mergeSameMeaningItems(client, buildItems("a", "b", "c"), "actions", []);
  assert.deepEqual(kept.map((item) => item.text), ["b", "c"]);
  assert.equal(kept[0].file, "2026-10-15-0900-aaaaaaaa");
  assert.equal(kept[0].sessionId, "s");
  assert.equal(requests.length, 1);
  assert.deepEqual(Object.keys(requests[0].questions), ["pair_0_1", "pair_0_2", "pair_1_2"]);
  assert.match(requests[0].questions.pair_0_2.instructions, /items\[0\]\.text.*items\[2\]\.text/);
}

async function mergeBatchesAtOneHundredQuestions() {
  const { client, requests } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  const texts = Array.from({ length: 15 }, (_, index) => `item ${index}`);
  const kept = await mergeSameMeaningItems(client, buildItems(...texts), "rules", []);
  assert.equal(kept.length, 15);
  assert.equal(requests.length, 2);
  assert.equal(Object.keys(requests[0].questions).length, 100);
  assert.equal(Object.keys(requests[1].questions).length, 5);
}

async function mergeSkipsPairsThatDifferOnlyByTaskPrefix() {
  const { client, requests } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  const kept = await mergeSameMeaningItems(client, buildItems("Task #1: x", "#1: x"), "actions", []);
  assert.equal(requests.length, 0);
  assert.deepEqual(kept.map((item) => item.text), ["#1: x"]);
}

async function mergeSendsNothingForOneItem() {
  const { client, requests } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  const kept = await mergeSameMeaningItems(client, buildItems("only"), "rules", []);
  assert.equal(kept.length, 1);
  assert.equal(requests.length, 0);
}

async function completedTasksDropAboveThresholdOnly() {
  const tasksFolder = mkdtempSync(`${tmpdir()}/catch-up-tasks-`);
  writeFileSync(`${tasksFolder}/1.json`, JSON.stringify({ id: "1", subject: "Fix the bug", status: "completed" }));
  writeFileSync(`${tasksFolder}/2.json`, JSON.stringify({ id: "2", subject: "Open work", status: "pending" }));
  writeFileSync(`${tasksFolder}/.lock`, "not json");
  const { client, requests } = buildFakeClient((name) => {
    if (name === "item_0_from_0")
      return { choice: "task_1", probability: 0.9 };
    if (name === "item_1_from_0")
      return { choice: "task_1", probability: 0.4 };
    return { choice: "none", probability: 0.99 };
  });
  const kept = await removeCompletedItems(client, buildItems("a", "b", "c"), tasksFolder, "not_done", []);
  assert.deepEqual(kept.map((item) => item.text), ["b", "c"]);
  const labels = requests[0].questions.item_0_from_0.criteria;
  assert.deepEqual(Object.keys(labels), ["task_1", "none"]);
  assert.equal(labels.task_1, "Fix the bug");
}

async function completedStepBatchesAtThreeQuestions() {
  const tasksFolder = mkdtempSync(`${tmpdir()}/catch-up-tasks-`);
  writeFileSync(`${tasksFolder}/1.json`, JSON.stringify({ id: "1", subject: "Fix the bug", status: "completed" }));
  const { client, requests } = buildFakeClient(() => ({ choice: "none", probability: 0.99 }));
  const texts = Array.from({ length: 7 }, (_, index) => `item ${index}`);
  const kept = await removeCompletedItems(client, buildItems(...texts), tasksFolder, "not_done", []);
  assert.equal(kept.length, 7);
  assert.equal(requests.length, 3);
  assert.equal(Object.keys(requests[0].questions).length, 3);
  assert.equal(Object.keys(requests[1].questions).length, 3);
  assert.equal(Object.keys(requests[2].questions).length, 1);
}

async function completedStepSplitsTasksAtTwoHundredFiftyFiveCriteria() {
  const tasksFolder = mkdtempSync(`${tmpdir()}/catch-up-tasks-`);
  for (let id = 1; id <= 300; id++)
    writeFileSync(`${tasksFolder}/${id}.json`, JSON.stringify({ id: String(id), subject: `Task ${id}`, status: "completed" }));
  // sorted as text, 99.json sorts last, so task_99 sits in the second group
  const { client, requests } = buildFakeClient((name) => {
    if (name === "item_0_from_254")
      return { choice: "task_99", probability: 0.9 };
    return { choice: "none", probability: 0.99 };
  });
  const kept = await removeCompletedItems(client, buildItems("a", "b"), tasksFolder, "not_done", []);
  assert.deepEqual(kept.map((item) => item.text), ["b"]);
  for (const request of requests) {
    for (const name of Object.keys(request.questions)) {
      const criteriaCount = Object.keys(request.questions[name].criteria).length;
      assert.ok(criteriaCount <= 255, `${name} has ${criteriaCount} criteria`);
    }
  }
}

async function logHoldsItemTextAndAnswers() {
  const root = mkdtempSync(`${tmpdir()}/catch-up-log-`);
  mkdirSync(`${root}/.idleState`);
  const log: any[] = [];
  const { client } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  await mergeSameMeaningItems(client, buildItems("a", "b"), "actions", log);
  writeTypesafeLog(root, log, new Date(2026, 9, 22, 9, 5));
  const names = readdirSync(`${root}/.idleState/archive`);
  assert.deepEqual(names, ["2026-10-22-0905-typesafe.json"]);
  const written = JSON.parse(readFileSync(`${root}/.idleState/archive/${names[0]}`, "utf8"));
  assert.equal(written[0].step, "merge:actions");
  assert.deepEqual(written[0].itemTexts, ["a", "b"]);
  assert.equal(written[0].answers.pair_0_1.choice, "no");
  assert.equal(written[0].answers.pair_0_1.confidence, 0.9);
}

test("merge drops the older item on yes and keeps both on unclear", mergeDropsOlderOnYesKeepsOnUnclear);
test("merge sends at most 100 questions per request", mergeBatchesAtOneHundredQuestions);
test("merge skips pairs that differ only by a Task prefix", mergeSkipsPairsThatDifferOnlyByTaskPrefix);
test("merge sends nothing for one item", mergeSendsNothingForOneItem);
test("completed tasks drop an item only above the threshold", completedTasksDropAboveThresholdOnly);
test("completed step sends at most 3 questions per request", completedStepBatchesAtThreeQuestions);
test("completed step keeps each question at 255 criteria or fewer", completedStepSplitsTasksAtTwoHundredFiftyFiveCriteria);
test("the log file holds item text and answers", logHoldsItemTextAndAnswers);
