#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { DEBT_LIMITS, DEBT_SETTINGS } from "./debt-ratchet-test-helpers.ts";

test("DEBT_LIMITS matches the numbers in DEBT_SETTINGS", () => {
  assert.equal(DEBT_LIMITS.maxFileLines, Number(DEBT_SETTINGS.CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES));
  assert.equal(DEBT_LIMITS.debtTarget, Number(DEBT_SETTINGS.CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET));
  assert.equal(DEBT_LIMITS.fixBatchSize, Number(DEBT_SETTINGS.CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE));
});
