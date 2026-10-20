#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { collectLists } from "./collect.ts";
import { writeMerged } from "./writeMerged.ts";

function buildInput(files: string[]) {
  return { not_done: ["a"], actions: ["b"], questions: ["c"], rules: ["d"], mistakes: ["e"], files };
}

function buildRoot() {
  const root = mkdtempSync(`${tmpdir()}/catch-up-`);
  mkdirSync(`${root}/.idleState`);
  writeFileSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`, JSON.stringify({
    not_done: [],
    nextSteps: { actions: [], questions: [] },
    traps: { rules: [], mistakes: [] },
  }));
  return root;
}

function writeMergedFileWithLocalStamp() {
  const root = buildRoot();
  writeMerged(root, buildInput([]), new Date(2026, 9, 19, 8, 5));
  const path = `${root}/.idleState/2026-10-19-0805-merged.json`;
  const state = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(state, {
    not_done: ["a"],
    nextSteps: { actions: ["b"], questions: ["c"] },
    traps: { rules: ["d"], mistakes: ["e"] },
  });
  const result = collectLists(root);
  assert.deepEqual(result.files, ["2026-10-15-0900-aaaaaaaa", "2026-10-19-0805-merged"]);
  assert.equal(result.mistakes[0].text, "e");
}

function moveReadFilesToArchive() {
  const root = buildRoot();
  writeMerged(root, buildInput(["2026-10-15-0900-aaaaaaaa"]), new Date());
  assert.equal(existsSync(`${root}/.idleState/2026-10-15-0900-aaaaaaaa.json`), false);
  assert.equal(existsSync(`${root}/.idleState/archive/2026-10-15-0900-aaaaaaaa.json`), true);
}

function deleteArchiveFilesOlderThanSevenDays() {
  const root = buildRoot();
  mkdirSync(`${root}/.idleState/archive`);
  writeFileSync(`${root}/.idleState/archive/old.json`, "{}");
  writeFileSync(`${root}/.idleState/archive/recent.json`, "{}");
  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  utimesSync(`${root}/.idleState/archive/old.json`, eightDaysAgo, eightDaysAgo);
  utimesSync(`${root}/.idleState/archive/recent.json`, sixDaysAgo, sixDaysAgo);
  writeMerged(root, buildInput([]), now);
  assert.equal(existsSync(`${root}/.idleState/archive/old.json`), false);
  assert.equal(existsSync(`${root}/.idleState/archive/recent.json`), true);
}

test("writes the merged file with a local time stamp that collect reads", writeMergedFileWithLocalStamp);
test("moves the read files to the archive folder", moveReadFilesToArchive);
test("deletes archive files older than 7 days", deleteArchiveFilesOlderThanSevenDays);
