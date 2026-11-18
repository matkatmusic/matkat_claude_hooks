import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithText } from "./lintRuleTestHelper.ts";

const TOP_LEVEL_CODE_TEXT = "Write code inside functions";

test("test_top_level_call_is_flagged", () => {
  // Scenario: a bare call at the top level gets one message.
  const messages = scanSourceText("subject.ts", "console.log('a');\n");
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 1);
});

test("test_top_level_loop_is_flagged", () => {
  // Scenario: a loop at the top level gets one message.
  const messages = scanSourceText("subject.ts", "for (let i = 0; i < 3; i++) {\n  console.log(i);\n}\n");
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 1);
});

test("test_allowed_top_level_declarations_are_not_flagged", () => {
  // Scenario: imports, exports, type, interface, enum, function and class declarations are allowed.
  const source = [
    "import { join } from 'node:path';",
    "export { join };",
    "export type Name = string;",
    "interface Shape { size: number }",
    "enum Color { Red }",
    "export function getName(): string {",
    "  return 'a';",
    "}",
    "class Box {}",
    "",
  ].join("\n");
  const messages = scanSourceText("subject.ts", source);
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 0);
});

test("test_main_guard_block_is_not_flagged", () => {
  // Scenario: the one 'if (import.meta.main) { main(); }' block is allowed.
  const source = "function main() {}\nif (import.meta.main) {\n  main();\n}\n";
  const messages = scanSourceText("subject.ts", source);
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 0);
});

test("test_main_guard_block_with_other_call_is_flagged", () => {
  // Scenario: another statement inside the main guard block gets one message.
  const source = "function main() {}\nif (import.meta.main) {\n  main();\n  console.log('a');\n}\n";
  const messages = scanSourceText("subject.ts", source);
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 1);
});

test("test_other_top_level_if_is_flagged", () => {
  // Scenario: an if that does not test import.meta.main gets one message.
  const messages = scanSourceText("subject.ts", "if (process.env.A) {\n  console.log('a');\n}\n");
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 1);
});

test("test_test_file_top_level_test_call_is_not_flagged", () => {
  // Scenario: test() and describe() calls are allowed at the top level of a test file.
  const source = "test('a', () => {});\ndescribe('b', () => {});\n";
  const messages = scanSourceText("subject.test.ts", source);
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 0);
});

test("test_test_file_top_level_await_import_is_not_flagged", () => {
  // Scenario: 'await import(...)' is allowed at the top level of a spec file.
  const messages = scanSourceText("subject.spec.ts", "await import('./other.ts');\n");
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 0);
});

test("test_test_call_in_plain_file_is_flagged", () => {
  // Scenario: a top-level test() call in a file that is not a test file gets one message.
  const messages = scanSourceText("subject.ts", "test('a', () => {});\n");
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 1);
});

test("test_test_file_other_top_level_call_is_flagged", () => {
  // Scenario: a top-level call other than test() or describe() in a test file gets one message.
  const messages = scanSourceText("subject.test.ts", "console.log('a');\n");
  assert.equal(listMessagesWithText(messages, TOP_LEVEL_CODE_TEXT).length, 1);
});
