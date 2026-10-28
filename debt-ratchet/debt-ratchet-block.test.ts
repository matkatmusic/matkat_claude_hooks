#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { FileDebt } from "./debt-compute.ts";
import { ARRAY_DEBT_DIR, DEBT_LIMITS, TEN_DEBT_SOURCE, setUpRepo, writeTranscript, executeHook } from "./debt-ratchet-test-helpers.ts";

const { blockReason } = await import("./debt-compute.ts");

test("first sighting with debt: blocked, ledger written with the total", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/subject.ts`, TEN_DEBT_SOURCE);
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = executeHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /Style debt is 10 and must drop to 0 or fewer/);
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).total, 10);
});

function setUpDebtTranscript(): string {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/subject.ts`, TEN_DEBT_SOURCE);
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

  writeFileSync(`${repo}/subject.ts`, TEN_DEBT_SOURCE);
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
  assert.match(output, /Style debt is 10 and must drop to 0 or fewer/);
  assert.match(output, /subject\.ts/);
  assert.doesNotMatch(output, /ignored\.ts/);
});

test("blockReason lists the files that have no test file", () => {
  // Steps: one file has no test file, another file has style debt.
  const lonelyFile: FileDebt = { file: "/x/lonely.ts", current: 1, lines: [], reformatted: false, lineCount: 10, missingTest: true };
  const messyFile: FileDebt = { file: "/x/messy.ts", current: 10, lines: [3, 4], reformatted: false, lineCount: 10, missingTest: false };
  // The block reason must name the file with no test file.
  const reason = blockReason([lonelyFile, messyFile], 11, undefined, [], DEBT_LIMITS);
  assert.match(reason ?? "", /lonely\.ts/);
  // A file with no flagged lines gets no "lines ... show:" line.
  assert.doesNotMatch(reason ?? "", /lonely\.ts: lines/);
});

test("blockReason requires the total to drop by fixBatchSize, never below debtTarget", () => {
  const limits = { ...DEBT_LIMITS, debtTarget: 0, fixBatchSize: 5 };
  const messyFile: FileDebt = { file: "/x/messy.ts", current: 12, lines: [3], reformatted: false, lineCount: 10, missingTest: false };
  const reasonFromTwelve = blockReason([messyFile], 12, undefined, [], limits);
  assert.match(reasonFromTwelve ?? "", /Style debt is 12 and must drop to 7 or fewer/);
  const bigBatchLimits = { ...DEBT_LIMITS, debtTarget: 0, fixBatchSize: 15 };
  const reasonFromBigBatch = blockReason([messyFile], 12, undefined, [], bigBatchLimits);
  assert.match(reasonFromBigBatch ?? "", /Style debt is 12 and must drop to 0 or fewer/);
});

test("blockReason does not block when no single file has 10 flagged items", () => {
  const fileA: FileDebt = { file: "/x/a.ts", current: 9, lines: [1], reformatted: false, lineCount: 10, missingTest: false };
  const fileB: FileDebt = { file: "/x/b.ts", current: 9, lines: [2], reformatted: false, lineCount: 10, missingTest: false };
  const limits = { ...DEBT_LIMITS, debtTarget: 0, fixBatchSize: 10 };
  assert.equal(blockReason([fileA, fileB], 18, undefined, [], limits), undefined);
});

test("blockReason blocks when one file has 10 flagged items", () => {
  const bigFile: FileDebt = { file: "/x/big.ts", current: 10, lines: [1], reformatted: false, lineCount: 10, missingTest: false };
  const limits = { ...DEBT_LIMITS, debtTarget: 0, fixBatchSize: 10 };
  assert.match(blockReason([bigFile], 10, undefined, [], limits) ?? "", /Style debt is 10/);
});

test("SubagentStop: a fake agent transcript with one Edit tool_use yields that file path", () => {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/subject.ts`, TEN_DEBT_SOURCE);
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-agent-transcript-`);
  const agent_transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = executeHook({ agent_transcript_path, session_id: randomUUID(), stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /subject\.ts/);
});
