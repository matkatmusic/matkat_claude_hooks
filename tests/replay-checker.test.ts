import assert from "node:assert/strict";
import { test } from "node:test";
import { loadPrompt, OLD_PROMPT_COMMIT, NEW_PROMPT_COMMIT } from "../ask-dont-dump/mod/tests/replay-checker.ts";

test("both prompt commits resolve to text with the $ARGUMENTS placeholder", () => {
  const oldPrompt = loadPrompt(OLD_PROMPT_COMMIT);
  const newPrompt = loadPrompt(NEW_PROMPT_COMMIT);
  assert.ok(oldPrompt.includes("$ARGUMENTS"));
  assert.ok(newPrompt.includes("$ARGUMENTS"));
});
