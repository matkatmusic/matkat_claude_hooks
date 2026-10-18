#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

process.env.CLAUDE_HOOKS_BLOCKED_EDITS_DIR = `${tmpdir()}/claude-blocked-edits`;

function readSavedBlockedEditPath(denyReason: string): string {
  const match = denyReason.match(/Your blocked tool call is saved at (\S+)/);
  assert.ok(match, "deny reason should contain a saved-file path");
  return match![1];
}

function writeTranscript(model: string): string {
  const dir = mkdtempSync(`${tmpdir()}/block-parent-edits-`);
  const path = `${dir}/transcript.jsonl`;
  const lines = [
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    JSON.stringify({ type: "assistant", message: { model } }),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

function runHook(input: object, env: Record<string, string | undefined> = process.env): string {
  const run = spawnSync("node", [`${import.meta.dirname}/block-parent-edits.ts`], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env,
  });
  return run.stdout.trim();
}

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

test("main session with no model in the transcript: the hook fails loudly and does not allow", () => {
  const dir = mkdtempSync(`${tmpdir()}/block-parent-edits-`);
  const transcript_path = `${dir}/transcript.jsonl`;
  writeFileSync(transcript_path, `${JSON.stringify({ type: "user", message: { content: "hi" } })}\n`);
  const run = spawnSync("node", [`${import.meta.dirname}/block-parent-edits.ts`], {
    input: JSON.stringify({ session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} }),
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0);
  assert.notEqual(run.stderr, "");
});

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
    { session_id: "test-session", transcript_path, tool_name: "Edit", tool_input: {} },
    { ...process.env, CLAUDE_HOOKS_BLOCKED_EDITS_DIR: savedDir },
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

test("real taskTools-86 fable transcripts: hook decisions match hand-labeled expected.json", () => {
  const fixturesDir = `${import.meta.dirname}/fixtures/block-parent-edits`;
  const expected = JSON.parse(readFileSync(`${fixturesDir}/expected.json`, "utf8"));
  const sessionIds = Object.keys(expected);
  const mismatches: string[] = [];

  for (let s = 0; s < sessionIds.length; s++) {
    const sessionId = sessionIds[s];
    const transcript_path = `${fixturesDir}/${sessionId}.jsonl`;
    const lines = readFileSync(transcript_path, "utf8").split("\n");
    const foundCommands: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const entry = JSON.parse(line);
      const isAssistant = entry.type === "assistant";
      if (!isAssistant) continue;
      const content = entry.message?.content;
      const isContentArray = Array.isArray(content);
      if (!isContentArray) continue;
      for (let b = 0; b < content.length; b++) {
        const block = content[b];
        const isBashToolUse = block.type === "tool_use" && block.name === "Bash";
        if (!isBashToolUse) continue;
        foundCommands.push(block.input.command);
      }
    }

    const expectedEntries = expected[sessionId];
    assert.equal(foundCommands.length, expectedEntries.length, `${sessionId}: command count`);

    for (let i = 0; i < foundCommands.length; i++) {
      const command = foundCommands[i];
      const output = runHook({ session_id: "test-session", transcript_path, tool_name: "Bash", tool_input: { command } });
      const isDenied = /"permissionDecision":"deny"/.test(output);
      const actual = isDenied ? "deny" : "allow";
      const expectedLabel = expectedEntries[i].expected;
      const isMatch = actual === expectedLabel;
      if (!isMatch) {
        mismatches.push(`${sessionId}: ${command.replace(/\n/g, "\\n").slice(0, 80)} expected ${expectedLabel} got ${actual}`);
      }
    }
  }

  assert.deepEqual(mismatches, []);
});
