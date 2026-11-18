import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "no-var";

test("test_var_keyword_is_flagged", () => {
  // Scenario: a 'var' declaration gets one message.
  const messages = scanSourceText("subject.ts", "export function getCount() {\n  var count = 1;\n  return count;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_const_keyword_is_not_flagged", () => {
  // Scenario: a 'const' declaration gets no message.
  const messages = scanSourceText("subject.ts", "export function getCount() {\n  const count = 1;\n  return count;\n}\n");
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
