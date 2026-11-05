#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DEBT_SETTINGS, executeHook, setUpRepo, TEN_DEBT_SOURCE } from "./debt-ratchet-test-helpers.ts";

function assertCleanTranscriptDoesNotBlock(): void {
  const ledgerDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-ledger-`);
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-transcript-`);
  const transcript_path = `${transcriptDir}/transcript.jsonl`;
  writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hello" } })}\n`);
  const settings = { ...DEBT_SETTINGS, CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: ledgerDir };
  const output = executeHook({ settings, transcript_path, session_id: "e2e-clean", stop_hook_active: false });
  assert.equal(output, "");
  rmSync(ledgerDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
}
test("a transcript with no edited ts files this turn does not block", assertCleanTranscriptDoesNotBlock);

function assertMissingHelperLogMakesNoFile(): void {
  const ledgerDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-ledger-`);
  const rootDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-missing-log-`);
  const missingDir = `${rootDir}/subagents`;
  const agent_transcript_path = `${missingDir}/agent-side-call.jsonl`;
  const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet.ts`], {
    input: JSON.stringify({ settings: { ...DEBT_SETTINGS, CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: ledgerDir }, agent_transcript_path, session_id: "e2e-side-call", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.equal(existsSync(agent_transcript_path), false);
  assert.equal(existsSync(missingDir), false);
  rmSync(ledgerDir, { recursive: true, force: true });
  rmSync(rootDir, { recursive: true, force: true });
}
test("a subagent stop with no helper log makes no file and exits clean", assertMissingHelperLogMakesNoFile);

function assertDeletedEditedFilesAreSkipped(): void {
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-transcript-`);
  const transcript_path = `${transcriptDir}/transcript.jsonl`;
  const testEdit = { type: "tool_use", id: "t1", name: "Edit", input: { file_path: `${transcriptDir}/zz-scratch-repro.test.ts` } };
  const sourceEdit = { type: "tool_use", id: "t2", name: "Edit", input: { file_path: `${transcriptDir}/zz-scratch-repro.ts` } };
  const editLine = JSON.stringify({ type: "assistant", message: { content: [testEdit, sourceEdit] } });
  writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hello" } })}\n${editLine}\n`);
  const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet.ts`], {
    input: JSON.stringify({ settings: DEBT_SETTINGS, transcript_path, session_id: "e2e-deleted-files", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
  rmSync(transcriptDir, { recursive: true, force: true });
}
test("edited files that no longer exist are skipped and do not crash the hook", assertDeletedEditedFilesAreSkipped);

function assertSpecFileEditedWithSourceIsNotReportedAsNoTestFile(): void {
  // Steps: a repo has subject.ts with enough style debt to block, and subject.spec.ts, and no subject.test.ts.
  const repo = setUpRepo(TEN_DEBT_SOURCE);
  rmSync(`${repo}/subject.test.ts`);
  writeFileSync(`${repo}/subject.spec.ts`, "export const check = 1;\n");
  // The turn edits both files.
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-transcript-`);
  const transcript_path = `${transcriptDir}/transcript.jsonl`;
  const sourceEdit = { type: "tool_use", id: "t1", name: "Edit", input: { file_path: `${repo}/subject.ts` } };
  const specEdit = { type: "tool_use", id: "t2", name: "Edit", input: { file_path: `${repo}/subject.spec.ts` } };
  const editLine = JSON.stringify({ type: "assistant", message: { content: [sourceEdit, specEdit] } });
  writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hello" } })}\n${editLine}\n`);
  // The hook blocks for style debt, and the block must not say any file has no test file.
  const output = executeHook({ transcript_path, session_id: "e2e-spec-file", stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.doesNotMatch(output, /no test file/);
  rmSync(transcriptDir, { recursive: true, force: true });
}
test("a .spec.ts file edited with its source file is not reported as no test file", assertSpecFileEditedWithSourceIsNotReportedAsNoTestFile);

function assertMissingLedgerDirFailsHook(): void {
  const settings = { ...DEBT_SETTINGS } as Record<string, string>;
  delete settings.CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR;
  const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet.ts`], {
    input: JSON.stringify({ settings, transcript_path: "/unused", session_id: "e2e-missing", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR/);
}
test("a missing ledger dir setting fails the hook and names the key", assertMissingLedgerDirFailsHook);
