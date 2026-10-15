#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findEditedFilePaths, findSubagentEditedFilePaths } from "./debt-transcript.ts";

function userPrompt(timestamp: string): string {
  return JSON.stringify({ type: "user", timestamp, message: { content: "do it" } });
}

function toolResult(): string {
  return JSON.stringify({ type: "user", message: { content: [{ type: "tool_result" }] } });
}

function toolUse(name: string, filePath: string, timestamp = "2026-01-01T00:00:00Z"): string {
  const block = { type: "tool_use", name, input: { file_path: filePath } };
  return JSON.stringify({ type: "assistant", timestamp, message: { content: [block] } });
}

test("findEditedFilePaths returns files edited after the last user prompt", () => {
  const transcript = [userPrompt("T1"), toolUse("Edit", "/a.ts"), toolUse("Write", "/b.ts")].join("\n");
  assert.deepEqual(findEditedFilePaths(transcript).files.sort(), ["/a.ts", "/b.ts"]);
});

test("findEditedFilePaths reports the last user prompt timestamp as the turn start", () => {
  const transcript = [userPrompt("T1"), toolUse("Edit", "/a.ts"), userPrompt("T2")].join("\n");
  assert.equal(findEditedFilePaths(transcript).turnStartTimestamp, "T2");
});

test("findEditedFilePaths leaves out edits made before the turn start", () => {
  const transcript = [userPrompt("T1"), toolUse("Edit", "/old.ts"), userPrompt("T2"), toolUse("Edit", "/new.ts")].join("\n");
  assert.deepEqual(findEditedFilePaths(transcript).files, ["/new.ts"]);
});

test("findEditedFilePaths does not treat a tool result as the turn start", () => {
  const transcript = [userPrompt("T1"), toolUse("Edit", "/a.ts"), toolResult(), toolUse("Edit", "/b.ts")].join("\n");
  const result = findEditedFilePaths(transcript);
  assert.deepEqual(result.files.sort(), ["/a.ts", "/b.ts"]);
  assert.equal(result.turnStartTimestamp, "T1");
});

test("findEditedFilePaths ignores tools that do not edit files", () => {
  const transcript = [userPrompt("T1"), toolUse("Read", "/a.ts")].join("\n");
  assert.deepEqual(findEditedFilePaths(transcript).files, []);
});

test("findSubagentEditedFilePaths returns an empty list when the folder does not exist", () => {
  assert.deepEqual(findSubagentEditedFilePaths(join(tmpdir(), "no-such-subagents-dir"), "T1"), []);
});

test("findSubagentEditedFilePaths returns files edited at or after the turn start", () => {
  const dir = mkdtempSync(`${tmpdir()}/debt-transcript-`);
  const lines = [toolUse("Edit", "/old.ts", "2026-01-01T00:00:00Z"), toolUse("Write", "/new.ts", "2026-01-02T00:00:00Z")];
  writeFileSync(join(dir, "agent-1.jsonl"), lines.join("\n"));
  assert.deepEqual(findSubagentEditedFilePaths(dir, "2026-01-02T00:00:00Z"), ["/new.ts"]);
});

test("findSubagentEditedFilePaths reads only agent-*.jsonl files", () => {
  const dir = mkdtempSync(`${tmpdir()}/debt-transcript-`);
  writeFileSync(join(dir, "agent-1.jsonl"), toolUse("Edit", "/yes.ts", "2026-01-02T00:00:00Z"));
  writeFileSync(join(dir, "notes.jsonl"), toolUse("Edit", "/no.ts", "2026-01-02T00:00:00Z"));
  assert.deepEqual(findSubagentEditedFilePaths(dir, "2026-01-01T00:00:00Z"), ["/yes.ts"]);
});
