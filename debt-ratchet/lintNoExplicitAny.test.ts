import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "@typescript-eslint/no-explicit-any";

test("test_any_type_is_flagged", () => {
  // Scenario: a parameter typed 'any' gets one message.
  const messages = scanSourceText("subject.ts", "export function getValue(input: any) {\n  return input;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_unknown_type_is_not_flagged", () => {
  // Scenario: a parameter typed 'unknown' gets no message.
  const messages = scanSourceText("subject.ts", "export function getValue(input: unknown) {\n  return input;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
