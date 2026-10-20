#!/usr/bin/env node
/* Disabled: removeItem.ts is disabled.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { removeItem } from "./removeItem.ts";

function buildRoot() {
  const root = mkdtempSync(`${tmpdir()}/catch-up-`);
  mkdirSync(`${root}/.idleState`);
  writeFileSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`, JSON.stringify({
    not_done: ["keep me", "remove me"],
    nextSteps: { actions: ["remove me"], questions: ["a question"] },
    traps: { rules: ["a rule"], mistakes: ["remove me"] },
  }));
  return root;
}

function removeItemFromEveryList() {
  const root = buildRoot();
  removeItem(root, "remove me", "2026-10-15-0900-aaaaaaaa");
  const state = JSON.parse(readFileSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`, "utf8"));
  assert.deepEqual(state.not_done, ["keep me"]);
  assert.deepEqual(state.nextSteps.actions, []);
  assert.deepEqual(state.nextSteps.questions, ["a question"]);
  assert.deepEqual(state.traps.rules, ["a rule"]);
  assert.deepEqual(state.traps.mistakes, []);
}

function assertThrowsWhenTextIsMissing() {
  const root = buildRoot();
  function removeMissingItem() {
    removeItem(root, "not in any list", "2026-10-15-0900-aaaaaaaa");
  }
  assert.throws(removeMissingItem);
}

function removeItemFromOtherFiles() {
  const root = buildRoot();
  writeFileSync(`${root}/.idleState/2026-10-16-0900-bbbbbbbb.json`, JSON.stringify({
    not_done: ["remove me", "other item"],
    nextSteps: { actions: [], questions: [] },
    traps: { rules: [], mistakes: [] },
  }));
  removeItem(root, "remove me", "2026-10-15-0900-aaaaaaaa");
  const otherState = JSON.parse(readFileSync(`${root}/.idleState/2026-10-16-0900-bbbbbbbb.json`, "utf8"));
  assert.deepEqual(otherState.not_done, ["other item"]);
}

function skipRepeatedTextOnCommandLine() {
  const root = buildRoot();
  const script = fileURLToPath(new URL("./removeItem.ts", import.meta.url));
  const file = "2026-10-15-0900-aaaaaaaa";
  const result = spawnSync("node", [script, "remove me", file, "remove me", file], { cwd: root });
  assert.equal(result.status, 0);
}

test("removes the item text from every list", removeItemFromEveryList);
test("skips a repeated text on the command line", skipRepeatedTextOnCommandLine);
test("removes the item text from other files too", removeItemFromOtherFiles);
test("throws when the item text is in no list", assertThrowsWhenTextIsMissing);
*/
