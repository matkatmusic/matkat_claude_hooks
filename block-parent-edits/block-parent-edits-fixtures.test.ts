#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { runHook } from "./block-parent-edits-helpers.ts";

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
      if (!line)
        continue;
      const entry = JSON.parse(line);
      const isAssistant = entry.type === "assistant";
      if (!isAssistant)
        continue;
      const content = entry.message?.content;
      const isContentArray = Array.isArray(content);
      if (!isContentArray)
        continue;
      for (let b = 0; b < content.length; b++) {
        const block = content[b];
        const isToolUse = block.type === "tool_use";
        const isBashName = block.name === "Bash";
        if (!isToolUse)
          continue;
        if (!isBashName)
          continue;
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
