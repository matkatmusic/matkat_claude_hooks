#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runHook, writeTranscript } from "./block-parent-edits-helpers.ts";

test("main session on claude-fable-5-1, Edit tool: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-opus-5, Edit tool: denied", () => {
  const transcript_path = writeTranscript("claude-opus-5");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-opus-5, plan mode, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-opus-5");
  const output = runHook({ transcript_path, permission_mode: "plan", tool_name: "Edit", tool_input: {} });
  assert.equal(output, "");
});

test("main session on claude-opus-4-8, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-opus-4-8");
  const output = runHook({ transcript_path, tool_name: "Edit", tool_input: {} });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, plan mode, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ transcript_path, permission_mode: "plan", tool_name: "Edit", tool_input: {} });
  assert.equal(output, "");
});

test("subagent (agent_id), sonnet CLAUDE_CODE_SUBAGENT_MODEL, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook(
    { agent_id: "abc", transcript_path, tool_name: "Edit", tool_input: {} },
    { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-5" },
  );
  assert.equal(output, "");
});

test("subagent (agent_type only), sonnet CLAUDE_CODE_SUBAGENT_MODEL, Edit tool: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook(
    { agent_type: "code-reviewer", transcript_path, tool_name: "Edit", tool_input: {} },
    { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-5" },
  );
  assert.equal(output, "");
});

test("subagent, fable CLAUDE_CODE_SUBAGENT_MODEL, Edit tool: denied", () => {
  const transcript_path = writeTranscript("claude-sonnet-5");
  const output = runHook(
    { agent_id: "abc", transcript_path, tool_name: "Edit", tool_input: {} },
    { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: "claude-fable-5-1" },
  );
  assert.match(output, /"permissionDecision":"deny"/);
});

test("subagent, fable CLAUDE_CODE_SUBAGENT_MODEL, Bash ls: allowed", () => {
  const transcript_path = writeTranscript("claude-sonnet-5");
  const output = runHook(
    { agent_id: "abc", transcript_path, tool_name: "Bash", tool_input: { command: "ls" } },
    { ...process.env, CLAUDE_CODE_SUBAGENT_MODEL: "claude-fable-5-1" },
  );
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash ls: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ transcript_path, tool_name: "Bash", tool_input: { command: "ls" } });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash sd: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "sd foo bar x.ts" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash sd right after a single pipe: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "ls | sd a b" } });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash sd at the start: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "sd a b file.ts" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash sd after ||: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "foo || sd a b f" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash sd after &&: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "foo && sd a b f" } });
  assert.match(output, /"permissionDecision":"deny"/);
});
