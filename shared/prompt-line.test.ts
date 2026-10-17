import { test } from "node:test";
import { strict as assert } from "node:assert";
import { isPromptLine } from "./prompt-line.ts";

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
