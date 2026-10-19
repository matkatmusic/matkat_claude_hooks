#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { FileDebt } from "./debt-compute.ts";
import { ARRAY_DEBT_DIR, DEBT_LIMITS, setUpRepo, writeTranscript, executeHook } from "./debt-ratchet-test-helpers.ts";

const { blockReason } = await import("./debt-compute.ts");

test("first sighting with debt: blocked, ledger written with the total", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getNums() {\n  return [1, 2, 3].map(addOne);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /Style debt is 1 and must drop to 0 or fewer/);
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).total, 1);
});

function setUpDebtTranscript(): string {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getNums() {\n  return [1, 2, 3].map(addOne);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  return writeTranscript(transcriptDir, `${repo}/subject.ts`);
}

test("reentrant stop with the same debt: blocked again", () => {
  const sessionId = randomUUID();
  const transcript_path = setUpDebtTranscript();
  const first = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(first, /"decision":"block"/);
  const second = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: true });
  assert.match(second, /"decision":"block"/);
});

test("reentrant stops stop blocking after the chain limit", () => {
  const sessionId = randomUUID();
  const transcript_path = setUpDebtTranscript();
  executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  let output = "";
  for (let i = 0; i < 5; i++)
    output = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: true });
  assert.equal(output, "");
});

test("a new chain starts again after the limit", () => {
  const sessionId = randomUUID();
  const transcript_path = setUpDebtTranscript();
  executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  for (let i = 0; i < 5; i++)
    executeHook({ transcript_path, session_id: sessionId, stop_hook_active: true });
  const output = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
});

test("subagent edits are collected: only the edit at/after turn start is evaluated", () => {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/ignored.ts`, "export function getOtherNums() {\n  return [4, 5, 6];\n}\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add ignored file"], { cwd: repo });

  writeFileSync(
    `${repo}/subject.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getNums() {\n  return [1, 2, 3].map(addOne);\n}\n",
  );
  writeFileSync(
    `${repo}/ignored.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getOtherNums() {\n  return [4, 5, 6].map(addOne);\n}\n",
  );

  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const sessionId = "session1";
  const transcript_path = `${transcriptDir}/${sessionId}.jsonl`;
  const turnStart = "2024-01-01T00:00:01.000Z";
  writeFileSync(
    transcript_path,
    `${JSON.stringify({ type: "user", timestamp: turnStart, message: { content: "add a helper" } })}\n`,
  );

  const subagentsDir = `${transcriptDir}/${sessionId}/subagents`;
  mkdirSync(subagentsDir, { recursive: true });
  const beforeTurnStart = JSON.stringify({
    type: "assistant",
    timestamp: "2024-01-01T00:00:00.000Z",
    message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${repo}/ignored.ts` } }] },
  });
  const afterTurnStart = JSON.stringify({
    type: "assistant",
    timestamp: "2024-01-01T00:00:02.000Z",
    message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${repo}/subject.ts` } }] },
  });
  writeFileSync(`${subagentsDir}/agent-x.jsonl`, `${beforeTurnStart}\n${afterTurnStart}\n`);

  const output = executeHook({ transcript_path, session_id: randomUUID(), stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /Style debt is 1 and must drop to 0 or fewer/);
  assert.match(output, /subject\.ts/);
  assert.doesNotMatch(output, /ignored\.ts/);
});

test("blockReason lists the files that have no test file", () => {
  // Steps: one file has no test file, another file has style debt.
  const lonelyFile: FileDebt = { file: "/x/lonely.ts", current: 1, lines: [], reformatted: false, lineCount: 10, missingTest: true };
  const messyFile: FileDebt = { file: "/x/messy.ts", current: 2, lines: [3, 4], reformatted: false, lineCount: 10, missingTest: false };
  // The block reason must name the file with no test file.
  const reason = blockReason([lonelyFile, messyFile], 3, undefined, [], DEBT_LIMITS);
  assert.match(reason ?? "", /lonely\.ts/);
  // A file with no flagged lines gets no "lines ... show:" line.
  assert.doesNotMatch(reason ?? "", /lonely\.ts: lines/);
});

test("blockReason requires the total to drop by fixBatchSize, never below debtTarget", () => {
  const limits = { ...DEBT_LIMITS, debtTarget: 0, fixBatchSize: 5 };
  const messyFile: FileDebt = { file: "/x/messy.ts", current: 7, lines: [3], reformatted: false, lineCount: 10, missingTest: false };
  const reasonFromSeven = blockReason([messyFile], 7, undefined, [], limits);
  assert.match(reasonFromSeven ?? "", /Style debt is 7 and must drop to 2 or fewer/);
  const reasonFromThree = blockReason([messyFile], 3, undefined, [], limits);
  assert.match(reasonFromThree ?? "", /Style debt is 3 and must drop to 0 or fewer/);
});

test("SubagentStop: a fake agent transcript with one Edit tool_use yields that file path", () => {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getNums() {\n  return [1, 2, 3].map(addOne);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-agent-transcript-`);
  const agent_transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = executeHook({ agent_transcript_path, session_id: randomUUID(), stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /subject\.ts/);
});
