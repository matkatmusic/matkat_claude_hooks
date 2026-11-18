import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "@typescript-eslint/consistent-type-definitions";

test("test_type_alias_of_object_shape_is_flagged", () => {
  // Scenario: an object shape written as a 'type' gets one message.
  const messages = scanSourceText("subject.ts", "export type Shape = { size: number };\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_type_alias_of_union_is_not_flagged", () => {
  // Scenario: a union written as a 'type' gets no message.
  const messages = scanSourceText("subject.ts", "export type Id = string | number;\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
