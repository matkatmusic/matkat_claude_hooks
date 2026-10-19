#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { DEBT_SETTINGS, executeHook } from "./debt-ratchet-test-helpers.ts";

test("a transcript with no edited ts files this turn does not block", () => {
  const ledgerDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-ledger-`);
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-e2e-transcript-`);
  const transcript_path = `${transcriptDir}/transcript.jsonl`;
  writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hello" } })}\n`);
  const settings = { ...DEBT_SETTINGS, CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: ledgerDir };
  const output = executeHook({ settings, transcript_path, session_id: "e2e-clean", stop_hook_active: false });
  assert.equal(output, "");
  rmSync(ledgerDir, { recursive: true, force: true });
  rmSync(transcriptDir, { recursive: true, force: true });
});

test("a missing ledger dir setting fails the hook and names the key", () => {
  const settings = { ...DEBT_SETTINGS } as Record<string, string>;
  delete settings.CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR;
  const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet.ts`], {
    input: JSON.stringify({ settings, transcript_path: "/unused", session_id: "e2e-missing", stop_hook_active: false }),
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR/);
});
