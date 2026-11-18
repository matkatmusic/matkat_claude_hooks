import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "@typescript-eslint/explicit-member-accessibility";

test("test_class_member_without_modifier_is_flagged", () => {
  // Scenario: a class method with no access modifier gets one message.
  const messages = scanSourceText("subject.ts", "export class Box {\n  getSize() {\n    return 1;\n  }\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_class_member_with_modifier_is_not_flagged", () => {
  // Scenario: a class method with 'public' gets no message.
  const messages = scanSourceText("subject.ts", "export class Box {\n  public getSize() {\n    return 1;\n  }\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
