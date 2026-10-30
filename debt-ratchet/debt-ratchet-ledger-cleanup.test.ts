#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { removeOldLedgers } from "./debt-ratchet-ledger-cleanup.ts";

test("removeOldLedgers keeps every file when none is older than the max age", () => {
  const dir = mkdtempSync(`${tmpdir()}/ledger-cleanup-`);
  writeFileSync(`${dir}/fresh.json`, "{}");
  removeOldLedgers(dir, Date.now(), 604800000);
  assert.deepEqual(readdirSync(dir), ["fresh.json"]);
});

test("removeOldLedgers removes a file older than the max age", () => {
  const dir = mkdtempSync(`${tmpdir()}/ledger-cleanup-`);
  writeFileSync(`${dir}/old.json`, "{}");
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  utimesSync(`${dir}/old.json`, twoDaysAgo, twoDaysAgo);
  removeOldLedgers(dir, Date.now(), 24 * 60 * 60 * 1000);
  assert.deepEqual(readdirSync(dir), []);
});
