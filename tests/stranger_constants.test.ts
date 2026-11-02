import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAIN_BLOCKS, PROMPT_FILES, SONNET, TURNS_RE } from "./stranger_constants.ts";

test("the shared constants keep their values", () => {
  assert.equal(CHAIN_BLOCKS, 3);
  assert.equal(SONNET, "claude-sonnet-5-5");
  assert.equal(PROMPT_FILES.includes("hello.txt"), true);
});

test("TURNS_RE reads the turn count from a status line", () => {
  assert.equal(TURNS_RE.exec("3 turns")![1], "3");
});
