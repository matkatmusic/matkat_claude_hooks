#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS = "86400000";
const { buildStateContext } = await import("./idle-state-reader.ts");

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
