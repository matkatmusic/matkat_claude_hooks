import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { readSavedBlockedEditPath, runHook, writeTranscript } from "./block-parent-edits-helpers.ts";

test("writeTranscript: the file ends with an assistant line that holds the model", () => {
  const path = writeTranscript("claude-sonnet-5");
  const contents = readFileSync(path, "utf8");
  const lines = contents.trim().split("\n");
  assert.equal(JSON.parse(lines[lines.length - 1]).message.model, "claude-sonnet-5");
});

test("readSavedBlockedEditPath: returns the path from the deny reason", () => {
  assert.equal(readSavedBlockedEditPath("x Your blocked tool call is saved at /tmp/a.json (JSON"), "/tmp/a.json");
});

test("runHook: a Sonnet parent session prints nothing", () => {
  const transcript_path = writeTranscript("claude-sonnet-5");
  assert.equal(runHook({ transcript_path, tool_name: "Edit", tool_input: {} }), "");
});
