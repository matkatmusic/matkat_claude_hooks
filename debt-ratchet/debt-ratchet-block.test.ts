#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { FileDebt } from "./debt-compute.ts";
import { ARRAY_DEBT_DIR, setDebtRatchetEnv, setUpRepo, writeTranscript, runHook } from "./debt-ratchet-test-helpers.ts";

setDebtRatchetEnv();
const { blockReason } = await import("./debt-compute.ts");

test("first sighting with debt: blocked, ledger not written", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /Style debt is 1 and must drop below 1/);
  assert.equal(existsSync(ledgerPath), false);
});

// test("HEAD has 1 violation, working copy has the same 1: allowed", () => {
//   const repo = setUpRepo("export function nums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n");
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
//   const output = runHook({ transcript_path, stop_hook_active: false });
//   assert.equal(output, "");
// });
// Superseded by the per-session ledger ratchet: an unchanged debt count now blocks (see "existing ledger with same total: blocked").

test("subagent edits are collected: only the edit at/after turn start is evaluated", () => {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/ignored.ts`, "export function getOtherNums() {\n  return [4, 5, 6];\n}\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add ignored file"], { cwd: repo });

  writeFileSync(
    `${repo}/subject.ts`,
    "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
  );
  writeFileSync(
    `${repo}/ignored.ts`,
    "export function getOtherNums() {\n  return [4, 5, 6].map((n) => n + 1);\n}\n",
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

  const output = runHook({ transcript_path, session_id: randomUUID(), stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /Style debt is 1 and must drop below 1/);
  assert.match(output, /subject\.ts/);
  assert.doesNotMatch(output, /ignored\.ts/);
});

test("blockReason lists the files that have no test file", () => {
  // Steps: one file has no test file, another file has style debt.
  const lonelyFile: FileDebt = { file: "/x/lonely.ts", current: 1, lines: [], reformatted: false, lineCount: 10, missingTest: true };
  const messyFile: FileDebt = { file: "/x/messy.ts", current: 2, lines: [3, 4], reformatted: false, lineCount: 10, missingTest: false };
  // The block reason must name the file with no test file.
  const reason = blockReason([lonelyFile, messyFile], 3, undefined, []);
  assert.match(reason ?? "", /lonely\.ts/);
  // A file with no flagged lines gets no "lines ... show:" line.
  assert.doesNotMatch(reason ?? "", /lonely\.ts: lines/);
});

// test("blockReason skips the style debt part when the only problem is a missing test file", () => {
//   const lonelyFile: FileDebt = { file: "/x/lonely.ts", current: 1, lines: [], reformatted: false, lineCount: 10, missingTest: true };
//   const reason = blockReason([lonelyFile], 1, undefined, []);
//   assert.doesNotMatch(reason ?? "", /Style debt/);
//   assert.match(reason ?? "", /These files have no test file: \/x\/lonely\.ts/);
// });

test("SubagentStop: a fake agent transcript with one Edit tool_use yields that file path", () => {
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-agent-transcript-`);
  const agent_transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = runHook({ agent_transcript_path, session_id: randomUUID(), stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /subject\.ts/);
});
