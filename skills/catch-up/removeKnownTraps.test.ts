#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { removeKnownTraps } from "./removeKnownTraps.ts";
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

function buildTrapFolders(withMemory: boolean, withProjectClaudeMd: boolean) {
  const base = mkdtempSync(`${tmpdir()}/catch-up-traps-`);
  const memoryFolder = `${base}/memory`;
  if (withMemory) {
    mkdirSync(memoryFolder);
    writeFileSync(`${memoryFolder}/MEMORY.md`, "index");
    writeFileSync(`${memoryFolder}/known.md`, "---\nname: known\ndescription: known memory summary\nmetadata:\n  type: feedback\n---\nlong body text that must not be sent\n");
  }
  writeFileSync(`${base}/global.md`, "global text");
  if (withProjectClaudeMd)
    writeFileSync(`${base}/project.md`, "project text");
  return { memoryFolder, globalPath: `${base}/global.md`, projectPath: `${base}/project.md` };
}

async function trapsDropOnMemoryOrClaudeMdAboveThreshold() {
  const folders = buildTrapFolders(true, true);
  const { client, requests } = buildFakeClient((name) => {
    if (name === "rules_0_memory")
      return { choice: "known.md", probability: 0.9 };
    if (name === "rules_1_memory")
      return { choice: "known.md", probability: 0.3 };
    if (name === "mistakes_0_global")
      return { choice: "yes", probability: 0.8 };
    if (name === "mistakes_1_project")
      return { choice: "yes", probability: 0.7 };
    if (name.endsWith("_memory"))
      return { choice: "none", probability: 0.9 };
    return { choice: "no", probability: 0.9 };
  });
  const result = await removeKnownTraps(client, buildItems("r0", "r1"), buildItems("m0", "m1", "m2"), folders.memoryFolder, folders.globalPath, folders.projectPath, []);
  assert.deepEqual(result.rules.map((item) => item.text), ["r1"]);
  assert.deepEqual(result.mistakes.map((item) => item.text), ["m2"]);
  assert.deepEqual(Object.keys(requests[0].questions.rules_0_memory.criteria), ["known.md", "none"]);
  assert.equal(requests[0].state.globalClaudeMd, "global text");
  assert.equal(requests[0].state.projectClaudeMd, "project text");
}

async function trapsSendMemoryDescriptionNotBody() {
  const folders = buildTrapFolders(true, true);
  const { client, requests } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  await removeKnownTraps(client, buildItems("r0"), buildItems("m0"), folders.memoryFolder, folders.globalPath, folders.projectPath, []);
  assert.equal(requests[0].questions.rules_0_memory.criteria["known.md"], "known memory summary");
}

async function trapsThrowWhenMemoryFileHasNoDescription() {
  const folders = buildTrapFolders(true, true);
  writeFileSync(`${folders.memoryFolder}/broken.md`, "no frontmatter here");
  const { client } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  await assert.rejects(removeKnownTraps(client, buildItems("r0"), buildItems("m0"), folders.memoryFolder, folders.globalPath, folders.projectPath, []), /broken\.md/);
}

async function trapsSkipSubfoldersInMemoryFolder() {
  const folders = buildTrapFolders(true, true);
  mkdirSync(`${folders.memoryFolder}/archive`);
  writeFileSync(`${folders.memoryFolder}/archive/old.md`, "no frontmatter here");
  const { client, requests } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  await removeKnownTraps(client, buildItems("r0"), buildItems("m0"), folders.memoryFolder, folders.globalPath, folders.projectPath, []);
  assert.deepEqual(Object.keys(requests[0].questions.rules_0_memory.criteria), ["known.md", "none"]);
}

async function trapsSkipMemoryQuestionsWhenFolderMissing() {
  const folders = buildTrapFolders(false, true);
  const { client, requests } = buildFakeClient(() => ({ choice: "no", probability: 0.9 }));
  const result = await removeKnownTraps(client, buildItems("r0"), buildItems("m0"), folders.memoryFolder, folders.globalPath, folders.projectPath, []);
  assert.equal(result.rules.length, 1);
  assert.deepEqual([...Object.keys(requests[0].questions), ...Object.keys(requests[1].questions)], ["rules_0_global", "rules_0_project", "mistakes_0_global", "mistakes_0_project"]);
}

async function trapsSkipProjectQuestionsWhenClaudeMdMissing() {
  const folders = buildTrapFolders(true, false);
  const { client, requests } = buildFakeClient((name) => name.endsWith("_memory") ? { choice: "none", probability: 0.9 } : { choice: "no", probability: 0.9 });
  const result = await removeKnownTraps(client, buildItems("r0"), buildItems("m0"), folders.memoryFolder, folders.globalPath, folders.projectPath, []);
  assert.equal(result.mistakes.length, 1);
  assert.deepEqual([...Object.keys(requests[0].questions), ...Object.keys(requests[1].questions)], ["rules_0_memory", "rules_0_global", "mistakes_0_memory", "mistakes_0_global"]);
  assert.equal("projectClaudeMd" in requests[0].state, false);
}

test("known traps drop on memory or CLAUDE.md above the threshold", trapsDropOnMemoryOrClaudeMdAboveThreshold);
test("known traps send the memory description, not the body", trapsSendMemoryDescriptionNotBody);
test("known traps throw when a memory file has no description", trapsThrowWhenMemoryFileHasNoDescription);
test("known traps skip subfolders in the memory folder", trapsSkipSubfoldersInMemoryFolder);
test("known traps skip memory questions when the folder is missing", trapsSkipMemoryQuestionsWhenFolderMissing);
test("known traps skip project questions when CLAUDE.md is missing", trapsSkipProjectQuestionsWhenClaudeMdMissing);
