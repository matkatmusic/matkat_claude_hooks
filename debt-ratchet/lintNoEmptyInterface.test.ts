import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "@typescript-eslint/no-empty-object-type";

test("test_empty_interface_is_flagged", () => {
  // Scenario: an interface with no members gets one message.
  const messages = scanSourceText("subject.ts", "export interface Empty {}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_interface_with_member_is_not_flagged", () => {
  // Scenario: an interface with one member gets no message.
  const messages = scanSourceText("subject.ts", "export interface Shape {\n  size: number;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
