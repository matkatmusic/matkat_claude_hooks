#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { runHook, writeTranscript } from "./block-parent-edits-helpers.ts";

test("main session on claude-fable-5-1, Bash cp: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "cp a.txt b.txt" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash mv: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "mv a.txt b.txt" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash rm: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "rm -rf foo" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash mkdir: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "mkdir -p foo/bar" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash touch: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "touch newfile.txt" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash chmod: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "chmod +x script.sh" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash redirect to /dev/null: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "git merge-tree --write-tree a b >/dev/null 2>&1" },
  });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash redirect to a real file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "echo hi > out.txt" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash rg -o: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ transcript_path, tool_name: "Bash", tool_input: { command: "rg -o foo | head -2" } });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash grep -o: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ transcript_path, tool_name: "Bash", tool_input: { command: "grep -o foo file.txt" } });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash rg with other flags before -o: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ transcript_path, tool_name: "Bash", tool_input: { command: "rg -m1 -o 'model \\S+' /tmp/some.log" } });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash sort -o file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "sort -o out.txt in" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash rg piped into sort -o file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "rg foo in | sort -o out.txt" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash rg redirected to a file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "rg foo > out.txt" } });
  assert.match(output, /"permissionDecision":"deny"/);
});
