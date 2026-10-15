#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isPromptLine, shouldBlock } from "./ask-dont-dump-issues.ts";

const line = (type: string, content: unknown, seconds: number, extra = {}) =>
  JSON.stringify({ type, message: { content }, timestamp: new Date(seconds * 1000).toISOString(), ...extra });

test("string prompt", () => {
  assert.equal(isPromptLine({ type: "user", message: { content: "hi" } }), true);
});

test("array prompt", () => {
  assert.equal(isPromptLine({ type: "user", message: { content: [{ type: "text" }] } }), true);
});

test("tool result", () => {
  assert.equal(isPromptLine({ type: "user", message: { content: [{ type: "tool_result" }] } }), false);
});

test("hook feedback", () => {
  assert.equal(isPromptLine({ type: "user", isMeta: true, message: { content: "Stop hook feedback" } }), false);
});

test("assistant", () => {
  assert.equal(isPromptLine({ type: "assistant", message: { content: "hi" } }), false);
});

test("human origin wins", () => {
  assert.equal(isPromptLine({ type: "user", origin: { kind: "human" }, message: { content: [{ type: "tool_result" }] } }), true);
});

test("subagent task notification is not a prompt", () => {
  assert.equal(isPromptLine({ type: "user", origin: { kind: "task-notification" }, message: { content: "<task-notification>done</task-notification>" } }), false);
});

// Prompt at 200; hook feedback at 300 must not count as a prompt.
const transcript = [
  line("user", "first prompt", 100),
  line("user", [{ type: "tool_result" }], 150),
  line("user", "second prompt", 200),
  line("user", "Stop hook feedback", 300, { isMeta: true }),
].join("\n");

test("marker before any reminder blocks", () => {
  assert.equal(shouldBlock(250, 0, transcript, "Done."), true);
});

test("reminder from an earlier reply blocks", () => {
  assert.equal(shouldBlock(250, 150, transcript, "Done."), true);
});

test("reminded, no marker blocks", () => {
  assert.equal(shouldBlock(0, 300, transcript, "Done."), true);
});

test("marker older than reminder blocks", () => {
  assert.equal(shouldBlock(250, 300, transcript, "Done."), true);
});

test("same-second marker blocks", () => {
  assert.equal(shouldBlock(300, 300, transcript, "Done."), true);
});

test("marker after reminder allows", () => {
  assert.equal(shouldBlock(310, 300, transcript, "Done."), false);
});

test("dump phrase blocks even with fresh marker", () => {
  assert.equal(shouldBlock(310, 300, transcript, "Done. Tell me if you want the rest."), true);
});

test("say the word blocks", () => {
  assert.equal(shouldBlock(310, 300, transcript, "Done. Say the word and I add it."), true);
});

// Real shape from session e6fec24a: a typed slash command has origin.kind "human", so it counts as a prompt.
test("typed slash command with human origin is a prompt", () => {
  assert.equal(
    isPromptLine({
      type: "user",
      origin: { kind: "human" },
      message: { content: "<command-message>taskTools:pick-a-task</command-message>\n<command-name>/taskTools:pick-a-task</command-name>" },
    }),
    true,
  );
});

// Real missed case: assistant listed options and asked for a confirmation word, without using a tracked phrase.
test("open-choices dump without a tracked phrase blocks", () => {
  const lastMessage =
    "You have two choices:\n\n1. Leave it.\n2. Shorten it now.\n\nI would pick option 2. Say \"do it\" and I will do it.";
  assert.equal(shouldBlock(310, 300, transcript, lastMessage), true);
});

test("question with two bullets blocks even with a newer done marker", () => {
  const lastMessage = "Which one?\n- Option A\n- Option B";
  assert.equal(shouldBlock(310, 300, transcript, lastMessage), true);
});

test("one bullet with no question mark does not block", () => {
  const lastMessage = "Done. Notes:\n- Ran the tests.";
  assert.equal(shouldBlock(310, 300, transcript, lastMessage), false);
});
