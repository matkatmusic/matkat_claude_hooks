#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import { runHook, writeTranscript } from "./block-parent-edits-helpers.ts";

test("main session on claude-fable-5-1, Bash python -c: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "python3 -c \"open('a.txt','w').write('x')\"" },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash stderr redirect to a file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command: "make 2> err.log" } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash redirect into a .idleState folder: allowed", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const command = `echo '{}' > ${tmpdir()}/.idleState/x.json`;
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command } });
  assert.equal(output, "");
});

test("main session on claude-fable-5-1, Bash redirect into .idleState plus a second redirect: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const command = `echo '{}' > ${tmpdir()}/.idleState/x.json && echo hi > out.txt`;
  const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command } });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash sd substitution: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "sd 'Invoke the following skill:' 'invoke this skill exactly:' scripts/tackle-tasks/shared/planPrompt.ts" },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash single redirect: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: 'echo "done $(date +%s)" > ~/.claude/turn-counters/$CLAUDE_CODE_SESSION_ID.done' },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash append redirect: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "echo '- note' >> /Users/someone/.claude/projects/demo/memory/MEMORY.md" },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash heredoc to new file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "cat > scripts/tackle-tasks/shared/dumpPromptShapes.ts <<'EOF'\nimport { mkdirSync } from \"node:fs\";\nEOF" },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash heredoc append: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "cat >> scripts/tackle-tasks/resetTask.test.ts <<'EOF'\ntest(\"x\", () => {});\nEOF" },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});

test("main session on claude-fable-5-1, Bash python heredoc rewriting a file: denied", () => {
  const transcript_path = writeTranscript("claude-fable-5-1");
  const output = runHook({
    session_id: "test-session",
    transcript_path,
    tool_name: "Bash",
    tool_input: { command: "python3 - <<'PYEOF'\np=\"scripts/tackle-tasks/shared/planPrompt.ts\"\nopen(p,\"w\").write(open(p).read())\nPYEOF" },
  });
  assert.match(output, /"permissionDecision":"deny"/);
});
