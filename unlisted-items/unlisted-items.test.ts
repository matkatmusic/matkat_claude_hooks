import { test } from "node:test";
import { strict as assert } from "node:assert";

process.env.CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH = "5";
process.env.CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS = "2";
const { getLastAssistantText, needsBuildingLines, isListed } = await import("./unlisted-items.ts");

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
  assert.equal(isListed(lines[0], ["Fix the login page"]), false);
});

test("allows when a task subject shares two long words", () => {
  const transcript = assistantLine("Still needs building: the merge script");
  const lines = needsBuildingLines(getLastAssistantText(transcript));
  assert.equal(isListed(lines[0], ["Write the merge script"]), true);
});

test("allows a message with no needs-building phrases", () => {
  const transcript = assistantLine("Done. Tests pass.");
  assert.deepEqual(needsBuildingLines(getLastAssistantText(transcript)), []);
});
