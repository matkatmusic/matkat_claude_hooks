import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithText } from "./lintRuleTestHelper.ts";

const GLOBAL_VARIABLE_TEXT = "No global variables";

test("test_top_level_const_is_flagged", () => {
  // Scenario: a top-level const gets one global variable message.
  const messages = scanSourceText("subject.ts", "const name = 'a';\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 1);
});

test("test_top_level_upper_case_const_is_flagged", () => {
  // Scenario: an UPPER_CASE top-level const is flagged too.
  const messages = scanSourceText("subject.ts", "const MAX_COUNT = 3;\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 1);
});

test("test_top_level_let_is_flagged", () => {
  // Scenario: a top-level let gets one global variable message.
  const messages = scanSourceText("subject.ts", "let counter = 0;\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 1);
});

test("test_exported_top_level_const_is_flagged", () => {
  // Scenario: 'export const' is still a global variable.
  const messages = scanSourceText("subject.ts", "export const name = 'a';\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 1);
});

test("test_const_inside_function_is_not_flagged", () => {
  // Scenario: a const inside a function is a local variable.
  const messages = scanSourceText("subject.ts", "export function getName() {\n  const name = 'a';\n  return name;\n}\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 0);
});

test("test_test_file_top_level_const_is_flagged", () => {
  // Scenario: test files get the global variable rule too.
  const messages = scanSourceText("subject.test.ts", "const name = 'a';\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 1);
});

test("test_register_file_hook_const_is_not_flagged", () => {
  // Scenario: a const typed Hook<...> or Register in a mod register.ts file is a hook declaration.
  const source = "const wrapHook: Hook<'turn.complete'> = async ($, e, next) => {};\nexport const register: Register = on => {};\n";
  const messages = scanSourceText("mod/hooks/register.ts", source);
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 0);
});

test("test_register_file_plain_const_is_flagged", () => {
  // Scenario: a plain const in a mod register.ts file is still a global variable.
  const messages = scanSourceText("mod/hooks/register.ts", "const PLUGIN_NAME = 'a';\n");
  assert.equal(listMessagesWithText(messages, GLOBAL_VARIABLE_TEXT).length, 1);
});
