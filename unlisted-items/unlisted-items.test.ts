import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

const MIN_WORD_LENGTH = 5;
const MIN_SHARED_WORDS = 2;
const { getLastAssistantText, findNeedsBuildingLines: needsBuildingLines, isListed } = await import("./unlisted-items.ts");

const assistantLine = (text: string) =>
  JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });

test("extracts the last assistant text from a fake transcript", () => {
  const transcript = [
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    assistantLine("first reply"),
    assistantLine("Still needs building: the merge script"),
  ].join("\n");
  assert.equal(getLastAssistantText(transcript), "Still needs building: the merge script");
});

test("finds a needs-building line", () => {
  const lines = needsBuildingLines("Still needs building: the merge script");
  assert.deepEqual(lines, ["Still needs building: the merge script"]);
});

test("blocks when no task subject overlaps", () => {
  const transcript = assistantLine("Still needs building: the merge script");
  const lines = needsBuildingLines(getLastAssistantText(transcript));
  assert.equal(lines.length, 1);
  assert.equal(isListed(lines[0], ["Fix the login page"], MIN_WORD_LENGTH, MIN_SHARED_WORDS), false);
});

test("allows when a task subject shares two long words", () => {
  const transcript = assistantLine("Still needs building: the merge script");
  const lines = needsBuildingLines(getLastAssistantText(transcript));
  assert.equal(isListed(lines[0], ["Write the merge script"], MIN_WORD_LENGTH, MIN_SHARED_WORDS), true);
});

test("allows a reworded task that has the same word stems", () => {
  const lines = needsBuildingLines("Still needs building: merging scripts");
  assert.equal(isListed(lines[0], ["Write the merge script"], MIN_WORD_LENGTH, MIN_SHARED_WORDS), true);
});

test("blocks when an unrelated task shares two words but most of the line is missing", () => {
  const lines = needsBuildingLines("Still needs building: the merge script runner with retry logging and metrics");
  assert.equal(isListed(lines[0], ["Write the merge script"], MIN_WORD_LENGTH, MIN_SHARED_WORDS), false);
});

test("ignores phrases inside quotes or backticks", () => {
  assert.deepEqual(needsBuildingLines('The phrase "next step:" is a trigger word.'), []);
  assert.deepEqual(needsBuildingLines("The phrase `next step:` is a trigger word."), []);
  assert.deepEqual(needsBuildingLines("The phrase “next step:” is a trigger word."), []);
  assert.deepEqual(needsBuildingLines('He said "hello". Next step: the parser'), ["He said \"hello\". Next step: the parser"]);
});

test("ignores a phrase inside a quote that spans lines", () => {
  assert.deepEqual(needsBuildingLines("```\nnext step: example\n```\nDone."), []);
});

const HOOK_SETTINGS = {
  CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH: "5",
  CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS: "2",
  CLAUDE_HOOKS_TASKS_DIR: "/nonexistent-tasks-dir",
};

function runHook(input: object): string {
  const result = spawnSync("node", [new URL("./unlisted-items.ts", import.meta.url).pathname], {
    input: JSON.stringify({ settings: HOOK_SETTINGS, ...input }),
    encoding: "utf8",
  });
  return result.stdout;
}

test("reads last_assistant_message and does not need a transcript", () => {
  const output = runHook({
    last_assistant_message: "Still needs building: the merge script",
    session_id: "no-such-session",
  });
  assert.ok(output.includes('"block"'));
});

test("allows a message with no needs-building phrases", () => {
  const transcript = assistantLine("Done. Tests pass.");
  assert.deepEqual(needsBuildingLines(getLastAssistantText(transcript)), []);
});
