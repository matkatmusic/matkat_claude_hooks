import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "prefer-destructuring";

// Rule prefer-destructuring is turned off (user order), so this test is commented out.
// test("test_property_assignment_is_flagged", () => {
//   // Scenario: 'const name = input.name' gets one message.
//   const messages = scanSourceText("subject.ts", "export function getName(input: { name: string }) {\n  const name = input.name;\n  return name;\n}\n");
//   assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
// });

test("test_destructured_property_is_not_flagged", () => {
  // Scenario: 'const { name } = input' gets no message.
  const messages = scanSourceText("subject.ts", "export function getName(input: { name: string }) {\n  const { name } = input;\n  return name;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});

test("test_array_index_assignment_is_not_flagged", () => {
  // Scenario: 'const first = list[0]' gets no message, because the rule is for object properties.
  const messages = scanSourceText("subject.ts", "export function getFirst(list: string[]) {\n  const first = list[0];\n  return first;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
