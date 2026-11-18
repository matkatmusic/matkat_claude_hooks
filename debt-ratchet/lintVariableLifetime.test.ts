import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

test("test_let_without_starting_value_is_flagged", () => {
  // Scenario: 'let count;' with no starting value gets one init-declarations message.
  const messages = scanSourceText("subject.ts", "export function getCount() {\n  let count;\n  count = 1;\n  return count;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, "init-declarations").length, 1);
});

test("test_let_that_is_never_changed_is_flagged", () => {
  // Scenario: a 'let' that is never changed gets one prefer-const message.
  const messages = scanSourceText("subject.ts", "export function getCount() {\n  let count = 1;\n  return count;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, "prefer-const").length, 1);
});

test("test_var_used_outside_its_block_is_flagged", () => {
  // Scenario: a 'var' declared in an if block and used after the block gets one block-scoped-var message.
  const messages = scanSourceText("subject.ts", "export function getCount(isOn: boolean) {\n  if (isOn) {\n    var count = 1;\n  }\n  return count;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, "block-scoped-var").length, 1);
});

test("test_const_used_before_its_declaration_is_flagged", () => {
  // Scenario: a const read on a line above its declaration gets one no-use-before-define message.
  const messages = scanSourceText("subject.ts", "export function getTotal() {\n  const total = base + 1;\n  const base = 1;\n  return total;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, "@typescript-eslint/no-use-before-define").length, 1);
});

test("test_function_called_above_its_declaration_is_not_flagged", () => {
  // Scenario: a function declaration below its caller gets no no-use-before-define message.
  const messages = scanSourceText("subject.ts", "export function getTotal() {\n  return getBase() + 1;\n}\nfunction getBase() {\n  return 1;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, "@typescript-eslint/no-use-before-define").length, 0);
});
