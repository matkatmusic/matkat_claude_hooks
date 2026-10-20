#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { collectLists } from "./collect.ts";

function buildState(suffix: string, sessionId?: string) {
  return JSON.stringify({
    sessionId,
    not_done: [`not done ${suffix}`],
    nextSteps: { actions: [`action ${suffix}`], questions: [`question ${suffix}`] },
    traps: { rules: [`rule ${suffix}`], mistakes: [`mistake ${suffix}`] },
  });
}

function collectInFilenameOrder() {
  const root = mkdtempSync(`${tmpdir()}/catch-up-`);
  mkdirSync(`${root}/.idleState`);
  writeFileSync(`${root}/.idleState/2026-10-15-1000-bbbbbbbb.json`, buildState("new", "session-new"));
  writeFileSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`, buildState("old", "session-old"));
  writeFileSync(`${root}/.idleState/2026-10-15-0800-notes.md`, "not json at all");
  const result = collectLists(root);
  assert.deepEqual(result.not_done, [
    { text: "not done old", file: "2026-10-15-0900-aaaaaaaa", sessionId: "session-old" },
    { text: "not done new", file: "2026-10-15-1000-bbbbbbbb", sessionId: "session-new" },
  ]);
  assert.equal(result.mistakes[1].sessionId, "session-new");
  assert.equal(result.actions[1].text, "action new");
  assert.equal(result.questions[0].file, "2026-10-15-0900-aaaaaaaa");
  assert.equal(result.rules[0].text, "rule old");
  assert.equal(result.mistakes[1].text, "mistake new");
  assert.deepEqual(result.files, ["2026-10-15-0900-aaaaaaaa", "2026-10-15-1000-bbbbbbbb"]);
}

function collectWithDuplicateTexts() {
  const root = mkdtempSync(`${tmpdir()}/catch-up-`);
  mkdirSync(`${root}/.idleState`);
  writeFileSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`, buildState("same", "session-a"));
  writeFileSync(`${root}/.idleState/2026-10-15-1000-bbbbbbbb.json`, buildState("same", "session-b"));
  const result = collectLists(root);
  assert.deepEqual(result.not_done, [{ text: "not done same", file: "2026-10-15-1000-bbbbbbbb", sessionId: "session-b" }]);
  assert.equal(result.actions.length, 1);
  assert.equal(result.questions.length, 1);
  assert.equal(result.rules.length, 1);
  assert.equal(result.mistakes[0].file, "2026-10-15-1000-bbbbbbbb");
}

function collectOldFileWithoutSessionId() {
  const root = mkdtempSync(`${tmpdir()}/catch-up-`);
  mkdirSync(`${root}/.idleState`);
  writeFileSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`, buildState("old"));
  const result = collectLists(root);
  assert.equal(result.not_done[0].text, "not done old");
  assert.equal(result.not_done[0].sessionId, undefined);
  assert.equal("sessionId" in JSON.parse(JSON.stringify(result.not_done[0])), false);
}

test("reads .json files in filename order and skips other files", collectInFilenameOrder);
test("keeps one item per text with the newest file", collectWithDuplicateTexts);
test("an old state file with no sessionId still loads", collectOldFileWithoutSessionId);
