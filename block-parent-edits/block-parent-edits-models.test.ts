#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { readSavedBlockedEditPath, runHook, writeTranscript } from "./block-parent-edits-helpers.ts";

test("main session on claude-fable-5-1, Edit tool: blocked tool_input is saved to a file named in the deny reason", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const tool_input = { file_path: "/tmp/example.ts", old_string: "a", new_string: "b" };
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input });
  const parsed = JSON.parse(output);
  const denyReason = parsed.hookSpecificOutput.permissionDecisionReason;
  const savedPath = readSavedBlockedEditPath(denyReason);
  const savedContents = JSON.parse(readFileSync(savedPath, "utf8"));
  assert.deepEqual(savedContents, tool_input);
});

test("main session: a model attachment after the last assistant entry decides the model", () => {
  const dir = mkdtempSync(`${tmpdir()}/block-parent-edits-`);
  const transcript_path = `${dir}/transcript.jsonl`;
  const lines = [
    JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5-5" } }),
    JSON.stringify({ type: "attachment", attachment: { type: "model", identity: { modelId: "claude-opus-5-5" } } }),
  ];
  writeFileSync(transcript_path, `${lines.join("\n")}\n`);
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Write to a .idleState folder: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const file_path = `${tmpdir()}/.idleState/x.json`;
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Write", tool_input: { file_path, content: "{}" } });
  assert.equal(output, "");
});

test("main session on claude-opus-6-0, Edit tool: denied", () => {
  const transcript_path = writeTranscript("claude-opus-6-0");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-opus-12, Edit tool: denied", () => {
  const transcript_path = writeTranscript("claude-opus-12");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-6, Edit tool: denied", () => {
  const transcript_path = writeTranscript("claude-fable-6");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on a dated claude-opus-4 name, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-opus-4-1-20250805");
  const output = runHook({ transcript_path, tool_name: "Edit", tool_input: {} });
  assert.equal(output, "");
});

// test("main session with no model in the transcript: the hook fails loudly and does not allow", () => {
//   const dir = mkdtempSync(`${tmpdir()}/block-parent-edits-`);
//   const transcript_path = `${dir}/transcript.jsonl`;
//   writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hi" } })}\n`);
//   const run = spawnSync("node", [`${import.meta.dirname}/block-parent-edits.ts`], {
//     input: JSON.stringify({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} }),
//     encoding: "utf8",
//   });
//   assert.notEqual(run.status, 0);
//   assert.notEqual(run.stderr, "");
// });

test("main session with no model in the transcript, Edit tool: denied", () => {
  const dir = mkdtempSync(`${tmpdir()}/block-parent-edits-`);
  const transcript_path = `${dir}/transcript.jsonl`;
  writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hi" } })}\n`);
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("a blocked edit deletes saved files older than one day and keeps newer ones", () => {
  const savedDir = mkdtempSync(`${tmpdir()}/blocked-edits-cleanup-`);
  const oldFile = `${savedDir}/old-session-1.json`;
  const newFile = `${savedDir}/new-session-2.json`;
  writeFileSync(oldFile, "{}");
  writeFileSync(newFile, "{}");
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  utimesSync(oldFile, twoDaysAgo, twoDaysAgo);
  const transcript_path = writeTranscript("claude-fable-5-1");
  runHook(
    { session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {}, settings: { CLAUDE_HOOKS_BLOCKED_EDITS_DIR: savedDir } },
  );
  assert.equal(existsSync(oldFile), false);
  assert.equal(existsSync(newFile), true);
});

test("main session on claude-opus-4-7, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-opus-4-7");
  const output = runHook({ transcript_path, tool_name: "Edit", tool_input: {} });
  assert.equal(output, "");
});

test("main session on claude-sonnet-5, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-sonnet-5");
  const output = runHook({ transcript_path, tool_name: "Edit", tool_input: {} });
  assert.equal(output, "");
});
