import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithRuleId } from "./lintRuleTestHelper.ts";

const RULE_ID = "check-file/filename-naming-convention";
const SOURCE_TEXT = "export function getName() {\n  return 'a';\n}\n";

test("test_kebab_case_ts_file_name_is_flagged", () => {
  // Scenario: a .ts file named in kebab-case gets one message.
  const messages = scanSourceText("debt-report.ts", SOURCE_TEXT);
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_kebab_case_test_file_name_is_flagged", () => {
  // Scenario: a .test.ts file named in kebab-case gets one message.
  const messages = scanSourceText("debt-report.test.ts", SOURCE_TEXT);
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 1);
});

test("test_camel_case_ts_file_name_is_not_flagged", () => {
  // Scenario: a .ts file named in camelCase gets no message.
  const messages = scanSourceText("debtReport.ts", SOURCE_TEXT);
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});

test("test_camel_case_test_file_name_is_not_flagged", () => {
  // Scenario: a .test.ts file named in camelCase gets no message.
  const messages = scanSourceText("debtReport.test.ts", SOURCE_TEXT);
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});

test("test_config_file_name_with_middle_extension_is_not_flagged", () => {
  // Scenario: a tool config name such as vite.config.ts gets no message.
  const messages = scanSourceText("vite.config.ts", SOURCE_TEXT);
  assert.equal(listMessagesWithRuleId(messages, RULE_ID).length, 0);
});
