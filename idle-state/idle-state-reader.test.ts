#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS = "86400000";
const { buildStateContext, findIdleStateFolder } = await import("./idle-state-reader.ts");

test("a subfolder of the repo finds the .idleState folder at the repo root", () => {
  const repo = mkdtempSync(`${tmpdir()}/idle-state-repo-`);
  mkdirSync(`${repo}/.git`);
  mkdirSync(`${repo}/.idleState`);
  mkdirSync(`${repo}/src/deep`, { recursive: true });
  assert.equal(findIdleStateFolder(`${repo}/src/deep`), `${repo}/.idleState`);
});

test("the search stops at the repo root and ignores folders above it", () => {
  const outer = mkdtempSync(`${tmpdir()}/idle-state-outer-`);
  mkdirSync(`${outer}/.idleState`);
  mkdirSync(`${outer}/repo/.git`, { recursive: true });
  mkdirSync(`${outer}/repo/src`);
  assert.equal(findIdleStateFolder(`${outer}/repo/src`), `${outer}/repo/src/.idleState`);
});

test("lists only state files from the last 24 hours, without their contents", () => {
  const folder = mkdtempSync(`${tmpdir()}/idle-state-`);
  const nowMs = Date.now();
  const recent = `${folder}/recent.json`;
  const old = `${folder}/old.json`;
  writeFileSync(recent, "recent-secret-text");
  writeFileSync(old, "old-secret-text");
  writeFileSync(`${folder}/.gitignore`, "ignored-secret-text");
  utimesSync(recent, (nowMs - 60 * 60 * 1000) / 1000, (nowMs - 60 * 60 * 1000) / 1000);
  utimesSync(old, (nowMs - 30 * 60 * 60 * 1000) / 1000, (nowMs - 30 * 60 * 60 * 1000) / 1000);
  const result = buildStateContext(folder, nowMs);
  assert.ok(result.includes(recent));
  assert.ok(!result.includes("recent-secret-text"));
  assert.ok(!result.includes(old));
  assert.ok(!result.includes("old-secret-text"));
  assert.ok(!result.includes("ignored-secret-text"));
});

test("missing folder gives empty text", () => {
  assert.equal(buildStateContext("/tmp/idle-state-missing-folder", Date.now()), "");
});

function createPromptProject(): { repo: string; stateDir: string; transcriptPath: string; stateFilePath: string } {
  const repo = mkdtempSync(`${tmpdir()}/idle-state-prompt-`);
  mkdirSync(`${repo}/.git`);
  mkdirSync(`${repo}/.idleState`);
  const stateFilePath = `${repo}/.idleState/recent.json`;
  writeFileSync(stateFilePath, "{}");
  const stateDir = mkdtempSync(`${tmpdir()}/idle-state-session-`);
  return { repo, stateDir, transcriptPath: `${repo}/session-abc.jsonl`, stateFilePath };
}

function runReader(project: { repo: string; stateDir: string; transcriptPath: string }, prompt: string): string {
  const result = spawnSync("node", [new URL("./idle-state-reader.ts", import.meta.url).pathname], {
    input: JSON.stringify({ prompt, cwd: project.repo, transcript_path: project.transcriptPath }),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_HOOKS_SESSION_STATE_DIR: project.stateDir, CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS: "86400000" },
  });
  assert.equal(result.status, 0);
  return result.stdout;
}

function readSavedFiles(project: { stateDir: string }): string[] {
  return JSON.parse(readFileSync(`${project.stateDir}/session-abc.json`, "utf8")).idleStateFiles;
}

test("the first plain prompt prints the state file and saves its path", () => {
  const project = createPromptProject();
  const output = runReader(project, "hello there");
  assert.ok(output.includes(project.stateFilePath));
  assert.deepEqual(readSavedFiles(project), [project.stateFilePath]);
});

test("a catch-up prompt prints nothing and saves an empty list", () => {
  const project = createPromptProject();
  assert.equal(runReader(project, "/catch-up"), "");
  assert.deepEqual(readSavedFiles(project), []);
});

test("the plugin-named catch-up prompt with arguments prints nothing and saves an empty list", () => {
  const project = createPromptProject();
  assert.equal(runReader(project, "/matkat-hooks:catch-up now"), "");
  assert.deepEqual(readSavedFiles(project), []);
});

test("the second prompt prints nothing and keeps the saved paths", () => {
  const project = createPromptProject();
  runReader(project, "hello there");
  assert.equal(runReader(project, "and another thing"), "");
  assert.deepEqual(readSavedFiles(project), [project.stateFilePath]);
});
