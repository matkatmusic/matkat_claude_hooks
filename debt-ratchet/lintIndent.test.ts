import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "@stylistic/indent";

test("test_four_space_indent_is_not_flagged", () => {
    // Scenario: a function body with a 4-space indent gets no message.
    const messages = scanSourceText("subject.ts", "export function getName() {\n    return \"name\";\n}\n");
    assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});

test("test_two_space_indent_is_flagged", () => {
    // Scenario: a function body with a 2-space indent gets one message.
    const messages = scanSourceText("subject.ts", "export function getName() {\n  return \"name\";\n}\n");
    assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});
